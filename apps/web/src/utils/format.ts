import i18n from '../i18n';

/**
 * Canonical Arabic locale used for number formatting across the app.
 * `ar-EG` yields Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩) and grouping separators.
 * This MUST stay in sync with the locale used in `formatService.ts` so that
 * `formatNumber` output is identical between the two modules.
 */
const ARABIC_LOCALE = 'ar-EG';

/**
 * Formats numbers for display. In the Arabic locale this delegates to
 * `Intl.NumberFormat(ARABIC_LOCALE, { useGrouping: true })`, which produces
 * Eastern Arabic numerals with proper grouping separators (e.g. ١٬٢٣٤) instead
 * of the previous manual digit replacement that dropped grouping. Non-Arabic
 * locales use the en-US grouped representation.
 */
export const formatNumber = (num: number | string): string => {
  const currentLng = i18n.language || 'ar';

  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return String(num);

  if (currentLng.startsWith('ar')) {
    return new Intl.NumberFormat(ARABIC_LOCALE, { useGrouping: true }).format(n);
  }

  return n.toLocaleString('en-US');
};

/**
 * Formats a date according to the current language.
 */
export const formatDate = (date: Date | string): string => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  
  const currentLng = i18n.language || 'ar';
  return new Intl.DateTimeFormat(currentLng.startsWith('ar') ? 'ar-EG' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
};
