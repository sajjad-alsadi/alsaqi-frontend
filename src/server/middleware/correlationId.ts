import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requestContext } from '../utils/logger';
import { CorrelationIdOptions } from '../types/middleware';

/**
 * UUID v4 format regex: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 * Validates 36-character string with hex digits and hyphens in correct positions.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates whether a string matches UUID format (36 chars, pattern xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).
 */
export function isValidUuid(value: string): boolean {
  return typeof value === 'string' && value.length === 36 && UUID_REGEX.test(value);
}

/**
 * Creates a correlation ID middleware with configurable options.
 *
 * The middleware:
 * 1. Checks for an existing correlation ID in the request header (case-insensitive)
 * 2. Validates the header value matches UUID format (36 chars, xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
 * 3. If valid, uses the provided value as the request ID
 * 4. If missing or invalid, generates a new UUID v4
 * 5. Attaches the ID to the request context (req.correlationId) for downstream use
 * 6. Sets the response header with the correlation ID
 * 7. Stores the correlation ID in AsyncLocalStorage for logger access
 */
export function createCorrelationIdMiddleware(options: CorrelationIdOptions = {}) {
  const {
    headerName = 'x-correlation-id',
    responseHeader = 'X-Request-Id',
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const headerValue = req.headers[headerName.toLowerCase()] as string | undefined;

    // Use provided header value only if it's a valid UUID format
    const correlationId = headerValue && isValidUuid(headerValue)
      ? headerValue
      : uuidv4();

    // Attach to request context for downstream middleware/handlers
    (req as any).correlationId = correlationId;

    // Set response header
    res.setHeader(responseHeader, correlationId);

    // Store in AsyncLocalStorage for logger access
    const userId = (req as any).user?.id;
    requestContext.run({ correlationId, userId }, () => {
      next();
    });
  };
}

/**
 * Default correlation ID middleware instance with standard options.
 * Generates UUID v4 when X-Correlation-Id header is missing or invalid.
 * Accepts and validates existing X-Correlation-Id header (UUID format).
 * Attaches request ID to req.correlationId for downstream use.
 */
export const correlationIdMiddleware = createCorrelationIdMiddleware();
