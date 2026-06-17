/**
 * Property-based test for cache freshness tier assignment.
 *
 * Property 7: Cache freshness tiers applied correctly
 *
 * For any query key prefix drawn from a known tier, `getStaleTimeForQuery`
 * must return the tier's staleTime. For any prefix NOT in any tier, it must
 * return the default (referenceData = 300_000 ms).
 *
 * **Validates: Requirements 3.4, 5.6**
 *
 * Feature: app-rebuild, Property 7
 *
 * Strategy:
 * - Use `fc.constantFrom(...)` per tier to generate prefixes from known sets.
 * - Use `fc.string()` filtered to exclude all known prefixes for the "unknown" case.
 * - Assert correct staleTime resolution for each category.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  getStaleTimeForQuery,
  FRESHNESS_TIERS,
  QUERY_STALE_TIMES,
} from './queryDefaults';

// ─── Derived constants from the implementation ──────────────────────────────

const referenceDataPrefixes = FRESHNESS_TIERS.find(
  (t) => t.category === 'referenceData'
)!.queryKeyPrefixes;

const volatileDataPrefixes = FRESHNESS_TIERS.find(
  (t) => t.category === 'volatileData'
)!.queryKeyPrefixes;

const rarelyChangingPrefixes = FRESHNESS_TIERS.find(
  (t) => t.category === 'rarelyChanging'
)!.queryKeyPrefixes;

/** All known prefixes across every tier */
const allKnownPrefixes = [
  ...referenceDataPrefixes,
  ...volatileDataPrefixes,
  ...rarelyChangingPrefixes,
];

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Property 7: Cache freshness tiers applied correctly', () => {
  it('referenceData prefixes → staleTime === 300_000', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...referenceDataPrefixes),
        fc.array(fc.string(), { minLength: 0, maxLength: 5 }),
        (prefix, rest) => {
          const queryKey = [prefix, ...rest];
          expect(getStaleTimeForQuery(queryKey)).toBe(300_000);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('volatileData prefixes → staleTime === 60_000', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...volatileDataPrefixes),
        fc.array(fc.string(), { minLength: 0, maxLength: 5 }),
        (prefix, rest) => {
          const queryKey = [prefix, ...rest];
          expect(getStaleTimeForQuery(queryKey)).toBe(60_000);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rarelyChanging prefixes → staleTime === 1_800_000', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...rarelyChangingPrefixes),
        fc.array(fc.string(), { minLength: 0, maxLength: 5 }),
        (prefix, rest) => {
          const queryKey = [prefix, ...rest];
          expect(getStaleTimeForQuery(queryKey)).toBe(1_800_000);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('unknown prefixes → staleTime === 300_000 (default = referenceData)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(
          (s) => !allKnownPrefixes.includes(s)
        ),
        fc.array(fc.string(), { minLength: 0, maxLength: 5 }),
        (prefix, rest) => {
          const queryKey = [prefix, ...rest];
          expect(getStaleTimeForQuery(queryKey)).toBe(
            QUERY_STALE_TIMES.referenceData
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('empty query key → staleTime === 300_000 (default = referenceData)', () => {
    expect(getStaleTimeForQuery([])).toBe(QUERY_STALE_TIMES.referenceData);
  });
});
