import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import api from '../services/api';
import { User } from '../types';
import { useUser } from './UserContext';
import logger from '../utils/logger';

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

  const hasCheckedSession = React.useRef(false);

  useEffect(() => {
    if (!hasCheckedSession.current) {
      const checkLocalSession = async (retries = 3) => {
        if (hasCheckedSession.current && retries === 3) return;
        hasCheckedSession.current = true;
        setIsCheckingSession(true);
        try {
          const profileRes = await api.get('/profile');
          if (profileRes.data) {
            setUser(profileRes.data);
            setToken('authenticated'); 
          }
          setIsCheckingSession(false);
        } catch (err: any) {
          if (err.response?.status === 503 && retries > 0) {
            logger.warn(`Server is starting up, retrying session check in 2s... (${retries} left)`);
            setTimeout(() => checkLocalSession(retries - 1), 2000);
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

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      logger.error('Logout failed', err);
    } finally {
      setUser(null);
      setToken(null);
    }
  }, [setUser]);

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
