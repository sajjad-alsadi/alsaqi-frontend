/**
 * Animation timing helpers.
 *
 * The list modules (RiskRegister, Recommendations, ComplianceMatrix) apply a
 * per-item entrance animation whose delay grows with the item's index. Without
 * a cap, the cumulative stagger delay scales unbounded with list length — the
 * last item in a 500-row list would wait many seconds before appearing, and the
 * total animation window grows without bound (Req 23.2, 23.3).
 *
 * `getStaggerDelay` bounds that delay: the per-item delay increases linearly up
 * to a fixed ceiling and then stays flat, so the delay never exceeds
 * `maxDelay` regardless of list length or item index.
 */

/** Default seconds added per item index before the cap is reached. */
export const STAGGER_STEP_SECONDS = 0.05;

/**
 * Default maximum cumulative stagger delay, in seconds. Past this point every
 * item shares the same (capped) delay, so the animation window is bounded no
 * matter how many items the list contains.
 */
export const MAX_STAGGER_DELAY_SECONDS = 0.3;

/**
 * Compute the bounded entrance-animation delay for the item at `index`.
 *
 * The result is `min(index * step, maxDelay)`, clamped to be non-negative and
 * finite. This guarantees `0 <= getStaggerDelay(index) <= maxDelay` for every
 * index, so the stagger delay never scales unbounded with list length.
 *
 * @param index    Zero-based position of the item in the list.
 * @param step     Seconds added per index before reaching the cap.
 * @param maxDelay Maximum delay in seconds (the cap).
 */
export function getStaggerDelay(
  index: number,
  step: number = STAGGER_STEP_SECONDS,
  maxDelay: number = MAX_STAGGER_DELAY_SECONDS,
): number {
  // Guard against NaN / Infinity / negative indices so the result is always a
  // finite, non-negative number within [0, maxDelay].
  const safeMax = Number.isFinite(maxDelay) && maxDelay > 0 ? maxDelay : 0;
  if (!Number.isFinite(index) || index <= 0) {
    return 0;
  }
  const safeStep = Number.isFinite(step) && step > 0 ? step : 0;
  const raw = index * safeStep;
  return Math.min(raw, safeMax);
}
