import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../utils/errors';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Determines if the application is running in production mode.
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Known database table names that should be sanitized from error messages in production.
 * This list covers the tables used in the AL-SAQI system.
 */
const TABLE_NAME_PATTERNS = [
  'audit_tasks',
  'audit_programs',
  'audit_findings',
  'audit_plans',
  'recommendations',
  'users',
  'departments',
  'roles',
  'permissions',
  'notifications',
  'correspondence',
  'attachments',
  'comments',
  'policies',
  'compliance',
  'fraud',
  'integrity',
  'coi',
  'org_entities',
  'job_titles',
  'sessions',
  'settings',
  'app_settings',
  'request_logs',
  'file_access_logs',
  'idempotency_keys',
  'dead_letter_queue',
  'regulatory',
  'executive_reports',
  'pdf_templates',
  'risk_assessments',
];

/**
 * Regex patterns for detecting internal information that should be sanitized.
 */
const SANITIZATION_PATTERNS = {
  /** Matches file paths like /path/to/file, C:\path\to\file, or relative paths */
  filePaths: /(?:[A-Za-z]:)?(?:\/|\\)[\w.\-/\\]+(?:\.(?:ts|js|json|sql|mjs|cjs))?/g,
  /** Matches SQL fragments */
  sqlFragments: /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|CREATE|ALTER|DROP|INDEX|CONSTRAINT|UNIQUE|PRIMARY\s+KEY|FOREIGN\s+KEY|REFERENCES|ON\s+DELETE|ON\s+UPDATE|CASCADE|SET\s+NULL|RETURNING|VALUES|INTO)\b/gi,
  /** Matches stack traces */
  stackTrace: /\s+at\s+.+\(.+:\d+:\d+\)/g,
  /** Matches column names in constraint violations (e.g., "column_name" or column_name) */
  constraintColumns: /(?:column|constraint|key)\s*[=:]?\s*["']?[\w]+["']?/gi,
  /** Matches internal service/module names */
  internalServices: /\b(?:BaseService|AuthService|NotificationService|CrudGenerator|DBWrapper|PGlite)\b/g,
};

/**
 * Sanitizes an error message by removing internal identifiers in production mode.
 * Removes table names, column names, file paths, SQL fragments, and internal service names.
 *
 * @param message - The original error message
 * @returns The sanitized message safe for external consumption
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return 'An error occurred';

  let sanitized = message;

  // Remove table names
  for (const tableName of TABLE_NAME_PATTERNS) {
    const regex = new RegExp(`\\b${tableName}\\b`, 'gi');
    sanitized = sanitized.replace(regex, '[resource]');
  }

  // Remove file paths
  sanitized = sanitized.replace(SANITIZATION_PATTERNS.filePaths, '[internal]');

  // Remove SQL fragments
  sanitized = sanitized.replace(SANITIZATION_PATTERNS.sqlFragments, '[query]');

  // Remove stack traces
  sanitized = sanitized.replace(SANITIZATION_PATTERNS.stackTrace, '');

  // Remove constraint/column details
  sanitized = sanitized.replace(SANITIZATION_PATTERNS.constraintColumns, '[detail]');

  // Remove internal service names
  sanitized = sanitized.replace(SANITIZATION_PATTERNS.internalServices, '[service]');

  // Clean up multiple spaces and trim
  sanitized = sanitized.replace(/\s{2,}/g, ' ').trim();

  return sanitized;
}

/**
 * Returns a generic message based on the HTTP status code for production responses.
 *
 * @param statusCode - The HTTP status code
 * @returns A generic, safe error message
 */
function getGenericMessage(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Bad request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Resource not found';
    case 409:
      return 'Conflict';
    case 413:
      return 'Payload too large';
    case 429:
      return 'Too many requests';
    case 503:
      return 'Service temporarily unavailable';
    default:
      return 'An unexpected error occurred';
  }
}

/**
 * Determines the appropriate production error message based on error type and status code.
 * For known error types (403, 404, 409), returns a generic message.
 * For other errors, sanitizes the original message.
 *
 * @param statusCode - The HTTP status code
 * @param errorCode - The application error code
 * @param originalMessage - The original error message
 * @returns A production-safe error message
 */
function getProductionMessage(statusCode: number, errorCode: string, originalMessage: string): string {
  // For specific status codes, always return generic messages regardless of content
  if (statusCode === 403) return 'Forbidden';
  if (statusCode === 404) return 'Resource not found';
  if (statusCode === 409) return 'Conflict';
  if (statusCode >= 500) return 'An unexpected error occurred. Please contact support.';

  // For other client errors, sanitize the message
  return sanitizeErrorMessage(originalMessage);
}

/**
 * Global error handler middleware for Express.
 * 
 * In production mode:
 * - Sanitizes error messages to remove internal identifiers (table names, columns, paths, SQL)
 * - Omits stack traces from responses
 * - Returns generic messages for 403, 404, 409 errors
 * - Sanitizes third-party library error messages
 * 
 * In development mode:
 * - Includes full error details for debugging
 * - Includes stack traces for 500+ errors
 * - Preserves original error messages with all internal details
 */
export const globalErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const traceId = (req as any).correlationId || uuidv4();

  // Default values
  let statusCode = err.statusCode || 500;
  let errorCode = err.errorCode || ErrorCode.INTERNAL_SERVER_ERROR;
  let message = err.message || 'Internal Server Error';
  let details = err.details || undefined;

  // Handle database constraint violations (unique constraint, foreign key, etc.)
  if (err.code === '23505' || err.constraint || (err.message && /unique.*constraint|duplicate.*key/i.test(err.message))) {
    statusCode = 409;
    errorCode = ErrorCode.CONFLICT;
    if (!isProduction()) {
      message = err.message || 'Database constraint violation';
    }
  }

  // Log the error with full details (always log full info server-side)
  const logMetadata = {
    traceId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: (req as any).user?.id,
    errorCode,
    stack: statusCode >= 500 ? err.stack : undefined,
    details,
  };

  if (statusCode >= 500) {
    logger.error(`[${traceId}] ${message}`, logMetadata);
  } else if (statusCode === 401) {
    logger.info(`[${traceId}] ${message}`, logMetadata);
  } else {
    logger.warn(`[${traceId}] ${message}`, logMetadata);
  }

  // Security logging for specific errors
  if (errorCode === ErrorCode.UNAUTHORIZED || errorCode === ErrorCode.FORBIDDEN || errorCode === ErrorCode.SECURITY_ERROR) {
    logger.info(`[SECURITY] [${traceId}] ${message}`, { ...logMetadata, level: 'security' });
  }

  // Build the response based on environment
  if (isProduction()) {
    // Production: sanitize all error details
    const productionMessage = getProductionMessage(statusCode, errorCode, message);

    res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message: productionMessage,
        traceId,
      },
    });
  } else {
    // Development: include full error details for debugging
    res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message,
        details,
        traceId,
        ...(statusCode >= 500 && err.stack ? { stack: err.stack } : {}),
      },
    });
  }
};

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const err = new AppError(
    isProduction()
      ? 'Resource not found'
      : `Route ${req.originalUrl} not found`,
    404,
    ErrorCode.NOT_FOUND
  );
  next(err);
};
