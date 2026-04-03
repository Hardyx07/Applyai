'use client';

import React, { createContext, useCallback, useEffect, useState } from 'react';
import { TokenResponse, User } from '@/app/lib/types';
import { setTokens, clearTokens, extractUserIdFromToken, getAccessToken } from '@/app/lib/auth';
import { apiPost } from '@/app/lib/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = getAccessToken();
        if (token) {
          const userId = extractUserIdFromToken(token);
          if (userId) {
            setUser({ user_id: userId, email: '' });
          }
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const data = await apiPost<TokenResponse>('/auth/login', { email, password }, { skipAuth: true });
      setTokens(data);

      const userId = extractUserIdFromToken(data.access_token);
      if (userId) {
        setUser({ user_id: userId, email });
      }
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const data = await apiPost<TokenResponse>(
        '/auth/register',
        { email, password },
        { skipAuth: true }
      );
      setTokens(data);

      const userId = extractUserIdFromToken(data.access_token);
      if (userId) {
        setUser({ user_id: userId, email });
      }
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearTokens();
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
