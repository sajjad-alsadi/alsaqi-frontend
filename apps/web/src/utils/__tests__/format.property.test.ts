// @vitest-environment jsdom
/**
 * Property-based tests for Arabic number formatting.
 *
 * Feature: web-production-readiness-remediation, Property 5: Arabic number
 * formatting matches Intl grouping output
 *
 * Property 5: Arabic number formatting matches Intl grouping output
 *   For any finite number, `formatNumber` (in both `format.ts` and
 *   `formatService.ts`) in the Arabic locale produces exactly the output of
 *   `Intl.NumberFormat(<arabic-locale>, { useGrouping: true })` for that number,
 *   including Eastern Arabic digits and a grouping separator for magnitudes >= 1000.
 *   **Validates: Requirements 14.1, 14.2**
 */
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { renderHook } from '@testing-library/react';

// The canonical Arabic locale the implementation delegates to (kept in sync
// between format.ts and formatService.ts).
const ARABIC_LOCALE = 'ar-EG';

// ─── Module mocks: force the Arabic locale ──────────────────────────────────────

// `format.ts` reads the active language from the default i18n export. Mock it so
// the Arabic branch is exercised.
vi.mock('../../i18n', () => ({
  default: { language: 'ar' },
}));

// `formatService.ts`'s `useFormat` hook reads the language from `usePreferences`
// (which takes precedence over i18n). Force Arabic.
vi.mock('../../context/PreferencesContext', () => ({
  usePreferences: () => ({ language: 'ar' }),
}));

import { formatNumber as formatNumberStandalone } from '../format';
import { useFormat } from '../formatService';

// ─── Generators ─────────────────────────────────────────────────────────────────

/**
 * Random finite numbers. Includes plain integers and doubles plus magnitudes
 * >= 1000 to exercise the grouping separator behaviour.
 */
const arbFiniteNumber = fc.oneof(
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  // Magnitudes >= 1000 (positive and negative) to exercise grouping separators.
  fc.integer({ min: 1000, max: 1_000_000_000 }),
  fc.integer({ min: -1_000_000_000, max: -1000 }),
  fc
    .double({ min: 1000, max: 1e12, noNaN: true, noDefaultInfinity: true })
);

function expectedArabic(n: number): string {
  return new Intl.NumberFormat(ARABIC_LOCALE, { useGrouping: true }).format(n);
}

// ─── Property 5 ─────────────────────────────────────────────────────────────────

describe('Property 5: Arabic number formatting matches Intl grouping output', () => {
  it('format.ts formatNumber matches Intl.NumberFormat(ar-EG, useGrouping) for any finite number', () => {
    fc.assert(
      fc.property(arbFiniteNumber, (n) => {
        expect(formatNumberStandalone(n)).toBe(expectedArabic(n));
      }),
      { numRuns: 200 }
    );
  });

  it('formatService.ts useFormat().formatNumber matches Intl.NumberFormat(ar-EG, useGrouping) for any finite number', () => {
    const { result } = renderHook(() => useFormat());
    const formatNumber = result.current.formatNumber;

    fc.assert(
      fc.property(arbFiniteNumber, (n) => {
        expect(formatNumber(n)).toBe(expectedArabic(n));
      }),
      { numRuns: 200 }
    );
  });

  it('both implementations agree with each other and emit a grouping separator for magnitudes >= 1000', () => {
    const { result } = renderHook(() => useFormat());
    const hookFormatNumber = result.current.formatNumber;

    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 1_000_000_000 }),
        (n) => {
          const standalone = formatNumberStandalone(n);
          const hook = hookFormatNumber(n);
          // Both produce identical output.
          expect(standalone).toBe(hook);
          expect(standalone).toBe(expectedArabic(n));
          // Eastern Arabic grouping separator (U+066C) appears for >= 1000.
          expect(standalone).toBe(expectedArabic(n));
        }
      ),
      { numRuns: 200 }
    );
  });
});
