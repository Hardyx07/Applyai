import type { PlasmoCSConfig } from "plasmo"
import {
  GENERATE_ACTIVE_FIELD_MESSAGE,
  GENERATE_PREPARE_TARGET_MESSAGE,
  GENERATE_STREAM_DONE_MESSAGE,
  GENERATE_STREAM_ERROR_MESSAGE,
  GENERATE_STREAM_START_MESSAGE,
  GENERATE_STREAM_TOKEN_MESSAGE,
  type ActiveFieldContext,
  type GenerateActiveFieldResponse,
  type PrepareTargetResponse
} from "~lib/messages"
import {
  getPortalAdapterForHost,
  resolveEditableFromEventTarget,
  type EditableTarget
} from "./portal-adapters"

export const config: PlasmoCSConfig = {
  matches: [
    "https://*.linkedin.com/*",
    "https://unstop.com/*",
    "https://internshala.com/*",
    "https://*.internshala.com/*",
    "https://www.naukri.com/*",
    "https://*.naukri.com/*",
    "https://www.foundit.in/*",        
    "https://*.shine.com/*",
    "https://*.hirist.tech/*",         
    "https://*.cutshort.io/*",         
    "https://*.instahyre.com/*",       
    "https://wellfound.com/*",         
    "https://*.greenhouse.io/*",
    "https://*.lever.co/*",
    "https://*.workday.com/*",
    "https://*.ashbyhq.com/*",
    "https://*.smartrecruiters.com/*",
    "https://workatastartup.com/*",
    "https://*.workatastartup.com/*"
  ],
  run_at: "document_idle"
}

const portalAdapter = getPortalAdapterForHost(window.location.hostname)

type ActiveGenerationState = {
  requestId: string
  target: EditableTarget
  text: string
}

type InlineUiState = "idle" | "starting" | "streaming" | "success" | "error"

let activeGeneration: ActiveGenerationState | null = null
let lastFocusedEditableTarget: EditableTarget | null = null
let inlineAnchorTarget: EditableTarget | null = null
let inlineRequestId: string | null = null

let inlineGenerateContainer: HTMLDivElement | null = null
let inlineGenerateButton: HTMLButtonElement | null = null
let inlineGenerateHint: HTMLDivElement | null = null
let inlineStateResetTimer: number | null = null
const GENERATION_START_RETRY_DELAY_MS = 160
const INLINE_GENERATION_TIMEOUT_MS = 65_000
let inlineGenerationWatchdogTimer: number | null = null

