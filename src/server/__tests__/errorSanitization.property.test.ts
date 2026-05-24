// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { sanitizeErrorMessage, globalErrorHandler } from '../middleware/error';
import { ErrorCode } from '../utils/errors';

/**
 * Property Test: Error Message Sanitization in Production (Property 3)
 *
 * Feature: api-audit-improvements
 * Property 3: Error Message Sanitization in Production
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * For any error response generated while in production mode, the response body
 * SHALL NOT contain database table names, column names, stack traces, file paths,
 * or SQL fragments that were present in the original error.
 */

// ─── Known Internal Identifiers ──────────────────────────────────────────────

const KNOWN_TABLE_NAMES = [
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

const SQL_KEYWORDS = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'FROM',
  'WHERE',
  'JOIN',
  'LEFT JOIN',
  'GROUP BY',
  'ORDER BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'CREATE',
  'ALTER',
  'DROP',
  'INDEX',
  'CONSTRAINT',
  'RETURNING',
  'VALUES',
  'INTO',
];

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates a random table name from the known list */
const tableNameArb = fc.constantFrom(...KNOWN_TABLE_NAMES);

/** Generates a random SQL keyword from the known list */
const sqlKeywordArb = fc.constantFrom(...SQL_KEYWORDS);

/** Generates Unix-style file paths */
const unixFilePathArb = fc
  .tuple(
    fc.constantFrom('/app/server', '/home/user/project', '/var/lib/app', '/usr/src'),
    fc.array(fc.stringMatching(/^[a-z][a-zA-Z0-9]{1,10}$/), { minLength: 1, maxLength: 3 }),
    fc.constantFrom('.ts', '.js', '.json', '.sql', '.mjs')
  )
  .map(([base, segments, ext]) => `${base}/${segments.join('/')}${ext}`);

/** Generates Windows-style file paths */
const windowsFilePathArb = fc
  .tuple(
    fc.constantFrom('C:\\Users\\dev\\project', 'D:\\app\\server', 'C:\\Program Files\\app'),
    fc.array(fc.stringMatching(/^[a-z][a-zA-Z0-9]{1,10}$/), { minLength: 1, maxLength: 3 }),
    fc.constantFrom('.ts', '.js', '.json', '.sql')
  )
  .map(([base, segments, ext]) => `${base}\\${segments.join('\\')}${ext}`);

/** Generates file paths (both Unix and Windows) */
const filePathArb = fc.oneof(unixFilePathArb, windowsFilePathArb);

/** Generates stack trace lines */
const stackTraceArb = fc
  .tuple(
    fc.constantFrom('Object.<anonymous>', 'Module._compile', 'Function.call', 'Router.handle', 'Layer.handle'),
    fc.constantFrom('/app/server/routes/index.ts', '/app/server/middleware/error.ts', 'C:\\project\\src\\handler.js'),
    fc.integer({ min: 1, max: 500 }),
    fc.integer({ min: 1, max: 80 })
  )
  .map(([fn, file, line, col]) => `    at ${fn} (${file}:${line}:${col})`);

/** Generates error messages containing table names */
const errorWithTableNameArb = fc
  .tuple(
    tableNameArb,
    fc.constantFrom(
      'item with ID 123 not found',
      'constraint violation on column "name"',
      'duplicate key value violates unique constraint',
      'record does not exist',
      'foreign key constraint failed'
    )
  )
  .map(([table, suffix]) => `${table} ${suffix}`);

/** Generates error messages containing file paths */
const errorWithFilePathArb = fc
  .tuple(
    fc.constantFrom('Error loading module at ', 'Cannot find file ', 'ENOENT: no such file or directory, open '),
    filePathArb
  )
  .map(([prefix, path]) => `${prefix}${path}`);

/** Generates error messages containing SQL fragments */
const errorWithSqlArb = fc
  .tuple(
    sqlKeywordArb,
    fc.constantFrom(
      ' * FROM users WHERE id = $1',
      ' INTO audit_tasks (title, status) VALUES ($1, $2)',
      ' audit_findings SET status = $1 WHERE id = $2',
      ' FROM recommendations WHERE due_date < NOW()'
    )
  )
  .map(([keyword, fragment]) => `Error in query: ${keyword}${fragment}`);

