export interface ByokKeys {
  gemini_api_key: string;
  cohere_api_key: string;
}

const BYOK_STORAGE_KEY = 'applyai_byok_keys';

const emptyKeys: ByokKeys = {
  gemini_api_key: '',
  cohere_api_key: '',
};

export function getByokKeys(): ByokKeys {
  if (typeof window === 'undefined') {
    return emptyKeys;
  }

  try {
    const raw = localStorage.getItem(BYOK_STORAGE_KEY);
    if (!raw) return emptyKeys;

    const parsed = JSON.parse(raw) as Partial<ByokKeys>;
    return {
      gemini_api_key: parsed.gemini_api_key || '',
      cohere_api_key: parsed.cohere_api_key || '',
    };
  } catch {
    return emptyKeys;
  }
}

export function setByokKeys(keys: ByokKeys): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify({
    gemini_api_key: keys.gemini_api_key,
    cohere_api_key: keys.cohere_api_key,
  }));
}

export function clearByokKeys(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(BYOK_STORAGE_KEY);
}

export function hasByokKeys(): boolean {
  const keys = getByokKeys();
  return Boolean(keys.gemini_api_key && keys.cohere_api_key);
}
