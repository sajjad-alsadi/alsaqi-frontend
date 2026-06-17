// @vitest-environment node
/**
 * Property-based test for single active locale loaded.
 *
 * **Property 3: Single active locale loaded**
 *
 * **Validates: Requirements 2.5**
 *
 * Assert that for any locale from {ar, en}, exactly one translation file fetch
 * occurs during init — only `/locales/{activeLocale}.json` is requested, and
 * the other locale's file is NOT fetched.
 *
 * Uses the node environment with a custom backend `request` function to
 * intercept and verify which locale files i18next-http-backend attempts to load.
 * This mirrors the production i18n.ts configuration which uses HttpBackend with
 * loadPath: '/locales/{{lng}}.json'.
 */
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

// Unmock i18next and http-backend so we test real backend loading behavior.
vi.unmock('i18next');
vi.unmock('i18next-http-backend');
vi.unmock('i18next-browser-languagedetector');
vi.unmock('react-i18next');

type Locale = 'ar' | 'en';

describe('Property 3: Single active locale loaded', () => {
  it('loads exactly one locale file matching the active locale during init', async () => {
    // Dynamic import after unmock directives to get real module implementations
    const { default: i18next } = await import('i18next');
    const { default: HttpBackend } = await import('i18next-http-backend');

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Locale>('ar', 'en'),
        async (locale) => {
          const loadedUrls: string[] = [];

          // Create a fresh i18n instance for each property run to avoid shared state
          const instance = i18next.createInstance();

          instance.use(HttpBackend);

          await instance.init({
            lng: locale,
            fallbackLng: false, // Disable fallback to prevent loading additional locales
            supportedLngs: ['ar', 'en'],
            ns: ['translation'],
            defaultNS: 'translation',
            backend: {
              loadPath: '/locales/{{lng}}.json',
              // Custom request function to intercept and track load requests
              // without requiring network access (mirrors production loadPath pattern)
              request: (
                _options: unknown,
                url: string,
                _payload: unknown,
                callback: (err: unknown, response: { status: number; data: string }) => void
              ) => {
                loadedUrls.push(url);
                // Return minimal valid translation JSON
                callback(null, {
                  status: 200,
                  data: JSON.stringify({ test: 'value' }),
                });
              },
            },
            interpolation: { escapeValue: false },
          });

          // Property 1: Exactly one locale file load occurred
          expect(loadedUrls).toHaveLength(1);

          // Property 2: The loaded file matches the active locale
          expect(loadedUrls[0]).toBe(`/locales/${locale}.json`);

          // Property 3: The OTHER locale file was NOT loaded
          const otherLocale: Locale = locale === 'ar' ? 'en' : 'ar';
          const otherLocaleFetches = loadedUrls.filter((url) =>
            url.includes(`/locales/${otherLocale}.json`)
          );
          expect(otherLocaleFetches).toHaveLength(0);
        }
      ),
      { numRuns: 50 }
    );
  });
});
