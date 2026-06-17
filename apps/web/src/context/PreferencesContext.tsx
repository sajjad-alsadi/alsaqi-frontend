import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import api from '../api/httpClient';
import { Language } from '../types';
import { useTranslation } from 'react-i18next';

/** Value context — holds read-only preference state. */
interface PreferencesValueType {
  language: Language;
  theme: 'light' | 'dark';
  dashboardLayout: 'standard' | 'compact' | 'detailed';
}

/** Actions context — holds functions that mutate preferences. */
interface PreferencesActionsType {
  setLanguage: (lang: Language) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setDashboardLayout: (layout: 'standard' | 'compact' | 'detailed') => void;
}

/** Legacy combined type for backward compatibility. */
interface PreferencesContextType {
  language: Language;
  theme: 'light' | 'dark';
  dashboardLayout: 'standard' | 'compact' | 'detailed';
  setLanguage: (lang: Language) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setDashboardLayout: (layout: 'standard' | 'compact' | 'detailed') => void;
}

const PreferencesValueContext = createContext<PreferencesValueType | undefined>(undefined);
const PreferencesActionsContext = createContext<PreferencesActionsType | undefined>(undefined);
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
  const { i18n } = useTranslation();

  // Use refs for values that callbacks need for API calls.
  // This avoids subscribing to AuthContext which would couple preference
  // consumers to auth state changes.
  const languageRef = useRef(language);
  languageRef.current = language;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const dashboardLayoutRef = useRef(dashboardLayout);
  dashboardLayoutRef.current = dashboardLayout;

  // Track the stored `notifications_enabled` value so preference updates that
  // concern theme/language/layout never overwrite the user's notification
  // setting with a hardcoded value (Requirement 19.1-19.3). Seeded from
  // localStorage and defaults to `true` when unset.
  const notificationsEnabledRef = useRef<boolean>(
    localStorage.getItem('audit_notifications') === null
      ? true
      : localStorage.getItem('audit_notifications') === 'true'
  );

  // NOTE: Document direction (`document.documentElement.dir`/`lang`) is intentionally
  // NOT set here. `i18n.ts` is the single source of truth for direction: it listens to
  // i18next's `languageChanged` event and updates the document direction whenever the
  // language changes. Since `setLanguage` below calls `i18n.changeLanguage(lang)`, that
  // handler runs automatically. Duplicating the logic here previously caused two
  // independent direction-setting paths (Requirement 11.3).

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    i18n.changeLanguage(lang);
    try {
      localStorage.setItem('audit_lang', lang);
      localStorage.setItem('i18nextLng', lang);
    } catch {}
    // Persist to server - API uses cookie-based auth, so no token check needed.
    // The request will simply fail with 401 if not authenticated (handled by api interceptor).
    try {
      await api.put('/preferences', { language: lang, theme: themeRef.current, dashboard_layout: dashboardLayoutRef.current, notifications_enabled: notificationsEnabledRef.current });
    } catch {
      // Silently fail - local state is already updated
    }
  }, [i18n]);

  const setTheme = useCallback(async (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('audit_theme', newTheme);
    } catch {}
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      await api.put('/preferences', { language: languageRef.current, theme: newTheme, dashboard_layout: dashboardLayoutRef.current, notifications_enabled: notificationsEnabledRef.current });
    } catch {
      // Silently fail - local state is already updated
    }
  }, []);

  const setDashboardLayout = useCallback(async (layout: 'standard' | 'compact' | 'detailed') => {
    setDashboardLayoutState(layout);
    try {
      localStorage.setItem('audit_layout', layout);
    } catch {}
    try {
      await api.put('/preferences', { language: languageRef.current, theme: themeRef.current, dashboard_layout: layout, notifications_enabled: notificationsEnabledRef.current });
    } catch {
      // Silently fail - local state is already updated
    }
  }, []);

  const valueState = useMemo<PreferencesValueType>(() => ({
    language, theme, dashboardLayout
  }), [language, theme, dashboardLayout]);

  const actions = useMemo<PreferencesActionsType>(() => ({
    setLanguage, setTheme, setDashboardLayout
  }), [setLanguage, setTheme, setDashboardLayout]);

  const combined = useMemo<PreferencesContextType>(() => ({
    language, theme, dashboardLayout, setLanguage, setTheme, setDashboardLayout
  }), [language, theme, dashboardLayout, setLanguage, setTheme, setDashboardLayout]);

  return (
    <PreferencesContext.Provider value={combined}>
      <PreferencesValueContext.Provider value={valueState}>
        <PreferencesActionsContext.Provider value={actions}>
          {children}
        </PreferencesActionsContext.Provider>
      </PreferencesValueContext.Provider>
    </PreferencesContext.Provider>
  );
};

/** Read-only preferences state. Does not re-render on action reference changes. */
export const usePreferencesValue = (): PreferencesValueType => {
  const context = useContext(PreferencesValueContext);
  if (!context) throw new Error('usePreferencesValue must be used within PreferencesProvider');
  return context;
};

/** Preferences actions. Does not re-render on preference value changes. */
export const usePreferencesActions = (): PreferencesActionsType => {
  const context = useContext(PreferencesActionsContext);
  if (!context) throw new Error('usePreferencesActions must be used within PreferencesProvider');
  return context;
};

/** Legacy hook — returns combined value + actions. Use usePreferencesValue/usePreferencesActions for selective subscriptions. */
export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used within PreferencesProvider');
  return context;
};