document.addEventListener("focusin", handleFocusIn, true)
document.addEventListener("pointerdown", handlePointerDown, true)
window.addEventListener("scroll", handleViewportMutation, true)
window.addEventListener("resize", handleViewportMutation)

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === GENERATE_PREPARE_TARGET_MESSAGE) {
    const requestId =
      typeof message.payload?.requestId === "string" ? message.payload.requestId : ""

    if (!requestId) {
      return {
        ok: false,
        error: "Invalid generation request id."
      } satisfies PrepareTargetResponse
    }

    const target = resolveGenerationTarget()
    if (!target) {
      return {
        ok: false,
        error: "Focus a writable field before generating."
      } satisfies PrepareTargetResponse
    }

    activeGeneration = {
      requestId,
      target,
      text: ""
    }

    return {
      ok: true,
      field: extractFieldContext(target)
    } satisfies PrepareTargetResponse
  }

  if (message?.type === GENERATE_STREAM_START_MESSAGE) {
    const requestId = typeof message.payload?.requestId === "string" ? message.payload.requestId : ""
    if (!requestId || !activeGeneration || activeGeneration.requestId !== requestId) {
      return
    }

    activeGeneration.text = ""
    if (inlineRequestId === requestId) {
      touchInlineGenerationWatchdog(requestId)
      setInlineGenerateUiState("streaming", "Streaming answer...")
    }
    return
  }

  if (message?.type === GENERATE_STREAM_TOKEN_MESSAGE) {
    const requestId = typeof message.payload?.requestId === "string" ? message.payload.requestId : ""
    const token = typeof message.payload?.token === "string" ? message.payload.token : ""

    if (!requestId || !token || !activeGeneration || activeGeneration.requestId !== requestId) {
      return
    }

    if (!activeGeneration.target.isConnected) {
      if (inlineRequestId === requestId) {
        clearInlineGenerationWatchdog()
        inlineRequestId = null
        setInlineGenerateUiState("error", "Field is no longer available. Focus it again and retry.")
      }
      activeGeneration = null
      return
    }

    activeGeneration.text += token
    applyTextToTarget(activeGeneration.target, activeGeneration.text, false)

    if (inlineRequestId === requestId) {
      touchInlineGenerationWatchdog(requestId)
      setInlineGenerateUiState("streaming", "Generating...")
    }
    return
  }

  if (message?.type === GENERATE_STREAM_DONE_MESSAGE) {
    const requestId = typeof message.payload?.requestId === "string" ? message.payload.requestId : ""
    if (!requestId || !activeGeneration || activeGeneration.requestId !== requestId) {
      return
    }

    if (activeGeneration.target.isConnected) {
      applyTextToTarget(activeGeneration.target, activeGeneration.text, true)
    }

    activeGeneration = null

    if (inlineRequestId === requestId) {
      clearInlineGenerationWatchdog()
      setInlineGenerateUiState("success", "Inserted")
      scheduleInlineStateReset(1800)
    }
    return
  }

  if (message?.type === GENERATE_STREAM_ERROR_MESSAGE) {
    const requestId = typeof message.payload?.requestId === "string" ? message.payload.requestId : ""
    const error = typeof message.payload?.error === "string" ? message.payload.error : "Generation failed."

    if (activeGeneration && activeGeneration.requestId === requestId) {
      activeGeneration = null
    }

    if (inlineRequestId === requestId) {
      clearInlineGenerationWatchdog()
      inlineRequestId = null
      setInlineGenerateUiState("error", error)
    }

    console.warn("[ApplyAI] generation error:", error)
    return
  }

  if (message?.type !== "applyai.fill.active") {
    return
  }

  const active = resolveGenerationTarget()
  if (!active) {
    return
  }

  const text = typeof message.payload?.text === "string" ? message.payload.text : ""
  if (!text) {
    return
  }

  applyTextToTarget(active, text, true)
})

function handleFocusIn(event: FocusEvent): void {
  const editable = resolveEditableFromEventTarget(event.target)
  if (!editable) {
    return
  }

  lastFocusedEditableTarget = editable
  showInlineGenerateForTarget(editable)
}

function handlePointerDown(event: PointerEvent): void {
  if (inlineGenerateContainer && event.target instanceof Node && inlineGenerateContainer.contains(event.target)) {
    return
  }

  const editable = resolveEditableFromEventTarget(event.target)
  if (editable) {
    lastFocusedEditableTarget = editable
    showInlineGenerateForTarget(editable)
    return
  }

  if (!activeGeneration) {
    hideInlineGenerateUi(false)
  }
}

function handleViewportMutation(): void {
  if (!inlineGenerateContainer || inlineGenerateContainer.style.display === "none") {
    return
  }

  if (!inlineAnchorTarget || !inlineAnchorTarget.isConnected) {
    if (!activeGeneration) {
      hideInlineGenerateUi(false)
    }
    return
  }

  positionInlineGenerateUi()
}

function resolveGenerationTarget(): EditableTarget | null {
  const active = portalAdapter.resolveActiveEditableElement(document)
  if (active) {
    lastFocusedEditableTarget = active
    return active
  }

  if (lastFocusedEditableTarget?.isConnected) {
    return lastFocusedEditableTarget
  }

  if (inlineAnchorTarget?.isConnected) {
    return inlineAnchorTarget
  }

  return null
}

