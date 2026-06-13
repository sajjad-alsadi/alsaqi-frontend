/**
 * Error Reporter Service
 *
 * Sends structured error reports to `/api/system-errors` with retry logic.
 * - Immediately attempts to POST the report (within 5 seconds of occurrence)
 * - On failure: retains in memory and retries up to 3 times with exponential backoff (1s, 2s, 4s)
 * - Sends session credentials and the CSRF token so the authenticated endpoint accepts the report
 * - Never throws or surfaces reporting errors to the user; exhausted deliveries are routed to a
 *   diagnostic channel instead of being silently dropped
 *
 * Requirements: 1.2, 1.3, 20.1, 20.2, 20.3
 */

import { getAppVersion, getErrorReportUrl } from './env';

/**
 * Read the CSRF token from the `csrf-token` cookie. Mirrors the cookie/header
 * convention used by the API client (`x-csrf-token` header, `csrf-token` cookie)
 * so the error-reporting endpoint can validate the request just like any other
 * authenticated mutation (Req 20.2).
 */
function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.split('; ').find((row) => row.startsWith('csrf-token='));
  return match?.split('=')[1];
}

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
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    // Include the CSRF token where available so the authenticated endpoint
    // accepts the report (Req 20.2). The header/cookie names match the API client.
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      // Send session cookies so the report is delivered as an authenticated
      // request rather than anonymously (Req 20.1).
      credentials: 'include',
      headers,
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
          } else {
            // Retries exhausted — surface the delivery failure to a diagnostic
            // channel rather than silently dropping it (Req 20.3). `console` is
            // used directly so this does not re-enter the reporting endpoint that
            // just failed.
            this.surfaceDeliveryFailure(item.payload, newAttempts);
          }
        });
    }

    this.queue = remaining;

    if (this.queue.length === 0) {
      this.stopRetryTimer();
    }
  }

  /**
   * Surface a permanently undeliverable error report to a diagnostic channel
   * (Req 20.3). Writing to `console.error` keeps the failure observable for
   * developers/diagnostics without re-posting to the reporting endpoint that
   * just exhausted its retries (which would risk a delivery loop). Wrapped in a
   * guard so reporting can never throw.
   */
  private surfaceDeliveryFailure(payload: ErrorReport, attempts: number): void {
    try {
      console.error(
        `[errorReporter] Failed to deliver error report after ${attempts} attempts:`,
        {
          module: payload.module,
          message: payload.message,
          severity: payload.severity,
          type: payload.type,
          timestamp: payload.timestamp,
        }
      );
    } catch {
      // Diagnostics must never throw or surface to the user.
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
