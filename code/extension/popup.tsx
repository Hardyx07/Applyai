import { useEffect, useState } from "react"

import { ExtensionAPIError, extensionApiJson } from "~lib/api"
import {
  GENERATE_ACTIVE_FIELD_MESSAGE,
  type GenerateActiveFieldResponse
} from "~lib/messages"
import {
  clearByokKeys,
  getByokKeys,
  getSession,
  getStoredProfileState,
  setByokKeys,
  setStoredProfileState,
  type ProfileState,
  type SessionTokens
} from "~lib/storage"
import { WEB_APP_BASE_URL } from "~lib/config"

type PopupState = {
  session: SessionTokens | null
  profile: ProfileState | null
  hasKeys: boolean
}

type KeyInputs = {
  geminiApiKey: string
  cohereApiKey: string
}

type PopupMessage = {
  kind: "success" | "error" | "info"
  text: string
}

type SaveKeysResponse = {
  gemini_valid: boolean
  cohere_valid: boolean
  saved: boolean
  detail: string
}

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

const GENERATION_START_RETRY_DELAY_MS = 160

function prettyIngestStatus(profile: ProfileState | null): string {
  if (!profile) {
    return "Unknown"
  }

  return profile.ingestedAt ? "Ready" : "Needs ingest"
}

async function requestGenerationStart(): Promise<GenerateActiveFieldResponse> {
  const message = { type: GENERATE_ACTIVE_FIELD_MESSAGE }

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
    return "Extension updated. Refresh the page and reopen popup."
  }

  if (detail.includes("receiving end does not exist") || detail.includes("could not establish connection")) {
    return "Background worker is not ready. Reload extension and try again."
  }

  if (detail.includes("message port closed")) {
    return "Background worker restarted. Try again once."
  }

  return "Failed to contact the extension background worker."
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

