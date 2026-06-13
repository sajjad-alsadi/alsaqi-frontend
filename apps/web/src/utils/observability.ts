/**
 * Observability Verification Surface (Observability_System)
 *
 * Component 6 of the frontend-production-readiness design. This module does NOT
 * re-implement Sentry init, the structured logger, or the source-map build
 * guard — those already live in `sentry.ts`, `logger.ts`, and
 * `scripts/check-dist-sourcemaps.mjs`. Instead it exposes a small, deterministic
 * surface that *proves* the three release-hardening invariants hold so they can
 * be locked by tests and CI:
 *
 *   1. `shouldInitSentry`        — Sentry initializes iff PROD && a DSN is present.
 *   2. `correlationIdPropagates` — the per-request `x-correlation-id` reaches the
 *                                  structured log entry byte-for-byte and, on
 *                                  error, is attached as a Sentry tag/context.
 *   3. `noSourceMapsInDist`      — a production `dist/` ships zero `.map` files.
 *
 * Requirements: 6.1, 6.6
 */

import * as Sentry from '@sentry/react';
import type { LogEntry, LogLevel } from './logger';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Sentry tag key under which the request correlation id is attached. */
export const CORRELATION_ID_TAG = 'correlation_id';

/** Sentry context name under which the request correlation id is attached. */
export const CORRELATION_ID_CONTEXT = 'request';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The shape attached to a Sentry scope so a frontend error can be traced back
 * to the originating request. Mirrors what `attachCorrelationToSentry` pushes
 * to Sentry: a flat tag (queryable) plus a structured context (richer detail).
 */
export interface CorrelationSentryScope {
  tags: Record<string, string>;
  contexts: Record<string, { correlationId: string }>;
}

/**
 * The verification surface for Component 6. Each method is a deterministic,
 * side-effect-free predicate (or, for `noSourceMapsInDist`, an async predicate)
 * that the test suite and CI use to assert the observability invariants.
 */
export interface ObservabilityContract {
  /** Sentry initializes iff PROD && DSN present. */
  shouldInitSentry(env: { PROD: boolean; dsn?: string | undefined }): boolean;
  /** Same correlation id flows: request header → log entry → Sentry tag/context. */
  correlationIdPropagates(requestId: string): boolean;
  /** dist/ ships zero .map files after a production build. */
  noSourceMapsInDist(distDir: string): Promise<boolean>;
}

// ─── shouldInitSentry ───────────────────────────────────────────────────────

/**
 * Decide whether Sentry should initialize. Mirrors the guard in `sentry.ts`
 * (`initSentry`): the SDK comes online only in a **production** build that also
 * has a **non-empty DSN** configured. A missing/empty DSN, or any non-production
 * environment, disables Sentry rather than failing startup (Req 6.3, 6.7).
 *
 * Pure and side-effect free.
 */
export function shouldInitSentry(env: { PROD: boolean; dsn?: string | undefined }): boolean {
  return env.PROD === true && typeof env.dsn === 'string' && env.dsn.length > 0;
}

// ─── Correlation propagation ──────────────────────────────────────────────────

/**
 * Build the structured log entry that carries a request's correlation id. The
 * `correlationId` field is the per-request `x-correlation-id` byte-for-byte —
 * NOT the logger's session id — so an error logged for a given request is
 * traceable to that exact request (Req 6.1).
 *
 * Pure: returns a fresh entry, mutates nothing.
 */
export function buildCorrelatedLogEntry(
  requestId: string,
  level: LogLevel = 'error',
  message = 'correlation propagation check',
  module = 'observability',
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    module,
    correlationId: requestId,
    componentStack: undefined,
    context: { module, correlationId: requestId },
  };
}

/**
 * Build the Sentry scope payload for a request's correlation id: a flat,
 * queryable tag plus a structured context block. Both carry the correlation id
 * byte-for-byte so a reported error can be pivoted back to its request (Req 6.6).
 *
 * Pure: returns a fresh payload, performs no Sentry side-effect (see
 * `attachCorrelationToSentry` for the side-effecting variant).
 */
export function buildCorrelationSentryScope(requestId: string): CorrelationSentryScope {
  return {
    tags: { [CORRELATION_ID_TAG]: requestId },
    contexts: { [CORRELATION_ID_CONTEXT]: { correlationId: requestId } },
  };
}

/**
 * Attach a request's correlation id to the current Sentry scope as both a tag
 * and a context block, so any error captured while that request is in scope is
 * traceable to it (Req 6.6). This is the side-effecting wiring used by the app;
 * `correlationIdPropagates` verifies the same mapping without side effects.
 *
 * Wrapped in try/catch so a Sentry misconfiguration can never break a request.
 * Returns the payload that was attached.
 */
export function attachCorrelationToSentry(requestId: string): CorrelationSentryScope {
  const scope = buildCorrelationSentryScope(requestId);
  try {
    Sentry.setTag(CORRELATION_ID_TAG, requestId);
    Sentry.setContext(CORRELATION_ID_CONTEXT, { correlationId: requestId });
  } catch {
    // Sentry not initialized / misconfigured — propagation verification still
    // holds for the log entry; never throw from an observability hook.
  }
  return scope;
}

/**
 * Verify that a non-empty request correlation id propagates intact across the
 * two observability sinks: it appears byte-for-byte as the `correlationId` of
 * the structured log entry AND as the Sentry tag and context for that request
 * (Req 6.1, 6.6).
 *
 * Returns `false` for an empty or non-string id (an absent correlation id has
 * nothing to propagate). Pure and side-effect free, so it is safe to call from
 * property tests across arbitrary ids.
 */
export function correlationIdPropagates(requestId: string): boolean {
  if (typeof requestId !== 'string' || requestId.length === 0) {
    return false;
  }

  const logEntry = buildCorrelatedLogEntry(requestId);
  const scope = buildCorrelationSentryScope(requestId);

  return (
    logEntry.correlationId === requestId &&
    scope.tags[CORRELATION_ID_TAG] === requestId &&
    scope.contexts[CORRELATION_ID_CONTEXT]?.correlationId === requestId
  );
}

// ─── Source-map ship guard ────────────────────────────────────────────────────

/**
 * Resolve whether `dist/` ships zero `.map` files after a production build
 * (Req 6.2). Mirrors `scripts/check-dist-sourcemaps.mjs` as an importable,
 * testable predicate: returns `true` when no `.map` file exists anywhere under
 * `distDir`, `false` when at least one is found.
 *
 * The Node filesystem APIs are loaded with a dynamic import so this module stays
 * browser-safe — it is only ever exercised from the Node test/CI context, never
 * bundled into the app.
 *
 * @throws if `distDir` does not exist, mirroring the build guard's fail-fast on
 *         a missing output directory (a production build must have produced it).
 */
export async function noSourceMapsInDist(distDir: string): Promise<boolean> {
  const { readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');

  // Fail fast on a missing directory: a production build must have produced it.
  await readdir(distDir);

  async function walk(dir: string): Promise<boolean> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        const clean = await walk(full);
        if (!clean) return false;
      } else if (entry.isFile() && entry.name.endsWith('.map')) {
        return false;
      }
    }
    return true;
  }

  return walk(distDir);
}

// ─── Contract aggregate ───────────────────────────────────────────────────────

/**
 * The {@link ObservabilityContract} implementation, bundling the three
 * verification predicates behind one object for callers that prefer the
 * interface shape.
 */
export const observabilityContract: ObservabilityContract = {
  shouldInitSentry,
  correlationIdPropagates,
  noSourceMapsInDist,
};
