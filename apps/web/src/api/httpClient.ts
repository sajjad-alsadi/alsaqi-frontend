/**
 * Raw HTTP Client Export (Backward Compatibility)
 *
 * Exports the underlying Axios instance from the API client for components
 * that still use direct `api.get()`, `api.post()` patterns.
 *
 * New code should prefer the typed API client (import { api } from '@/api')
 * or React Query hooks (import { useFindings } from '@/api/hooks/useFindings').
 *
 * Resilience: retries are owned exclusively by the typed client's
 * `requestWithRetry` (a single bounded, idempotency-aware Retry_Layer in
 * `client.ts`). This module no longer installs its own response-interceptor
 * retry loop, so requests are never retried twice. It keeps base-URL
 * resolution, delegates 401 handling to the client's existing token-refresh
 * flow, and routes the client `onError` hook through the structured
 * `errorReporter` instead of `console.error`, so failures remain visible in
 * production where console output is stripped.
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
import { createApiClient } from './client';
import { dispatchUnauthorized } from './navigationEvents';
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

const client = createApiClient({
  baseUrl: resolveBaseUrl(env?.['VITE_API_URL']),
  timeout: 30000,
  onUnauthorized: () => {
    // SPA-internal redirect (Req 23.2): dispatch an in-app navigation event
    // consumed by a top-level listener that calls `navigate('/login')`,
    // instead of reloading the document via `window.location.href`.
    dispatchUnauthorized();
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

/**
 * The raw Axios instance with all interceptors configured.
 *
 * Retries are handled solely by the typed client's `requestWithRetry`; this
 * instance installs no additional retry interceptor.
 *
 * Drop-in replacement for the old services/api.ts default export.
 */
const api = client.http;

export default api;
