import { WEB_APP_BASE_URL } from "~lib/config"

export const CONNECT_START_MESSAGE = "applyai.connect.start"
export const CONNECT_COMPLETE_MESSAGE = "applyai.connect.complete"

export const GENERATE_ACTIVE_FIELD_MESSAGE = "applyai.generate.active-field"
export const GENERATE_PREPARE_TARGET_MESSAGE = "applyai.generate.prepare-target"
export const GENERATE_STREAM_START_MESSAGE = "applyai.generate.stream-start"
export const GENERATE_STREAM_TOKEN_MESSAGE = "applyai.generate.stream-token"
export const GENERATE_STREAM_DONE_MESSAGE = "applyai.generate.stream-done"
export const GENERATE_STREAM_ERROR_MESSAGE = "applyai.generate.stream-error"

export const CONNECT_NONCE_QUERY = "nonce"
export const CONNECT_EXTENSION_ID_QUERY = "ext"

export type PortalId =
  | "linkedin"
  | "greenhouse"
  | "lever"
  | "workday"
  | "ashbyhq"
  | "smartrecruiters"
  | "workatastartup"
  | "generic"

export type PortalContext = {
  id: PortalId
  name: string
  confidence: number
  strategy: "generic" | "shadow-dom" | "iframe-limited"
}

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

export type ActiveFieldContext = {
  portal: PortalContext
  label: string
  name: string | null
  placeholder: string | null
  promptContext: string | null
  fieldType: "input" | "textarea" | "contenteditable"
}

export type GenerateActiveFieldMessage = {
  type: typeof GENERATE_ACTIVE_FIELD_MESSAGE
  payload?: {
    tabId?: number
    requestId?: string
    field?: ActiveFieldContext
  }
}

export type GeneratePrepareTargetMessage = {
  type: typeof GENERATE_PREPARE_TARGET_MESSAGE
  payload: {
    requestId: string
  }
}

export type GenerateStreamStartMessage = {
  type: typeof GENERATE_STREAM_START_MESSAGE
  payload: {
    requestId: string
  }
}

export type GenerateStreamTokenMessage = {
  type: typeof GENERATE_STREAM_TOKEN_MESSAGE
  payload: {
    requestId: string
    token: string
  }
}

export type GenerateStreamDoneMessage = {
  type: typeof GENERATE_STREAM_DONE_MESSAGE
  payload: {
    requestId: string
  }
}

export type GenerateStreamErrorMessage = {
  type: typeof GENERATE_STREAM_ERROR_MESSAGE
  payload: {
    requestId: string
    error: string
  }
}

export type PrepareTargetResponse = {
  ok: boolean
  field?: ActiveFieldContext
  error?: string
}

export type GenerateActiveFieldResponse = {
  ok: boolean
  requestId?: string
  error?: string
}

export type RuntimeMessage =
  | ConnectStartMessage
  | ConnectCompleteMessage
  | GenerateActiveFieldMessage
  | Record<string, unknown>

export function buildConnectUrl(nonce: string, extensionId: string): string {
  const base = WEB_APP_BASE_URL.replace(/\/$/, "")
  const params = new URLSearchParams({
    [CONNECT_NONCE_QUERY]: nonce,
    [CONNECT_EXTENSION_ID_QUERY]: extensionId
  })

  return `${base}/dashboard/extension-connect?${params.toString()}`
}