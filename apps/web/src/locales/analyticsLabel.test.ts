/**
 * Unit Tests — Analytics Module i18n Label Localization
 * =====================================================
 * **Validates: Requirements 27.1, 27.2, 27.3**
 *
 * These tests verify the newly-added `modules.Analytics` key resolves to its exact
 * localized label in both English ('Analytics') and Arabic ('التحليلات'), that the
 * active-language label resolves with no `⚠️` missing-translation marker, and that
 * both locale files parse as valid JSON and actually contain the new key.
 *
 * Uses the same isolated `createInstance` + `parseMissingKeyHandler` pattern as the
 * existing `permission-matrix-module-i18n.unit.test.ts`, driving translation through
 * a REAL i18next instance loaded from the actual en.json / ar.json. The
 * `parseMissingKeyHandler` injects a `⚠️` marker for any unresolved key, so a clean
 * label proves the active-language resource resolved the key (Req 27.3).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeAll, vi } from 'vitest';

// Unmock i18next so we can use the real module for translation testing.
vi.unmock('i18next');

import { createInstance } from 'i18next';
import ar from './ar.json';
import en from './en.json';

// ─── Expected localized labels for the Analytics identifier ──────────────────

const EXPECTED_EN_ANALYTICS = 'Analytics';
const EXPECTED_AR_ANALYTICS = 'التحليلات';

// ─── Isolated i18next instance (mirrors i18n.ts shape) ───────────────────────

const i18nInstance = createInstance();

beforeAll(async () => {
  await i18nInstance.init({
    resources: {
      ar: { translation: ar },
      en: { translation: en },
    },
    lng: 'en',
    fallbackLng: 'ar',
    supportedLngs: ['en', 'ar'],
    interpolation: { escapeValue: false },
    parseMissingKeyHandler: (key: string) => {
      return `⚠️ [${key}]`;
    },
    saveMissing: false,
    returnNull: false,
    returnEmptyString: false,
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Analytics i18n — active-language label resolution (Req 27.3)', () => {
  it('resolves modules.Analytics to "Analytics" when the active language is English', async () => {
    await i18nInstance.changeLanguage('en');
    const result = i18nInstance.t('modules.Analytics');
    expect(result).toBe(EXPECTED_EN_ANALYTICS);
    expect(result).not.toContain('⚠️');
  });

  it('resolves modules.Analytics to "التحليلات" when the active language is Arabic', async () => {
    await i18nInstance.changeLanguage('ar');
    const result = i18nInstance.t('modules.Analytics');
    expect(result).toBe(EXPECTED_AR_ANALYTICS);
    expect(result).not.toContain('⚠️');

    // Reset for any subsequent tests/instances.
    await i18nInstance.changeLanguage('en');
  });

  it('resolves modules.Analytics per explicit lng option for both languages', () => {
    expect(i18nInstance.t('modules.Analytics', { lng: 'en' })).toBe(EXPECTED_EN_ANALYTICS);
    expect(i18nInstance.t('modules.Analytics', { lng: 'ar' })).toBe(EXPECTED_AR_ANALYTICS);
  });
});

describe('Analytics i18n — locale files define modules.Analytics (Req 27.1, 27.2)', () => {
  it('en.json parses as valid JSON and contains modules.Analytics = "Analytics"', () => {
    const raw = readFileSync(path.resolve(process.cwd(), 'src/locales/en.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { modules: Record<string, string> };
    expect(parsed.modules).toHaveProperty('Analytics');
    expect(parsed.modules.Analytics).toBe(EXPECTED_EN_ANALYTICS);
  });

  it('ar.json parses as valid JSON and contains modules.Analytics = "التحليلات"', () => {
    const raw = readFileSync(path.resolve(process.cwd(), 'src/locales/ar.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { modules: Record<string, string> };
    expect(parsed.modules).toHaveProperty('Analytics');
    expect(parsed.modules.Analytics).toBe(EXPECTED_AR_ANALYTICS);
  });
});
