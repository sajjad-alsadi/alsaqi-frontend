// @vitest-environment node
/**
 * Property-based test for CI bundle delta comparison.
 *
 * **Property 16: CI delta comparison rejects excessive growth**
 *
 * **Validates: Requirements 6.5**
 *
 * Uses fast-check to generate (currentTotal, baselineTotal) pairs and asserts:
 * 1. For any (current, baseline) where current - baseline > 5120 and no override: FAIL
 * 2. For any (current, baseline) where current - baseline ≤ 5120: PASS
 * 3. For any (current, baseline) where override is true: PASS regardless of delta
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { checkDelta, MAX_DELTA_BYTES } from './bundleDelta';

describe('Property 16: CI delta comparison rejects excessive growth', () => {
  it('rejects when delta > 5120 bytes without override', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.nat(),
        (baselineTotal, extraBytes) => {
          // Ensure delta is strictly greater than MAX_DELTA_BYTES
          const currentTotal = baselineTotal + MAX_DELTA_BYTES + 1 + extraBytes;

          const result = checkDelta(currentTotal, baselineTotal, false);

          expect(result.pass).toBe(false);
          expect(result.delta).toBe(currentTotal - baselineTotal);
          expect(result.delta).toBeGreaterThan(MAX_DELTA_BYTES);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('passes when delta ≤ 5120 bytes', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.integer({ min: 0, max: MAX_DELTA_BYTES }),
        (baselineTotal, delta) => {
          const currentTotal = baselineTotal + delta;

          const result = checkDelta(currentTotal, baselineTotal, false);

          expect(result.pass).toBe(true);
          expect(result.delta).toBe(delta);
          expect(result.delta).toBeLessThanOrEqual(MAX_DELTA_BYTES);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('passes when current is smaller than baseline (negative delta)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10_000_000 }),
        fc.integer({ min: 1, max: 10_000_000 }),
        (currentTotal, reduction) => {
          const baselineTotal = currentTotal + reduction;

          const result = checkDelta(currentTotal, baselineTotal, false);

          expect(result.pass).toBe(true);
          expect(result.delta).toBeLessThan(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('always passes when override is true regardless of delta', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.nat(),
        (currentTotal, baselineTotal) => {
          const result = checkDelta(currentTotal, baselineTotal, true);

          expect(result.pass).toBe(true);
          expect(result.delta).toBe(currentTotal - baselineTotal);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('boundary: exactly 5120 bytes delta passes without override', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        (baselineTotal) => {
          const currentTotal = baselineTotal + MAX_DELTA_BYTES;

          const result = checkDelta(currentTotal, baselineTotal, false);

          expect(result.pass).toBe(true);
          expect(result.delta).toBe(MAX_DELTA_BYTES);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('boundary: exactly 5121 bytes delta fails without override', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        (baselineTotal) => {
          const currentTotal = baselineTotal + MAX_DELTA_BYTES + 1;

          const result = checkDelta(currentTotal, baselineTotal, false);

          expect(result.pass).toBe(false);
          expect(result.delta).toBe(MAX_DELTA_BYTES + 1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
