/**
 * Error Reporter Service
 *
 * Sends structured error reports to `/api/system-errors` with retry logic.
 * - Immediately attempts to POST the report (within 5 seconds of occurrence)
 * - On failure: retains in memory and retries up to 3 times with exponential backoff (1s, 2s, 4s)
 * - Never throws or surfaces reporting errors to the user
 *
 * Requirements: 1.2, 1.3
 */

import { getAppVersion, getErrorReportUrl } from './env';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorReport {
  module: string;
  message: string;
  severity: ErrorSeverity;
  stack?: string | undefined;
  componentStack?: string | undefined;
  appVersion: string;
  sessionId: string;
  userAgent: string;
  routePath: string;
  timestamp: string;
  type: 'boundary' | 'uncaught' | 'unhandled-rejection';
}

interface QueuedReport {
  payload: ErrorReport;
  attempts: number;
  nextRetryAt: number;
}

/** Base delay for exponential backoff in milliseconds */
const BASE_DELAY_MS = 1000;

/** Maximum retry attempts per report */
const MAX_RETRIES = 3;

/** Retry interval for processing the queue (ms) */
const QUEUE_PROCESS_INTERVAL_MS = 1000;

class ErrorReporter {
  private endpoint: string;
  private sessionId: string;
  private queue: QueuedReport[] = [];
  private retryTimerId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.endpoint = getErrorReportUrl();
    this.sessionId = this.getOrCreateSessionId();
  }

  /**
   * Report an error. Accepts a partial payload — missing fields are filled with defaults.
   * The report is sent immediately; on failure it is queued for retry.
   */
  report(error: Partial<ErrorReport>): void {
    const payload: ErrorReport = {
      module: error.module || 'unknown',
      message: error.message || 'Unknown error',
      severity: error.severity || 'medium',
      stack: error.stack ?? '',
      componentStack: error.componentStack ?? '',
      appVersion: getAppVersion(),
      sessionId: this.sessionId,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      routePath: typeof window !== 'undefined' ? window.location.pathname : '/',
      timestamp: error.timestamp || new Date().toISOString(),
      type: error.type || 'uncaught',
    };

    // Immediate first attempt — fire and forget, queue on failure
    this.sendReport(payload).catch(() => {
      this.enqueue(payload);
    });
  }

  /**
   * Returns a shallow copy of the current retry queue (for testing/debugging).
   */
  getQueueSnapshot(): ReadonlyArray<QueuedReport> {
    return [...this.queue];
  }

  /**
   * Flush: attempt to send all queued reports immediately (useful for page unload).
   */
  flush(): void {
    this.processQueue();
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  private async sendReport(payload: ErrorReport): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Report failed with status ${response.status}`);
    }
  }

  private enqueue(payload: ErrorReport): void {
    const queuedReport: QueuedReport = {
      payload,
      attempts: 1, // First attempt already happened
      nextRetryAt: Date.now() + BASE_DELAY_MS,
    };

    this.queue.push(queuedReport);
    this.startRetryTimer();
  }

  private startRetryTimer(): void {
    if (this.retryTimerId !== null) return;

    this.retryTimerId = setInterval(() => {
      this.processQueue();
    }, QUEUE_PROCESS_INTERVAL_MS);
  }

  private stopRetryTimer(): void {
    if (this.retryTimerId !== null) {
      clearInterval(this.retryTimerId);
      this.retryTimerId = null;
    }
  }

  private processQueue(): void {
    if (this.queue.length === 0) {
      this.stopRetryTimer();
      return;
    }

    const now = Date.now();
    const remaining: QueuedReport[] = [];

    for (const item of this.queue) {
      if (item.nextRetryAt > now) {
        // Not ready for retry yet
        remaining.push(item);
        continue;
      }

      // Attempt retry
      this.sendReport(item.payload)
        .then(() => {
          // Successfully sent — remove from queue (already not in remaining)
        })
        .catch(() => {
          const newAttempts = item.attempts + 1;
          if (newAttempts <= MAX_RETRIES) {
            // Schedule next retry with exponential backoff: 1s, 2s, 4s
            const delay = BASE_DELAY_MS * Math.pow(2, newAttempts - 1);
            this.queue.push({
              payload: item.payload,
              attempts: newAttempts,
              nextRetryAt: Date.now() + delay,
            });
            this.startRetryTimer();
          }
          // If max retries exhausted, silently drop the report
        });
    }

    this.queue = remaining;

    if (this.queue.length === 0) {
      this.stopRetryTimer();
    }
  }

  private getOrCreateSessionId(): string {
    const key = 'alsaqi_error_session';
    try {
      let id = sessionStorage.getItem(key);
      if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(key, id);
      }
      return id;
    } catch {
      // sessionStorage may not be available (e.g., SSR or private browsing)
      return crypto.randomUUID();
    }
  }
}

export const errorReporter = new ErrorReporter();
