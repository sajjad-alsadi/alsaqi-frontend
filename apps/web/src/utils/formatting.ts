/**
 * Formatting_Module — the single canonical source of truth for date and number
 * formatting across the Web_App (Requirement 17).
 *
 * Design goals:
 *  - ONE canonical Arabic locale is used for ALL Arabic date/number formatting
 *    (Req 17.1, 17.2). This replaces the previous divergence where `format.ts`
 *    used `ar-EG` while `formatService.ts` used `ar-IQ` plus a manual digit
 *    replacement that dropped grouping separators.
 *  - Arabic output is produced by `Intl` formatters configured with the
 *    canonical locale, so the result equals the canonical Arabic locale's
 *    `Intl` formatter output exactly (Property 19) — no manual digit munging.
 *  - The functions are pure and language-parameterized so they are framework
 *    agnostic and testable without React context. Callers (the `format.ts`
 *    helpers and the `useFormat` hook) route through this module in task 15.2.
 *
 * The Arabic locale `ar-EG` yields Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩) with
 * grouping separators via the `arab` numbering system.
 */

/**
 * The single canonical Arabic locale used for every Arabic date and number
 * format in the application. Do NOT introduce a second Arabic locale anywhere;
 * route formatting through this module instead (Req 17.2, 17.3).
 */
export const CANONICAL_ARABIC_LOCALE = 'ar-EG';

/**
 * Locale used when the active language is not Arabic.
 */
export const FALLBACK_LOCALE = 'en-US';

/**
 * Default currency used by {@link formatCurrency} when none is supplied.
 */
export const DEFAULT_CURRENCY = 'IQD';

/** A value that can be coerced into a `Date`. */
export type DateInput = Date | string | number | null | undefined;

/** A value that can be coerced into a number. */
export type NumberInput = number | string | null | undefined;

/** Options accepted by the formatting functions in addition to `Intl` options. */
export interface LocaleOptions {
  /**
   * The active language (e.g. `'ar'`, `'ar-IQ'`, `'en'`). Any language whose
   * tag starts with `ar` resolves to {@link CANONICAL_ARABIC_LOCALE}; every
   * other language resolves to {@link FALLBACK_LOCALE}. Defaults to Arabic.
   */
  language?: string;
}

/**
 * Resolves an arbitrary language tag to one of the two canonical locales.
 * Exported so tests can assert the canonical-locale invariant directly.
 */
export const resolveLocale = (language?: string): string => {
  const lng = language ?? 'ar';
  return lng.startsWith('ar') ? CANONICAL_ARABIC_LOCALE : FALLBACK_LOCALE;
};

const toDate = (value: DateInput): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toNumber = (value: NumberInput): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isNaN(n) ? null : n;
};

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

const DEFAULT_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
};

const DEFAULT_NUMBER_OPTIONS: Intl.NumberFormatOptions = {
  useGrouping: true,
};

/**
 * Formats a number using the canonical locale's `Intl.NumberFormat`. In Arabic
 * this produces Eastern Arabic numerals with grouping separators. Invalid
 * input is returned as a string unchanged.
 */
export const formatNumber = (
  value: NumberInput,
  options: LocaleOptions & Intl.NumberFormatOptions = {},
): string => {
  const { language, ...numberOptions } = options;
  const n = toNumber(value);
  if (n === null) return value === null || value === undefined ? '' : String(value);
  return new Intl.NumberFormat(resolveLocale(language), {
    ...DEFAULT_NUMBER_OPTIONS,
    ...numberOptions,
  }).format(n);
};

/**
 * Formats a date using the canonical locale's `Intl.DateTimeFormat`. Invalid
 * input is returned as a string unchanged; empty input yields an empty string.
 */
export const formatDate = (
  value: DateInput,
  options: LocaleOptions & Intl.DateTimeFormatOptions = {},
): string => {
  const { language, ...dateOptions } = options;
  const d = toDate(value);
  if (d === null) return value === null || value === undefined ? '' : String(value);
  return new Intl.DateTimeFormat(resolveLocale(language), {
    ...DEFAULT_DATE_OPTIONS,
    ...dateOptions,
  }).format(d);
};

/**
 * Formats a date and time using the canonical locale's `Intl.DateTimeFormat`.
 */
export const formatDateTime = (
  value: DateInput,
  options: LocaleOptions & Intl.DateTimeFormatOptions = {},
): string => {
  const { language, ...dateOptions } = options;
  const d = toDate(value);
  if (d === null) return value === null || value === undefined ? '' : String(value);
  return new Intl.DateTimeFormat(resolveLocale(language), {
    ...DEFAULT_DATE_TIME_OPTIONS,
    ...dateOptions,
  }).format(d);
};

/**
 * Formats a currency amount using the canonical locale's `Intl.NumberFormat`.
 * Defaults to {@link DEFAULT_CURRENCY} with no fractional digits.
 */
export const formatCurrency = (
  value: NumberInput,
  options: LocaleOptions & Intl.NumberFormatOptions & { currency?: string } = {},
): string => {
  const { language, currency = DEFAULT_CURRENCY, ...numberOptions } = options;
  const n = toNumber(value);
  if (n === null) return value === null || value === undefined ? '' : String(value);
  return new Intl.NumberFormat(resolveLocale(language), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    ...numberOptions,
  }).format(n);
};
