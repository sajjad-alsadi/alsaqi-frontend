/**
 * Property-based test for Web Vitals classification correctness.
 *
 * Property 14: Web Vitals classification correctness
 *
 * For each metric name (LCP, FID, CLS, FCP, TTFB), values generated within
 * the "good", "needs-improvement", or "poor" range must be classified accordingly
 * by `classifyMetric`. Boundary values (exactly at threshold) must be classified
 * per the ≤ good → 'good', ≤ poor → 'needs-improvement', > poor → 'poor' rules.
 *
 * **Validates: Requirements 6.1, 6.2**
 *
 * Feature: app-rebuild, Property 14
 *
 * Strategy:
 * - For each metric, use `fc.double()` constrained to the appropriate range.
 * - Assert correct classification per threshold boundaries.
 * - Boundary tests: values exactly at threshold boundaries.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { classifyMetric, THRESHOLDS } from './webVitalsMonitor';

// ─── Metric definitions with their threshold boundaries ─────────────────────

interface MetricDef {
  name: string;
  good: number;
  poor: number;
}

const METRICS: MetricDef[] = Object.entries(THRESHOLDS).map(
  ([name, [good, poor]]) => ({ name, good, poor })
);

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Property 14: Web Vitals classification correctness', () => {
  describe('values in "good" range → classified as good', () => {
    for (const metric of METRICS) {
      it(`${metric.name}: value in [0, ${metric.good}] → 'good'`, () => {
        fc.assert(
          fc.property(
            fc.double({ min: 0, max: metric.good, noNaN: true }),
            (value) => {
              expect(classifyMetric(metric.name, value)).toBe('good');
            }
          ),
          { numRuns: 200 }
        );
      });
    }
  });

  describe('values in "needs-improvement" range → classified as needs-improvement', () => {
    for (const metric of METRICS) {
      it(`${metric.name}: value in (${metric.good}, ${metric.poor}] → 'needs-improvement'`, () => {
        // Generate values strictly greater than `good` and up to `poor`.
        // `minExcluded` guarantees the lower bound is exclusive — adding
        // Number.EPSILON is unreliable at large magnitudes (e.g. 2500) where it
        // rounds back to the boundary itself.
        fc.assert(
          fc.property(
            fc.double({
              min: metric.good,
              minExcluded: true,
              max: metric.poor,
              noNaN: true,
            }),
            (value) => {
              expect(classifyMetric(metric.name, value)).toBe(
                'needs-improvement'
              );
            }
          ),
          { numRuns: 200 }
        );
      });
    }
  });

  describe('values in "poor" range → classified as poor', () => {
    for (const metric of METRICS) {
      it(`${metric.name}: value > ${metric.poor} → 'poor'`, () => {
        // Generate values strictly above the poor threshold. `minExcluded`
        // makes the lower bound exclusive (Number.EPSILON is lost at large
        // magnitudes, which previously yielded the boundary value itself).
        const maxValue = metric.poor * 10;
        fc.assert(
          fc.property(
            fc.double({
              min: metric.poor,
              minExcluded: true,
              max: maxValue,
              noNaN: true,
            }),
            (value) => {
              expect(classifyMetric(metric.name, value)).toBe('poor');
            }
          ),
          { numRuns: 200 }
        );
      });
    }
  });

  describe('boundary values: exactly at thresholds', () => {
    for (const metric of METRICS) {
      it(`${metric.name}: value exactly at good threshold (${metric.good}) → 'good'`, () => {
        expect(classifyMetric(metric.name, metric.good)).toBe('good');
      });

      it(`${metric.name}: value exactly at poor threshold (${metric.poor}) → 'needs-improvement'`, () => {
        expect(classifyMetric(metric.name, metric.poor)).toBe(
          'needs-improvement'
        );
      });
    }
  });

  describe('unknown metric names → default to good', () => {
    it('any unknown metric name returns good', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter(
            (s) => !Object.keys(THRESHOLDS).includes(s)
          ),
          fc.double({ min: 0, max: 100000, noNaN: true }),
          (name, value) => {
            expect(classifyMetric(name, value)).toBe('good');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
