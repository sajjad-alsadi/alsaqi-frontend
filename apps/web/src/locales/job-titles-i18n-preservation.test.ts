/**
 * Preservation Property Test — Job Titles i18n
 * ==================================================
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * Property 2: Preservation — المفاتيح غير المتأثرة بالخلل تبقى دون تغيير بعد الإصلاح
 *
 * هذا الاختبار يُثبت السلوك الأساسي للمفاتيح غير المتأثرة بالخلل.
 * يجب أن ينجح على الكود غير المُصلَح — لتأكيد أن هذه المفاتيح تعمل بشكل صحيح حالياً.
 *
 * Approach:
 * - Load locale JSON files directly
 * - Enumerate all valid key paths that do NOT satisfy the bug condition
 * - For each key, verify the translation resolves to the expected value
 * - Specifically verify: common.jobTitles, userManagement.title, recommendations.title,
 *   recommendations.noRecommendationTextFound
 * - Verify parseMissingKeyHandler still works for genuinely missing keys
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import fc from 'fast-check';

// Unmock i18next so we can use the real module for translation testing
vi.unmock('i18next');

import { createInstance } from 'i18next';
import ar from './ar.json';
import en from './en.json';

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

// ─── Bug Condition Check ────────────────────────────────────────────────────

/**
 * Determines if a key path satisfies the bug condition.
 * Keys that satisfy the bug condition are EXCLUDED from preservation tests.
 */
function isBugCondition(key: string, localeResource: Record<string, unknown>): boolean {
  // Case 1: dot-notation sub-key of 'jobTitles' but 'jobTitles' is a flat string
  if (key.startsWith('jobTitles.') && typeof localeResource['jobTitles'] === 'string') {
    return true;
  }

  // Case 2: 'recommendations.noRecommendations' does not exist
  if (key === 'recommendations.noRecommendations') {
    const recommendations = localeResource['recommendations'];
    if (
      !recommendations ||
      typeof recommendations !== 'object' ||
      !('noRecommendations' in (recommendations as Record<string, unknown>))
    ) {
      return true;
    }
  }

  return false;
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

describe('Preservation Property — Job Titles i18n (يجب أن تنجح)', () => {
  /**
   * Property 2: Preservation — For all translation keys where isBugCondition
   * does NOT hold, the resolved value matches the expected value from the JSON file.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
   */
  it('Property 2: Preservation — all non-bug-condition AR keys resolve to their expected values', () => {
    // Use property-based testing with random sampling from all preserved keys
    fc.assert(
      fc.property(
        fc.constantFrom(...preservedArKeys),
        (entry: { key: string; value: string }) => {
          const result = tAr(entry.key);
          // The resolved translation must equal the expected value from the JSON
          expect(result).toBe(entry.value);
        }
      ),
      { numRuns: Math.min(preservedArKeys.length, 200) }
    );
  });

  it('Property 2: Preservation — all non-bug-condition EN keys resolve to their expected values', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...preservedEnKeys),
        (entry: { key: string; value: string }) => {
          const result = tEn(entry.key);
          expect(result).toBe(entry.value);
        }
      ),
      { numRuns: Math.min(preservedEnKeys.length, 200) }
    );
  });

  /**
   * Specific test: common.jobTitles must continue to resolve correctly.
   * This is critical because the fix restructures the top-level jobTitles key,
   * but common.jobTitles must remain unchanged.
   *
   * **Validates: Requirement 3.1**
   */
  it('common.jobTitles resolves to correct page title text', () => {
    expect(tAr('common.jobTitles')).toBe('المسميات الوظيفية');
    expect(tEn('common.jobTitles')).toBe('Job Titles');
  });

  /**
   * Specific test: userManagement.title and other sibling keys work correctly.
   *
   * **Validates: Requirement 3.2**
   */
  it('Sibling keys like userManagement.title resolve correctly', () => {
    expect(tAr('userManagement.title')).toBe('إدارة مستخدمي النظام');
    expect(tEn('userManagement.title')).toBe('System User Management');
  });

  /**
   * Specific test: recommendations.title and recommendations.noRecommendationTextFound
   * must continue to resolve correctly.
   *
   * **Validates: Requirement 3.3**
   */
  it('Existing recommendations keys resolve correctly', () => {
    expect(tAr('recommendations.title')).toBe('التوصيات');
    expect(tEn('recommendations.title')).toBe('Recommendations');

    expect(tAr('recommendations.noRecommendationTextFound')).toBe('لم يتم العثور على نص التوصية');
    expect(tEn('recommendations.noRecommendationTextFound')).toBe('No recommendation text found');
  });

  /**
   * Specific test: parseMissingKeyHandler continues to work for genuinely missing keys.
   * A key that does not exist in ANY locale file should trigger the ⚠️ fallback.
   *
   * **Validates: Requirement 3.3**
   */
  it('parseMissingKeyHandler triggers ⚠️ for genuinely missing keys', () => {
    const missingKey = 'nonexistent.key.that.does.not.exist';
    const result = tAr(missingKey);
    expect(result).toBe(`⚠️ [${missingKey}]`);
  });

  /**
   * Property-based test: randomly generated non-existent keys should all
   * trigger the parseMissingKeyHandler.
   *
   * **Validates: Requirement 3.3**
   */
  it('Property: random non-existent keys trigger parseMissingKeyHandler', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.stringMatching(/^[a-z]{3,8}$/),
          fc.stringMatching(/^[a-z]{3,8}$/)
        ),
        ([prefix, suffix]) => {
          const fakeKey = `${prefix}_nonexistent_.${suffix}_missing_`;
          const result = tAr(fakeKey);
          expect(result).toBe(`⚠️ [${fakeKey}]`);
        }
      ),
      { numRuns: 30 }
    );
  });
});
