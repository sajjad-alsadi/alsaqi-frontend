/**
 * Property-based tests for the Formatting_Module (Requirement 17).
 *
 * Property 19: Date and number formatting uses one canonical locale
 * For any date or number, the value produced by the Formatting_Module equals
 * the output of the canonical Arabic locale's `Intl` formatter. This guards the
 * invariant that ALL Arabic formatting routes through a single canonical locale
 * (`CANONICAL_ARABIC_LOCALE`) and never diverges via a second locale or manual
 * digit munging.
 *
 * **Validates: Requirements 17.2, 17.4**
 *
 * Feature: code-review-remediation, Property 19
 *
 * Strategy: generate arbitrary finite numbers and dates, format them through
 * the module with `{ language: 'ar' }`, and assert the result equals the
 * canonical Arabic locale's `Intl` formatter configured with the module's own
 * default options. The generators constrain to the valid input space (finite
 * numbers, in-range timestamps) so we compare like for like against `Intl`.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  formatNumber,
  formatDate,
  formatDateTime,
  formatCurrency,
  CANONICAL_ARABIC_LOCALE,
  DEFAULT_CURRENCY,
} from './formatting';

// The module's default option sets, mirrored here so the oracle (raw `Intl`)
// is configured identically to the module under test.
const DEFAULT_NUMBER_OPTIONS: Intl.NumberFormatOptions = { useGrouping: true };

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

const DEFAULT_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
};

const DEFAULT_CURRENCY_OPTIONS: Intl.NumberFormatOptions = {
  style: 'currency',
  currency: DEFAULT_CURRENCY,
  maximumFractionDigits: 0,
};

// Finite, non-NaN numbers across a wide magnitude range (including negatives
// and fractional values) to exercise grouping separators and digit shaping.
const arbNumber = fc
  .double({ min: -1e12, max: 1e12, noNaN: true, noDefaultInfinity: true })
  .filter((n) => Number.isFinite(n));

// Timestamps within a realistic range so `new Date(ts)` is always valid.
// Bounds: 1970-01-01 .. ~2100.
const arbDate = fc
  .integer({ min: 0, max: 4_102_444_800_000 })
  .map((ts) => new Date(ts));

const RUNS = 200;

describe('Property 19: Formatting uses one canonical Arabic locale (Requirements 17.2, 17.4)', () => {
  it('formatNumber equals the canonical Arabic locale Intl.NumberFormat output', () => {
    fc.assert(
      fc.property(arbNumber, (n) => {
        const oracle = new Intl.NumberFormat(
          CANONICAL_ARABIC_LOCALE,
          DEFAULT_NUMBER_OPTIONS,
        ).format(n);
        expect(formatNumber(n, { language: 'ar' })).toBe(oracle);
      }),
      { numRuns: RUNS },
    );
  });

  it('formatCurrency equals the canonical Arabic locale Intl.NumberFormat output', () => {
    fc.assert(
      fc.property(arbNumber, (n) => {
        const oracle = new Intl.NumberFormat(
          CANONICAL_ARABIC_LOCALE,
          DEFAULT_CURRENCY_OPTIONS,
        ).format(n);
        expect(formatCurrency(n, { language: 'ar' })).toBe(oracle);
      }),
      { numRuns: RUNS },
    );
  });

  it('formatDate equals the canonical Arabic locale Intl.DateTimeFormat output', () => {
    fc.assert(
      fc.property(arbDate, (d) => {
        const oracle = new Intl.DateTimeFormat(
          CANONICAL_ARABIC_LOCALE,
          DEFAULT_DATE_OPTIONS,
        ).format(d);
        expect(formatDate(d, { language: 'ar' })).toBe(oracle);
      }),
      { numRuns: RUNS },
    );
  });

  it('formatDateTime equals the canonical Arabic locale Intl.DateTimeFormat output', () => {
    fc.assert(
      fc.property(arbDate, (d) => {
        const oracle = new Intl.DateTimeFormat(
          CANONICAL_ARABIC_LOCALE,
          DEFAULT_DATE_TIME_OPTIONS,
        ).format(d);
        expect(formatDateTime(d, { language: 'ar' })).toBe(oracle);
      }),
      { numRuns: RUNS },
    );
  });

  it('Arabic-variant language tags resolve to the same canonical output', () => {
    fc.assert(
      fc.property(
        arbNumber,
        fc.constantFrom('ar', 'ar-IQ', 'ar-EG', 'ar-SA'),
        (n, lang) => {
          const oracle = new Intl.NumberFormat(
            CANONICAL_ARABIC_LOCALE,
            DEFAULT_NUMBER_OPTIONS,
          ).format(n);
          expect(formatNumber(n, { language: lang })).toBe(oracle);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
