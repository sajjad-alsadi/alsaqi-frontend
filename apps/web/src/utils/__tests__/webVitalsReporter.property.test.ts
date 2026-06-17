/**
 * Property-based tests for the Web Vitals Reporter beacon-based reporting.
 *
 * Property: All flushed metrics are transmitted without data loss
 *   For any sequence of metrics buffered in webVitalsMonitor, when the reporter
 *   flushes, ALL metrics are included in the sendBeacon/fetch payload. No metrics
 *   are silently dropped during the send process (when authenticated).
 *   **Validates: Requirements 6.6**
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { WebVitalsReporter, sendMetrics } from '../webVitalsReporter';
import {
  webVitalsMonitor,
  type MetricReport,
  type MetricName,
  type MetricRating,
} from '../webVitalsMonitor';
import { markAuthenticated, markUnauthenticated } from '../authGate';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const arbMetricName: fc.Arbitrary<MetricName> = fc.constantFrom(
  'LCP',
  'FID',
  'CLS',
  'FCP',
  'TTFB',
);

const arbMetricRating: fc.Arbitrary<MetricRating> = fc.constantFrom(
  'good',
  'needs-improvement',
  'poor',
);

const arbMetricReport: fc.Arbitrary<MetricReport> = fc.record({
  name: arbMetricName as fc.Arbitrary<string>,
  value: fc.double({ min: 0, max: 10_000, noNaN: true }),
  rating: arbMetricRating,
  delta: fc.double({ min: 0, max: 5000, noNaN: true }),
  id: fc.string({ minLength: 3, maxLength: 10 }),
  navigationType: fc.constantFrom('navigate', 'reload', 'back-forward', 'prerender'),
});

describe('Property: Web Vitals reporter transmits all flushed metrics without data loss', () => {
  beforeEach(() => {
    markAuthenticated();
    webVitalsMonitor.destroy();
  });

  afterEach(() => {
    markUnauthenticated();
    webVitalsMonitor.destroy();
    vi.restoreAllMocks();
  });

  it('sendMetrics includes all provided metrics in the beacon payload', () => {
    fc.assert(
      fc.property(
        fc.array(arbMetricReport, { minLength: 1, maxLength: 100 }),
        (metrics) => {
          const beaconFn = vi.fn().mockReturnValue(true);

          sendMetrics(metrics, '/api/metrics/web-vitals', beaconFn, undefined);

          expect(beaconFn).toHaveBeenCalledOnce();

          const payload = JSON.parse(beaconFn.mock.calls[0][1]);
          // All metrics are present in the payload without loss
          expect(payload.metrics).toHaveLength(metrics.length);
          expect(payload.metrics).toEqual(metrics);
          // Timestamp is included
          expect(typeof payload.timestamp).toBe('number');

          beaconFn.mockClear();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sendMetrics falls back to fetch with keepalive when sendBeacon is null', () => {
    fc.assert(
      fc.property(
        fc.array(arbMetricReport, { minLength: 1, maxLength: 50 }),
        (metrics) => {
          const fetchFn = vi.fn().mockResolvedValue({ ok: true });

          sendMetrics(metrics, '/api/metrics/web-vitals', null, fetchFn);

          expect(fetchFn).toHaveBeenCalledOnce();

          const callArgs = fetchFn.mock.calls[0];
          expect(callArgs[0]).toBe('/api/metrics/web-vitals');
          expect(callArgs[1].method).toBe('POST');
          expect(callArgs[1].keepalive).toBe(true);

          const payload = JSON.parse(callArgs[1].body);
          expect(payload.metrics).toHaveLength(metrics.length);
          expect(payload.metrics).toEqual(metrics);

          fetchFn.mockClear();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sendMetrics does not transmit when unauthenticated (for any metrics)', () => {
    markUnauthenticated();

    fc.assert(
      fc.property(
        fc.array(arbMetricReport, { minLength: 1, maxLength: 50 }),
        (metrics) => {
          const beaconFn = vi.fn().mockReturnValue(true);
          const fetchFn = vi.fn().mockResolvedValue({ ok: true });

          sendMetrics(metrics, '/api/metrics/web-vitals', beaconFn, fetchFn);

          expect(beaconFn).not.toHaveBeenCalled();
          expect(fetchFn).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('reporter flushes all buffered monitor metrics on interval', () => {
    fc.assert(
      fc.property(
        fc.array(arbMetricReport, { minLength: 0, maxLength: 80 }),
        (metrics) => {
          const beaconFn = vi.fn().mockReturnValue(true);

          // Mock the monitor's flush to return our generated metrics
          const flushSpy = vi.spyOn(webVitalsMonitor, 'flush').mockReturnValue(metrics);

          const reporter = new WebVitalsReporter({
            endpoint: '/api/metrics/web-vitals',
            intervalMs: 10_000,
            sendBeaconFn: beaconFn,
          });

          reporter.start();
          // Manually trigger flush (simulates what the interval does)
          reporter.flush();

          if (metrics.length === 0) {
            // No metrics → no beacon call
            expect(beaconFn).not.toHaveBeenCalled();
          } else {
            expect(beaconFn).toHaveBeenCalledOnce();
            const payload = JSON.parse(beaconFn.mock.calls[0][1]);
            expect(payload.metrics).toHaveLength(metrics.length);
            expect(payload.metrics).toEqual(metrics);
          }

          reporter.destroy();
          flushSpy.mockRestore();
          beaconFn.mockClear();
        },
      ),
      { numRuns: 100 },
    );
  });
});
