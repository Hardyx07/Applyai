// API client wrapper with automatic Bearer header injection and token refresh
import { getAccessToken, setTokens, isTokenExpiredSoon, clearTokens, getRefreshToken } from './auth';
import { TokenResponse, ErrorResponse } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface RequestOptions extends RequestInit {
  byokHeaders?: Record<string, string>;
  skipAuth?: boolean;
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearTokens();
        return false;
      }

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        clearTokens();
        return false;
      }

      const data: TokenResponse = await response.json();
      setTokens(data);
      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      clearTokens();
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function apiCall(
  endpoint: string,
  options: RequestOptions = {}
): Promise<Response> {
  const { byokHeaders = {}, skipAuth = false, ...fetchOptions } = options;

  let headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers,
    ...byokHeaders,
  };

  // Inject auth token if not skipped
  if (!skipAuth) {
    let accessToken = getAccessToken();

    // Check if token will expire soon, refresh preemptively
    if (accessToken && isTokenExpiredSoon(accessToken, 1)) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) {
        throw new Error('Authentication failed. Please log in again.');
      }
      accessToken = getAccessToken();
    }

    if (accessToken) {
      headers = {
        ...headers,
        Authorization: `Bearer ${accessToken}`,
      };
    }
  }

  const url = `${API_BASE_URL}${endpoint}`;
  let response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  // If 401, try refreshing token once
  if (response.status === 401 && !skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const newAccessToken = getAccessToken();
      if (newAccessToken) {
        headers = {
          ...headers,
          Authorization: `Bearer ${newAccessToken}`,
        };
        response = await fetch(url, {
          ...fetchOptions,
          headers,
        });
      }
    }
  }

  return response;
}

export async function apiGet<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const response = await apiCall(endpoint, {
    method: 'GET',
    ...options,
  });

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse;
    throw new APIError(error.detail, response.status);
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(
  endpoint: string,
  body?: Record<string, unknown>,
  options: RequestOptions = {}
): Promise<T> {
  const response = await apiCall(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    ...options,
  });

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse;
    throw new APIError(error.detail, response.status);
  }

  return response.json() as Promise<T>;
}

export async function apiPut<T>(
  endpoint: string,
  body?: Record<string, unknown>,
  options: RequestOptions = {}
): Promise<T> {
  const response = await apiCall(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
    ...options,
  });

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse;
    throw new APIError(error.detail, response.status);
  }

  return response.json() as Promise<T>;
}

export async function apiDelete<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const response = await apiCall(endpoint, {
    method: 'DELETE',
    ...options,
  });

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse;
    throw new APIError(error.detail, response.status);
  }

  return response.json() as Promise<T>;
}

export async function apiStream(
  endpoint: string,
  body?: Record<string, unknown>,
  options: RequestOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  const response = await apiCall(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    ...options,
  });

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse;
    throw new APIError(error.detail, response.status);
  }

  if (!response.body) {
    throw new Error('Response body is not readable');
  }

  return response.body;
}

export class APIError extends Error {
  constructor(
    message: string | Array<{ msg: string; loc: string[] }>,
    public statusCode: number
  ) {
    const errorMessage = Array.isArray(message)
      ? message.map((e) => `${e.loc.join('.')}: ${e.msg}`).join(', ')
      : message;
    super(errorMessage);
    this.name = 'APIError';
  }
}
