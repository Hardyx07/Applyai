import { chromium } from "@playwright/test"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const extensionPath = path.join(repoRoot, "extension", "build", "chrome-mv3-prod")
const userDataDir = path.join(repoRoot, ".playwright", "extension-smoke-user-data")

async function main() {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  })

  try {
    let serviceWorker = context.serviceWorkers()[0]
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker", { timeout: 30000 })
    }

    const extensionId = serviceWorker.url().split("/")[2]
    const popupUrl = `chrome-extension://${extensionId}/popup.html`

    const page = await context.newPage()
    await page.goto(popupUrl, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    const title = await page.title()
    const bodyText = await page.locator("body").innerText()
    const hasApplyAiText = /applyai|apply ai/i.test(bodyText)

    console.log("Extension ID:", extensionId)
    console.log("Popup title:", title || "(empty)")
    console.log("Popup contains ApplyAI text:", hasApplyAiText)

    if (!hasApplyAiText) {
      throw new Error("Popup loaded but expected ApplyAI marker text was not found.")
    }

    console.log("Smoke test passed: extension loaded and popup is reachable.")
  } finally {
    await context.close()
  }
}

main().catch((error) => {
  console.error("Smoke test failed:", error)
  process.exitCode = 1
})
