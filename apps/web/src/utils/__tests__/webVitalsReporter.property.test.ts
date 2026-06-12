/**
 * Property-based tests for the Web Vitals Reporter retry buffer.
 *
 * Feature: web-production-readiness-remediation, Property 7: Web Vitals buffer is
 * capped and retains the most recent metrics
 *
 * Property 7: Web Vitals buffer is capped and retains the most recent metrics
 *   For any sequence of captured metrics reported while the endpoint is failing,
 *   the retry buffer never exceeds MAX_BUFFER_SIZE (50) entries and retains the
 *   most recent metrics up to that cap.
 *   **Validates: Requirements 17.3**
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { WebVitalsReporter } from '../webVitalsReporter';
import {
  webVitalsMonitor,
  type WebVitalMetric,
  type MetricCallback,
  type MetricName,
  type MetricRating,
} from '../webVitalsMonitor';

/** Must mirror MAX_BUFFER_SIZE in webVitalsReporter.ts */
const MAX_BUFFER_SIZE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * A fetch implementation that always rejects, simulating a failing endpoint.
 */
const failingFetch = (() =>
  Promise.reject(new Error('endpoint unavailable'))) as unknown as typeof fetch;

/**
 * Flush pending microtasks (lets the rejected fetch's .catch run and re-buffer).
 */
const flushAsync = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

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

/**
 * Arbitrary for a single Web Vital metric. The `value` is overwritten with a
 * unique sequential index before feeding so recency can be asserted unambiguously.
 */
const arbMetric: fc.Arbitrary<WebVitalMetric> = fc.record({
  name: arbMetricName,
  value: fc.double({ min: 0, max: 10_000, noNaN: true }),
  rating: arbMetricRating,
  route: fc.constantFrom('/', '/dashboard', '/findings', '/audit'),
  timestamp: fc.constant('2024-01-01T00:00:00.000Z'),
});

describe('Property 7: Web Vitals buffer is capped and retains the most recent metrics', () => {
  const MAX_IDLE_TIME = 50;

  beforeEach(() => {
    // Make scheduleIdle run synchronously so flush() invokes sendMetrics inline.
    (globalThis as unknown as { requestIdleCallback: unknown }).requestIdleCallback = (
      cb: (deadline: { timeRemaining: () => number; didTimeout: boolean }) => void,
    ) => {
      cb({ timeRemaining: () => MAX_IDLE_TIME, didTimeout: false });
      return 0;
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;
    vi.restoreAllMocks();
  });

  it('buffer never exceeds 50 and retains the most-recent metrics under a failing endpoint', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate sequences that may exceed the cap (up to 120 metrics).
        fc.array(arbMetric, { minLength: 0, maxLength: 120 }),
        async (rawMetrics) => {
          // Tag each metric with a unique, monotonically increasing value so the
          // "most recent" tail can be identified deterministically.
          const metrics: WebVitalMetric[] = rawMetrics.map((m, i) => ({ ...m, value: i }));

          // Capture the reporter's metric callback instead of relying on the real
          // monitor's PerformanceObserver plumbing.
          let captured: MetricCallback | null = null;
          const spy = vi
            .spyOn(webVitalsMonitor, 'onMetric')
            .mockImplementation((cb: MetricCallback) => {
              captured = cb;
              return () => {};
            });

          const reporter = new WebVitalsReporter({
            endpoint: '/api/metrics/web-vitals',
            intervalMs: 1_000_000, // large enough that the periodic timer never fires mid-test
            fetchFn: failingFetch,
          });

          try {
            reporter.start();
            expect(captured).not.toBeNull();

            // Emit the generated sequence of metrics through the captured callback.
            for (const metric of metrics) {
              captured!(metric);
            }

            // Attempt to report; the failing endpoint forces everything into the buffer.
            reporter.flush();
            await flushAsync();

            const expectedSize = Math.min(metrics.length, MAX_BUFFER_SIZE);
            const snapshot = reporter.getBufferSnapshot();

            // Buffer is capped at MAX_BUFFER_SIZE.
            expect(reporter.getBufferSize()).toBe(expectedSize);
            expect(reporter.getBufferSize()).toBeLessThanOrEqual(MAX_BUFFER_SIZE);

            // Buffer retains the MOST RECENT metrics (the tail of the sequence).
            const expectedTail = metrics.slice(metrics.length - expectedSize);
            expect(snapshot.map((b) => b.metric)).toEqual(expectedTail);
          } finally {
            reporter.destroy();
            spy.mockRestore();
          }
        },
      ),
      { numRuns: 120 },
    );
  });
});
