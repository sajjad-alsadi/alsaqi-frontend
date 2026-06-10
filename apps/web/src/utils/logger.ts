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

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  module: string;
  correlationId: string;
  componentStack?: string | undefined;
  context?: Record<string, unknown> | undefined;
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

/**
 * Send error-level log entries to the backend in production.
 * Fire-and-forget — never throws or surfaces errors to the caller.
 */
function reportToBackend(entry: LogEntry): void {
  try {
    fetch('/api/system-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    }).catch(() => {
      // Silently ignore — errorReporter handles retries separately
    });
  } catch {
    // Guard against synchronous failures (e.g., during teardown)
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
   * In production: suppressed entirely.
   * In development: outputs to console.warn with structured formatting.
   */
  warn(message: string, ...args: unknown[]): void {
    if (isProduction) return;
    const { context, extra } = parseArgs(args);
    const entry = buildEntry('warn', message, context);
    devOutput(entry, ...extra);
  }

  /**
   * Log an error-level message.
   * In production: NO console output; routes to /api/system-errors via HTTP POST.
   * In development: outputs to console.error with structured formatting.
   */
  error(message: string, ...args: unknown[]): void {
    const { context, extra } = parseArgs(args);
    const entry = buildEntry('error', message, context);

    if (isProduction) {
      reportToBackend(entry);
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
