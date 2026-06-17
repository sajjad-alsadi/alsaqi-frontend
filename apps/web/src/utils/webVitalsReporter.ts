/**
 * Web Vitals Reporter — Beacon-based metric reporting.
 *
 * Batches and sends Web Vitals metrics every 10 seconds via navigator.sendBeacon.
 * Flushes on visibilitychange (hidden) to avoid losing metrics on navigation.
 * Falls back to fetch with keepalive: true when sendBeacon is unavailable.
 *
 * Requirements: 6.6
 */

import { webVitalsMonitor, type MetricReport } from './webVitalsMonitor';
import { isAuthenticated } from './authGate';

/** Default reporting endpoint */
const REPORT_ENDPOINT = '/api/metrics/web-vitals';

/** Default batch interval in milliseconds (10 seconds) */
const BATCH_INTERVAL = 10_000;

export interface WebVitalsReporterConfig {
  /** Backend endpoint URL to POST metrics to (default: /api/metrics/web-vitals) */
  endpoint?: string;
  /** Reporting batch interval in ms (default: 10000) */
  intervalMs?: number;
  /** Custom sendBeacon implementation (for testing) */
  sendBeaconFn?: ((url: string, data: string) => boolean) | null;
  /** Custom fetch implementation (for testing) */
  fetchFn?: typeof fetch;
}

/**
 * Send metrics to the backend using sendBeacon with fetch+keepalive fallback.
 */
function sendMetrics(
  metrics: MetricReport[],
  endpoint: string,
  sendBeaconFn?: ((url: string, data: string) => boolean) | null,
  fetchFn?: typeof fetch,
): void {
  // Do not send metrics if the user is not authenticated
  if (!isAuthenticated()) return;

  const payload = JSON.stringify({ metrics, timestamp: Date.now() });

  // Determine if sendBeacon is available
  const beacon = sendBeaconFn !== undefined
    ? sendBeaconFn
    : (typeof navigator !== 'undefined' && navigator.sendBeacon
      ? navigator.sendBeacon.bind(navigator)
      : null);

  if (beacon) {
    beacon(endpoint, payload);
  } else {
    // Fallback: fire-and-forget fetch with keepalive
    const fetchImpl = fetchFn ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    if (fetchImpl) {
      fetchImpl(endpoint, {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {
        // Silently swallow — never surface reporting errors to the user
      });
    }
  }
}

class WebVitalsReporter {
  private endpoint: string;
  private intervalMs: number;
  private sendBeaconFn: ((url: string, data: string) => boolean) | null | undefined;
  private fetchFn: typeof fetch | undefined;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private visibilityHandler: (() => void) | null = null;
  private started = false;

  constructor(config?: WebVitalsReporterConfig) {
    this.endpoint = config?.endpoint ?? REPORT_ENDPOINT;
    this.intervalMs = config?.intervalMs ?? BATCH_INTERVAL;
    this.sendBeaconFn = config?.sendBeaconFn;
    this.fetchFn = config?.fetchFn;
  }

  /**
   * Start the reporter: begin periodic batched reporting and register
   * the visibilitychange listener to flush on page hide.
   * Safe to call multiple times — only starts once.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Periodic flush every BATCH_INTERVAL ms
    this.timerId = setInterval(() => {
      this.flushAndSend();
    }, this.intervalMs);

    // Flush on page hide to avoid losing metrics during navigation/tab close
    this.visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        this.flushAndSend();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  /**
   * Stop the reporter: clear the timer and remove the visibilitychange listener.
   */
  stop(): void {
    if (!this.started) return;
    this.started = false;

    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  /**
   * Destroy the reporter — stop and clear all state.
   */
  destroy(): void {
    this.stop();
  }

  /**
   * Manually trigger a flush-and-send cycle. Useful for testing.
   */
  flush(): void {
    this.flushAndSend();
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  private flushAndSend(): void {
    const metrics = webVitalsMonitor.flush();
    if (metrics.length === 0) return;
    sendMetrics(metrics, this.endpoint, this.sendBeaconFn, this.fetchFn);
  }
}

// ─── Factory & Singleton ──────────────────────────────────────────────────────

let reporterInstance: WebVitalsReporter | null = null;

/**
 * Initialize and start the Web Vitals reporter singleton.
 * Call once during app startup (e.g., in main.tsx after webVitalsMonitor.init()).
 *
 * @param config - Optional configuration overrides
 */
export function initWebVitalsReporter(config?: WebVitalsReporterConfig): WebVitalsReporter {
  if (reporterInstance) {
    return reporterInstance;
  }

  reporterInstance = new WebVitalsReporter(config);
  reporterInstance.start();
  return reporterInstance;
}

/**
 * Get the current reporter instance (or null if not initialized).
 */
export function getWebVitalsReporter(): WebVitalsReporter | null {
  return reporterInstance;
}

/**
 * Stop and destroy the reporter singleton. Used in tests or app teardown.
 */
export function destroyWebVitalsReporter(): void {
  if (reporterInstance) {
    reporterInstance.destroy();
    reporterInstance = null;
  }
}

export { WebVitalsReporter, sendMetrics };
