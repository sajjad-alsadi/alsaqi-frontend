/**
 * Web Vitals Monitor Utility (Performance_Monitor)
 *
 * Collects frontend performance metrics using the `web-vitals` library.
 * Metrics collected: LCP, FID, CLS, FCP, TTFB
 * Each metric is classified as 'good', 'needs-improvement', or 'poor' per standard thresholds.
 *
 * Requirements: 6.1, 6.2
 */

import { onLCP, onFID, onCLS, onFCP, onTTFB, type Metric } from 'web-vitals';

export type MetricName = 'LCP' | 'FID' | 'CLS' | 'FCP' | 'TTFB';
export type MetricRating = 'good' | 'needs-improvement' | 'poor';

export interface MetricReport {
  name: string;
  value: number;
  rating: MetricRating;
  delta: number;
  id: string;
  navigationType: string;
}

/**
 * Legacy interface preserved for backward compatibility with webVitalsReporter.
 */
export interface WebVitalMetric {
  name: MetricName;
  value: number;
  rating: MetricRating;
  route: string;
  timestamp: string;
  delta: number;
  id: string;
  navigationType: string;
}

export type MetricCallback = (metric: WebVitalMetric) => void;

/**
 * Thresholds for Web Vitals classification.
 * Each metric has a [good, poor] boundary pair:
 * - value <= good → 'good'
 * - value > good && value <= poor → 'needs-improvement'
 * - value > poor → 'poor'
 */
export const THRESHOLDS: Record<string, [number, number]> = {
  LCP: [2500, 4000],
  FID: [100, 300],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

/**
 * Classify a metric value against its thresholds.
 * Exported separately for isolated testing (Property 14).
 */
export function classifyMetric(name: string, value: number): MetricRating {
  // Use a safe own-property lookup: indexing a plain object can resolve
  // inherited keys (e.g. 'constructor', 'toString') to non-threshold values,
  // which would otherwise crash the destructure below.
  const thresholds = Object.prototype.hasOwnProperty.call(THRESHOLDS, name)
    ? THRESHOLDS[name]
    : undefined;
  if (!thresholds) return 'good';
  const [good, poor] = thresholds;
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

/**
 * Get the current route path from the browser's location.
 * Falls back to '/' if location is unavailable.
 */
function getCurrentRoute(): string {
  try {
    return window.location.pathname + window.location.hash;
  } catch {
    return '/';
  }
}

/**
 * WebVitalsMonitor — singleton class that collects Web Vitals using the `web-vitals` library.
 *
 * Usage:
 *   import { webVitalsMonitor } from '@/utils/webVitalsMonitor';
 *   webVitalsMonitor.init();
 *   // Later, flush buffered metrics:
 *   const reports = webVitalsMonitor.flush();
 */
class WebVitalsMonitor {
  private buffer: MetricReport[] = [];
  private metrics: WebVitalMetric[] = [];
  private subscribers: MetricCallback[] = [];
  private initialized = false;

  /**
   * Initialize Web Vitals collection using the `web-vitals` library.
   * Safe to call multiple times — only initializes once.
   */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    const handler = (metric: Metric) => {
      const report: MetricReport = {
        name: metric.name,
        value: metric.value,
        rating: classifyMetric(metric.name, metric.value),
        delta: metric.delta,
        id: metric.id,
        navigationType: metric.navigationType,
      };

      this.buffer.push(report);

      // Also emit as legacy WebVitalMetric for backward compatibility
      const legacyMetric: WebVitalMetric = {
        name: metric.name as MetricName,
        value: metric.value,
        rating: classifyMetric(metric.name, metric.value),
        route: getCurrentRoute(),
        timestamp: new Date().toISOString(),
        delta: metric.delta,
        id: metric.id,
        navigationType: metric.navigationType,
      };

      this.metrics.push(legacyMetric);
      this.emitToSubscribers(legacyMetric);
    };

    onLCP(handler);
    onFID(handler);
    onCLS(handler);
    onFCP(handler);
    onTTFB(handler);
  }

  /**
   * Flush the metric buffer: returns all buffered MetricReports and clears the buffer.
   */
  flush(): MetricReport[] {
    const reports = [...this.buffer];
    this.buffer = [];
    return reports;
  }

  /**
   * Subscribe to metric events. The callback is invoked each time a metric is collected.
   * Returns an unsubscribe function.
   */
  onMetric(callback: MetricCallback): () => void {
    this.subscribers.push(callback);
    return () => {
      const idx = this.subscribers.indexOf(callback);
      if (idx !== -1) {
        this.subscribers.splice(idx, 1);
      }
    };
  }

  /**
   * Get all collected metrics so far (legacy interface).
   */
  getMetrics(): ReadonlyArray<WebVitalMetric> {
    return [...this.metrics];
  }

  /**
   * Disconnect all observers and clear state.
   * Useful for cleanup in tests or when unmounting the app.
   */
  destroy(): void {
    this.buffer = [];
    this.metrics = [];
    this.subscribers = [];
    this.initialized = false;
  }

  // --- Private methods ---

  private emitToSubscribers(metric: WebVitalMetric): void {
    for (const cb of this.subscribers) {
      try {
        cb(metric);
      } catch {
        // Never let a subscriber error crash the monitor
      }
    }
  }
}

/** Singleton instance of the Web Vitals Monitor */
export const webVitalsMonitor = new WebVitalsMonitor();
export default webVitalsMonitor;
