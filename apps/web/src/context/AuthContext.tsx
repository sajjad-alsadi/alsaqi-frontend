import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api/httpClient';
import { User } from '../types';
import { useUser } from './UserContext';
import logger from '../utils/logger';
import { clearAppStorage } from '../utils/clearAppStorage';

interface AuthContextType {
  token: string | null;
  setToken: (token: string | null) => void;
  logout: () => void;
  isCheckingSession: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const { setUser } = useUser();
  const queryClient = useQueryClient();

  const hasCheckedSession = useRef(false);
  // Session-check retry lifecycle (Requirement 12): hold the pending 503 retry timer
  // so it can be cleared on unmount, and track mount status so no state update runs
  // after the provider has unmounted.
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (!hasCheckedSession.current) {
      const checkLocalSession = async (retries = 3) => {
        if (hasCheckedSession.current && retries === 3) return;
        hasCheckedSession.current = true;
        if (!isMountedRef.current) return;
        setIsCheckingSession(true);
        try {
          const profileRes = await api.get('/profile');
          if (!isMountedRef.current) return;
          if (profileRes.data) {
            setUser(profileRes.data);
            setToken('authenticated');
          }
          setIsCheckingSession(false);
        } catch (err: unknown) {
          if (!isMountedRef.current) return;
          const status = (err as { response?: { status?: number } } | null | undefined)?.response
            ?.status;
          if (status === 503 && retries > 0) {
            logger.warn(`Server is starting up, retrying session check in 2s... (${retries} left)`);
            retryTimerRef.current = setTimeout(() => checkLocalSession(retries - 1), 2000);
            return;
          }
          setUser(null);
          setToken(null);
          setIsCheckingSession(false);
        }
      };
      checkLocalSession();
    }
  }, [setUser]);

  // Clear any pending retry timer and block post-unmount state updates (Req 12.2, 12.3).
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      logger.error('Logout failed', err);
    } finally {
      // Complete logout cleanup (Requirement 10): clear the React Query cache and
      // remove all application-prefixed entries from localStorage/sessionStorage so
      // no cached or drafted data survives logout on a shared device.
      clearAppStorage(queryClient);
      setUser(null);
      setToken(null);
    }
  }, [setUser, queryClient]);

  const value = useMemo(() => ({
    token, setToken, logout, isCheckingSession
  }), [token, logout, isCheckingSession]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