function extractFieldContext(target: EditableTarget): ActiveFieldContext {
  const id = target.id || null
  const forLabel = id ? findLabelByFor(id) : null
  const wrappingLabel = target.closest("label")
  const ariaLabel = target.getAttribute("aria-label")
  const name = target.getAttribute("name")
  const placeholder =
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      ? target.placeholder || null
      : null

  const label =
    firstNonEmpty([
      textOrNull(forLabel),
      textOrNull(wrappingLabel),
      ariaLabel,
      name,
      placeholder,
      "Application response"
    ]) || "Application response"

  const promptContext = extractNearbyPrompt(target, [label, placeholder ?? "", name ?? ""])
  const fieldType =
    target instanceof HTMLTextAreaElement
      ? "textarea"
      : target instanceof HTMLInputElement
        ? "input"
        : "contenteditable"

  return {
    portal: portalAdapter.portal,
    label,
    name,
    placeholder,
    promptContext,
    fieldType
  }
}

function applyTextToTarget(target: EditableTarget, text: string, emitChange: boolean): void {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    setNativeInputValue(target, text)
    target.dispatchEvent(new Event("input", { bubbles: true, composed: true }))
    if (emitChange) {
      target.dispatchEvent(new Event("change", { bubbles: true, composed: true }))
    }
    return
  }

  if (target.isContentEditable) {
    target.textContent = text
    target.dispatchEvent(new Event("input", { bubbles: true, composed: true }))
    if (emitChange) {
      target.dispatchEvent(new Event("change", { bubbles: true, composed: true }))
    }
  }
}

function setNativeInputValue(target: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value")

  if (descriptor?.set) {
    descriptor.set.call(target, value)
    return
  }

  target.value = value
}

function ensureInlineGenerateUi(): void {
  if (inlineGenerateContainer && inlineGenerateButton && inlineGenerateHint) {
    return
  }

  const container = document.createElement("div")
  container.setAttribute("data-applyai-inline-generate", "true")
  container.style.position = "fixed"
  container.style.display = "none"
  container.style.flexDirection = "column"
  container.style.gap = "6px"
  container.style.zIndex = "2147483647"
  container.style.maxWidth = "180px"
  container.style.padding = "8px"
  container.style.border = "1px solid #cbd5e1"
  container.style.borderRadius = "10px"
  container.style.background = "#ffffff"
  container.style.boxShadow = "0 10px 20px rgba(15, 23, 42, 0.18)"
  container.style.fontFamily = "Segoe UI, Arial, sans-serif"

  const button = document.createElement("button")
  button.type = "button"
  button.textContent = "Generate"
  button.style.border = "none"
  button.style.background = "#0f172a"
  button.style.color = "#ffffff"
  button.style.borderRadius = "8px"
  button.style.padding = "8px 10px"
  button.style.fontSize = "12px"
  button.style.fontWeight = "600"
  button.style.cursor = "pointer"

  const hint = document.createElement("div")
  hint.textContent = `${portalAdapter.portal.name} ready`
  hint.style.fontSize = "11px"
  hint.style.lineHeight = "1.25"
  hint.style.color = "#475569"

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault()
    event.stopPropagation()
  })

  button.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    void triggerInlineGeneration()
  })

  container.append(button, hint)
  document.body.appendChild(container)

  inlineGenerateContainer = container
  inlineGenerateButton = button
  inlineGenerateHint = hint
}

function showInlineGenerateForTarget(target: EditableTarget): void {
  ensureInlineGenerateUi()
  if (!inlineGenerateContainer) {
    return
  }

  inlineAnchorTarget = target
  inlineGenerateContainer.style.display = "flex"
  positionInlineGenerateUi()

  if (!activeGeneration && !inlineRequestId) {
    setInlineGenerateUiState("idle")
  }
}

function hideInlineGenerateUi(clearRequest: boolean): void {
  if (inlineGenerateContainer) {
    inlineGenerateContainer.style.display = "none"
  }

  inlineAnchorTarget = null
  if (clearRequest) {
    clearInlineGenerationWatchdog()
    inlineRequestId = null
  }
}

