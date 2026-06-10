/**
 * Web Vitals Reporter — Async metric reporting with retry buffer.
 *
 * Subscribes to the webVitalsMonitor and sends metrics to a backend endpoint.
 * - Reports asynchronously via requestIdleCallback/setTimeout — never adds >50ms blocking to main thread
 * - On endpoint failure: retains up to 50 entries in memory, retries on next cycle
 * - Never surfaces reporting errors to the end user
 *
 * Requirements: 7.4, 7.5
 */

import { webVitalsMonitor, type WebVitalMetric } from './webVitalsMonitor';

/** Maximum number of metric entries retained in the retry buffer */
const MAX_BUFFER_SIZE = 50;

/** Default reporting interval in milliseconds */
const DEFAULT_REPORT_INTERVAL_MS = 10_000;

/** Maximum idle callback deadline budget (ms) to avoid blocking main thread */
const MAX_IDLE_BUDGET_MS = 50;

export interface WebVitalsReporterConfig {
  /** Backend endpoint URL to POST metrics to */
  endpoint: string;
  /** Reporting interval in ms (default: 10000) */
  intervalMs?: number | undefined;
  /** Custom fetch implementation (for testing) */
  fetchFn?: typeof fetch | undefined;
}

interface BufferedMetric {
  metric: WebVitalMetric;
  enqueuedAt: number;
}

/**
 * Schedule a callback using requestIdleCallback if available,
 * falling back to setTimeout. Ensures the main thread is never
 * blocked for more than MAX_IDLE_BUDGET_MS.
 */
function scheduleIdle(callback: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(
      (deadline) => {
        // Only run if we have enough idle time or if timed out
        if (deadline.timeRemaining() > 0 || deadline.didTimeout) {
          callback();
        } else {
          // Re-schedule if no time remaining
          scheduleIdle(callback);
        }
      },
      { timeout: MAX_IDLE_BUDGET_MS },
    );
  } else {
    // Fallback: use setTimeout(0) to defer off the main thread
    setTimeout(callback, 0);
  }
}

class WebVitalsReporter {
  private endpoint: string;
  private intervalMs: number;
  private fetchFn: typeof fetch;
  private buffer: BufferedMetric[] = [];
  private pending: WebVitalMetric[] = [];
  private timerId: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private started = false;

  constructor(config: WebVitalsReporterConfig) {
    this.endpoint = config.endpoint;
    this.intervalMs = config.intervalMs ?? DEFAULT_REPORT_INTERVAL_MS;
    this.fetchFn = config.fetchFn ?? fetch.bind(globalThis);
  }

  /**
   * Start the reporter: subscribe to webVitalsMonitor and begin periodic reporting.
   * Safe to call multiple times — only starts once.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Subscribe to new metrics from the monitor
    this.unsubscribe = webVitalsMonitor.onMetric((metric) => {
      this.pending.push(metric);
    });

    // Begin periodic flush cycle
    this.timerId = setInterval(() => {
      this.flush();
    }, this.intervalMs);
  }

  /**
   * Stop the reporter: unsubscribe from the monitor and clear the timer.
   * Buffered metrics are retained in case start() is called again.
   */
  stop(): void {
    if (!this.started) return;
    this.started = false;

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Flush pending and buffered metrics asynchronously.
   * Uses requestIdleCallback/setTimeout to avoid blocking the main thread.
   */
  flush(): void {
    scheduleIdle(() => {
      this.sendMetrics();
    });
  }

  /**
   * Get the current number of buffered (failed) metrics.
   * Useful for testing and observability.
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Get a snapshot of the current buffer (for testing).
   */
  getBufferSnapshot(): ReadonlyArray<BufferedMetric> {
    return [...this.buffer];
  }

  /**
   * Destroy the reporter — stop and clear all state.
   */
  destroy(): void {
    this.stop();
    this.buffer = [];
    this.pending = [];
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  private sendMetrics(): void {
    // Gather all metrics to send: buffered retries + newly pending
    const metricsToSend: WebVitalMetric[] = [
      ...this.buffer.map((b) => b.metric),
      ...this.pending,
    ];

    // Clear pending — they're now in-flight
    this.pending = [];
    // Clear buffer — will re-add on failure
    this.buffer = [];

    if (metricsToSend.length === 0) return;

    // Fire-and-forget the POST — never block main thread
    this.postMetrics(metricsToSend).catch(() => {
      // On failure: re-add all metrics to the buffer, respecting the cap
      this.retainInBuffer(metricsToSend);
    });
  }

  private async postMetrics(metrics: WebVitalMetric[]): Promise<void> {
    try {
      const response = await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics }),
        // Keep the request non-blocking — use keepalive for page unload scenarios
        keepalive: true,
      });

      if (!response.ok) {
        throw new Error(`Metrics report failed: ${response.status}`);
      }
    } catch {
      // Re-throw so the caller can handle buffering
      throw new Error('Metrics reporting failed');
    }
  }

  /**
   * Retain failed metrics in the buffer, capped at MAX_BUFFER_SIZE.
   * Oldest entries are dropped when the buffer is full.
   */
  private retainInBuffer(metrics: WebVitalMetric[]): void {
    const now = Date.now();
    const newEntries: BufferedMetric[] = metrics.map((metric) => ({
      metric,
      enqueuedAt: now,
    }));

    // Combine existing buffer with new entries
    const combined = [...this.buffer, ...newEntries];

    // Cap at MAX_BUFFER_SIZE — keep the most recent entries
    if (combined.length > MAX_BUFFER_SIZE) {
      this.buffer = combined.slice(combined.length - MAX_BUFFER_SIZE);
    } else {
      this.buffer = combined;
    }
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
export function initWebVitalsReporter(config?: Partial<WebVitalsReporterConfig>): WebVitalsReporter {
  if (reporterInstance) {
    return reporterInstance;
  }

  const endpoint = config?.endpoint ?? '/api/metrics/web-vitals';

  reporterInstance = new WebVitalsReporter({
    endpoint,
    intervalMs: config?.intervalMs,
    fetchFn: config?.fetchFn,
  });

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

export { WebVitalsReporter };
export type { BufferedMetric };