/** Generates error messages containing stack traces */
const errorWithStackTraceArb = fc
  .tuple(
    fc.constantFrom('TypeError: Cannot read property', 'ReferenceError: x is not defined', 'Error: Connection refused'),
    fc.array(stackTraceArb, { minLength: 1, maxLength: 5 })
  )
  .map(([msg, traces]) => `${msg}\n${traces.join('\n')}`);

/** Generates complex error messages combining multiple internal details */
const complexErrorArb = fc
  .tuple(
    tableNameArb,
    sqlKeywordArb,
    filePathArb,
    stackTraceArb
  )
  .map(
    ([table, sql, path, trace]) =>
      `Error: ${sql} FROM ${table} failed at ${path}\n${trace}`
  );

/** Generates a random filler word for building messages */
const fillerArb = fc.constantFrom(
  'error occurred while processing',
  'failed to execute operation on',
  'unexpected issue in',
  'could not complete request for'
);

// ─── Helper Functions ────────────────────────────────────────────────────────

/** Checks if a string contains any known table name (case-insensitive word boundary match) */
function containsTableName(text: string): boolean {
  return KNOWN_TABLE_NAMES.some((table) => {
    const regex = new RegExp(`\\b${table}\\b`, 'i');
    return regex.test(text);
  });
}

/** Checks if a string contains file path patterns */
function containsFilePath(text: string): boolean {
  const filePathRegex = /(?:[A-Za-z]:)?(?:\/|\\)[\w.\-/\\]+(?:\.(?:ts|js|json|sql|mjs|cjs))?/;
  return filePathRegex.test(text);
}

/** Checks if a string contains SQL keywords (standalone words) */
function containsSqlKeyword(text: string): boolean {
  return SQL_KEYWORDS.some((keyword) => {
    const regex = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
    return regex.test(text);
  });
}

/** Checks if a string contains stack trace patterns */
function containsStackTrace(text: string): boolean {
  return /\s+at\s+.+\(.+:\d+:\d+\)/.test(text);
}

// ─── Tests: sanitizeErrorMessage Function ────────────────────────────────────