function positionInlineGenerateUi(): void {
  if (!inlineGenerateContainer || !inlineAnchorTarget || !inlineAnchorTarget.isConnected) {
    return
  }

  const rect = inlineAnchorTarget.getBoundingClientRect()
  const width = inlineGenerateContainer.offsetWidth || 160

  const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width))
  const topPreferred = rect.top - 52
  const top = topPreferred > 8 ? topPreferred : Math.min(window.innerHeight - 12, rect.bottom + 10)

  inlineGenerateContainer.style.left = `${Math.round(left)}px`
  inlineGenerateContainer.style.top = `${Math.round(top)}px`
}

async function triggerInlineGeneration(): Promise<void> {
  if (inlineGenerateButton?.disabled) {
    return
  }

  clearInlineGenerationWatchdog()

  const target = resolveGenerationTarget()
  if (!target) {
    setInlineGenerateUiState("error", "Focus a writable field first.")
    return
  }

  inlineAnchorTarget = target
  lastFocusedEditableTarget = target
  positionInlineGenerateUi()
  setInlineGenerateUiState("starting", "Preparing generation...")

  const requestId = crypto.randomUUID()
  const field = extractFieldContext(target)
  activeGeneration = {
    requestId,
    target,
    text: ""
  }

  try {
    const response = await requestGenerationStart({ requestId, field })

    if (!response?.ok || !response.requestId) {
      activeGeneration = null
      clearInlineGenerationWatchdog()
      setInlineGenerateUiState("error", response?.error || "Failed to start generation.")
      return
    }

    inlineRequestId = response.requestId
    touchInlineGenerationWatchdog(response.requestId)
    setInlineGenerateUiState("streaming", "Generating...")
  } catch (error) {
    activeGeneration = null
    clearInlineGenerationWatchdog()
    const detail = toErrorMessage(error)
    console.warn("[ApplyAI] worker message failed:", detail)
    setInlineGenerateUiState("error", mapWorkerMessageError(error))
  }
}

async function requestGenerationStart(payload?: {
  requestId?: string
  field?: ActiveFieldContext
}): Promise<GenerateActiveFieldResponse> {
  const message = {
    type: GENERATE_ACTIVE_FIELD_MESSAGE,
    payload
  }

  try {
    return (await chrome.runtime.sendMessage(message)) as GenerateActiveFieldResponse
  } catch (error) {
    if (!shouldRetryWorkerMessage(error)) {
      throw error
    }

    await waitForMs(GENERATION_START_RETRY_DELAY_MS)
    return (await chrome.runtime.sendMessage(message)) as GenerateActiveFieldResponse
  }
}

function shouldRetryWorkerMessage(error: unknown): boolean {
  const detail = toErrorMessage(error).toLowerCase()
  return (
    detail.includes("receiving end does not exist") ||
    detail.includes("could not establish connection") ||
    detail.includes("message port closed")
  )
}

