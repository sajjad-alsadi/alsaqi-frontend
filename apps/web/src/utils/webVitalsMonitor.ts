/**
 * Web Vitals Monitor Utility (Web_Vitals_Monitor)
 *
 * Collects frontend performance metrics using the raw Performance Observer API.
 * No external dependencies (web-vitals npm package) — suitable for air-gapped environments.
 *
 * Metrics collected: LCP, FID, CLS, FCP, TTFB
 * Each metric is classified as 'good', 'needs-improvement', or 'poor' per standard thresholds.
 * Includes current route path and ISO 8601 UTC timestamp with each metric.
 *
 * Requirements: 7.1, 7.2, 7.3
 */

export type MetricName = 'LCP' | 'FID' | 'CLS' | 'FCP' | 'TTFB';
export type MetricRating = 'good' | 'needs-improvement' | 'poor';

export interface WebVitalMetric {
  name: MetricName;
  value: number;
  rating: MetricRating;
  route: string;
  timestamp: string;
}

export type MetricCallback = (metric: WebVitalMetric) => void;

/**
 * Thresholds for Web Vitals classification.
 * Values at or below `good` → 'good'
 * Values above `good` and at or below `poor` → 'needs-improvement'
 * Values above `poor` → 'poor'
 */
const THRESHOLDS: Record<MetricName, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
};

/**
 * Classify a metric value against its thresholds.
 */
export function classifyMetric(name: MetricName, value: number): MetricRating {
  const threshold = THRESHOLDS[name];
  if (value <= threshold.good) return 'good';
  if (value > threshold.poor) return 'poor';
  return 'needs-improvement';
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
 * Check if PerformanceObserver is supported in the current browser.
 */
function isPerformanceObserverSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'PerformanceObserver' in window &&
    typeof PerformanceObserver === 'function'
  );
}

/**
 * Check if a specific entry type is supported by PerformanceObserver.
 */
function isEntryTypeSupported(entryType: string): boolean {
  try {
    // Use supportedEntryTypes if available (modern browsers)
    if (
      typeof PerformanceObserver !== 'undefined' &&
      'supportedEntryTypes' in PerformanceObserver
    ) {
      const supported = PerformanceObserver.supportedEntryTypes as readonly string[];
      return supported.includes(entryType);
    }
    return true; // Assume supported if we can't check
  } catch {
    return false;
  }
}

/**
 * WebVitalsMonitor — singleton class that observes performance metrics.
 *
 * Usage:
 *   import { webVitalsMonitor } from '@/utils/webVitalsMonitor';
 *   webVitalsMonitor.init();
 *   webVitalsMonitor.onMetric((metric) => { ... });
 *   const all = webVitalsMonitor.getMetrics();
 */
class WebVitalsMonitor {
  private metrics: WebVitalMetric[] = [];
  private subscribers: MetricCallback[] = [];
  private observers: PerformanceObserver[] = [];
  private initialized = false;
  private clsValue = 0;
  private clsReported = false;

  /**
   * Initialize all Performance Observers.
   * Safe to call multiple times — only initializes once.
   * Gracefully handles browsers that don't support PerformanceObserver.
   */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    if (!isPerformanceObserverSupported()) {
      return;
    }

    this.observeLCP();
    this.observeFID();
    this.observeCLS();
    this.observeFCP();
    this.observeTTFB();
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
   * Get all collected metrics so far.
   */
  getMetrics(): ReadonlyArray<WebVitalMetric> {
    return [...this.metrics];
  }

