/**
 * Structured Logger Utility (Structured_Logger)
 *
 * Provides structured logging with different behavior per environment:
 * - Development: Pretty-prints to console with level, timestamp, module, and context
 * - Production: Suppresses ALL console output; routes errors to `/api/system-errors` via HTTP POST
 *
 * Fields included in every log entry:
 *   level, message, timestamp (ISO 8601), module, correlationId, componentStack (when available)
 *
 * Requirements: 6.3, 6.4, 1.2
 */

import { isAuthenticated } from './authGate';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  module: string;
  correlationId: string;
  componentStack?: string | undefined;
  context?: Record<string, unknown> | undefined;
  /**
   * The route the entry was produced on, derived from `location.pathname` only.
   * The query string is intentionally excluded so query-string tokens are never
   * forwarded to the Backend (Req 10.2, 10.3). Present only on transmitted entries.
   */
  routePath?: string | undefined;
}

/**
 * Allowlist of caller-supplied `context` keys that may be forwarded to the
 * Backend (Req 10.1, 10.4). Only these keys survive redaction; every other key
 * is excluded before transmission so tokens and unvetted context are never
 * leaked. Keys are limited to safe, structural diagnostic fields — identifiers,
 * routing/structure hints, and standard error metadata — and deliberately omit
 * free-form payloads (`data`, `payload`, `body`), credentials (`token`,
 * `tokenId`, `password`), and raw network identifiers (`ip`, `username`).
 */
export const LOG_CONTEXT_ALLOWLIST: readonly string[] = [
  'module',
  'componentStack',
  'correlationId',
  'route',
  'routePath',
  'action',
  'component',
  'feature',
  'status',
  'statusCode',
  'errorCode',
  'code',
  'name',
  'type',
  'severity',
  'attempts',
  'count',
  'retries',
  'duration',
  'userId',
  'message',
  'filename',
  'lineno',
  'colno',
  'stack',
  'reason',
];

const ALLOWLIST_SET = new Set<string>(LOG_CONTEXT_ALLOWLIST);

/**
 * Apply the allowlist policy to a caller-supplied context object before it is
 * forwarded to the Backend (Req 10.1, 10.4). Returns a new object containing
 * only allowlisted keys; non-allowlisted keys are excluded entirely so their
 * values are never transmitted. Returns `undefined` when given no context so
 * the forwarded entry omits the field.
 */
export function redactContext(
  context: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const redacted: Record<string, unknown> = {};
  for (const key of Object.keys(context)) {
    if (ALLOWLIST_SET.has(key)) {
      redacted[key] = context[key];
    }
  }
  return redacted;
}

/**
 * Resolve the current route path with the query string stripped (Req 10.2,
 * 10.3). Uses `location.pathname` only so query-string tokens in
 * `window.location.href` are never forwarded. Returns `undefined` when the
 * location is unavailable (e.g. SSR).
 */
function getRoutePath(): string | undefined {
  try {
    if (typeof window !== 'undefined' && window.location) {
      return window.location.pathname;
    }
  } catch {
    // location unavailable — omit the route path rather than throwing.
  }
  return undefined;
}

/**
 * Produce a transmission-safe copy of a structured entry (Req 10.1–10.4):
 * caller-supplied context is reduced to the allowlist, and the route path is
 * attached as `location.pathname` only (no query string). The original entry
 * (used for local dev console output) is left untouched.
 */
export function toTransmissionEntry(entry: LogEntry): LogEntry {
  const routePath = getRoutePath();
  return {
    ...entry,
    context: redactContext(entry.context),
    ...(routePath !== undefined ? { routePath } : {}),
  };
}

/**
 * Configuration for the log aggregation forwarding hook (Req 18.1, 18.3).
 *
 * - `destination`: the aggregation endpoint structured entries are forwarded to in
 *   production. When unset/unavailable, `/api/system-errors` is used as the fallback.
 * - `forwardWarn`: when `true`, `warn`-level entries are forwarded in addition to
 *   `error`-level entries.
 */
export interface LogForwardingConfig {
  destination?: string | undefined;
  forwardWarn: boolean;
}

// Use bracket notation per noPropertyAccessFromIndexSignature
const MODE = import.meta.env['MODE'] as string | undefined;
const isProduction = MODE === 'production';

