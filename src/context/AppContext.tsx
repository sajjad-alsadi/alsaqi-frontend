import React, { createContext, useContext, ReactNode, useEffect, useMemo, useCallback } from 'react';
import i18n from '../i18n';
import { useAuth } from './AuthContext';
import { useUser } from './UserContext';
import { usePreferences } from './PreferencesContext';
import { User } from '../types';

interface AppContextType {
  login: (user: User, token: string) => void;
  logout: () => void;
  setActiveTab: (tab: string) => void;
  fetchNotifications: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { setToken, logout: authLogout } = useAuth();
  const { setUser } = useUser();
  const { language } = usePreferences();
  
  useEffect(() => {
    i18n.changeLanguage(language);
  }, [language]);
  
  // State that remains in AppContext for orchestration
  const [, setActiveTab] = React.useState('dashboard');

  const login = useCallback((userData: User, authToken: string) => {
    setUser(userData);
    setToken(authToken);
  }, [setUser, setToken]);

  const logout = useCallback(async () => {
    authLogout();
    setUser(null);
  }, [authLogout, setUser]);

  const fetchNotifications = useCallback(async () => {}, []);

  const value = useMemo(() => ({
    login, logout, setActiveTab, fetchNotifications
  }), [login, logout, fetchNotifications]);

  // Memoize the directional wrapper to prevent re-renders of children
  // when AppProvider re-renders due to auth state changes
  const wrappedChildren = useMemo(() => (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className={language === 'ar' ? 'font-arabic' : 'font-sans'}>
      {children}
    </div>
  ), [language, children]);

  return (
    <AppContext.Provider value={value}>
      {wrappedChildren}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
