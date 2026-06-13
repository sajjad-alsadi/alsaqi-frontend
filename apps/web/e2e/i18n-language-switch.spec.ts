import { test, expect } from './fixtures/backend';
import type { Page } from '@playwright/test';

/**
 * Stream 1 — E2E critical path: language RTL/LTR switch (Task 1.8).
 *
 * Exercises the `i18n.rtl-ltr-switch` critical path: switching the application
 * language between Arabic and English on the login screen and asserting that
 *   1. the rendered interface text updates to the selected language, and
 *   2. the document text direction is `rtl` for Arabic and `ltr` for English.
 *
 * The login screen is used because its language toggle is reachable without
 * authentication and its localized strings are stable. Direction is owned by a
 * single source of truth (`src/i18n.ts`), which flips
 * `document.documentElement.dir`/`lang` on every `languageChanged` event.
 *
 * Runs in `mock` backend mode by default, so no request reaches `:3000`
 * (Req 1.5); the language switch itself is purely client-side.
 *
 * _Requirements: 1.4_
 */

/** Localized strings asserted to prove the rendered language updated. */
const PORTAL_TITLE = {
  ar: 'بوابة التدقيق الداخلي',
  en: 'Internal Audit Portal',
} as const;

/**
 * The login-header language toggle exposes only an icon, so its accessible name
 * is the localized `title` ("اللغة" in Arabic, "Language" in English). Match
 * either so the same locator works in both directions.
 */
function languageToggle(page: Page) {
  return page.getByRole('button', { name: /^(Language|اللغة)$/ });
}

test.describe('Language RTL/LTR switch (Req 1.4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('defaults to Arabic with rtl direction', async ({ page }) => {
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
    await expect(page.getByRole('heading', { name: PORTAL_TITLE.ar })).toBeVisible();
  });

  test('switches to English (ltr) and back to Arabic (rtl)', async ({ page }) => {
    const html = page.locator('html');

    // Baseline: Arabic / RTL.
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
    await expect(page.getByRole('heading', { name: PORTAL_TITLE.ar })).toBeVisible();

    // Switch Arabic -> English: rendered text and direction must update to LTR.
    await languageToggle(page).click();
    await expect(html).toHaveAttribute('dir', 'ltr');
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: PORTAL_TITLE.en })).toBeVisible();
    await expect(page.getByRole('heading', { name: PORTAL_TITLE.ar })).toHaveCount(0);

    // Switch English -> Arabic: direction must return to RTL.
    await languageToggle(page).click();
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
    await expect(page.getByRole('heading', { name: PORTAL_TITLE.ar })).toBeVisible();
    await expect(page.getByRole('heading', { name: PORTAL_TITLE.en })).toHaveCount(0);
  });

  test('keeps document.body direction in sync with the selected language', async ({ page }) => {
    // i18n.ts also mirrors direction onto document.body; verify the pairing holds
    // for both languages (rtl/ar and ltr/en).
    await expect.poll(() => page.evaluate(() => document.body.dir)).toBe('rtl');

    await languageToggle(page).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect.poll(() => page.evaluate(() => document.body.dir)).toBe('ltr');
  });
});
