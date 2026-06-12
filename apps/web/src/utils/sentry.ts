import * as Sentry from '@sentry/react';

/**
 * Initialize the Sentry (`@sentry/react`) error monitoring SDK.
 *
 * Guardrails (Requirement 7.1, 7.2):
 * - Only active in **production** builds (`import.meta.env.PROD`).
 * - Only active when a DSN is configured via `VITE_SENTRY_DSN`. The DSN is
 *   intentionally NOT a required build variable (see `plugins/envValidator.ts`),
 *   so a missing/empty DSN simply disables Sentry rather than failing the build.
 * - The whole call is wrapped in try/catch so a misconfigured or malformed DSN
 *   can never throw during application startup.
 *
 * Unhandled errors and unhandled promise rejections are captured automatically
 * by Sentry's default global handlers integration. This function is invoked
 * *after* `registerGlobalErrorHandlers()` in `main.tsx`, so Sentry chains the
 * existing `errorReporter` window.onerror handler rather than clobbering it —
 * keeping the internal `/api/system-errors` reporting path intact (Requirement 7.4).
 *
 * @returns `true` when Sentry was initialized, `false` when it was skipped.
 */
export function initSentry(): boolean {
  const dsn = import.meta.env['VITE_SENTRY_DSN'] as string | undefined;

  // Production-only AND DSN-gated. A missing DSN must never break startup.
  if (!import.meta.env.PROD || !dsn) {
    return false;
  }

  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      // Release tracking aligns errors with the deployed build version.
      release: (import.meta.env['VITE_APP_VERSION'] as string | undefined) || undefined,
      // Error monitoring only — performance tracing disabled by default.
      tracesSampleRate: 0,
    });
    return true;
  } catch {
    // A misconfigured/missing DSN (or any init failure) must never break the
    // application. Sentry simply stays disabled in that case.
    return false;
  }
}