function App() {
  const [state, setState] = useState<PopupState>({
    session: null,
    profile: null,
    hasKeys: false
  })
  const [keyInputs, setKeyInputs] = useState<KeyInputs>({ geminiApiKey: "", cohereApiKey: "" })
  const [isSavingKeys, setIsSavingKeys] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false)
  const [message, setMessage] = useState<PopupMessage | null>(null)

  const syncProfileState = async (silent = false, sessionOverride: SessionTokens | null = null): Promise<void> => {
    const activeSession = sessionOverride || state.session
    if (!activeSession) {
      return
    }

    setIsRefreshingStatus(true)
    try {
      const profile = await extensionApiJson<ProfileResponse>("/profile")
      const nextProfileState: ProfileState = {
        ingestedAt: profile.ingested_at
      }

      await setStoredProfileState(nextProfileState)
      setState((current) => ({ ...current, profile: nextProfileState }))

      if (!silent) {
        setMessage({ kind: "success", text: "Profile status refreshed." })
      }
    } catch (error) {
      if (error instanceof ExtensionAPIError && error.status === 401) {
        setState((current) => ({ ...current, session: null }))
        setMessage({ kind: "error", text: "Session expired. Reconnect your account." })
      } else if (!silent) {
        setMessage({ kind: "error", text: "Unable to refresh profile status right now." })
      }
    } finally {
      setIsRefreshingStatus(false)
    }
  }

  const syncSavedKeysFromAccount = async (
    silent = false,
    sessionOverride: SessionTokens | null = null
  ): Promise<void> => {
    const activeSession = sessionOverride || state.session
    if (!activeSession) {
      return
    }

    try {
      const saved = await extensionApiJson<SavedKeysResponse>("/settings/saved-keys")
      if (saved.has_saved_keys && saved.gemini_api_key && saved.cohere_api_key) {
        await setByokKeys({
          geminiApiKey: saved.gemini_api_key,
          cohereApiKey: saved.cohere_api_key
        })
        setState((current) => ({ ...current, hasKeys: true }))

        if (!silent) {
          setMessage({ kind: "success", text: "Account keys synced." })
        }
      } else {
        await clearByokKeys()
        setState((current) => ({ ...current, hasKeys: false }))

        if (!silent) {
          setMessage({ kind: "info", text: "No saved account keys found." })
        }
      }
    } catch (error) {
      if (error instanceof ExtensionAPIError && error.status === 401) {
        setState((current) => ({ ...current, session: null }))
        setMessage({ kind: "error", text: "Session expired. Reconnect your account." })
      } else if (!silent) {
        setMessage({ kind: "error", text: "Unable to sync account keys right now." })
      }
    }
  }

  useEffect(() => {
    let mounted = true

    ;(async () => {
      const [session, profile, keys] = await Promise.all([
        getSession(),
        getStoredProfileState(),
        getByokKeys()
      ])

      if (!mounted) {
        return
      }

      setState({
        session,
        profile,
        hasKeys: Boolean(keys?.geminiApiKey && keys?.cohereApiKey)
      })

      if (session) {
        void syncProfileState(true, session)
        void syncSavedKeysFromAccount(true, session)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  const updateKeyInput = (field: keyof KeyInputs, value: string) => {
    setKeyInputs((current) => ({ ...current, [field]: value }))
  }

  const handleSaveKeys = async () => {
    if (!state.session) {
      setMessage({ kind: "error", text: "Connect your account before saving keys." })
      return
    }

    if (!keyInputs.geminiApiKey || !keyInputs.cohereApiKey) {
      setMessage({ kind: "error", text: "Both Gemini and Cohere keys are required." })
      return
    }

    setIsSavingKeys(true)
    setMessage(null)

    try {
      const response = await extensionApiJson<SaveKeysResponse>("/settings/save-keys", {
        method: "POST",
        body: {
          gemini_api_key: keyInputs.geminiApiKey,
          cohere_api_key: keyInputs.cohereApiKey
        }
      })

      if (!response.saved) {
        setMessage({ kind: "error", text: response.detail || "Validation failed." })
        return
      }

      await setByokKeys({
        geminiApiKey: keyInputs.geminiApiKey,
        cohereApiKey: keyInputs.cohereApiKey
      })

      setState((current) => ({ ...current, hasKeys: true }))
      setKeyInputs({ geminiApiKey: "", cohereApiKey: "" })
      setMessage({ kind: "success", text: "Keys validated and saved to your account." })
    } catch (error) {
      if (error instanceof ExtensionAPIError && error.status === 401) {
        setState((current) => ({ ...current, session: null }))
        setMessage({ kind: "error", text: "Session expired. Reconnect your account." })
      } else {
        setMessage({ kind: "error", text: "Failed to validate keys." })
      }
    } finally {
      setIsSavingKeys(false)
    }
  }

  const handleClearKeys = async () => {
    await clearByokKeys()
    setState((current) => ({ ...current, hasKeys: false }))
    setKeyInputs({ geminiApiKey: "", cohereApiKey: "" })
    setMessage({ kind: "info", text: "Stored keys cleared on this browser." })
  }

  const handleConnectAccount = async () => {
    await chrome.runtime.sendMessage({ type: "applyai.connect.start" })
  }

  const handleGenerateForActiveField = async () => {
    if (!state.session) {
      setMessage({ kind: "error", text: "Connect your account before generating." })
      return
    }

    if (!state.hasKeys) {
      setMessage({ kind: "error", text: "Add provider keys before generating." })
      return
    }

    if (!state.profile?.ingestedAt) {
      setMessage({ kind: "error", text: "Profile ingest is required before generation." })
      return
    }

    setIsGenerating(true)
    setMessage(null)

    try {
      const response = await requestGenerationStart()

      if (!response?.ok) {
        setMessage({
          kind: "error",
          text: response?.error || "Could not start generation for the active field."
        })
        return
      }

      setMessage({ kind: "info", text: "Generating for active field. Keep the target field focused." })
    } catch (error) {
      const detail = toErrorMessage(error)
      console.warn("[ApplyAI] popup worker message failed:", detail)
      setMessage({ kind: "error", text: mapWorkerMessageError(error) })
    } finally {
      setIsGenerating(false)
    }
  }

  const openWebDashboard = async () => {
    await chrome.tabs.create({ url: `${WEB_APP_BASE_URL}/dashboard` })
  }

  const refreshStatus = async () => {
    await syncProfileState()
    await syncSavedKeysFromAccount(true)
  }

  const messageColor =
    message?.kind === "success"
      ? "#166534"
      : message?.kind === "error"
        ? "#b91c1c"
        : "#1d4ed8"

  const messageBackground =
    message?.kind === "success"
      ? "#dcfce7"
      : message?.kind === "error"
        ? "#fee2e2"
        : "#dbeafe"

  return (
    <main style={{ fontFamily: "Segoe UI, sans-serif", padding: 12, width: 340 }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 18 }}>ApplyAI Autofill</h1>
      <p style={{ margin: "0 0 12px", color: "#4b5563", fontSize: 12 }}>
        Account-connected assistant for job form generation.
      </p>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 12, marginBottom: 6 }}>Auth: {state.session ? "Connected" : "Not connected"}</div>
        <div style={{ fontSize: 12, marginBottom: 6 }}>BYOK keys: {state.hasKeys ? "Present" : "Missing"}</div>
        <div style={{ fontSize: 12 }}>Profile ingest: {prettyIngestStatus(state.profile)}</div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Provider Keys</div>

        <label style={{ display: "block", fontSize: 11, marginBottom: 4, color: "#374151" }}>Gemini API key</label>
        <input
          type="password"
          value={keyInputs.geminiApiKey}
          onChange={(event) => updateKeyInput("geminiApiKey", event.target.value)}
          placeholder="AIza..."
          style={{
            width: "100%",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            padding: "7px 8px",
            fontSize: 12,
            marginBottom: 8
          }}
        />

        <label style={{ display: "block", fontSize: 11, marginBottom: 4, color: "#374151" }}>Cohere API key</label>
        <input
          type="password"
          value={keyInputs.cohereApiKey}
          onChange={(event) => updateKeyInput("cohereApiKey", event.target.value)}
          placeholder="co_..."
          style={{
            width: "100%",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            padding: "7px 8px",
            fontSize: 12,
            marginBottom: 8
          }}
        />

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={handleSaveKeys}
            disabled={isSavingKeys || !state.session}
            style={{
              flex: 1,
              background: "#0f172a",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              padding: "8px 10px",
              cursor: isSavingKeys || !state.session ? "not-allowed" : "pointer",
              opacity: isSavingKeys || !state.session ? 0.65 : 1,
              fontSize: 12
            }}
          >
            {isSavingKeys ? "Validating..." : "Validate & Save"}
          </button>
          <button
            type="button"
            onClick={handleClearKeys}
            disabled={!state.hasKeys}
            style={{
              background: "#f3f4f6",
              color: "#111827",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              padding: "8px 10px",
              cursor: !state.hasKeys ? "not-allowed" : "pointer",
              opacity: !state.hasKeys ? 0.65 : 1,
              fontSize: 12
            }}
          >
            Clear
          </button>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Generation</div>
        <p style={{ margin: "0 0 8px", fontSize: 11, color: "#4b5563" }}>
          Focus a text field in the job form, then generate directly into that active field.
        </p>
        <button
          type="button"
          onClick={handleGenerateForActiveField}
          disabled={isGenerating || !state.session || !state.hasKeys || !state.profile?.ingestedAt}
          style={{
            width: "100%",
            background: "#0f172a",
            color: "#ffffff",
            border: "none",
            borderRadius: 6,
            padding: "8px 10px",
            cursor:
              isGenerating || !state.session || !state.hasKeys || !state.profile?.ingestedAt
                ? "not-allowed"
                : "pointer",
            opacity: isGenerating || !state.session || !state.hasKeys || !state.profile?.ingestedAt ? 0.65 : 1,
            fontSize: 12
          }}
        >
          {isGenerating ? "Starting..." : "Generate for Active Field"}
        </button>
      </section>

      {message && (
        <div
          style={{
            borderRadius: 6,
            padding: "8px 10px",
            marginBottom: 10,
            fontSize: 12,
            color: messageColor,
            background: messageBackground,
            border: "1px solid rgba(17,24,39,0.08)"
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={handleConnectAccount}
          style={{
            flex: 1,
            background: "#111827",
            color: "#ffffff",
            border: "none",
            borderRadius: 6,
            padding: "8px 10px",
            cursor: "pointer"
          }}
        >
          Connect Account
        </button>
        <button
          type="button"
          onClick={openWebDashboard}
          style={{
            flex: 1,
            background: "#f3f4f6",
            color: "#111827",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            padding: "8px 10px",
            cursor: "pointer"
          }}
        >
          Open Dashboard
        </button>
          <button
            type="button"
            onClick={refreshStatus}
            disabled={isRefreshingStatus || !state.session}
            style={{
              flex: 1,
              background: "#f8fafc",
              color: "#0f172a",
              border: "1px solid #cbd5e1",
              borderRadius: 6,
              padding: "8px 10px",
              cursor: isRefreshingStatus || !state.session ? "not-allowed" : "pointer",
              opacity: isRefreshingStatus || !state.session ? 0.65 : 1
            }}
          >
            {isRefreshingStatus ? "Refreshing..." : "Refresh Status"}
          </button>
      </div>
    </main>
  )
}

export default App