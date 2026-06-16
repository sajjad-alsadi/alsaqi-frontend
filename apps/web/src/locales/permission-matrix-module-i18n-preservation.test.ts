/**
 * Preservation Property Test — Permission Matrix Module i18n
 * ==========================================================
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * Property 2: Preservation — Existing Translation Keys Unchanged
 *
 * This test captures the baseline behavior of the UNFIXED locale files and asserts
 * it. It MUST PASS on the unfixed code — confirming the behavior that the additive
 * fix (adding the five missing `modules.*` keys) must preserve.
 *
 * Observation-first methodology:
 * - Flatten en.json + ar.json into dot-notation key paths, recording each embedded value.
 * - For all keys WHERE NOT isBugCondition(key), assert t(key, { lng }) equals the embedded
 *   value, for lng in { en, ar }.
 * - Assert genuinely non-existent keys still trigger the `⚠️` parseMissingKeyHandler fallback.
 *
 * Mirrors the established `job-titles-i18n-preservation.test.ts` harness:
 * isolated `createInstance`, `flattenKeys`, and `isBugCondition`.
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

// ─── Helpers: Flatten JSON to dot-notation paths ───────────────────────────

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

/**
 * Recursively flattens a JSON object into dot-notation key paths.
 * Only includes leaf string values (not arrays or nested objects).
 */
function flattenKeys(obj: JsonObject, prefix = ''): { key: string; value: string }[] {
  const results: { key: string; value: string }[] = [];

  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;

    if (typeof v === 'string') {
      results.push({ key: fullKey, value: v });
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      results.push(...flattenKeys(v as JsonObject, fullKey));
    }
    // Skip arrays and non-string/non-object values
  }

  return results;
}

// ─── Bug Condition check ────────────────────────────────────────────────────

/**
 * Determines whether `modules.<identifier>` exists in the given locale resource.
 */
function keyExists(identifier: string, localeResource: Record<string, unknown>): boolean {
  const modules = localeResource['modules'];
  return (
    !!modules &&
    typeof modules === 'object' &&
    identifier in (modules as Record<string, unknown>)
  );
}

/**
 * isBugCondition(key) is true when the flattened key targets one of the five
 * affected module identifiers AND that key is absent from the `modules` namespace
 * for the given locale (matching the design's Bug Condition).
 *
 * Keys satisfying the bug condition are EXCLUDED from preservation assertions.
 * On the unfixed files the affected keys are absent (so they never appear in the
 * flattened key set); after the additive fix they exist, so isBugCondition returns
 * false and they are no longer special-cased.
 */
function isBugCondition(key: string, localeResource: Record<string, unknown>): boolean {
  if (!key.startsWith('modules.')) {
    return false;
  }
  const identifier = key.slice('modules.'.length);
  return (
    (AFFECTED_IDENTIFIERS as readonly string[]).includes(identifier) &&
    !keyExists(identifier, localeResource)
  );
}

// ─── i18next initialization (isolated instance) ────────────────────────────

// Use createInstance to avoid conflicts with other test files using the global i18n
const i18nInstance = createInstance();

let tAr: (key: string) => string;
let tEn: (key: string) => string;

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

  tAr = (key: string) => i18nInstance.t(key, { lng: 'ar' });
  tEn = (key: string) => i18nInstance.t(key, { lng: 'en' });
});

// ─── Build valid key paths ──────────────────────────────────────────────────

const arResource = ar as unknown as JsonObject;
const enResource = en as unknown as JsonObject;

const allArKeys = flattenKeys(arResource);
const allEnKeys = flattenKeys(enResource);

