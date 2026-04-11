'use client';

import React, { createContext, useCallback, useEffect, useState } from 'react';
import { LoginRequest, RegisterRequest, SavedKeysResponse, TokenResponse, User } from '@/app/lib/types';
import {
  setTokens,
  clearTokens,
  extractUserIdFromToken,
  getAccessToken,
  isTokenExpired,
  syncAuthCookieFromStorage,
} from '@/app/lib/auth';
import { apiGet, apiPost } from '@/app/lib/api';
import { clearByokKeys, setByokKeys } from '@/app/lib/byok';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const hydrateSavedKeysFromAccount = useCallback(async () => {
    try {
      const saved = await apiGet<SavedKeysResponse>('/settings/saved-keys');
      if (saved.has_saved_keys && saved.gemini_api_key && saved.cohere_api_key) {
        setByokKeys({
          gemini_api_key: saved.gemini_api_key,
          cohere_api_key: saved.cohere_api_key,
        });
      } else {
        clearByokKeys();
      }
    } catch (error) {
      console.warn('Failed to hydrate account API keys:', error);
    }
  }, []);

  // Hydrate session from token subject (backend token does not include email).
  useEffect(() => {
    const initAuth = async () => {
      try {
        syncAuthCookieFromStorage();
        const token = getAccessToken();
        if (token) {
          if (isTokenExpired(token)) {
            clearTokens();
            setUser(null);
            return;
          }

          const userId = extractUserIdFromToken(token);
          if (userId) {
            setUser({ user_id: userId, email: '' });
            await hydrateSavedKeysFromAccount();
          } else {
            clearTokens();
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [hydrateSavedKeysFromAccount]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const payload: LoginRequest = { email, password };
      const data = await apiPost<TokenResponse>('/auth/login', payload, { skipAuth: true });
      setTokens(data);

      const userId = extractUserIdFromToken(data.access_token);
      if (userId) {
        setUser({ user_id: userId, email });
        await hydrateSavedKeysFromAccount();
      }
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [hydrateSavedKeysFromAccount]);

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    try {
      setIsLoading(true);
      const payload: RegisterRequest = {
        full_name: fullName.trim(),
        email,
        password,
      };
      const data = await apiPost<TokenResponse>(
        '/auth/register',
        payload,
        { skipAuth: true }
      );
      setTokens(data);

      const userId = extractUserIdFromToken(data.access_token);
      if (userId) {
        setUser({ user_id: userId, email });
        await hydrateSavedKeysFromAccount();
      }
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [hydrateSavedKeysFromAccount]);

  const logout = useCallback(() => {
    clearTokens();
    clearByokKeys();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
