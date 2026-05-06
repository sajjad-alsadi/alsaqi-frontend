import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import i18n from '../i18n';
import { useAuth } from './AuthContext';
import { useUser } from './UserContext';
import { usePreferences } from './PreferencesContext';
import { User, Language } from '../types';

interface AppContextType {
  user: User | null;
  token: string | null;
  language: Language;
  theme: 'light' | 'dark';
  dashboardLayout: 'standard' | 'compact' | 'detailed';
  login: (user: User, token: string) => void;
  logout: () => void;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setDashboardLayout: (layout: 'standard' | 'compact' | 'detailed') => void;
  updateUser: (userData: Partial<User>) => void;
  setActiveTab: (tab: string) => void;
  fetchNotifications: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token, setToken, logout: authLogout } = useAuth();
  const { user, setUser, updateUser } = useUser();
  const { language, theme, dashboardLayout, setLanguage, setTheme, setDashboardLayout } = usePreferences();
  
  useEffect(() => {
    i18n.changeLanguage(language);
  }, [language]);
  
  // State that remains in AppContext for now
  const [activeTab, setActiveTab] = React.useState('dashboard');

  const login = React.useCallback((userData: User, authToken: string) => {
    setUser(userData);
    setToken(authToken);
  }, [setUser, setToken]);

  const logout = React.useCallback(async () => {
    authLogout();
    setUser(null);
  }, [authLogout, setUser]);

  const fetchNotifications = async () => {};

  return (
    <AppContext.Provider value={{ 
      user, token, language, theme, dashboardLayout,
      login, logout, setLanguage, setTheme, setDashboardLayout, updateUser, setActiveTab,
      fetchNotifications
    }}>
      <div dir={language === 'ar' ? 'rtl' : 'ltr'} className={language === 'ar' ? 'font-arabic' : 'font-sans'}>
        {children}
      </div>
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
