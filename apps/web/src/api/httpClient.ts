/**
 * Raw HTTP Client Export (Backward Compatibility)
 *
 * Exports the underlying Axios instance from the API client for components
 * that still use direct `api.get()`, `api.post()` patterns.
 *
 * New code should prefer the typed API client (import { api } from '@/api')
 * or React Query hooks (import { useFindings } from '@/api/hooks/useFindings').
 *
 * Resilience: this raw instance now carries an idempotent, bounded response
 * interceptor that retries transient failures (network errors and 5xx) with
 * exponential backoff (1s, 2s — capped at MAX_RETRY_ATTEMPTS total tries),
 * delegates 401 handling to the client's existing token-refresh flow, and never
 * retries other 4xx responses. Final failures (and the client `onError` hook)
 * are routed through the structured `errorReporter` instead of `console.error`,
 * so they remain visible in production where console output is stripped.
 *
 * @example
 * // Legacy pattern (still supported):
 * import api from '../api/httpClient';
 * const res = await api.get('/endpoint');
 *
 * // Preferred pattern:
 * import { api } from '../api';
 * const findings = await api.findings.list();
 */
import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import { createApiClient, isRetriableError, MAX_RETRY_ATTEMPTS } from './client';
import { errorReporter, type ErrorSeverity } from '../utils/errorReporter';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env = (import.meta as any).env as Record<string, string> | undefined;

/**
 * Resolve the HTTP client base URL from a configured `VITE_API_URL` value.
 *
 * Pure and side-effect free so it can be unit/property tested in isolation.
 * Returns the provided value when it is a non-empty string (after rejecting
 * whitespace-only input); otherwise — when the value is `undefined`, empty, or
 * whitespace-only — falls back to the same-origin default `/api`.
 *
 * @param value - The raw `VITE_API_URL` env value (may be undefined).
 * @returns The configured value when meaningful, else `/api`.
 */
export function resolveBaseUrl(value?: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return '/api';
}

// ─── Retry Constants (mirror client.ts) ─────────────────────────────────────────
// Kept in sync with the typed client's `requestWithRetry`: 1s → 2s → 4s base,
// bounded by the shared MAX_RETRY_ATTEMPTS.
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MULTIPLIER = 2;

/** Axios request config tagged with a retry counter to bound retries and avoid double-retry. */
interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  __retryCount?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff delay for a given zero-based retry index.
 * index 0 → 1000ms, index 1 → 2000ms, index 2 → 4000ms.
 */
function getRetryDelay(retryIndex: number): number {
  return RETRY_BASE_DELAY_MS * Math.pow(RETRY_MULTIPLIER, retryIndex);
}

/**
 * Route a failed raw-axios request through the structured error reporter.
 */
function reportApiError(error: AxiosError, attempts: number): void {
  const status = error.response?.status;
  const url = error.config?.url ?? 'unknown';
  const type: 'timeout' | 'connection' | 'server_error' = !error.response
    ? error.code === 'ECONNABORTED'
      ? 'timeout'
      : 'connection'
    : 'server_error';
  const severity: ErrorSeverity = type === 'server_error' ? 'high' : 'medium';

  errorReporter.report({
    module: 'api',
    message: `[API Error] ${type} ${url} (status: ${status ?? 'none'}, attempts: ${attempts}): ${error.message}`,
    severity,
    type: 'uncaught',
    stack: error.stack,
  });
}

const client = createApiClient({
  baseUrl: resolveBaseUrl(env?.['VITE_API_URL']),
  timeout: 30000,
  onUnauthorized: () => {
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  },
  onError: (error) => {
    const severity: ErrorSeverity = error.type === 'server_error' ? 'high' : 'medium';
    errorReporter.report({
      module: 'api',
      message: `[API Error] ${error.type} ${error.url} (status: ${error.status ?? 'none'}, attempts: ${error.attempts}): ${error.reason}`,
      severity,
      type: 'uncaught',
    });
  },
});

// ─── Bounded Retry Interceptor ──────────────────────────────────────────────────
// Runs after the client's built-in response interceptor (which owns 401 → refresh,
// version-mismatch detection, and envelope unwrapping). This handler only sees
// errors that the refresh flow did not resolve. It retries network errors and 5xx
// responses with exponential backoff up to MAX_RETRY_ATTEMPTS total attempts,
// tracking the count on the request config so the bound is never exceeded
// (idempotent — safe even when the request is re-dispatched). All other errors,
// including non-401 4xx, are rejected without retry. After exhausting retries the
// failure is reported through `errorReporter.report()`.
client.http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const config = error.config as RetryableRequestConfig | undefined;

    // Non-retriable (e.g. 4xx other than the refresh-handled 401) or no config to retry.
    if (!config || !isRetriableError(error)) {
      return Promise.reject(error);
    }

    const previousRetries = config.__retryCount ?? 0;
    // previousRetries counts retries already performed; the initial attempt is implicit.
    // Total attempts = 1 (initial) + previousRetries. Stop once we would exceed the bound.
    if (previousRetries >= MAX_RETRY_ATTEMPTS - 1) {
      reportApiError(error, MAX_RETRY_ATTEMPTS);
      return Promise.reject(error);
    }

    config.__retryCount = previousRetries + 1;
    await sleep(getRetryDelay(previousRetries));
    return client.http(config);
  }
);

/**
 * The raw Axios instance with all interceptors configured.
 * Drop-in replacement for the old services/api.ts default export.
 */
const api = client.http;

export default api;