/** Generate a session-scoped correlation ID (persists across page navigations within the same session) */
function getCorrelationId(): string {
  const key = 'alsaqi_log_correlation_id';
  let id: string | null = null;
  try {
    id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
  } catch {
    // sessionStorage unavailable (SSR, privacy mode) — generate ephemeral ID
    id = crypto.randomUUID();
  }
  return id;
}

const correlationId = getCorrelationId();

/** Console color codes for development output */
const LEVEL_STYLES: Record<LogLevel, string> = {
  debug: 'color: #6b7280; font-weight: normal;', // gray
  info: 'color: #2563eb; font-weight: bold;',    // blue
  warn: 'color: #d97706; font-weight: bold;',    // amber
  error: 'color: #dc2626; font-weight: bold;',   // red
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

/** The fallback delivery path retained for backward compatibility (Req 18.4). */
const FALLBACK_DESTINATION = '/api/system-errors';

/** Mutable forwarding configuration; defaults to fallback-only delivery. */
let forwardingConfig: LogForwardingConfig = { forwardWarn: false };

/**
 * Configure the log aggregation forwarding hook (Req 18.1).
 *
 * Merges the provided partial configuration over the current one so callers can
 * set the destination and warn-forwarding independently. Safe to call at startup
 * (e.g. from `main.tsx`) once the aggregation destination is known.
 */
export function configureLogForwarding(config: Partial<LogForwardingConfig>): void {
  forwardingConfig = {
    destination: config.destination ?? forwardingConfig.destination,
    forwardWarn: config.forwardWarn ?? forwardingConfig.forwardWarn,
  };
}

/** Read-only view of the current forwarding configuration (useful for tests/diagnostics). */
export function getLogForwardingConfig(): Readonly<LogForwardingConfig> {
  return forwardingConfig;
}

/**
 * Pure routing decision (Property 8 — routes by level and warn-configuration).
 *
 * An entry is forwarded to the aggregation pipeline if and only if its level is
 * `error`, or its level is `warn` and `forwardWarn` is enabled. Entries of any
 * other level are never forwarded.
 *
 * This function is intentionally side-effect free so it can be property-tested
 * across all levels and `forwardWarn` configurations.
 */
export function shouldForward(level: LogLevel, forwardWarn: boolean): boolean {
  return level === 'error' || (level === 'warn' && forwardWarn);
}

/**
 * POST a structured entry to the given URL. Resolves on a 2xx response and
 * rejects otherwise so the caller can apply the fallback path.
 */
function postEntry(url: string, entry: LogEntry): Promise<void> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).then((res) => {
    if (!res.ok) {
      throw new Error(`Log forwarding failed with status ${res.status}`);
    }
  });
}

/**
 * Forward a structured entry to the configured aggregation destination, falling
 * back to `/api/system-errors` when the destination is unset or unavailable
 * (Req 18.2, 18.4). Fire-and-forget — never throws or surfaces errors.
 *
 * Gated by authentication: entries are silently dropped when the user has not
 * yet signed in, preventing unauthenticated POST requests to the backend.
 */
function forwardToPipeline(entry: LogEntry): void {
  // Do not transmit log entries when the user is not authenticated.
  if (!isAuthenticated()) return;

  const { destination } = forwardingConfig;
  // Redact caller-supplied context to the allowlist and strip the query string
  // from the forwarded location before anything leaves the client (Req 10.1–10.4).
  const safeEntry = toTransmissionEntry(entry);
  try {
    if (destination && destination !== FALLBACK_DESTINATION) {
      // Forward to the configured destination; on failure, retain the
      // `/api/system-errors` delivery path as the fallback.
      postEntry(destination, safeEntry).catch(() => {
        postEntry(FALLBACK_DESTINATION, safeEntry).catch(() => {
          // Fallback also failed — silently ignore (fire-and-forget).
        });
      });
    } else {
      // Destination unavailable/unset — use the fallback path directly.
      postEntry(FALLBACK_DESTINATION, safeEntry).catch(() => {
        // Silently ignore — errorReporter handles retries separately.
      });
    }
  } catch {
    // Guard against synchronous failures (e.g., during teardown).
  }
}

/**
 * Pretty-print a log entry to the console in development mode.
 */
