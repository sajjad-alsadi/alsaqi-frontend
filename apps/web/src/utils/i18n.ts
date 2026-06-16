import i18next from 'i18next';
import {
  formatNumber as canonicalFormatNumber,
  formatDate as canonicalFormatDate,
} from './formatting';

export type Language = 'en' | 'ar';

export const t = (key: string, lang: Language): string => {
  return i18next.t(key, { lng: lang });
};

/**
 * Number formatting now routes through the canonical Formatting_Module so the
 * Arabic locale (`ar-EG`) is the single source of truth (Req 17.3, 17.4).
 */
export const formatNumber = (value: number, lang: Language): string => {
  return canonicalFormatNumber(value, { language: lang });
};

/**
 * Date formatting routes through the canonical Formatting_Module. The long
 * month / numeric day presentation is preserved for existing callers.
 */
export const formatDate = (date: Date | string, lang: Language): string => {
  return canonicalFormatDate(date, { language: lang, month: 'long', day: 'numeric' });
};

export const translateStatus = (status: string, lang: Language): string => {
  return i18next.t(status, { lng: lang });
};
