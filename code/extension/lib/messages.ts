import { WEB_APP_BASE_URL } from "~lib/config"

export const CONNECT_START_MESSAGE = "applyai.connect.start"
export const CONNECT_COMPLETE_MESSAGE = "applyai.connect.complete"

export const CONNECT_NONCE_QUERY = "nonce"
export const CONNECT_EXTENSION_ID_QUERY = "ext"

export type ConnectStartMessage = {
  type: typeof CONNECT_START_MESSAGE
}

export type ConnectCompleteMessage = {
  type: typeof CONNECT_COMPLETE_MESSAGE
  payload: {
    nonce: string
    accessToken: string
    refreshToken: string
  }
}

export type RuntimeMessage = ConnectStartMessage | ConnectCompleteMessage | Record<string, unknown>

export function buildConnectUrl(nonce: string, extensionId: string): string {
  const base = WEB_APP_BASE_URL.replace(/\/$/, "")
  const params = new URLSearchParams({
    [CONNECT_NONCE_QUERY]: nonce,
    [CONNECT_EXTENSION_ID_QUERY]: extensionId
  })

  return `${base}/dashboard/extension-connect?${params.toString()}`
}