describe('Property 3: Error Message Sanitization in Production', () => {
  describe('sanitizeErrorMessage removes table names', () => {
    it('sanitized output never contains any injected table name', () => {
      fc.assert(
        fc.property(errorWithTableNameArb, (errorMessage) => {
          const sanitized = sanitizeErrorMessage(errorMessage);
          expect(containsTableName(sanitized)).toBe(false);
        }),
        { numRuns: 200 }
      );
    });

    it('sanitized output never contains table names from complex messages', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          fillerArb,
          (table, filler) => {
            const message = `${filler} ${table} record`;
            const sanitized = sanitizeErrorMessage(message);
            expect(containsTableName(sanitized)).toBe(false);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('sanitizeErrorMessage removes file paths', () => {
    it('sanitized output never contains Unix file paths', () => {
      fc.assert(
        fc.property(unixFilePathArb, (filePath) => {
          const message = `Error loading module at ${filePath}`;
          const sanitized = sanitizeErrorMessage(message);
          expect(containsFilePath(sanitized)).toBe(false);
        }),
        { numRuns: 200 }
      );
    });

    it('sanitized output never contains Windows file paths', () => {
      fc.assert(
        fc.property(windowsFilePathArb, (filePath) => {
          const message = `Cannot find file ${filePath}`;
          const sanitized = sanitizeErrorMessage(message);
          expect(containsFilePath(sanitized)).toBe(false);
        }),
        { numRuns: 200 }
      );
    });

    it('sanitized output never contains file paths from error messages', () => {
      fc.assert(
        fc.property(errorWithFilePathArb, (errorMessage) => {
          const sanitized = sanitizeErrorMessage(errorMessage);
          expect(containsFilePath(sanitized)).toBe(false);
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('sanitizeErrorMessage removes SQL keywords', () => {
    it('sanitized output never contains SQL keywords', () => {
      fc.assert(
        fc.property(errorWithSqlArb, (errorMessage) => {
          const sanitized = sanitizeErrorMessage(errorMessage);
          expect(containsSqlKeyword(sanitized)).toBe(false);
        }),
        { numRuns: 200 }
      );
    });

    it('sanitized output never contains standalone SQL keywords', () => {
      fc.assert(
        fc.property(sqlKeywordArb, (keyword) => {
          const message = `Failed query: ${keyword} operation on database`;
          const sanitized = sanitizeErrorMessage(message);
          expect(containsSqlKeyword(sanitized)).toBe(false);
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('sanitizeErrorMessage removes stack traces', () => {
    it('sanitized output never contains stack trace patterns', () => {
      fc.assert(
        fc.property(errorWithStackTraceArb, (errorMessage) => {
          const sanitized = sanitizeErrorMessage(errorMessage);
          expect(containsStackTrace(sanitized)).toBe(false);
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('sanitizeErrorMessage handles complex combined messages', () => {
    it('sanitized output never contains any internal identifiers from complex errors', () => {
      fc.assert(
        fc.property(complexErrorArb, (errorMessage) => {
          const sanitized = sanitizeErrorMessage(errorMessage);
          expect(containsTableName(sanitized)).toBe(false);
          expect(containsFilePath(sanitized)).toBe(false);
          expect(containsSqlKeyword(sanitized)).toBe(false);
          expect(containsStackTrace(sanitized)).toBe(false);
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('sanitizeErrorMessage preserves non-sensitive content', () => {
    it('returns a non-empty string for any non-empty input', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (message) => {
            const sanitized = sanitizeErrorMessage(message);
            expect(sanitized.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns default message for empty input', () => {
      expect(sanitizeErrorMessage('')).toBe('An error occurred');
    });
  });

  // ─── Tests: globalErrorHandler in Production Mode ────────────────────────────

  describe('globalErrorHandler in production mode never leaks internal identifiers', () => {
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
      originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    /** Creates a mock Express request */
    function createMockReq(correlationId?: string) {
      return {
        method: 'GET',
        originalUrl: '/api/v1/test',
        ip: '127.0.0.1',
        headers: {},
        correlationId: correlationId || 'test-trace-id',
        user: { id: 'user-1' },
      } as any;
    }

    /** Creates a mock Express response that captures the JSON output */
    function createMockRes() {
      const res: any = {
        statusCode: 200,
        _json: null as any,
        status(code: number) {
          res.statusCode = code;
          return res;
        },
        json(body: any) {
          res._json = body;
          return res;
        },
      };
      return res;
    }

    it('production error responses never contain table names', () => {
      fc.assert(
        fc.property(errorWithTableNameArb, (errorMessage) => {
          const err = {
            message: errorMessage,
            statusCode: 400,
            errorCode: ErrorCode.BAD_REQUEST,
          };
          const req = createMockReq();
          const res = createMockRes();
          const next = vi.fn();

          globalErrorHandler(err, req, res, next);

          const responseBody = JSON.stringify(res._json);
          expect(containsTableName(responseBody)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('production error responses never contain file paths', () => {
      fc.assert(
        fc.property(errorWithFilePathArb, (errorMessage) => {
          const err = {
            message: errorMessage,
            statusCode: 400,
            errorCode: ErrorCode.BAD_REQUEST,
          };
          const req = createMockReq();
          const res = createMockRes();
          const next = vi.fn();

          globalErrorHandler(err, req, res, next);

          const responseMessage = res._json?.error?.message || '';
          expect(containsFilePath(responseMessage)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('production error responses never contain SQL keywords', () => {
      fc.assert(
        fc.property(errorWithSqlArb, (errorMessage) => {
          const err = {
            message: errorMessage,
            statusCode: 400,
            errorCode: ErrorCode.BAD_REQUEST,
          };
          const req = createMockReq();
          const res = createMockRes();
          const next = vi.fn();

          globalErrorHandler(err, req, res, next);

          const responseBody = JSON.stringify(res._json);
          expect(containsSqlKeyword(responseBody)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('production error responses never contain stack traces', () => {
      fc.assert(
        fc.property(errorWithStackTraceArb, (errorMessage) => {
          const err = {
            message: errorMessage,
            statusCode: 500,
            errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
            stack: errorMessage,
          };
          const req = createMockReq();
          const res = createMockRes();
          const next = vi.fn();

          globalErrorHandler(err, req, res, next);

          const responseBody = JSON.stringify(res._json);
          expect(containsStackTrace(responseBody)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('production 403 responses never reveal permission or module details', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('AuditTasks', 'Recommendations', 'Compliance', 'Fraud', 'Users'),
          fc.constantFrom('View', 'Create', 'Edit', 'Delete'),
          (module, action) => {
            const err = {
              message: `Forbidden: Missing permission ${action} on ${module}`,
              statusCode: 403,
              errorCode: ErrorCode.FORBIDDEN,
            };
            const req = createMockReq();
            const res = createMockRes();
            const next = vi.fn();

            globalErrorHandler(err, req, res, next);

            const responseMessage = res._json?.error?.message;
            expect(responseMessage).toBe('Forbidden');
            expect(responseMessage).not.toContain(module);
            expect(responseMessage).not.toContain(action);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('production 404 responses never reveal table names', () => {
      fc.assert(
        fc.property(tableNameArb, (table) => {
          const err = {
            message: `${table} item with ID 42 not found`,
            statusCode: 404,
            errorCode: ErrorCode.NOT_FOUND,
          };
          const req = createMockReq();
          const res = createMockRes();
          const next = vi.fn();

          globalErrorHandler(err, req, res, next);

          const responseMessage = res._json?.error?.message;
          expect(responseMessage).toBe('Resource not found');
          expect(containsTableName(responseMessage)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('production 409 responses never reveal constraint or column details', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          fc.constantFrom('name', 'email', 'username', 'title', 'reference_number'),
          (table, column) => {
            const err = {
              message: `duplicate key value violates unique constraint "${table}_${column}_unique"`,
              statusCode: 409,
              errorCode: ErrorCode.CONFLICT,
            };
            const req = createMockReq();
            const res = createMockRes();
            const next = vi.fn();

            globalErrorHandler(err, req, res, next);

            const responseMessage = res._json?.error?.message;
            expect(responseMessage).toBe('Conflict');
            expect(containsTableName(responseMessage)).toBe(false);
            expect(responseMessage).not.toContain(column);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('production 500 responses never leak any internal details', () => {
      fc.assert(
        fc.property(complexErrorArb, (errorMessage) => {
          const err = {
            message: errorMessage,
            statusCode: 500,
            errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
            stack: `Error: ${errorMessage}\n    at Object.<anonymous> (/app/server/index.ts:42:10)`,
          };
          const req = createMockReq();
          const res = createMockRes();
          const next = vi.fn();

          globalErrorHandler(err, req, res, next);

          const responseBody = JSON.stringify(res._json);
          expect(containsTableName(responseBody)).toBe(false);
          expect(containsFilePath(responseBody)).toBe(false);
          expect(containsSqlKeyword(responseBody)).toBe(false);
          expect(containsStackTrace(responseBody)).toBe(false);
          // 500 errors should get a generic message
          expect(res._json?.error?.message).toBe('An unexpected error occurred. Please contact support.');
        }),
        { numRuns: 100 }
      );
    });

    it('production responses always include traceId', () => {
      fc.assert(
        fc.property(
          complexErrorArb,
          fc.constantFrom(400, 403, 404, 409, 500),
          (errorMessage, statusCode) => {
            const err = {
              message: errorMessage,
              statusCode,
              errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
            };
            const req = createMockReq('trace-123');
            const res = createMockRes();
            const next = vi.fn();

            globalErrorHandler(err, req, res, next);

            expect(res._json?.error?.traceId).toBeDefined();
            expect(typeof res._json?.error?.traceId).toBe('string');
            expect(res._json?.error?.traceId.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
