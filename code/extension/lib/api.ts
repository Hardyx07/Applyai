import { API_BASE_URL } from "~lib/config"
import { clearSession, getSession, setSession, type ByokKeys } from "~lib/storage"

export class ExtensionAPIError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = "ExtensionAPIError"
  }
}

type RequestOptions = {
  method?: string
  body?: unknown
  byok?: ByokKeys | null
  signal?: AbortSignal
}

export async function extensionApiCall(path: string, options: RequestOptions = {}): Promise<Response> {
  const session = await getSession()
  if (!session?.accessToken) {
    throw new ExtensionAPIError("Not authenticated with ApplyAI web app.", 401)
  }

  const response = await doFetch(path, session.accessToken, options)
  if (response.status !== 401 || !session.refreshToken) {
    return response
  }

  const refreshed = await refreshSession(session.refreshToken)
  if (!refreshed) {
    await clearSession()
    return response
  }

  return doFetch(path, refreshed.accessToken, options)
}

export async function extensionApiJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await extensionApiCall(path, options)
  if (!response.ok) {
    throw await mapError(response)
  }

  return response.json() as Promise<T>
}

export async function extensionApiStream(path: string, options: RequestOptions = {}): Promise<Response> {
  const response = await extensionApiCall(path, options)
  if (!response.ok) {
    throw await mapError(response)
  }

  return response
}

async function doFetch(path: string, accessToken: string, options: RequestOptions): Promise<Response> {
  const headers: HeadersInit = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  }

  if (options.byok?.geminiApiKey) {
    headers["X-Gemini-API-Key"] = options.byok.geminiApiKey
  }
  if (options.byok?.cohereApiKey) {
    headers["X-Cohere-API-Key"] = options.byok.cohereApiKey
  }

  return fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal
  })
}

async function refreshSession(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken })
  })

  if (!response.ok) {
    return null
  }

  const payload = (await response.json()) as {
    access_token: string
    refresh_token: string
  }

  const updated = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token
  }
  await setSession(updated)
  return updated
}

async function mapError(response: Response): Promise<ExtensionAPIError> {
  let detail = `Request failed with status ${response.status}`

  try {
    const json = (await response.json()) as { detail?: string }
    if (json.detail) {
      detail = json.detail
    }
  } catch {
    // no-op
  }

  return new ExtensionAPIError(detail, response.status)
}