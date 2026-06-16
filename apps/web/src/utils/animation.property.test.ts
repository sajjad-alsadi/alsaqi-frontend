/**
 * Property-based test for the bounded animation stagger delay.
 *
 * Feature: code-review-remediation, Property 14: Animation stagger delay is
 * bounded.
 *
 * Property 14 (design.md → "Property 14: Animation stagger delay is bounded"):
 *   "For any list length and any item index, the computed cumulative animation
 *    stagger delay does not exceed the configured cap — it never scales
 *    unbounded with list length."
 *
 * The testable seam is `getStaggerDelay(index, step, maxDelay)`. By construction
 * the result must always land in the closed interval [0, maxDelay] no matter how
 * large, negative, or non-finite the index is, and within that interval it must
 * grow monotonically (non-decreasing) with the index up to the cap. We generate
 * arbitrary indices — including huge, negative, NaN, and ±Infinity values — and
 * assert both the boundedness and the monotonicity invariants.
 *
 * **Validates: Requirements 23.2, 23.3**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  getStaggerDelay,
  STAGGER_STEP_SECONDS,
  MAX_STAGGER_DELAY_SECONDS,
} from './animation';

// Indices spanning the full input space: ordinary list positions, the boundary
// where the cap kicks in, pathologically huge values, negatives, and the
// non-finite values the helper explicitly guards against.
const indexArb = fc.oneof(
  fc.integer({ min: 0, max: 1000 }),
  fc.integer({ min: -1000, max: -1 }),
  fc.double({ min: 0, max: 1e9, noNaN: true }),
  fc.constantFrom(
    0,
    1,
    5,
    6, // 6 * 0.05 = 0.30 -> exactly the cap
    7, // just past the cap
    Number.MAX_SAFE_INTEGER,
    -1,
    -Number.MAX_SAFE_INTEGER,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY
  )
);

describe('Feature: code-review-remediation, Property 14: Animation stagger delay is bounded (Requirements 23.2, 23.3)', () => {
  it('always returns a finite delay within [0, MAX_STAGGER_DELAY_SECONDS] for any index', () => {
    fc.assert(
      fc.property(indexArb, (index) => {
        const delay = getStaggerDelay(index);
        expect(Number.isFinite(delay)).toBe(true);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(MAX_STAGGER_DELAY_SECONDS);
      }),
      { numRuns: 200 }
    );
  });

  it('never exceeds the cap for arbitrary step/maxDelay configurations', () => {
    fc.assert(
      fc.property(
        indexArb,
        fc.double({ min: 0, max: 10, noNaN: true }),
        fc.double({ min: 0, max: 10, noNaN: true }),
        (index, step, maxDelay) => {
          const delay = getStaggerDelay(index, step, maxDelay);
          // The effective cap is the configured maxDelay when it is a positive
          // finite number, otherwise the helper clamps to 0.
          const effectiveCap = Number.isFinite(maxDelay) && maxDelay > 0 ? maxDelay : 0;
          expect(Number.isFinite(delay)).toBe(true);
          expect(delay).toBeGreaterThanOrEqual(0);
          expect(delay).toBeLessThanOrEqual(effectiveCap);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('is monotonically non-decreasing in the index up to the cap', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 0, max: 10000 }),
        (a, b) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          // A larger (non-negative) index never yields a smaller delay.
          expect(getStaggerDelay(hi)).toBeGreaterThanOrEqual(getStaggerDelay(lo));
        }
      ),
      { numRuns: 200 }
    );
  });

  it('saturates at the cap once index * step reaches MAX_STAGGER_DELAY_SECONDS', () => {
    const capIndex = Math.ceil(MAX_STAGGER_DELAY_SECONDS / STAGGER_STEP_SECONDS);
    fc.assert(
      fc.property(fc.integer({ min: capIndex, max: 1_000_000 }), (index) => {
        // Every index at or beyond the saturation point shares the same capped
        // delay, so the total animation window is bounded regardless of length.
        expect(getStaggerDelay(index)).toBe(MAX_STAGGER_DELAY_SECONDS);
      }),
      { numRuns: 200 }
    );
  });
});
