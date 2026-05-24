// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  computePaginationMeta,
  parsePaginationParams,
  MAX_PAGE_SIZE,
} from '../utils/paginationService';
import { ValidationError } from '../utils/errors';

/**
 * Property Test: Pagination Metadata Correctness (Property 2)
 *
 * Feature: api-audit-improvements
 * Property 2: Pagination Metadata Correctness
 *
 * **Validates: Requirements 5.2, 5.4**
 *
 * For any combination of `page`, `pageSize`, and `total` record count, the
 * Pagination_Service SHALL compute `totalPages` as `ceil(total / pageSize)`,
 * `hasNext` as `page < totalPages`, and `hasPrev` as `page > 1`, and SHALL
 * cap `pageSize` at 100 for any input value exceeding 100.
 */

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates valid page numbers (1-1000) */
const pageArb = fc.integer({ min: 1, max: 1000 });

/** Generates valid pageSize values (1-500) */
const pageSizeArb = fc.integer({ min: 1, max: 500 });

/** Generates valid total record counts (0-100000) */
const totalArb = fc.integer({ min: 0, max: 100000 });

/** Generates pageSize values that exceed the maximum (101-500) */
const oversizedPageSizeArb = fc.integer({ min: 101, max: 500 });

/** Generates non-numeric string values */
const nonNumericArb = fc.string({ minLength: 1, maxLength: 10 }).filter(
  (s) => isNaN(Number(s)) && s.trim().length > 0
);

/** Generates decimal (non-integer) numbers */
const decimalArb = fc.double({ min: 0.01, max: 999.99, noNaN: true }).filter(
  (n) => !Number.isInteger(n)
);

/** Generates values less than 1 (zero or negative) */
const lessThanOneArb = fc.integer({ min: -1000, max: 0 });

// ─── Tests: computePaginationMeta ────────────────────────────────────────────

describe('Property 2: Pagination Metadata Correctness', () => {
  describe('computePaginationMeta', () => {
    it('totalPages equals Math.ceil(total / pageSize) or 0 when total is 0', () => {
      fc.assert(
        fc.property(pageArb, pageSizeArb, totalArb, (page, pageSize, total) => {
          const meta = computePaginationMeta(page, pageSize, total);

          const expectedTotalPages =
            total === 0 ? 0 : Math.ceil(total / pageSize);
          expect(meta.totalPages).toBe(expectedTotalPages);
        }),
        { numRuns: 500 }
      );
    });

    it('hasNext is true iff page < totalPages', () => {
      fc.assert(
        fc.property(pageArb, pageSizeArb, totalArb, (page, pageSize, total) => {
          const meta = computePaginationMeta(page, pageSize, total);

          const expectedTotalPages =
            total === 0 ? 0 : Math.ceil(total / pageSize);
          expect(meta.hasNext).toBe(page < expectedTotalPages);
        }),
        { numRuns: 500 }
      );
    });

    it('hasPrev is true iff page > 1', () => {
      fc.assert(
        fc.property(pageArb, pageSizeArb, totalArb, (page, pageSize, total) => {
          const meta = computePaginationMeta(page, pageSize, total);

          expect(meta.hasPrev).toBe(page > 1);
        }),
        { numRuns: 500 }
      );
    });

    it('returned page matches input page', () => {
      fc.assert(
        fc.property(pageArb, pageSizeArb, totalArb, (page, pageSize, total) => {
          const meta = computePaginationMeta(page, pageSize, total);

          expect(meta.page).toBe(page);
        }),
        { numRuns: 500 }
      );
    });

    it('returned pageSize matches input pageSize', () => {
      fc.assert(
        fc.property(pageArb, pageSizeArb, totalArb, (page, pageSize, total) => {
          const meta = computePaginationMeta(page, pageSize, total);

          expect(meta.pageSize).toBe(pageSize);
        }),
        { numRuns: 500 }
      );
    });

    it('returned total matches input total', () => {
      fc.assert(
        fc.property(pageArb, pageSizeArb, totalArb, (page, pageSize, total) => {
          const meta = computePaginationMeta(page, pageSize, total);

          expect(meta.total).toBe(total);
        }),
        { numRuns: 500 }
      );
    });
  });

  // ─── Tests: parsePaginationParams - pageSize capping ─────────────────────────

  describe('parsePaginationParams - pageSize capping', () => {
    it('caps pageSize at 100 for any input exceeding 100', () => {
      fc.assert(
        fc.property(oversizedPageSizeArb, (pageSize) => {
          const result = parsePaginationParams({
            page: '1',
            pageSize: String(pageSize),
          });

          expect(result.pageSize).toBe(MAX_PAGE_SIZE);
          expect(result.pageSize).toBeLessThanOrEqual(100);
        }),
        { numRuns: 200 }
      );
    });

    it('does not cap pageSize when it is at or below 100', () => {
      const validPageSizeArb = fc.integer({ min: 1, max: 100 });

      fc.assert(
        fc.property(validPageSizeArb, (pageSize) => {
          const result = parsePaginationParams({
            page: '1',
            pageSize: String(pageSize),
          });

          expect(result.pageSize).toBe(pageSize);
        }),
        { numRuns: 200 }
      );
    });
  });

  // ─── Tests: parsePaginationParams - invalid values ───────────────────────────

  describe('parsePaginationParams - invalid values', () => {
    it('throws ValidationError for non-numeric page values', () => {
      fc.assert(
        fc.property(nonNumericArb, (invalidPage) => {
          expect(() =>
            parsePaginationParams({ page: invalidPage, pageSize: '10' })
          ).toThrow(ValidationError);
        }),
        { numRuns: 100 }
      );
    });

    it('throws ValidationError for non-numeric pageSize values', () => {
      fc.assert(
        fc.property(nonNumericArb, (invalidPageSize) => {
          expect(() =>
            parsePaginationParams({ page: '1', pageSize: invalidPageSize })
          ).toThrow(ValidationError);
        }),
        { numRuns: 100 }
      );
    });

    it('throws ValidationError for decimal page values', () => {
      fc.assert(
        fc.property(decimalArb, (decimalPage) => {
          expect(() =>
            parsePaginationParams({
              page: String(decimalPage),
              pageSize: '10',
            })
          ).toThrow(ValidationError);
        }),
        { numRuns: 100 }
      );
    });

    it('throws ValidationError for decimal pageSize values', () => {
      fc.assert(
        fc.property(decimalArb, (decimalPageSize) => {
          expect(() =>
            parsePaginationParams({
              page: '1',
              pageSize: String(decimalPageSize),
            })
          ).toThrow(ValidationError);
        }),
        { numRuns: 100 }
      );
    });

    it('throws ValidationError for page values less than 1', () => {
      fc.assert(
        fc.property(lessThanOneArb, (invalidPage) => {
          expect(() =>
            parsePaginationParams({
              page: String(invalidPage),
              pageSize: '10',
            })
          ).toThrow(ValidationError);
        }),
        { numRuns: 100 }
      );
    });

    it('throws ValidationError for pageSize values less than 1', () => {
      fc.assert(
        fc.property(lessThanOneArb, (invalidPageSize) => {
          expect(() =>
            parsePaginationParams({
              page: '1',
              pageSize: String(invalidPageSize),
            })
          ).toThrow(ValidationError);
        }),
        { numRuns: 100 }
      );
    });
  });
});
