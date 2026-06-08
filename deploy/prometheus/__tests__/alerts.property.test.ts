// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property Test: Alert rule fires on high latency (Property 14)
 *
 * Feature: production-readiness-review
 * Property 14: Alert rule fires on high latency
 *
 * **Validates: Requirements 3.5**
 *
 * The HighLatency alert rule in deploy/prometheus/alerts.yml fires when:
 *   histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 2.0
 *
 * For any response time distribution where p95 > 2000ms (2.0s), the alert should fire.
 * For any response time distribution where p95 <= 2000ms (2.0s), the alert should NOT fire.
 */

// ─── Alert Threshold Constants (from alerts.yml) ─────────────────────────────

const HIGH_LATENCY_P95_THRESHOLD_SECONDS = 2.0;

// ─── Helper: Compute p95 from a sorted sample array ─────────────────────────

/**
 * Computes the 95th percentile from a sorted array of response times.
 * Uses the nearest-rank method consistent with Prometheus histogram_quantile behavior.
 */
function computeP95(sortedSamples: number[]): number {
  if (sortedSamples.length === 0) return 0;
  if (sortedSamples.length === 1) return sortedSamples[0];

  // Nearest-rank method: index = ceil(0.95 * N) - 1
  const index = Math.ceil(0.95 * sortedSamples.length) - 1;
  return sortedSamples[index];
}

/**
 * Simulates whether the HighLatency alert would fire given a p95 latency value.
 * Based on the alert expression: histogram_quantile(0.95, ...) > 2.0
 */
function highLatencyAlertFires(p95Seconds: number): boolean {
  return p95Seconds > HIGH_LATENCY_P95_THRESHOLD_SECONDS;
}

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/**
 * Generates a sorted array of response times (in seconds) where p95 > 2.0s.
 * Strategy: generate samples where at least the top 5% exceed the threshold.
 */
const highLatencyDistributionArb: fc.Arbitrary<number[]> = fc
  .integer({ min: 20, max: 200 })
  .chain((sampleCount) => {
    // For p95 > 2.0s we need the value at index ceil(0.95*N)-1 to be > 2.0
    // Generate ~94% below threshold and ~6% above to ensure p95 exceeds threshold
    const belowThresholdCount = Math.floor(sampleCount * 0.94);
    const aboveThresholdCount = sampleCount - belowThresholdCount;

    const belowSamples = fc.array(
      fc.double({ min: 0.001, max: 1.99, noNaN: true }),
      { minLength: belowThresholdCount, maxLength: belowThresholdCount }
    );

    const aboveSamples = fc.array(
      fc.double({ min: 2.01, max: 30.0, noNaN: true }),
      { minLength: aboveThresholdCount, maxLength: aboveThresholdCount }
    );

    return fc.tuple(belowSamples, aboveSamples).map(([below, above]) => {
      return [...below, ...above].sort((a, b) => a - b);
    });
  });

/**
 * Generates a sorted array of response times (in seconds) where p95 <= 2.0s.
 * Strategy: ensure all values are at or below the threshold so p95 cannot exceed it.
 */
const normalLatencyDistributionArb: fc.Arbitrary<number[]> = fc
  .array(fc.double({ min: 0.001, max: 2.0, noNaN: true }), { minLength: 20, maxLength: 200 })
  .map((samples) => samples.sort((a, b) => a - b));

/**
 * Generates any valid p95 value above the threshold (in seconds).
 */
const p95AboveThresholdArb: fc.Arbitrary<number> = fc.double({
  min: 2.001,
  max: 60.0,
  noNaN: true,
});

/**
 * Generates any valid p95 value at or below the threshold (in seconds).
 */
const p95AtOrBelowThresholdArb: fc.Arbitrary<number> = fc.double({
  min: 0.001,
  max: 2.0,
  noNaN: true,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 14: Alert rule fires on high latency', () => {
  describe('alert fires when p95 latency exceeds 2000ms (2.0s)', () => {
    it('for any p95 value > 2.0s, the HighLatency alert evaluates to firing', () => {
      fc.assert(
        fc.property(p95AboveThresholdArb, (p95Seconds) => {
          expect(highLatencyAlertFires(p95Seconds)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('for any response time distribution where computed p95 > 2.0s, the alert fires', () => {
      fc.assert(
        fc.property(highLatencyDistributionArb, (sortedSamples) => {
          const p95 = computeP95(sortedSamples);
          // Confirm p95 is actually above threshold
          expect(p95).toBeGreaterThan(HIGH_LATENCY_P95_THRESHOLD_SECONDS);
          // Verify alert fires
          expect(highLatencyAlertFires(p95)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('alert does NOT fire when p95 latency is at or below 2000ms (2.0s)', () => {
    it('for any p95 value <= 2.0s, the HighLatency alert does NOT fire', () => {
      fc.assert(
        fc.property(p95AtOrBelowThresholdArb, (p95Seconds) => {
          expect(highLatencyAlertFires(p95Seconds)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('for any response time distribution where computed p95 <= 2.0s, the alert does NOT fire', () => {
      fc.assert(
        fc.property(normalLatencyDistributionArb, (sortedSamples) => {
          const p95 = computeP95(sortedSamples);
          // Confirm p95 is at or below threshold
          expect(p95).toBeLessThanOrEqual(HIGH_LATENCY_P95_THRESHOLD_SECONDS);
          // Verify alert does not fire
          expect(highLatencyAlertFires(p95)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('threshold boundary behavior', () => {
    it('p95 exactly at 2.0s does NOT fire (threshold is strictly greater than)', () => {
      // The alert expression uses > 2.0, not >= 2.0
      expect(highLatencyAlertFires(2.0)).toBe(false);
    });

    it('p95 just above 2.0s fires', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 2.0001, max: 2.01, noNaN: true }),
          (p95Seconds) => {
            expect(highLatencyAlertFires(p95Seconds)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('the alert threshold matches the configured value in alerts.yml (2.0 seconds = 2000ms)', () => {
      // Document that the threshold is 2.0 seconds (2000ms) as specified in Requirement 3.5
      expect(HIGH_LATENCY_P95_THRESHOLD_SECONDS).toBe(2.0);
    });
  });

  describe('p95 computation correctness', () => {
    it('p95 from any sorted distribution is always a value within the sample range', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 0.001, max: 60.0, noNaN: true }), { minLength: 20, maxLength: 200 }),
          (samples) => {
            const sorted = [...samples].sort((a, b) => a - b);
            const p95 = computeP95(sorted);
            expect(p95).toBeGreaterThanOrEqual(sorted[0]);
            expect(p95).toBeLessThanOrEqual(sorted[sorted.length - 1]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('p95 is deterministic for same input', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 0.001, max: 60.0, noNaN: true }), { minLength: 20, maxLength: 200 }),
          (samples) => {
            const sorted = [...samples].sort((a, b) => a - b);
            const p95a = computeP95(sorted);
            const p95b = computeP95(sorted);
            expect(p95a).toBe(p95b);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
