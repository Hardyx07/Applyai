import {
  buildConnectUrl,
  CONNECT_COMPLETE_MESSAGE,
  CONNECT_START_MESSAGE,
  type ConnectCompleteMessage,
  type RuntimeMessage
} from "~lib/messages"
import { extensionApiJson } from "~lib/api"
import { WEB_APP_BASE_URL } from "~lib/config"
import {
  clearByokKeys,
  clearPendingNonce,
  getPendingNonce,
  setPendingNonce,
  setByokKeys,
  setSession,
  type SessionTokens
} from "~lib/storage"

const CONNECT_ALLOWED_ORIGIN = getAllowedConnectOrigin()

type SavedKeysResponse = {
  gemini_api_key: string | null
  cohere_api_key: string | null
  has_saved_keys: boolean
}

chrome.runtime.onInstalled.addListener(() => {
  console.info("[ApplyAI] extension installed")
})

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message?.type === CONNECT_START_MESSAGE) {
    void handleConnectStart(sendResponse)
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