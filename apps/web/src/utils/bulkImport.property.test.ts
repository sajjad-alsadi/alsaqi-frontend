/**
 * Property-based tests for the bulk-import helpers (Req 24).
 *
 * Property 15: Bulk import partitions outcomes and processes every record
 * For any sequence of per-record success/failure outcomes, `runBulkImport`
 * attempts every record despite individual failures (one `writeOne` call per
 * record), and the resulting summary's succeeded/failed partition exactly
 * matches the actual outcomes, with `succeeded.length + failed.length` equal to
 * the total number of records.
 *
 * **Validates: Requirements 24.3, 24.4**
 *
 * Feature: code-review-remediation, Property 15
 *
 * Strategy: generate a random array of boolean outcomes (true = success, false
 * = failure), build a real `writeOne` that resolves or rejects per outcome, run
 * the real `runBulkImport`, and assert every record was attempted exactly once
 * and the partition mirrors the outcomes precisely.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { runBulkImport } from './bulkImport';

describe('Property 15: Bulk import partitions outcomes and processes every record (Requirements 24.3, 24.4)', () => {
  it('attempts every record and partitions succeeded/failed exactly per the outcomes', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.boolean(), { maxLength: 50 }), async (outcomes) => {
        // Each record is its input index; writeOne resolves for `true` outcomes
        // and rejects for `false`, so the outcome array is the ground truth.
        const items = outcomes.map((_, index) => index);

        // Track that writeOne is invoked exactly once per record (no record is
        // skipped or attempted twice), regardless of individual failures.
        const attempts = new Array<number>(items.length).fill(0);

        const writeOne = async (item: number, index: number): Promise<number> => {
          attempts[index] += 1;
          if (outcomes[index]) return item;
          throw new Error(`fail ${index}`);
        };

        const summary = await runBulkImport(items, writeOne);

        const expectedSucceeded = items.filter((_, i) => outcomes[i]);
        const expectedFailed = items.filter((_, i) => !outcomes[i]);

        // Every record was attempted despite individual failures (Req 24.4).
        expect(attempts).toEqual(new Array<number>(items.length).fill(1));

        // The partition mirrors the actual outcomes exactly, in input order (Req 24.3).
        expect(summary.total).toBe(items.length);
        expect(summary.succeeded).toEqual(expectedSucceeded);
        expect(summary.failed.map((f) => f.item)).toEqual(expectedFailed);

        // Every record is accounted for exactly once.
        expect(summary.succeeded.length + summary.failed.length).toBe(items.length);
      }),
      { numRuns: 100 },
    );
  });

  it('reports progress once per settled record and never loses a record under mixed outcomes', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.boolean(), { minLength: 1, maxLength: 50 }), async (outcomes) => {
        const items = outcomes.map((_, index) => index);
        const progress: Array<{ completed: number; total: number }> = [];

        const writeOne = async (item: number, index: number): Promise<number> => {
          if (outcomes[index]) return item;
          throw new Error(`fail ${index}`);
        };

        const summary = await runBulkImport(items, writeOne, (completed, total) =>
          progress.push({ completed, total }),
        );

        // Progress fires once per record (success or failure) and ends at total.
        expect(progress).toHaveLength(items.length);
        expect(progress[progress.length - 1]).toEqual({
          completed: items.length,
          total: items.length,
        });

        // The summary still partitions every record exactly once.
        expect(summary.succeeded.length + summary.failed.length).toBe(items.length);
      }),
      { numRuns: 100 },
    );
  });
});
