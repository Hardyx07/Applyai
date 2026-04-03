// JWT token storage and utility functions
import { TokenResponse, User } from './types';

const TOKEN_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';

export function setTokens(tokens: TokenResponse): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
    // Also set a simple cookie for edge middleware presence check (HTTP only cannot be set from client)
    document.cookie = `${TOKEN_KEY}=${tokens.access_token}; path=/; max-age=86400; SameSite=Lax`;
  }
}

export function getAccessToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(TOKEN_KEY);
  }
  return null;
}

export function getRefreshToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(REFRESH_KEY);
  }
  return null;
}

export function clearTokens(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    document.cookie = `${TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

export function parseJWT(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = parseJWT(token);
  if (!payload || !payload.exp) return true;
  
  const expirationTime = (payload.exp as number) * 1000; // Convert to milliseconds
  const currentTime = new Date().getTime();
  return expirationTime <= currentTime;
}

export function isTokenExpiredSoon(token: string, minutesBefore: number = 1): boolean {
  const payload = parseJWT(token);
  if (!payload || !payload.exp) return true;
  
  const expirationTime = (payload.exp as number) * 1000;
  const currentTime = new Date().getTime();
  const bufferTime = minutesBefore * 60 * 1000; // Convert minutes to milliseconds
  
  return expirationTime <= currentTime + bufferTime;
}

export function extractUserIdFromToken(token: string): string | null {
  const payload = parseJWT(token);
  return (payload?.sub as string) || null;
}