// Filter out bug condition keys
const preservedArKeys = allArKeys.filter(
  (entry) => !isBugCondition(entry.key, ar as unknown as Record<string, unknown>)
);
const preservedEnKeys = allEnKeys.filter(
  (entry) => !isBugCondition(entry.key, en as unknown as Record<string, unknown>)
);

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Preservation Property — Permission Matrix Module i18n (must PASS on unfixed code)', () => {
  /**
   * Property 2: Preservation — For all flattened translation keys where
   * isBugCondition does NOT hold, the resolved value matches the embedded value
   * from the JSON file, in both languages.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
   */
  it('Property 2: Preservation — all non-bug-condition AR keys resolve to their embedded values', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...preservedArKeys),
        (entry: { key: string; value: string }) => {
          const result = tAr(entry.key);
          expect(result).toBe(entry.value);
        }
      ),
      { numRuns: Math.min(preservedArKeys.length, 300) }
    );
  });

  it('Property 2: Preservation — all non-bug-condition EN keys resolve to their embedded values', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...preservedEnKeys),
        (entry: { key: string; value: string }) => {
          const result = tEn(entry.key);
          expect(result).toBe(entry.value);
        }
      ),
      { numRuns: Math.min(preservedEnKeys.length, 300) }
    );
  });

  /**
   * Representative pre-existing `modules.*` keys must continue to resolve to their
   * exact current EN and AR values (regression-prevention for the namespace we edit).
   *
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
   */
  it('pre-existing modules.* keys resolve to their current embedded values', () => {
    const enModules = (en as unknown as JsonObject)['modules'] as JsonObject;
    const arModules = (ar as unknown as JsonObject)['modules'] as JsonObject;

    for (const identifier of [
      'AuditCharter',
      'AuditPlans',
      'AuditProgramLibrary',
      'AuditTasks',
      'Evidence',
      'Findings',
      'SystemErrorLogs',
      'Correspondence',
      'Dashboard',
      'Departments',
      'IntegrityManagement',
      'OrgStructure',
      'Recommendations',
      'Reports',
      'RiskRegister',
      'Settings',
      'UserManagement',
    ]) {
      const key = `modules.${identifier}`;
      expect(tEn(key)).toBe(enModules[identifier]);
      expect(tEn(key)).not.toContain('⚠️');
      expect(tAr(key)).toBe(arModules[identifier]);
      expect(tAr(key)).not.toContain('⚠️');
    }
  });

  /**
   * Representative keys from other namespaces (`common`, `userManagement`,
   * `permissions`) must continue to resolve to their current values.
   *
   * **Validates: Requirement 3.4**
   */
  it('representative keys from common, userManagement, permissions resolve unchanged', () => {
    const enRes = en as unknown as Record<string, JsonObject>;
    const arRes = ar as unknown as Record<string, JsonObject>;

    const representativeKeys = [
      'userManagement.title',
      'userManagement.subtitle',
      'permissions.View',
      'permissions.Create',
      'common.module',
      'common.action',
    ];

    for (const key of representativeKeys) {
      const [ns, leaf] = key.split('.');
      const enExpected = enRes[ns]?.[leaf];
      const arExpected = arRes[ns]?.[leaf];

      // Only assert keys that genuinely exist in the resource (guards the
      // representative list against namespace drift).
      if (typeof enExpected === 'string') {
        expect(tEn(key)).toBe(enExpected);
        expect(tEn(key)).not.toContain('⚠️');
      }
      if (typeof arExpected === 'string') {
        expect(tAr(key)).toBe(arExpected);
        expect(tAr(key)).not.toContain('⚠️');
      }
    }
  });

  /**
   * The five affected identifiers are present in the modules namespace on the
   * FIXED files (the fix added these keys to en.json and ar.json).
   */
  it('documents that the five affected identifiers are now present in modules after the fix', () => {
    for (const identifier of AFFECTED_IDENTIFIERS) {
      expect(keyExists(identifier, en as unknown as Record<string, unknown>)).toBe(true);
      expect(keyExists(identifier, ar as unknown as Record<string, unknown>)).toBe(true);
    }
  });

  /**
   * parseMissingKeyHandler continues to work for a genuinely missing key.
   *
   * **Validates: Requirement 3.4**
   */
  it('parseMissingKeyHandler triggers ⚠️ for a genuinely missing key', () => {
    const missingKey = 'nonexistent.key.that.does.not.exist';
    expect(tAr(missingKey)).toBe(`⚠️ [${missingKey}]`);
    expect(tEn(missingKey)).toBe(`⚠️ [${missingKey}]`);
  });

  /**
   * Property-based test: randomly generated non-existent keys all trigger the
   * `⚠️` parseMissingKeyHandler fallback.
   *
   * **Validates: Requirement 3.4**
   */
  it('Property: random non-existent keys trigger the ⚠️ fallback', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.stringMatching(/^[a-z]{3,8}$/),
          fc.stringMatching(/^[a-z]{3,8}$/)
        ),
        ([prefix, suffix]) => {
          const fakeKey = `${prefix}_nonexistent_.${suffix}_missing_`;
          expect(tAr(fakeKey)).toBe(`⚠️ [${fakeKey}]`);
          expect(tEn(fakeKey)).toBe(`⚠️ [${fakeKey}]`);
        }
      ),
      { numRuns: 30 }
    );
  });
});
