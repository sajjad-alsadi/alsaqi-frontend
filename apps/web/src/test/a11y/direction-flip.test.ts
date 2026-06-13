// @vitest-environment jsdom
/**
 * Direction-flip verification (Stream 5, task 5.4).
 *
 * Asserts that switching the application language flips `document.dir` and
 * `document.lang` to the pairing the application commits to:
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
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type i18nType from 'i18next';

// Exercise the REAL i18next + direction handler (setup.ts mocks them globally).
vi.unmock('i18next');
vi.unmock('i18next-browser-languagedetector');
vi.unmock('react-i18next');

let i18n: typeof i18nType;

beforeAll(async () => {
  // Dynamic import so the unmock above is in effect when `src/i18n.ts` runs its
  // `init()` and registers the `languageChanged` direction handler.
  i18n = (await import('../../i18n')).default;
  // Ensure initialization has settled before the assertions below.
  if (!i18n.isInitialized) {
    await new Promise<void>((resolve) => i18n.on('initialized', () => resolve()));
  }
});

describe('document direction/language flip on language switch (Req 5.1)', () => {
  it('sets dir="rtl" and lang="ar" when switching to Arabic', async () => {
    await i18n.changeLanguage('ar');

    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.body.dir).toBe('rtl');
  });

  it('sets dir="ltr" and lang="en" when switching to English', async () => {
    await i18n.changeLanguage('en');

    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
    expect(document.body.dir).toBe('ltr');
  });

  it('flips back and forth deterministically across repeated switches', async () => {
    await i18n.changeLanguage('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');

    await i18n.changeLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');

    await i18n.changeLanguage('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });
});
