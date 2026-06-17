/**
 * Unit tests for webVitalsReporter.
 *
 * Validates:
 * - Beacon-based reporting via navigator.sendBeacon
 * - Fallback to fetch with keepalive when sendBeacon unavailable
 * - Flush on visibilitychange (hidden)
 * - Batching every 10 seconds via webVitalsMonitor.flush()
 * - Auth gate prevents sending when unauthenticated
 *
 * Requirements: 6.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WebVitalsReporter,
  initWebVitalsReporter,
  destroyWebVitalsReporter,
  getWebVitalsReporter,
  sendMetrics,
} from './webVitalsReporter';
import { webVitalsMonitor, type MetricReport } from './webVitalsMonitor';
import { markAuthenticated, markUnauthenticated } from './authGate';

// Helper to create a mock MetricReport
function createMetricReport(overrides?: Partial<MetricReport>): MetricReport {
  return {
    name: 'LCP',
    value: 2000,
    rating: 'good',
    delta: 2000,
    id: 'v1-123',
    navigationType: 'navigate',
    ...overrides,
  };
}

describe('WebVitalsReporter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    destroyWebVitalsReporter();
    markAuthenticated();
    webVitalsMonitor.destroy();
  });

  afterEach(() => {
    destroyWebVitalsReporter();
    markUnauthenticated();
    webVitalsMonitor.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('sendMetrics function', () => {
    it('should use sendBeacon when available', () => {
      const beaconFn = vi.fn().mockReturnValue(true);
      const metrics = [createMetricReport()];

      sendMetrics(metrics, '/api/metrics/web-vitals', beaconFn, undefined);

      expect(beaconFn).toHaveBeenCalledOnce();
      expect(beaconFn).toHaveBeenCalledWith(
        '/api/metrics/web-vitals',
        expect.stringContaining('"metrics"'),
      );
    });

    it('should include timestamp in payload', () => {
      const beaconFn = vi.fn().mockReturnValue(true);
      const metrics = [createMetricReport()];

      sendMetrics(metrics, '/api/metrics/web-vitals', beaconFn, undefined);

      const payload = JSON.parse(beaconFn.mock.calls[0][1]);
      expect(payload).toHaveProperty('timestamp');
      expect(typeof payload.timestamp).toBe('number');
      expect(payload.metrics).toEqual(metrics);
    });

    it('should fall back to fetch with keepalive when sendBeacon is null', () => {
      const fetchFn = vi.fn().mockResolvedValue({ ok: true });
      const metrics = [createMetricReport()];

      sendMetrics(metrics, '/api/metrics/web-vitals', null, fetchFn);

      expect(fetchFn).toHaveBeenCalledOnce();
      expect(fetchFn).toHaveBeenCalledWith('/api/metrics/web-vitals', {
        method: 'POST',
        body: expect.stringContaining('"metrics"'),
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      });
    });

    it('should not send metrics when user is unauthenticated', () => {
      markUnauthenticated();
      const beaconFn = vi.fn().mockReturnValue(true);
      const metrics = [createMetricReport()];

      sendMetrics(metrics, '/api/metrics/web-vitals', beaconFn, undefined);

      expect(beaconFn).not.toHaveBeenCalled();
    });

    it('should silently swallow fetch errors', async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error('Network error'));
      const metrics = [createMetricReport()];

      // Should not throw
      expect(() =>
        sendMetrics(metrics, '/api/metrics/web-vitals', null, fetchFn),
      ).not.toThrow();
    });
  });

  describe('periodic batching', () => {
    it('should flush and send metrics every batch interval', () => {
      const beaconFn = vi.fn().mockReturnValue(true);
      const reporter = new WebVitalsReporter({
        endpoint: '/api/metrics/web-vitals',
        intervalMs: 10_000,
        sendBeaconFn: beaconFn,
      });

      // Seed the monitor buffer with metrics
      webVitalsMonitor.init();
      // Manually push to the buffer via the flush mechanism
      // We'll use the internal approach: init the monitor then push a report
      const metric = createMetricReport({ name: 'FCP', value: 1200 });
      // Access the monitor's buffer via its flush — but first we need to push data in
      // Since we can't trigger real PerformanceObserver, we'll directly test via flush
      // by spying on webVitalsMonitor.flush

      const flushSpy = vi.spyOn(webVitalsMonitor, 'flush').mockReturnValue([metric]);

      reporter.start();

      // Advance timer to trigger the interval
      vi.advanceTimersByTime(10_000);

      expect(flushSpy).toHaveBeenCalled();
      expect(beaconFn).toHaveBeenCalledOnce();

      reporter.destroy();
    });

    it('should not send when flush returns empty array', () => {
      const beaconFn = vi.fn().mockReturnValue(true);
      const reporter = new WebVitalsReporter({
        endpoint: '/api/metrics/web-vitals',
        intervalMs: 10_000,
        sendBeaconFn: beaconFn,
      });

      vi.spyOn(webVitalsMonitor, 'flush').mockReturnValue([]);

      reporter.start();
      vi.advanceTimersByTime(10_000);

      expect(beaconFn).not.toHaveBeenCalled();

      reporter.destroy();
    });

    it('should use default 10-second interval', () => {
      const beaconFn = vi.fn().mockReturnValue(true);
      const reporter = new WebVitalsReporter({
        sendBeaconFn: beaconFn,
      });

      const metric = createMetricReport();
      vi.spyOn(webVitalsMonitor, 'flush').mockReturnValue([metric]);

      reporter.start();

      // Should not fire at 9 seconds
      vi.advanceTimersByTime(9_000);
      expect(beaconFn).not.toHaveBeenCalled();

      // Should fire at 10 seconds
      vi.advanceTimersByTime(1_000);
      expect(beaconFn).toHaveBeenCalledOnce();

      reporter.destroy();
    });
  });

  describe('visibilitychange flush', () => {
    it('should flush metrics when page becomes hidden', () => {
      const beaconFn = vi.fn().mockReturnValue(true);
      const reporter = new WebVitalsReporter({
        endpoint: '/api/metrics/web-vitals',
        sendBeaconFn: beaconFn,
      });

      const metric = createMetricReport({ name: 'CLS', value: 0.05 });
      vi.spyOn(webVitalsMonitor, 'flush').mockReturnValue([metric]);

      reporter.start();

      // Simulate visibilitychange to hidden
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(beaconFn).toHaveBeenCalledOnce();

      // Restore
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });

      reporter.destroy();
    });

    it('should not flush when page becomes visible', () => {
      const beaconFn = vi.fn().mockReturnValue(true);
      const reporter = new WebVitalsReporter({
        endpoint: '/api/metrics/web-vitals',
        sendBeaconFn: beaconFn,
      });

      vi.spyOn(webVitalsMonitor, 'flush').mockReturnValue([createMetricReport()]);

      reporter.start();

      // Simulate visibilitychange to visible (should NOT trigger flush)
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(beaconFn).not.toHaveBeenCalled();

      reporter.destroy();
    });
  });

  describe('singleton management', () => {
    it('initWebVitalsReporter creates a singleton', () => {
      const reporter = initWebVitalsReporter({
        endpoint: '/api/metrics',
        sendBeaconFn: vi.fn().mockReturnValue(true),
      });
      expect(reporter).toBeDefined();
      expect(getWebVitalsReporter()).toBe(reporter);
    });

    it('initWebVitalsReporter returns same instance on repeated calls', () => {
      const r1 = initWebVitalsReporter({ endpoint: '/a' });
      const r2 = initWebVitalsReporter({ endpoint: '/b' });
      expect(r1).toBe(r2);
    });

    it('destroyWebVitalsReporter clears the singleton', () => {
      initWebVitalsReporter({ endpoint: '/api' });
      destroyWebVitalsReporter();
      expect(getWebVitalsReporter()).toBeNull();
    });
  });

  describe('start and stop', () => {
    it('should only start once even if start() called multiple times', () => {
      const beaconFn = vi.fn().mockReturnValue(true);
      const reporter = new WebVitalsReporter({
        sendBeaconFn: beaconFn,
        intervalMs: 5000,
      });

      vi.spyOn(webVitalsMonitor, 'flush').mockReturnValue([createMetricReport()]);

      reporter.start();
      reporter.start(); // no-op

      vi.advanceTimersByTime(5000);
      // Should only have one interval firing, not two
      expect(beaconFn).toHaveBeenCalledTimes(1);

      reporter.destroy();
    });

    it('stop() should halt periodic reporting and remove visibilitychange listener', () => {
      const beaconFn = vi.fn().mockReturnValue(true);
      const reporter = new WebVitalsReporter({
        sendBeaconFn: beaconFn,
        intervalMs: 5000,
      });

      vi.spyOn(webVitalsMonitor, 'flush').mockReturnValue([createMetricReport()]);

      reporter.start();
      reporter.stop();

      // Timer should not fire
      vi.advanceTimersByTime(10_000);
      expect(beaconFn).not.toHaveBeenCalled();

      // Visibilitychange should not trigger
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(beaconFn).not.toHaveBeenCalled();

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });

      reporter.destroy();
    });

    it('destroy() is safe to call multiple times', () => {
      const reporter = new WebVitalsReporter({
        sendBeaconFn: vi.fn().mockReturnValue(true),
      });
      reporter.start();
      reporter.destroy();
      expect(() => reporter.destroy()).not.toThrow();
    });
  });

  describe('default endpoint', () => {
    it('should default to /api/metrics/web-vitals', () => {
      const beaconFn = vi.fn().mockReturnValue(true);
      const reporter = new WebVitalsReporter({
        sendBeaconFn: beaconFn,
      });

      vi.spyOn(webVitalsMonitor, 'flush').mockReturnValue([createMetricReport()]);

      reporter.start();
      vi.advanceTimersByTime(10_000);

      expect(beaconFn).toHaveBeenCalledWith(
        '/api/metrics/web-vitals',
        expect.any(String),
      );

      reporter.destroy();
    });
  });
});
