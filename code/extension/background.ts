import {
  GENERATE_ACTIVE_FIELD_MESSAGE,
  GENERATE_PREPARE_TARGET_MESSAGE,
  GENERATE_STREAM_DONE_MESSAGE,
  GENERATE_STREAM_ERROR_MESSAGE,
  GENERATE_STREAM_START_MESSAGE,
  GENERATE_STREAM_TOKEN_MESSAGE,
  type ActiveFieldContext,
  buildConnectUrl,
  CONNECT_COMPLETE_MESSAGE,
  CONNECT_START_MESSAGE,
  type ConnectCompleteMessage,
  type GenerateActiveFieldMessage,
  type GenerateActiveFieldResponse,
  type PrepareTargetResponse,
  type RuntimeMessage
} from "~lib/messages"
import { ExtensionAPIError, extensionApiJson, extensionApiStream } from "~lib/api"
import { parseSseEvents, type SseEvent } from "~lib/sse"
import { WEB_APP_BASE_URL } from "~lib/config"
import {
  clearByokKeys,
  clearPendingNonce,
  getByokKeys,
  getPendingNonce,
  getSession,
  setPendingNonce,
  setByokKeys,
  setSession,
  setStoredProfileState,
  type ByokKeys,
  type SessionTokens
} from "~lib/storage"

const CONNECT_ALLOWED_ORIGIN = getAllowedConnectOrigin()
const generationByTab = new Map<number, { requestId: string; controller: AbortController; frameId?: number }>()
const GENERATION_CONNECT_TIMEOUT_MS = 45_000
const GENERATION_STREAM_IDLE_TIMEOUT_MS = 30_000

type SavedKeysResponse = {
  gemini_api_key: string | null
  cohere_api_key: string | null
  has_saved_keys: boolean
}

type ProfileResponse = {
  user_id: string
  data: Record<string, unknown>
  ingested_at: string | null
}

type StreamGenerationArgs = {
  tabId: number
  requestId: string
  frameId?: number
  prompt: string
  fieldName: string | undefined
  byokKeys: ByokKeys
  signal: AbortSignal
}

chrome.runtime.onInstalled.addListener(() => {
  console.info("[ApplyAI] extension installed")
})

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (message?.type === CONNECT_START_MESSAGE) {
    void handleConnectStart(sendResponse)
    return true
  }

  if (message?.type === GENERATE_ACTIVE_FIELD_MESSAGE) {
    void handleGenerateActiveField(message as GenerateActiveFieldMessage, sender, sendResponse)
    return true
  }

  return false
})

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isConnectCompleteMessage(message)) {
    return false
  }

  if (!isAllowedExternalSender(sender)) {
    sendResponse({ ok: false, error: "Unauthorized sender" })
    return false
  }

  void handleConnectComplete(message as ConnectCompleteMessage, sendResponse)
  return true
})

async function handleConnectStart(sendResponse: (response: unknown) => void): Promise<void> {
  const nonce = crypto.randomUUID()
  await setPendingNonce(nonce)

  await chrome.tabs.create({ url: buildConnectUrl(nonce, chrome.runtime.id) })
  sendResponse({ ok: true })
}

async function handleConnectComplete(
  message: ConnectCompleteMessage,
  sendResponse: (response: unknown) => void
): Promise<void> {
  const expectedNonce = await getPendingNonce()
  if (!expectedNonce || expectedNonce !== message.payload.nonce) {
    sendResponse({ ok: false, error: "Invalid nonce" })
    return
  }

  const tokens: SessionTokens = {
    accessToken: message.payload.accessToken,
    refreshToken: message.payload.refreshToken
  }

  await setSession(tokens)
  await clearPendingNonce()

  await hydrateByokKeysFromAccount()
  sendResponse({ ok: true })
}

