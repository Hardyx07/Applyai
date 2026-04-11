const STORAGE_KEYS = {
  SESSION: "applyai.session",
  BYOK: "applyai.byok",
  PROFILE: "applyai.profile",
  CONNECT_NONCE: "applyai.connect.nonce"
} as const

export type SessionTokens = {
  accessToken: string
  refreshToken: string
}

export type ByokKeys = {
  geminiApiKey: string
  cohereApiKey: string
}

export type ProfileState = {
  ingestedAt: string | null
}

type StoreShape = {
  [STORAGE_KEYS.SESSION]?: SessionTokens
  [STORAGE_KEYS.BYOK]?: ByokKeys
  [STORAGE_KEYS.PROFILE]?: ProfileState
  [STORAGE_KEYS.CONNECT_NONCE]?: string
}

export async function getSession(): Promise<SessionTokens | null> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.SESSION)
  return (data as StoreShape)[STORAGE_KEYS.SESSION] ?? null
}

export async function setSession(session: SessionTokens): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SESSION]: session })
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.SESSION)
}

export async function getByokKeys(): Promise<ByokKeys | null> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.BYOK)
  return (data as StoreShape)[STORAGE_KEYS.BYOK] ?? null
}

export async function setByokKeys(keys: ByokKeys): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.BYOK]: keys })
}

export async function clearByokKeys(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.BYOK)
}

export async function getStoredProfileState(): Promise<ProfileState | null> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.PROFILE)
  return (data as StoreShape)[STORAGE_KEYS.PROFILE] ?? null
}

export async function setStoredProfileState(profile: ProfileState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.PROFILE]: profile })
}

export async function getPendingNonce(): Promise<string | null> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.CONNECT_NONCE)
  return ((data as StoreShape)[STORAGE_KEYS.CONNECT_NONCE] as string | undefined) ?? null
}

export async function setPendingNonce(nonce: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.CONNECT_NONCE]: nonce })
}

export async function clearPendingNonce(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.CONNECT_NONCE)
}