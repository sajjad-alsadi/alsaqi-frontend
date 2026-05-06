import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../services/api';
import { User } from '../types';
import { useUser } from './UserContext';

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
            console.warn(`Server is starting up, retrying session check in 2s... (${retries} left)`);
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

  const logout = React.useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Logout failed', err);
    } finally {
      setUser(null);
      setToken(null);
    }
  }, [setUser, setToken]);

  return (
    <AuthContext.Provider value={{ token, setToken, logout, isCheckingSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