async function hydrateByokKeysFromAccount(): Promise<void> {
  try {
    const saved = await extensionApiJson<SavedKeysResponse>("/settings/saved-keys")
    if (saved.has_saved_keys && saved.gemini_api_key && saved.cohere_api_key) {
      await setByokKeys({
        geminiApiKey: saved.gemini_api_key,
        cohereApiKey: saved.cohere_api_key
      })
    } else {
      await clearByokKeys()
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error"
    console.warn("[ApplyAI] Failed to hydrate BYOK keys from account:", detail)
  }
}

async function handleGenerateActiveField(
  message: GenerateActiveFieldMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: GenerateActiveFieldResponse) => void
): Promise<void> {
  try {
    const session = await getSession()
    if (!session?.accessToken) {
      sendResponse({ ok: false, error: "Connect your account before generating." })
      return
    }

    const keys = await getByokKeys()
    if (!keys?.geminiApiKey || !keys?.cohereApiKey) {
      sendResponse({ ok: false, error: "Add Gemini and Cohere keys before generating." })
      return
    }

    const profile = await extensionApiJson<ProfileResponse>("/profile")
    await setStoredProfileState({ ingestedAt: profile.ingested_at })
    if (!profile.ingested_at) {
      sendResponse({ ok: false, error: "Profile ingest is not ready. Run ingest from dashboard first." })
      return
    }

    const tabId = await resolveTargetTabId(message.payload?.tabId, sender.tab?.id)
    const requestId = message.payload?.requestId || crypto.randomUUID()
    const senderFrameId =
      typeof sender.frameId === "number" && sender.frameId >= 0 ? sender.frameId : undefined
    let field = message.payload?.field

    await cancelExistingGeneration(tabId)

    if (!field) {
      const prep = await requestPrepareTarget(tabId, requestId, senderFrameId)
      if (!prep?.ok || !prep.field) {
        sendResponse({
          ok: false,
          error: prep?.error || "Could not read active field context. Focus a writable field and try again."
        })
        return
      }

      field = prep.field
    }

    const prompt = buildPromptFromField(field)
    if (!prompt) {
      sendResponse({ ok: false, error: "Could not build prompt from the active field." })
      return
    }

    const controller = new AbortController()
    generationByTab.set(tabId, { requestId, controller, frameId: senderFrameId })

    void streamGenerationToTab({
      tabId,
      requestId,
      frameId: senderFrameId,
      prompt,
      fieldName: buildFieldName(field),
      byokKeys: keys,
      signal: controller.signal
    })

    sendResponse({ ok: true, requestId })
  } catch (error) {
    sendResponse({ ok: false, error: mapGenerationError(error) })
  }
}

async function streamGenerationToTab(args: StreamGenerationArgs): Promise<void> {
  const streamController = new AbortController()
  const unlinkAbort = linkAbortSignal(args.signal, streamController)

  try {
    const params = new URLSearchParams({ prompt: args.prompt })
    if (args.fieldName) {
      params.set("field_name", args.fieldName)
    }

    const response = await withTimeout(
      extensionApiStream(`/generate/stream?${params.toString()}`, {
        method: "POST",
        byok: args.byokKeys,
        signal: streamController.signal
      }),
      GENERATION_CONNECT_TIMEOUT_MS,
      "Generation timed out before the stream started.",
      () => streamController.abort()
    )

    const body = response.body
    if (!body) {
      throw new Error("Generation stream was empty.")
    }

    await sendMessageToTab(
      args.tabId,
      {
      type: GENERATE_STREAM_START_MESSAGE,
      payload: { requestId: args.requestId }
      },
      args.frameId
    )

    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let sawDoneEvent = false

    while (true) {
      const { value, done } = await withTimeout(
        reader.read(),
        GENERATION_STREAM_IDLE_TIMEOUT_MS,
        "Generation timed out while waiting for stream data.",
        () => streamController.abort()
      )
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const parsed = parseSseEvents(buffer)
      buffer = parsed.rest
      sawDoneEvent =
        (await relaySseEvents(args.tabId, args.requestId, parsed.events, args.frameId)) || sawDoneEvent
    }

    if (buffer.trim().length > 0) {
      const parsed = parseSseEvents(buffer, true)
      sawDoneEvent =
        (await relaySseEvents(args.tabId, args.requestId, parsed.events, args.frameId)) || sawDoneEvent
    }

    if (!sawDoneEvent) {
      await sendMessageToTab(
        args.tabId,
        {
        type: GENERATE_STREAM_DONE_MESSAGE,
        payload: { requestId: args.requestId }
        },
        args.frameId
      )
    }
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? "Generation cancelled."
        : mapGenerationError(error)

    await sendMessageToTab(
      args.tabId,
      {
        type: GENERATE_STREAM_ERROR_MESSAGE,
        payload: { requestId: args.requestId, error: message }
      },
      args.frameId
    ).catch(() => {
      // Tab may have navigated or closed.
    })
  } finally {
    unlinkAbort()

    const current = generationByTab.get(args.tabId)
    if (current?.requestId === args.requestId) {
      generationByTab.delete(args.tabId)
    }
  }
}