  /**
   * Disconnect all observers and clear state.
   * Useful for cleanup in tests or when unmounting the app.
   */
  destroy(): void {
    for (const observer of this.observers) {
      try {
        observer.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }
    this.observers = [];
    this.metrics = [];
    this.subscribers = [];
    this.initialized = false;
    this.clsValue = 0;
    this.clsReported = false;
  }

  // --- Private methods ---

  private emit(metric: WebVitalMetric): void {
    this.metrics.push(metric);
    for (const cb of this.subscribers) {
      try {
        cb(metric);
      } catch {
        // Never let a subscriber error crash the monitor
      }
    }
  }

  private createMetric(name: MetricName, value: number): WebVitalMetric {
    return {
      name,
      value,
      rating: classifyMetric(name, value),
      route: getCurrentRoute(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Observe Largest Contentful Paint (LCP).
   * Reports the last LCP entry before the page becomes hidden.
   */
  private observeLCP(): void {
    if (!isEntryTypeSupported('largest-contentful-paint')) return;

    let lastLCPValue: number | null = null;

    try {
      const observer = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          lastLCPValue = lastEntry.startTime;
        }
      });

      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      this.observers.push(observer);

      // LCP is finalized when the page becomes hidden
      const reportLCP = (): void => {
        if (lastLCPValue !== null) {
          this.emit(this.createMetric('LCP', lastLCPValue));
          lastLCPValue = null;
          observer.disconnect();
        }
      };

      // Use visibilitychange to capture the final LCP value
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          reportLCP();
        }
      }, { once: true });

      // Also report on pagehide for Safari
      window.addEventListener('pagehide', reportLCP, { once: true });
    } catch {
      // Observer creation failed — browser doesn't support this entry type
    }
  }

  /**
   * Observe First Input Delay (FID).
   * Reports the delay of the first user interaction.
   */
  private observeFID(): void {
    if (!isEntryTypeSupported('first-input')) return;

    try {
      const observer = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const firstEntry = entries[0] as PerformanceEventTiming | undefined;
        if (firstEntry) {
          const fid = firstEntry.processingStart - firstEntry.startTime;
          this.emit(this.createMetric('FID', fid));
          observer.disconnect();
        }
      });

      observer.observe({ type: 'first-input', buffered: true });
      this.observers.push(observer);
    } catch {
      // Observer creation failed
    }
  }

  /**
   * Observe Cumulative Layout Shift (CLS).
   * Accumulates layout shift values where hadRecentInput is false.
   * Reports the final CLS value when the page becomes hidden.
   */
  private observeCLS(): void {
    if (!isEntryTypeSupported('layout-shift')) return;

    try {
      const observer = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          // Only count layout shifts without recent user input
          const layoutShiftEntry = entry as PerformanceEntry & {
            hadRecentInput?: boolean;
            value?: number;
          };
          if (!layoutShiftEntry.hadRecentInput && layoutShiftEntry.value !== undefined) {
            this.clsValue += layoutShiftEntry.value;
          }
        }
      });

      observer.observe({ type: 'layout-shift', buffered: true });
      this.observers.push(observer);

      // CLS is finalized when the page becomes hidden
      const reportCLS = (): void => {
        if (!this.clsReported) {
          this.clsReported = true;
          this.emit(this.createMetric('CLS', this.clsValue));
          observer.disconnect();
        }
      };

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          reportCLS();
        }
      }, { once: true });

      window.addEventListener('pagehide', reportCLS, { once: true });
    } catch {
      // Observer creation failed
    }
  }

  /**
   * Observe First Contentful Paint (FCP).
   * Filters paint entries for 'first-contentful-paint'.
   */
  private observeFCP(): void {
    if (!isEntryTypeSupported('paint')) return;

    try {
      const observer = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.emit(this.createMetric('FCP', entry.startTime));
            observer.disconnect();
            break;
          }
        }
      });

      observer.observe({ type: 'paint', buffered: true });
      this.observers.push(observer);
    } catch {
      // Observer creation failed
    }
  }

  /**
   * Observe Time to First Byte (TTFB).
   * Uses navigation timing entry's responseStart value.
   */
  private observeTTFB(): void {
    if (!isEntryTypeSupported('navigation')) return;

    try {
      const observer = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const navEntry = entries[0] as PerformanceNavigationTiming | undefined;
        if (navEntry && navEntry.responseStart > 0) {
          this.emit(this.createMetric('TTFB', navEntry.responseStart));
          observer.disconnect();
        }
      });

      observer.observe({ type: 'navigation', buffered: true });
      this.observers.push(observer);
    } catch {
      // Observer creation failed
    }
  }
}

/** Singleton instance of the Web Vitals Monitor */
export const webVitalsMonitor = new WebVitalsMonitor();
export default webVitalsMonitor;
