// @vitest-environment jsdom
/**
 * Property 6: Direction correctness (Stream 5, task 5.5).
 *
 * **Validates: Requirements 5.1**
 *
 * For ANY sequence of language switches (between 'ar' and 'en', possibly
 * repeated), after each switch `document.dir`/`document.lang` reflect the
 * selected language:
 *   - Arabic  ⇒ `dir="rtl"`, `lang="ar"`
 *   - English ⇒ `dir="ltr"`, `lang="en"`
 *
 * The single source of truth for direction is the `languageChanged` handler in
 * `src/i18n.ts` (it updates `document.documentElement.dir`/`lang` and
 * `document.body.dir`). To exercise that real handler — rather than the global
 * `i18next` test double installed in `src/test/setup.ts` — this file unmocks
 * `i18next` and its companion modules and imports the real `i18n` instance.
 *
 * @see Requirement 5.1
 */
import { describe, it, beforeAll, expect, vi } from 'vitest';
import fc from 'fast-check';
import type i18nType from 'i18next';

// Exercise the REAL i18next + direction handler (setup.ts mocks them globally).
vi.unmock('i18next');
vi.unmock('i18next-browser-languagedetector');
vi.unmock('react-i18next');

let i18n: typeof i18nType;

type Lang = 'ar' | 'en';

/** The pairing the application commits to for each language. */
const expected = (lng: Lang) =>
  lng === 'ar' ? { dir: 'rtl', lang: 'ar' } : { dir: 'ltr', lang: 'en' };

beforeAll(async () => {
  // Dynamic import so the unmock above is in effect when `src/i18n.ts` runs its
  // `init()` and registers the `languageChanged` direction handler.
  i18n = (await import('../../i18n')).default;
  if (!i18n.isInitialized) {
    await new Promise<void>((resolve) => i18n.on('initialized', () => resolve()));
  }
  // Preload empty resource bundles so `changeLanguage` resolves synchronously
  // instead of awaiting the HttpBackend fetch of `/locales/{{lng}}.json`, which
  // never resolves under jsdom and would otherwise time out these tests.
  if (!i18n.hasResourceBundle('ar', 'translation')) {
    i18n.addResourceBundle('ar', 'translation', {});
  }
  if (!i18n.hasResourceBundle('en', 'translation')) {
    i18n.addResourceBundle('en', 'translation', {});
  }
});

describe('Property 6: Direction correctness (Req 5.1)', () => {
  it('document.dir/lang match the selected language after every switch in any sequence', async () => {
    await fc.assert(
      fc.asyncProperty(
        // A non-empty random sequence of language switches, with repeats allowed.
        fc.array(fc.constantFrom<Lang>('ar', 'en'), { minLength: 1, maxLength: 30 }),
        async (sequence) => {
          for (const lng of sequence) {
            await i18n.changeLanguage(lng);

            const { dir, lang } = expected(lng);
            // Invariant holds after EACH switch, regardless of prior state.
            expect(document.documentElement.dir).toBe(dir);
            expect(document.documentElement.lang).toBe(lang);
            expect(document.body.dir).toBe(dir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