async function requestPrepareTarget(
  tabId: number,
  requestId: string,
  preferredFrameId?: number
): Promise<PrepareTargetResponse | undefined> {
  const prepMessage = {
    type: GENERATE_PREPARE_TARGET_MESSAGE,
    payload: { requestId }
  }

  try {
    if (typeof preferredFrameId === "number") {
      const scoped = await sendMessageToTab<PrepareTargetResponse>(tabId, prepMessage, preferredFrameId)
      if (scoped?.ok || scoped?.error) {
        return scoped
      }
    }

    const broad = await sendMessageToTab<PrepareTargetResponse>(tabId, prepMessage)
    if (broad?.ok || broad?.error) {
      return broad
    }

    await waitForMs(120)
    return await sendMessageToTab<PrepareTargetResponse>(tabId, prepMessage)
  } catch (error) {
    if (typeof preferredFrameId === "number") {
      try {
        const broad = await sendMessageToTab<PrepareTargetResponse>(tabId, prepMessage)
        if (broad?.ok || broad?.error) {
          return broad
        }
      } catch {
        // Ignore and rethrow original error below.
      }
    }

    throw error
  }
}

async function relaySseEvents(
  tabId: number,
  requestId: string,
  events: SseEvent[],
  frameId?: number
): Promise<boolean> {
  let sawDone = false

  for (const event of events) {
    if (event.event === "token") {
      const parsed = parseSseData(event.data)
      const token = typeof parsed === "string" ? parsed : ""
      if (!token) {
        continue
      }

      await sendMessageToTab(
        tabId,
        {
        type: GENERATE_STREAM_TOKEN_MESSAGE,
        payload: { requestId, token }
        },
        frameId
      )
      continue
    }

    if (event.event === "done") {
      sawDone = true
      await sendMessageToTab(
        tabId,
        {
        type: GENERATE_STREAM_DONE_MESSAGE,
        payload: { requestId }
        },
        frameId
      )
    }
  }

  return sawDone
}

async function cancelExistingGeneration(tabId: number): Promise<void> {
  const existing = generationByTab.get(tabId)
  if (!existing) {
    return
  }

  existing.controller.abort()
  generationByTab.delete(tabId)

  await sendMessageToTab(tabId, {
    type: GENERATE_STREAM_ERROR_MESSAGE,
    payload: {
      requestId: existing.requestId,
      error: "Generation cancelled because a new request started."
    }
  }, existing.frameId).catch(() => {
    // Best effort cleanup.
  })
}

