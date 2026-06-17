/**
 * Pure function for CI bundle delta comparison.
 *
 * Compares the current build's total gzip size against a baseline and
 * determines whether the growth exceeds the allowed threshold (5 KB = 5120 bytes).
 *
 * Used by `scripts/check-bundle-delta.mjs` and tested via property-based tests.
 */

/** Maximum allowed delta in bytes before the check fails (5 KB). */
export const MAX_DELTA_BYTES = 5120;

/**
 * Result of a delta comparison check.
 */
export interface DeltaCheckResult {
  /** Whether the check passed (no excessive growth or override active) */
  pass: boolean;
  /** The computed delta in bytes (current - baseline) */
  delta: number;
}

/**
 * Pure function that checks whether the bundle size delta is within budget.
 *
 * Rules:
 * 1. If `hasOverride` is true, always passes regardless of delta.
 * 2. If `currentTotal - baselineTotal > MAX_DELTA_BYTES` (5120 bytes) and no override: FAIL.
 * 3. If `currentTotal - baselineTotal <= MAX_DELTA_BYTES`: PASS.
 *
 * @param currentTotal  - Total gzip size in bytes of the current build
 * @param baselineTotal - Total gzip size in bytes of the baseline build
 * @param hasOverride   - Whether BUDGET_OVERRIDE is set (bypasses the check)
 * @returns DeltaCheckResult indicating pass/fail and the computed delta
 */
export function checkDelta(
  currentTotal: number,
  baselineTotal: number,
  hasOverride: boolean
): DeltaCheckResult {
  const delta = currentTotal - baselineTotal;

  if (hasOverride) {
    return { pass: true, delta };
  }

  return {
    pass: delta <= MAX_DELTA_BYTES,
    delta,
  };
}
