// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { globalErrorHandler, notFoundHandler, sanitizeErrorMessage } from './error';
import { AppError, ErrorCode, ForbiddenError, NotFoundError, ConflictError } from '../utils/errors';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../__tests__/helpers/apiTestUtils';

// Mock the logger to prevent console output during tests
vi.mock('../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('globalErrorHandler', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('Production mode (NODE_ENV=production)', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('returns 403 with generic "Forbidden" message without permission details', () => {
      const req = createMockRequest({ url: '/api/audit-tasks' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new ForbiddenError('Forbidden: Missing permission Edit on AuditTasks');

      globalErrorHandler(err, req, res as any, next);

      expect(res.statusCode).toBe(403);
      expect(res._json.success).toBe(false);
      expect(res._json.error.message).toBe('Forbidden');
      expect(res._json.error.message).not.toContain('Edit');
      expect(res._json.error.message).not.toContain('AuditTasks');
      expect(res._json.error.message).not.toContain('permission');
      expect(res._json.error.traceId).toBeDefined();
    });

    it('returns 404 with generic "Resource not found" without table name', () => {
      const req = createMockRequest({ url: '/api/audit-tasks/123' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new NotFoundError('audit_tasks item with ID 123 not found');

      globalErrorHandler(err, req, res as any, next);

      expect(res.statusCode).toBe(404);
      expect(res._json.success).toBe(false);
      expect(res._json.error.message).toBe('Resource not found');
      expect(res._json.error.message).not.toContain('audit_tasks');
      expect(res._json.error.message).not.toContain('123');
      expect(res._json.error.traceId).toBeDefined();
    });

    it('returns 409 with generic conflict message without constraint details', () => {
      const req = createMockRequest({ url: '/api/users', method: 'POST' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new ConflictError(
        'duplicate key value violates unique constraint "users_email_key"'
      );

      globalErrorHandler(err, req, res as any, next);

      expect(res.statusCode).toBe(409);
      expect(res._json.success).toBe(false);
      expect(res._json.error.message).toBe('Conflict');
      expect(res._json.error.message).not.toContain('users_email_key');
      expect(res._json.error.message).not.toContain('constraint');
      expect(res._json.error.message).not.toContain('duplicate');
      expect(res._json.error.traceId).toBeDefined();
    });

    it('returns 500 with generic message and no stack trace', () => {
      const req = createMockRequest({ url: '/api/data' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new Error('SELECT * FROM audit_tasks WHERE id = 1 failed at /app/server/services/BaseService.ts:42');
      (err as any).statusCode = 500;

      globalErrorHandler(err, req, res as any, next);

      expect(res.statusCode).toBe(500);
      expect(res._json.success).toBe(false);
      expect(res._json.error.message).toBe('An unexpected error occurred. Please contact support.');
      expect(res._json.error.stack).toBeUndefined();
      expect(res._json.error.details).toBeUndefined();
      expect(res._json.error.traceId).toBeDefined();
    });

    it('omits stack traces from all error responses', () => {
      const req = createMockRequest({ url: '/api/test' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new AppError('Something went wrong', 400, ErrorCode.BAD_REQUEST);
      err.stack = 'Error: Something went wrong\n    at Object.<anonymous> (/app/server/routes/test.ts:15:11)';

      globalErrorHandler(err, req, res as any, next);

      expect(res._json.error.stack).toBeUndefined();
    });

    it('sanitizes table names from error messages', () => {
      const req = createMockRequest({ url: '/api/test' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new AppError(
        'Error querying audit_tasks table',
        400,
        ErrorCode.BAD_REQUEST
      );

      globalErrorHandler(err, req, res as any, next);

      expect(res._json.error.message).not.toContain('audit_tasks');
    });

    it('sanitizes file paths from error messages', () => {
      const req = createMockRequest({ url: '/api/test' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new AppError(
        'Error at /app/server/services/BaseService.ts:42',
        400,
        ErrorCode.BAD_REQUEST
      );

      globalErrorHandler(err, req, res as any, next);

      expect(res._json.error.message).not.toContain('/app/server/services/BaseService.ts');
    });

    it('sanitizes SQL fragments from error messages', () => {
      const req = createMockRequest({ url: '/api/test' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new AppError(
        'Failed: SELECT id, name FROM users WHERE status = active',
        400,
        ErrorCode.BAD_REQUEST
      );

      globalErrorHandler(err, req, res as any, next);

      expect(res._json.error.message).not.toContain('SELECT');
      expect(res._json.error.message).not.toContain('FROM');
      expect(res._json.error.message).not.toContain('WHERE');
    });

    it('sanitizes third-party library error messages containing internal details', () => {
      const req = createMockRequest({ url: '/api/test' });
      const res = createMockResponse();
      const next = createMockNext();

      // Simulate a PGlite/PostgreSQL driver error
      const err = new AppError(
        'relation "audit_tasks" does not exist at /node_modules/pglite/dist/index.js:123',
        400,
        ErrorCode.DATABASE_ERROR
      );

      globalErrorHandler(err, req, res as any, next);

      expect(res._json.error.message).not.toContain('audit_tasks');
      expect(res._json.error.message).not.toContain('/node_modules');
    });

    it('handles database constraint violations and returns 409', () => {
      const req = createMockRequest({ url: '/api/users', method: 'POST' });
      const res = createMockResponse();
      const next = createMockNext();

      // Simulate a raw database error with constraint violation code
      const err: any = new Error('duplicate key value violates unique constraint "users_username_key"');
      err.code = '23505';
      err.constraint = 'users_username_key';

      globalErrorHandler(err, req, res as any, next);

      expect(res.statusCode).toBe(409);
      expect(res._json.error.message).toBe('Conflict');
      expect(res._json.error.message).not.toContain('users_username_key');
    });

    it('does not include details field in production responses', () => {
      const req = createMockRequest({ url: '/api/test' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR);
      (err as any).details = [{ field: 'email', message: 'Invalid email' }];

      globalErrorHandler(err, req, res as any, next);

      // In production, details should not be exposed for non-validation errors
      // But for 400 validation errors, the sanitized message is returned
      expect(res._json.error.details).toBeUndefined();
    });

    it('uses correlationId from request when available', () => {
      const correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const req = createMockRequest({ url: '/api/test' });
      (req as any).correlationId = correlationId;
      const res = createMockResponse();
      const next = createMockNext();

      const err = new AppError('Test error', 400, ErrorCode.BAD_REQUEST);

      globalErrorHandler(err, req, res as any, next);

      expect(res._json.error.traceId).toBe(correlationId);
    });
  });

  describe('Development mode (NODE_ENV=development)', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('includes full error message with table names', () => {
      const req = createMockRequest({ url: '/api/audit-tasks/123' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new NotFoundError('audit_tasks item with ID 123 not found');

      globalErrorHandler(err, req, res as any, next);

      expect(res.statusCode).toBe(404);
      expect(res._json.error.message).toContain('audit_tasks');
      expect(res._json.error.message).toContain('123');
    });

    it('includes permission details in 403 errors', () => {
      const req = createMockRequest({ url: '/api/audit-tasks' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new ForbiddenError('Forbidden: Missing permission Edit on AuditTasks');

      globalErrorHandler(err, req, res as any, next);

      expect(res.statusCode).toBe(403);
      expect(res._json.error.message).toContain('Edit');
      expect(res._json.error.message).toContain('AuditTasks');
    });

    it('includes stack trace for 500 errors', () => {
      const req = createMockRequest({ url: '/api/test' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new Error('Database connection failed');
      (err as any).statusCode = 500;
      err.stack = 'Error: Database connection failed\n    at DBWrapper.connect (/app/server/db/index.ts:42:11)';

      globalErrorHandler(err, req, res as any, next);

      expect(res.statusCode).toBe(500);
      expect(res._json.error.stack).toBeDefined();
      expect(res._json.error.stack).toContain('DBWrapper.connect');
    });

    it('includes details field when present', () => {
      const req = createMockRequest({ url: '/api/test' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR);
      (err as any).details = [{ field: 'email', message: 'Invalid email format' }];

      globalErrorHandler(err, req, res as any, next);

      expect(res._json.error.details).toBeDefined();
      expect(res._json.error.details[0].field).toBe('email');
    });

    it('includes SQL details in error messages', () => {
      const req = createMockRequest({ url: '/api/test' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new AppError(
        'Failed: SELECT id, name FROM users WHERE status = active',
        400,
        ErrorCode.DATABASE_ERROR
      );

      globalErrorHandler(err, req, res as any, next);

      expect(res._json.error.message).toContain('SELECT');
      expect(res._json.error.message).toContain('FROM');
      expect(res._json.error.message).toContain('WHERE');
    });

    it('includes constraint details in 409 errors', () => {
      const req = createMockRequest({ url: '/api/users', method: 'POST' });
      const res = createMockResponse();
      const next = createMockNext();

      const err: any = new Error('duplicate key value violates unique constraint "users_username_key"');
      err.code = '23505';
      err.constraint = 'users_username_key';

      globalErrorHandler(err, req, res as any, next);

      expect(res.statusCode).toBe(409);
      expect(res._json.error.message).toContain('users_username_key');
    });

    it('does not include stack trace for non-500 errors', () => {
      const req = createMockRequest({ url: '/api/test' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new AppError('Bad request', 400, ErrorCode.BAD_REQUEST);
      err.stack = 'Error: Bad request\n    at handler (/app/server/routes/test.ts:10:5)';

      globalErrorHandler(err, req, res as any, next);

      expect(res._json.error.stack).toBeUndefined();
    });
  });

  describe('Common behavior (both modes)', () => {
    it('defaults to 500 status code when not specified', () => {
      const req = createMockRequest({ url: '/api/test' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new Error('Unknown error');

      globalErrorHandler(err, req, res as any, next);

      expect(res.statusCode).toBe(500);
    });

    it('defaults to INTERNAL_SERVER_ERROR error code when not specified', () => {
      const req = createMockRequest({ url: '/api/test' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new Error('Unknown error');

      globalErrorHandler(err, req, res as any, next);

      expect(res._json.error.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    });

    it('always includes traceId in error response', () => {
      const req = createMockRequest({ url: '/api/test' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new AppError('Test', 400, ErrorCode.BAD_REQUEST);

      globalErrorHandler(err, req, res as any, next);

      expect(res._json.error.traceId).toBeDefined();
      expect(typeof res._json.error.traceId).toBe('string');
      expect(res._json.error.traceId.length).toBeGreaterThan(0);
    });

    it('always sets success to false', () => {
      const req = createMockRequest({ url: '/api/test' });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new AppError('Test', 400, ErrorCode.BAD_REQUEST);

      globalErrorHandler(err, req, res as any, next);

      expect(res._json.success).toBe(false);
    });
  });
});

describe('notFoundHandler', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('calls next with a 404 AppError in production with generic message', () => {
    process.env.NODE_ENV = 'production';
    const req = createMockRequest({ url: '/api/nonexistent' });
    const res = createMockResponse();
    const next = createMockNext();

    notFoundHandler(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Resource not found');
    expect(error.message).not.toContain('/api/nonexistent');
  });

  it('calls next with a 404 AppError in development with route details', () => {
    process.env.NODE_ENV = 'development';
    const req = createMockRequest({ url: '/api/nonexistent' });
    const res = createMockResponse();
    const next = createMockNext();

    notFoundHandler(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(404);
    expect(error.message).toContain('/api/nonexistent');
  });
});

describe('sanitizeErrorMessage', () => {
  it('removes known table names', () => {
    const result = sanitizeErrorMessage('Error in audit_tasks table');
    expect(result).not.toContain('audit_tasks');
    expect(result).toContain('[resource]');
  });

  it('removes multiple table names', () => {
    const result = sanitizeErrorMessage('Join between users and recommendations failed');
    expect(result).not.toContain('users');
    expect(result).not.toContain('recommendations');
  });

  it('removes file paths', () => {
    const result = sanitizeErrorMessage('Error at /app/server/services/BaseService.ts:42');
    expect(result).not.toContain('/app/server/services/BaseService.ts');
    expect(result).toContain('[internal]');
  });

  it('removes SQL keywords', () => {
    const result = sanitizeErrorMessage('Failed to execute SELECT * FROM users WHERE id = 1');
    expect(result).not.toContain('SELECT');
    expect(result).not.toContain('FROM');
    expect(result).not.toContain('WHERE');
  });

  it('removes constraint column references', () => {
    const result = sanitizeErrorMessage('constraint: users_email_key violated');
    expect(result).toContain('[detail]');
  });

  it('removes internal service names', () => {
    const result = sanitizeErrorMessage('BaseService.findById failed for record');
    expect(result).not.toContain('BaseService');
    expect(result).toContain('[service]');
  });

  it('handles empty string input', () => {
    const result = sanitizeErrorMessage('');
    expect(result).toBe('An error occurred');
  });

  it('handles messages with no sensitive content', () => {
    const result = sanitizeErrorMessage('Invalid input provided');
    expect(result).toBe('Invalid input provided');
  });

  it('cleans up multiple spaces after sanitization', () => {
    const result = sanitizeErrorMessage('Error in   audit_tasks   table');
    expect(result).not.toMatch(/\s{2,}/);
  });
});
