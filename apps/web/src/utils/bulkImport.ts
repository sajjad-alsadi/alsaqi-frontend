/**
 * Bulk-import helpers (Req 24).
 *
 * The RiskRegister Excel import and the AuditPlanForm procedure import each
 * write multiple records to the Backend. Previously they ran a sequential
 * `for` loop that `await`ed one create at a time, so a single failure aborted
 * the whole batch and the user got no progress feedback or summary of which
 * records succeeded.
 *
 * These helpers process every record with `Promise.allSettled` so one record's
 * failure never aborts the batch (Req 24.1, 24.4), report progress as records
 * settle (Req 24.2), and partition the outcomes into a succeeded/failed summary
 * that exactly mirrors the per-record results (Req 24.3).
 *
 * The partitioning logic is kept as a small pure function (`partitionSettled`)
 * so it can be property-tested independently of any network or React code.
 */

/** A single record that failed to import, paired with the rejection reason. */
export interface BulkImportFailure<T> {
  item: T;
  reason: unknown;
}

/** Summary of a bulk import: which records succeeded and which failed. */
export interface BulkImportSummary<T> {
  /** Total number of records attempted. */
  total: number;
  /** Records whose write fulfilled, in input order. */
  succeeded: T[];
  /** Records whose write rejected, paired with the reason, in input order. */
  failed: BulkImportFailure<T>[];
}

/**
 * Partition `items` into succeeded/failed buckets according to the parallel
 * `results` array produced by `Promise.allSettled`.
 *
 * Pure function: `items[i]` corresponds to `results[i]`. A `fulfilled` result
 * places the item in `succeeded`; a `rejected` result places it in `failed`
 * with the rejection reason. Items without a corresponding result (defensive:
 * mismatched lengths) are treated as failures with an explanatory reason.
 *
 * Invariant: `succeeded.length + failed.length === total === items.length`, so
 * every record is accounted for exactly once.
 */
export function partitionSettled<T>(
  items: readonly T[],
  results: readonly PromiseSettledResult<unknown>[],
): BulkImportSummary<T> {
  const succeeded: T[] = [];
  const failed: BulkImportFailure<T>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i] as T;
    const result = results[i];
    if (result && result.status === 'fulfilled') {
      succeeded.push(item);
    } else {
      failed.push({
        item,
        reason: result && result.status === 'rejected' ? result.reason : new Error('No result for item'),
      });
    }
  }

  return { total: items.length, succeeded, failed };
}

/**
 * Run a bulk import over `items`, writing each with `writeOne`, processing all
 * records with `Promise.allSettled` so individual failures do not abort the
 * batch. Progress is reported through `onProgress` as each record settles.
 *
 * @param items      The records to import.
 * @param writeOne   Async writer invoked once per record with `(item, index)`.
 * @param onProgress Optional callback invoked after each record settles with
 *                   `(completed, total)` where `completed` counts both
 *                   successes and failures.
 * @returns A summary partitioning the records into succeeded/failed.
 */
export async function runBulkImport<T>(
  items: readonly T[],
  writeOne: (item: T, index: number) => Promise<unknown>,
  onProgress?: (completed: number, total: number) => void,
): Promise<BulkImportSummary<T>> {
  const total = items.length;
  let completed = 0;

  const results = await Promise.allSettled(
    items.map((item, index) =>
      writeOne(item, index).finally(() => {
        completed += 1;
        onProgress?.(completed, total);
      }),
    ),
  );

  return partitionSettled(items, results);
}