function buildPromptFromField(field: ActiveFieldContext): string {
  const lines = [
    "Write a professional job application response based only on my profile context.",
    `Portal: ${field.portal.name}`,
    `Field: ${field.label}`
  ]

  if (field.portal.strategy === "iframe-limited") {
    lines.push("Some portals restrict direct DOM control; keep the answer concise for reliable insertion.")
  }

  if (field.promptContext) {
    lines.push(`Form context: ${field.promptContext}`)
  }
  if (field.placeholder) {
    lines.push(`Placeholder hint: ${field.placeholder}`)
  }
  if (field.fieldType === "input") {
    lines.push("Keep the answer concise and single-line unless the field clearly asks for detail.")
  }

  lines.push("Return only the final answer text.")

  const prompt = lines.join("\n")
  return prompt.slice(0, 2000)
}

function buildFieldName(field: ActiveFieldContext): string | undefined {
  const raw = field.label || field.name || field.placeholder || ""
  const normalized = raw.replace(/\s+/g, " ").trim()
  if (!normalized) {
    return undefined
  }

  return normalized.slice(0, 128)
}

async function resolveTargetTabId(explicitTabId?: number, senderTabId?: number): Promise<number> {
  if (typeof explicitTabId === "number") {
    return explicitTabId
  }

  if (typeof senderTabId === "number") {
    return senderTabId
  }

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (!tab?.id) {
    throw new Error("No active tab found for generation.")
  }

  return tab.id
}

async function sendMessageToTab<T = unknown>(
  tabId: number,
  message: unknown,
  frameId?: number
): Promise<T> {
  if (typeof frameId === "number" && frameId >= 0) {
    return (await chrome.tabs.sendMessage(tabId, message, { frameId })) as T
  }

  return (await chrome.tabs.sendMessage(tabId, message)) as T
}

function parseSseData(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function mapGenerationError(error: unknown): string {
  if (error instanceof ExtensionAPIError) {
    if (error.status === 401) {
      return "Session expired. Reconnect your account and try again."
    }
    if (error.status === 404) {
      return "Profile ingest is required before generation."
    }
    if (error.status === 422) {
      return "Both Gemini and Cohere keys are required before generation."
    }
    if (error.status === 502) {
      return "Generation provider is temporarily unavailable. Please retry."
    }

    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return "Unknown generation error."
}

function waitForMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isAllowedExternalSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id) {
    return false
  }

  const origin = extractSenderOrigin(sender)
  return Boolean(origin && origin === CONNECT_ALLOWED_ORIGIN)
}

function isConnectCompleteMessage(message: unknown): message is ConnectCompleteMessage {
  if (!message || typeof message !== "object") {
    return false
  }

  const candidate = message as {
    type?: unknown
    payload?: {
      nonce?: unknown
      accessToken?: unknown
      refreshToken?: unknown
    }
  }

  return (
    candidate.type === CONNECT_COMPLETE_MESSAGE &&
    typeof candidate.payload?.nonce === "string" &&
    candidate.payload.nonce.length > 0 &&
    typeof candidate.payload?.accessToken === "string" &&
    candidate.payload.accessToken.length > 0 &&
    typeof candidate.payload?.refreshToken === "string" &&
    candidate.payload.refreshToken.length > 0
  )
}

function extractSenderOrigin(sender: chrome.runtime.MessageSender): string | null {
  if (sender.origin) {
    return sender.origin
  }

  if (!sender.url) {
    return null
  }

  try {
    return new URL(sender.url).origin
  } catch {
    return null
  }
}

function getAllowedConnectOrigin(): string {
  try {
    return new URL(WEB_APP_BASE_URL).origin
  } catch {
    return "http://localhost:3000"
  }
}

function linkAbortSignal(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) {
    return () => {}
  }

  if (source.aborted) {
    target.abort()
    return () => {}
  }

  const onAbort = () => {
    target.abort()
  }

  source.addEventListener("abort", onAbort, { once: true })
  return () => {
    source.removeEventListener("abort", onAbort)
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        onTimeout?.()
      } catch {
        // Best effort timeout cleanup.
      }

      reject(new Error(message))
    }, timeoutMs)

    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}