function devOutput(entry: LogEntry, ...extra: unknown[]): void {
  const label = LEVEL_LABELS[entry.level];
  const style = LEVEL_STYLES[entry.level];
  const prefix = `%c[${label}]%c ${entry.timestamp} [${entry.module}]`;

  const consoleFn =
    entry.level === 'error'
      ? console.error
      : entry.level === 'warn'
        ? console.warn
        : entry.level === 'debug'
          ? console.debug
          : console.info;

  const parts: unknown[] = [prefix, style, 'color: inherit;', entry.message];

  if (entry.context && Object.keys(entry.context).length > 0) {
    parts.push(entry.context);
  }
  if (extra.length > 0) {
    parts.push(...extra);
  }
  if (entry.componentStack) {
    parts.push('\n' + entry.componentStack);
  }

  consoleFn(...parts);
}

/**
 * Build a structured log entry from the provided arguments.
 */
function buildEntry(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    module: context?.['module'] as string ?? 'app',
    correlationId,
    componentStack: context?.['componentStack'] as string | undefined,
    context,
  };
}

/**
 * Normalize the variadic args into a context object and extra values.
 * This ensures backward compatibility with the old API: `logger.error('msg', err)`
 * while also supporting the new structured API: `logger.error('msg', { module: '...' })`
 */
function parseArgs(args: unknown[]): { context: Record<string, unknown>; extra: unknown[] } {
  if (args.length === 0) {
    return { context: {}, extra: [] };
  }

  const first = args[0];

  // If first arg is a plain object (not null, not an Error, not an array), treat as context
  if (
    first !== null &&
    first !== undefined &&
    typeof first === 'object' &&
    !Array.isArray(first) &&
    !(first instanceof Error)
  ) {
    return { context: first as Record<string, unknown>, extra: args.slice(1) };
  }

  // Otherwise treat all args as extra (backward compat: logger.error('msg', err))
  return { context: {}, extra: args };
}

/**
 * Structured_Logger — the main logger class.
 *
 * Supports two calling conventions:
 *   1. Structured: logger.error('message', { module: 'AuditPlan', userId: 123 })
 *   2. Legacy:     logger.error('message', errorObj)  — backward compatible
 *
 * Usage:
 *   import logger from '@/utils/logger';
 *   logger.error('Something failed', { module: 'AuditPlan', userId: 123 });
 *   logger.info('Data loaded', { module: 'Dashboard' });
 */
class StructuredLogger {
  /**
   * Log a debug-level message.
   * In production: suppressed entirely.
   * In development: outputs to console.debug with structured formatting.
   */
  debug(message: string, ...args: unknown[]): void {
    if (isProduction) return;
    const { context, extra } = parseArgs(args);
    const entry = buildEntry('debug', message, context);
    devOutput(entry, ...extra);
  }

  /**
   * Log an info-level message.
   * In production: suppressed entirely.
   * In development: outputs to console.info with structured formatting.
   */
  info(message: string, ...args: unknown[]): void {
    if (isProduction) return;
    const { context, extra } = parseArgs(args);
    const entry = buildEntry('info', message, context);
    devOutput(entry, ...extra);
  }

  /**
   * Log a warning-level message.
   * In production: NO console output; forwarded to the aggregation pipeline only
   * when warn-forwarding is enabled (`forwardWarn: true`), otherwise suppressed.
   * In development: outputs to console.warn with structured formatting.
   */
  warn(message: string, ...args: unknown[]): void {
    const { context, extra } = parseArgs(args);
    const entry = buildEntry('warn', message, context);

    if (isProduction) {
      if (shouldForward('warn', forwardingConfig.forwardWarn)) {
        forwardToPipeline(entry);
      }
      return;
    }

    devOutput(entry, ...extra);
  }

  /**
   * Log an error-level message.
   * In production: NO console output; forwarded to the configured aggregation
   * destination with `/api/system-errors` as the fallback path.
   * In development: outputs to console.error with structured formatting.
   */
  error(message: string, ...args: unknown[]): void {
    const { context, extra } = parseArgs(args);
    const entry = buildEntry('error', message, context);

    if (isProduction) {
      if (shouldForward('error', forwardingConfig.forwardWarn)) {
        forwardToPipeline(entry);
      }
      return;
    }

    devOutput(entry, ...extra);
  }

  /** The session correlation ID used in all log entries */
  get sessionCorrelationId(): string {
    return correlationId;
  }
}

export const logger = new StructuredLogger();
export default logger;
