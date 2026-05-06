import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../services/api';
import { Language } from '../types';
import { useAuth } from './AuthContext';
import { useTranslation } from 'react-i18next';

interface PreferencesContextType {
  language: Language;
  theme: 'light' | 'dark';
  dashboardLayout: 'standard' | 'compact' | 'detailed';
  setLanguage: (lang: Language) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setDashboardLayout: (layout: 'standard' | 'compact' | 'detailed') => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export const PreferencesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('audit_lang') as Language) || Language.AR;
  });
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('audit_theme') as 'light' | 'dark') || 'light';
  });
  const [dashboardLayout, setDashboardLayoutState] = useState<'standard' | 'compact' | 'detailed'>(() => {
    return (localStorage.getItem('audit_layout') as 'standard' | 'compact' | 'detailed') || 'standard';
  });
  const { token } = useAuth();
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    i18n.changeLanguage(lang);
    try {
      localStorage.setItem('audit_lang', lang);
      localStorage.setItem('i18nextLng', lang); // Important for i18n detection consistency
    } catch (e) {}
    if (token) {
      try {
        await api.put('/preferences', { language: lang, theme, dashboard_layout: dashboardLayout, notifications_enabled: true });
      } catch (err) {
        console.error('Failed to save language preference', err);
      }
    }
  };

  const setTheme = async (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('audit_theme', newTheme);
    } catch (e) {}
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    if (token) {
      try {
        await api.put('/preferences', { language, theme: newTheme, dashboard_layout: dashboardLayout, notifications_enabled: true });
      } catch (err) {
        console.error('Failed to save theme preference', err);
      }
    }
  };

  const setDashboardLayout = async (layout: 'standard' | 'compact' | 'detailed') => {
    setDashboardLayoutState(layout);
    try {
      localStorage.setItem('audit_layout', layout);
    } catch (e) {}
    if (token) {
      try {
        await api.put('/preferences', { language, theme, dashboard_layout: layout, notifications_enabled: true });
      } catch (err) {
        console.error('Failed to save layout preference', err);
      }
    }
  };

  return (
    <PreferencesContext.Provider value={{ language, theme, dashboardLayout, setLanguage, setTheme, setDashboardLayout }}>
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used within PreferencesProvider');
  return context;
};
