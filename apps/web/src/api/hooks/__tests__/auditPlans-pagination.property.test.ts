/**
 * Property-based tests for server-driven pagination metadata (Requirement 21).
 *
 * Feature: frontend-audit-remediation, Property 18: Server-driven pagination metadata
 *   For any Response_Envelope pagination meta `{total, totalPages}` and any length of
 *   the current page's data array, the Query_Hook SHALL surface `total` and `totalPages`
 *   equal to the meta values, independent of the array length. The page array length is
 *   used ONLY as a degraded fallback when the server omits pagination meta entirely.
 *   **Validates: Requirements 21.1, 21.2, 21.3**
 *
 * These tests exercise the pure `metaPagination` helper that `useAuditPlans` /
 * `audit-plans.ts` use to project server meta into `{ total, totalPages }`. Testing the
 * pure helper isolates the precedence rule (server meta wins; item count is fallback-only)
 * from React Query / network wiring.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { metaPagination, type EnvelopeMeta } from '../../utils/envelope';

const NUM_RUNS = 100;

describe('Property 18: Server-driven pagination metadata', () => {
  it('surfaces server meta total/totalPages regardless of the page array length', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }), // server total
        fc.integer({ min: 0, max: 100_000 }), // server totalPages
        fc.integer({ min: 0, max: 10_000 }), // current page item count
        (total, totalPages, itemCount) => {
          const meta: EnvelopeMeta = { pagination: { total, totalPages } };

          const result = metaPagination(meta, itemCount);

          // Surfaced values equal the server meta values exactly...
          expect(result.total).toBe(total);
          expect(result.totalPages).toBe(totalPages);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('never derives total/totalPages from items.length when meta is present (even when they differ)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        // Force a page item count that is NOT equal to the server total so that a
        // length-derived implementation would visibly diverge from server meta.
        fc.integer({ min: 0, max: 10_000 }),
        (total, totalPages, offset) => {
          const itemCount = total + offset + 1; // guaranteed !== total
          const meta: EnvelopeMeta = { pagination: { total, totalPages } };

          const result = metaPagination(meta, itemCount);

          expect(result.total).toBe(total);
          expect(result.total).not.toBe(itemCount);
          expect(result.totalPages).toBe(totalPages);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('uses items.length as a total fallback ONLY when the server omits pagination meta', () => {
    fc.assert(
      fc.property(
        // meta absent entirely, or present but without a numeric pagination block
        fc.oneof(
          fc.constant<EnvelopeMeta | undefined>(undefined),
          fc.constant<EnvelopeMeta>({}),
          fc.constant<EnvelopeMeta>({ pagination: {} }),
        ),
        fc.integer({ min: 0, max: 10_000 }),
        (meta, itemCount) => {
          const result = metaPagination(meta, itemCount);

          // Fallback: total degrades to the loaded item count, totalPages to 1.
          expect(result.total).toBe(itemCount);
          expect(result.totalPages).toBe(1);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('honors a server total of 0 instead of falling back to items.length', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }), // non-zero item count (stale page)
        fc.integer({ min: 0, max: 100_000 }),
        (itemCount, totalPages) => {
          const meta: EnvelopeMeta = { pagination: { total: 0, totalPages } };

          const result = metaPagination(meta, itemCount);

          // total: 0 is a real server value, not "absent" — must not become itemCount.
          expect(result.total).toBe(0);
          expect(result.totalPages).toBe(totalPages);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
