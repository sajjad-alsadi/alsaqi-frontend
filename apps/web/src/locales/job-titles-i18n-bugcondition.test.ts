/**
 * Bug Condition Exploration Test — Job Titles i18n
 * ==================================================
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.5**
 *
 * هذا الاختبار يُثبت وجود الخلل على الكود غير المُصلَح.
 * يُتوقع أن يفشل — الفشل دليل على وجود المشكلة.
 *
 * Property 1: Bug Condition — مفاتيح الترجمة الفرعية تفشل بسبب تعارض بنيوي ومفتاح مفقود
 *
 * CRITICAL: DO NOT fix the code when this test fails.
 * The failure IS the success condition for this exploration test.
 *
 * Bug Condition:
 * 1. jobTitles.* sub-keys fail because jobTitles is a flat string (structural conflict)
 * 2. recommendations.noRecommendations fails because the key does not exist
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import fc from 'fast-check';

// Unmock i18next so we can use the real implementation with actual locale resources
vi.unmock('i18next');

import i18n from 'i18next';
import ar from './ar.json';
import en from './en.json';

// ─── i18next initialization with real locale files ─────────────────────────

let t: (key: string) => string;

beforeAll(async () => {
  await i18n.init({
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
  t = i18n.t.bind(i18n);
});

// ─── Bug Condition Keys ─────────────────────────────────────────────────────

/** All keys that trigger the bug condition */
const BUG_CONDITION_KEYS = [
  'jobTitles.staff',
  'jobTitles.executive',
  'jobTitles.manager',
  'jobTitles.officer',
  'jobTitles.active',
  'jobTitles.inactive',
  'jobTitles.failedToSaveJobTitle',
  'jobTitles.failedToDeleteJobTitle',
  'recommendations.noRecommendations',
];

// ─── Helper: isBugCondition ─────────────────────────────────────────────────

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Bug Condition Exploration — Job Titles i18n (يُتوقع الفشل)', () => {
  /**
   * Property 1: Bug Condition — For all keys where isBugCondition holds,
   * the translation should return non-empty text that does NOT start with ⚠️
   * and is NOT equal to the raw key.
   *
   * This test WILL FAIL on unfixed code — confirming the bug exists.
   *
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.5**
   */
  it('Property 1: Bug Condition — all bug condition keys should resolve to proper translated text', () => {
    // After the fix, the bug condition should NO LONGER hold
    // (jobTitles is now an object, noRecommendations key exists)
    const arResource = ar as Record<string, unknown>;
    for (const key of BUG_CONDITION_KEYS) {
      expect(isBugCondition(key, arResource)).toBe(false);
    }

    // Property-based test: for any key from the bug condition set,
    // the resolved translation should be proper (non-empty, no ⚠️, not raw key)
    fc.assert(
      fc.property(
        fc.constantFrom(...BUG_CONDITION_KEYS),
        (key: string) => {
          const result = t(key);

          // Expected behavior (will fail on unfixed code):
          // result IS NOT EMPTY
          expect(result).toBeTruthy();
          expect(result.length).toBeGreaterThan(0);

          // result DOES NOT START WITH "⚠️"
          expect(result.startsWith('⚠️')).toBe(false);

          // result ≠ input.key
          expect(result).not.toBe(key);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Specific test: jobTitles.staff, jobTitles.executive, jobTitles.manager, jobTitles.officer
   * should return properly translated job level text.
   *
   * **Validates: Requirement 1.1**
   */
  it('Job level keys should return translated text (not ⚠️)', () => {
    const jobLevelKeys = ['jobTitles.staff', 'jobTitles.executive', 'jobTitles.manager', 'jobTitles.officer'];

    for (const key of jobLevelKeys) {
      const result = t(key);
      expect(result).toBeTruthy();
      expect(result.startsWith('⚠️')).toBe(false);
      expect(result).not.toBe(key);
    }
  });

  /**
   * Specific test: jobTitles.active, jobTitles.inactive
   * should return translated status text.
   *
   * **Validates: Requirement 1.3**
   */
  it('Status keys should return translated text (not ⚠️)', () => {
    const statusKeys = ['jobTitles.active', 'jobTitles.inactive'];

    for (const key of statusKeys) {
      const result = t(key);
      expect(result).toBeTruthy();
      expect(result.startsWith('⚠️')).toBe(false);
      expect(result).not.toBe(key);
    }
  });

  /**
   * Specific test: jobTitles.failedToSaveJobTitle, jobTitles.failedToDeleteJobTitle
   * should return localized error messages.
   *
   * **Validates: Requirement 1.2**
   */
  it('Error message keys should return translated text (not ⚠️)', () => {
    const errorKeys = ['jobTitles.failedToSaveJobTitle', 'jobTitles.failedToDeleteJobTitle'];

    for (const key of errorKeys) {
      const result = t(key);
      expect(result).toBeTruthy();
      expect(result.startsWith('⚠️')).toBe(false);
      expect(result).not.toBe(key);
    }
  });

  /**
   * Specific test: recommendations.noRecommendations
   * should return translated "no recommendations" text.
   *
   * **Validates: Requirement 1.5**
   */
  it('recommendations.noRecommendations should return translated text (not ⚠️)', () => {
    const result = t('recommendations.noRecommendations');
    expect(result).toBeTruthy();
    expect(result.startsWith('⚠️')).toBe(false);
    expect(result).not.toBe('recommendations.noRecommendations');
  });
});
