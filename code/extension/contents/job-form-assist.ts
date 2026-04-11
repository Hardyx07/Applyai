import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: [
    "https://*.linkedin.com/*",
    "https://*.greenhouse.io/*",
    "https://*.lever.co/*",
    "https://*.workday.com/*",
    "https://*.ashbyhq.com/*",
    "https://*.smartrecruiters.com/*"
  ],
  run_at: "document_idle"
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "applyai.fill.active") {
    return
  }

  const active = document.activeElement
  if (!active) {
    return
  }

  const text = typeof message.payload?.text === "string" ? message.payload.text : ""
  if (!text) {
    return
  }

  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    active.value = text
    active.dispatchEvent(new Event("input", { bubbles: true }))
    active.dispatchEvent(new Event("change", { bubbles: true }))
    return
  }

  if (active instanceof HTMLElement && active.isContentEditable) {
    active.textContent = text
    active.dispatchEvent(new Event("input", { bubbles: true }))
  }
})

console.debug("[ApplyAI] content script ready")