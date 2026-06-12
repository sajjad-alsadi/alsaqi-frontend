import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ar from './locales/ar.json';
import en from './locales/en.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ar: { translation: ar },
      en: { translation: en }
    },
    // Arabic-first decision: this is an Arabic-primary application, so when no
    // persisted/detected language is available we default to Arabic (RTL). The
    // initial language prefers the persisted `i18nextLng` value, otherwise 'ar'.
    // `LanguageDetector` is enabled (order: localStorage -> cookie -> navigator)
    // to allow browser-language detection for first-time visitors, but the
    // `fallbackLng` remains 'ar' so any unsupported/undetected case lands on Arabic.
    lng: localStorage.getItem('i18nextLng') || 'ar',
    fallbackLng: 'ar',
    supportedLngs: ['en', 'ar'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'cookie', 'navigator'],
      caches: ['localStorage', 'cookie']
    },
    parseMissingKeyHandler: (key: string) => {
      // Fallback: try the other language, or show key ID with visual indicator
      const currentLng = i18n.language || 'ar';
      const otherLng = currentLng === 'ar' ? 'en' : 'ar';
      const otherResources = i18n.getResourceBundle(otherLng, 'translation');
      
      // Try to resolve the key from the other language
      const keys = key.split('.');
      let value: unknown = otherResources;
      for (const k of keys) {
        if (value && typeof value === 'object' && k in (value as Record<string, unknown>)) {
          value = (value as Record<string, unknown>)[k];
        } else {
          value = undefined;
          break;
        }
      }
      
      if (typeof value === 'string' && value.length > 0) {
        return `⚠️ ${value}`;
      }
      
      // Show key ID with visual indicator if no translation found in either language
      return `⚠️ [${key}]`;
    },
    saveMissing: false,
    returnNull: false,
    returnEmptyString: false,
  });

// Single source of truth for document direction.
// Direction-setting lives ONLY here (Requirement 11.3): the `languageChanged`
// handler updates `document.documentElement.dir`/`lang` (and `document.body.dir`)
// whenever the active language changes. Do not duplicate this logic elsewhere
// (e.g. in PreferencesContext); call `i18n.changeLanguage(...)` instead.
const updateDirection = (lng: string) => {
  const dir = lng === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
  document.body.dir = dir;
};

i18n.on('languageChanged', (lng) => {
  updateDirection(lng);
});

// Initialize direction based on current language
updateDirection(i18n.language || 'ar');

export default i18n;
