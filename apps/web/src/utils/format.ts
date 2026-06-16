import i18n from '../i18n';
import {
  formatNumber as canonicalFormatNumber,
  formatDate as canonicalFormatDate,
} from './formatting';

/**
 * Thin compatibility wrappers that route through the canonical Formatting_Module
 * (`utils/formatting.ts`). The previous divergent `ar-EG` implementation has been
 * removed so no second Arabic locale remains anywhere (Req 17.3, 17.4).
 *
 * @deprecated Prefer importing directly from `utils/formatting` or using the
 * `useFormat` hook in `utils/formatService`.
 */
export const formatNumber = (num: number | string): string =>
  canonicalFormatNumber(num, { language: i18n.language });

/**
 * Formats a date according to the current language. Delegates to the canonical
 * module; the long month / numeric day presentation is preserved for callers.
 */
export const formatDate = (date: Date | string): string =>
  canonicalFormatDate(date, {
    language: i18n.language,
    month: 'long',
    day: 'numeric',
  });