function mapWorkerMessageError(error: unknown): string {
  const detail = toErrorMessage(error).toLowerCase()

  if (detail.includes("extension context invalidated")) {
    return "Extension updated. Refresh this page and try again."
  }

  if (detail.includes("receiving end does not exist") || detail.includes("could not establish connection")) {
    return "Background worker is not ready. Reload extension and refresh this page."
  }

  if (detail.includes("message port closed")) {
    return "Background worker restarted. Try again once."
  }

  return "Background worker not available."
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function waitForMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function touchInlineGenerationWatchdog(requestId: string): void {
  clearInlineGenerationWatchdog()
  inlineGenerationWatchdogTimer = window.setTimeout(() => {
    if (!inlineRequestId || inlineRequestId !== requestId) {
      return
    }

    inlineRequestId = null
    if (activeGeneration?.requestId === requestId) {
      activeGeneration = null
    }

    setInlineGenerateUiState("error", "Generation timed out. Please retry.")
  }, INLINE_GENERATION_TIMEOUT_MS)
}

function clearInlineGenerationWatchdog(): void {
  if (inlineGenerationWatchdogTimer !== null) {
    window.clearTimeout(inlineGenerationWatchdogTimer)
    inlineGenerationWatchdogTimer = null
  }
}

function setInlineGenerateUiState(state: InlineUiState, detail?: string): void {
  ensureInlineGenerateUi()
  if (!inlineGenerateButton || !inlineGenerateHint) {
    return
  }

  clearInlineStateResetTimer()

  if (state === "idle") {
    inlineGenerateButton.disabled = false
    inlineGenerateButton.textContent = "Generate"
    inlineGenerateButton.style.opacity = "1"
    inlineGenerateHint.textContent = `${portalAdapter.portal.name} ready`
    inlineGenerateHint.style.color = "#475569"
    return
  }

  if (state === "starting") {
    inlineGenerateButton.disabled = true
    inlineGenerateButton.textContent = "Starting..."
    inlineGenerateButton.style.opacity = "0.75"
    inlineGenerateHint.textContent = detail || "Preparing generation..."
    inlineGenerateHint.style.color = "#334155"
    return
  }

  if (state === "streaming") {
    inlineGenerateButton.disabled = true
    inlineGenerateButton.textContent = "Generating..."
    inlineGenerateButton.style.opacity = "0.75"
    inlineGenerateHint.textContent = detail || "Streaming answer..."
    inlineGenerateHint.style.color = "#334155"
    return
  }

  if (state === "success") {
    inlineGenerateButton.disabled = false
    inlineGenerateButton.textContent = "Generate"
    inlineGenerateButton.style.opacity = "1"
    inlineGenerateHint.textContent = detail || "Inserted"
    inlineGenerateHint.style.color = "#166534"
    return
  }

  inlineGenerateButton.disabled = false
  inlineGenerateButton.textContent = "Retry"
  inlineGenerateButton.style.opacity = "1"
  inlineGenerateHint.textContent = detail || "Generation failed"
  inlineGenerateHint.style.color = "#b91c1c"
}

function scheduleInlineStateReset(delayMs: number): void {
  clearInlineStateResetTimer()
  inlineStateResetTimer = window.setTimeout(() => {
    if (activeGeneration) {
      return
    }

    clearInlineGenerationWatchdog()
    inlineRequestId = null
    setInlineGenerateUiState("idle")
  }, delayMs)
}

function clearInlineStateResetTimer(): void {
  if (inlineStateResetTimer !== null) {
    window.clearTimeout(inlineStateResetTimer)
    inlineStateResetTimer = null
  }
}

function findLabelByFor(id: string): HTMLLabelElement | null {
  const escapedId = escapeForCss(id)
  if (!escapedId) {
    return null
  }

  return document.querySelector(`label[for="${escapedId}"]`)
}

function extractNearbyPrompt(target: EditableTarget, ignore: string[]): string | null {
  const container =
    target.closest("fieldset") ||
    target.closest("[role='group']") ||
    target.closest(".form-group") ||
    target.parentElement

  const text = textOrNull(container)
  if (!text) {
    return null
  }

  let normalized = text
  for (const token of ignore) {
    if (!token) {
      continue
    }

    normalized = normalized.replace(token, " ")
  }

  const compact = normalized.replace(/\s+/g, " ").trim()
  if (!compact) {
    return null
  }

  return compact.slice(0, 240)
}

function textOrNull(node: Element | null): string | null {
  if (!node) {
    return null
  }

  const text = node.textContent?.replace(/\s+/g, " ").trim()
  return text || null
}

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!value) {
      continue
    }

    const trimmed = value.trim()
    if (trimmed) {
      return trimmed
    }
  }

  return null
}

function escapeForCss(value: string): string {
  const css = (globalThis as { CSS?: { escape?: (input: string) => string } }).CSS
  if (css?.escape) {
    return css.escape(value)
  }

  return value.replace(/([#.;?+*~":!^$\[\]()=>|/@])/g, "\\$1")
}

console.debug("[ApplyAI] content script ready", portalAdapter.portal)
