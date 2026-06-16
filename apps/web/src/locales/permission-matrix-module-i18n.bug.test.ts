/**
 * Bug Condition Exploration Test — Permission Matrix Module i18n
 * ==============================================================
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5**
 *
 * Property 1: Bug Condition — Affected Module Identifiers Resolve To Localized Labels
 *
 * CRITICAL: This test is EXPECTED TO FAIL on the unfixed locale files. The failure
 * confirms the bug exists — five backend module identifiers have no matching key in
 * the `modules` translation namespace, so i18next's parseMissingKeyHandler returns the
 * `⚠️ [<key>]` fallback instead of a localized label.
 *
 * After the fix (adding the five keys to en.json and ar.json), this same test will PASS,
 * confirming the affected identifiers resolve to clean localized labels in both languages.
 *
 * Approach:
 * - Create an isolated i18next instance (createInstance) loaded from en.json + ar.json
 * - Replicate the parseMissingKeyHandler shape from src/i18n.ts (returns `⚠️ [<key>]`)
 * - Scoped PBT: cross product of affected identifiers × languages { en, ar }
 * - For each (identifier, language), resolve t('modules.' + identifier, { lng }) and assert
 *   the result (a) does NOT contain `⚠️`, (b) is NOT equal to `[modules.<identifier>]`,
 *   and (c) has length > 0
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import fc from 'fast-check';

// Unmock i18next so we can use the real module for translation testing
vi.unmock('i18next');

import { createInstance } from 'i18next';
import ar from './ar.json';
import en from './en.json';

// ─── Affected module identifiers (the Bug Condition scope) ──────────────────

const AFFECTED_IDENTIFIERS = [
  'AuditEvidence',
  'AuditFindings',
  'ComplianceMatrix',
  'Notifications',
  'SystemLogs',
] as const;

const LANGUAGES = ['en', 'ar'] as const;

// ─── Bug Condition check ────────────────────────────────────────────────────

/**
 * isBugCondition(input) is true when the module identifier is one of the five
 * affected identifiers AND the key is absent from the `modules` namespace for the
 * given language. On the unfixed files this holds for all five identifiers in both
 * languages.
 */
function keyExists(identifier: string, localeResource: Record<string, unknown>): boolean {
  const modules = localeResource['modules'];
  return (
    !!modules &&
    typeof modules === 'object' &&
    identifier in (modules as Record<string, unknown>)
  );
}

function isBugCondition(identifier: string, localeResource: Record<string, unknown>): boolean {
  return (
    (AFFECTED_IDENTIFIERS as readonly string[]).includes(identifier) &&
    !keyExists(identifier, localeResource)
  );
}

// ─── i18next initialization (isolated instance) ────────────────────────────

// Use createInstance to avoid conflicts with other test files using the global i18n
const i18nInstance = createInstance();

beforeAll(async () => {
  await i18nInstance.init({
    resources: {
      ar: { translation: ar },
      en: { translation: en },
    },
    lng: 'ar',
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

const resources: Record<string, Record<string, unknown>> = {
  en: en as unknown as Record<string, unknown>,
  ar: ar as unknown as Record<string, unknown>,
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Bug Condition Exploration — Permission Matrix Module i18n (EXPECTED TO FAIL on unfixed code)', () => {
  /**
   * Property 1: Bug Condition / Expected Behavior — For every affected module
   * identifier and every language, the resolved label must be a clean localized
   * string (no `⚠️`, not the raw key, non-empty).
   *
   * Scoped PBT over the cross product of identifiers × languages.
   *
   * **Validates: Requirements 1.1-1.5, 2.1-2.5**
   */
  it('Property 1: affected module identifiers resolve to clean localized labels in en and ar', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...AFFECTED_IDENTIFIERS),
        fc.constantFrom(...LANGUAGES),
        (identifier: string, lng: string) => {
          const key = `modules.${identifier}`;
          const result = i18nInstance.t(key, { lng });

          // (a) does NOT contain the missing-translation warning marker
          expect(result).not.toContain('⚠️');
          // (b) is NOT the raw fallback key
          expect(result).not.toBe(`[${key}]`);
          // (c) has length > 0
          expect(result.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: AFFECTED_IDENTIFIERS.length * LANGUAGES.length }
    );
  });

  // Explicit per-case assertions to surface each concrete counterexample clearly.
  for (const identifier of AFFECTED_IDENTIFIERS) {
    for (const lng of LANGUAGES) {
      it(`modules.${identifier} (${lng}) resolves to a clean localized label`, () => {
        const key = `modules.${identifier}`;
        const result = i18nInstance.t(key, { lng });

        expect(result).not.toContain('⚠️');
        expect(result).not.toBe(`[${key}]`);
        expect(result.length).toBeGreaterThan(0);
      });
    }
  }

  /**
   * Documents that, after the fix, the affected identifiers no longer satisfy the
   * bug condition on the locale files: the key is now present in the `modules`
   * namespace, so isBugCondition returns false.
   */
  it('documents that all five affected identifiers are now present in the modules namespace after the fix', () => {
    for (const identifier of AFFECTED_IDENTIFIERS) {
      for (const lng of LANGUAGES) {
        expect(isBugCondition(identifier, resources[lng])).toBe(false);
      }
    }
  });
});
