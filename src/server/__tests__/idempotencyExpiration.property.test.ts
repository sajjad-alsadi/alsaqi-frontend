// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

/**
 * Property Test: Idempotency Key Expiration (Property 7)
 *
 * Feature: api-audit-improvements
 * Property 7: Idempotency Key Expiration
 *
 * **Validates: Requirements 13.4**
 *
 * For any stored idempotency record, after the configured TTL has elapsed,
 * the record SHALL no longer be returned and a new request with the same key
 * SHALL execute the operation fresh.
 */

// ─── Hoisted Mocks ──────────────────────────────────────────────────────────

const { mockPrepare } = vi.hoisted(() => ({
  mockPrepare: vi.fn(),
}));

vi.mock('../../server/db/index', () => ({
  default: {
    prepare: mockPrepare,
  },
}));

import {
  createIdempotencyMiddleware,
  clearInFlightKeys,
  IdempotencyService,
} from '../../server/middleware/idempotency';
import {
  createAuthenticatedRequest,
  createMockResponse,
  createMockNext,
} from '../../server/__tests__/helpers/apiTestUtils';

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates valid idempotency keys (1-256 alphanumeric characters) */
const idempotencyKeyArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,64}$/);

/** Generates valid user IDs */
const userIdArb = fc.uuid();

/** Generates valid HTTP methods that idempotency applies to */
const methodArb = fc.constantFrom('POST', 'PUT');

/** Generates valid API paths */
const pathArb = fc.constantFrom(
  '/api/v1/items',
  '/api/v1/audit-plans',
  '/api/v1/recommendations',
  '/api/v1/audit-tasks',
  '/api/v1/compliance'
);

/** Generates arbitrary JSON-serializable response bodies */
const responseBodyArb = fc.oneof(
  fc.record({
    id: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 20 }),
    status: fc.constantFrom('active', 'pending', 'completed'),
  }),
  fc.record({
    total: fc.integer({ min: 0, max: 100 }),
    success: fc.boolean(),
  })
);

/** Generates valid HTTP status codes for successful responses */
const statusCodeArb = fc.constantFrom(200, 201, 202);

/** Generates TTL values in seconds (1 minute to 7 days) */
const ttlArb = fc.integer({ min: 60, max: 604800 });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 7: Idempotency Key Expiration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearInFlightKeys();
  });

  afterEach(() => {
    clearInFlightKeys();
  });

  it('expired records are not returned and new execution occurs', async () => {
    await fc.assert(
      fc.asyncProperty(
        idempotencyKeyArb,
        userIdArb,
        methodArb,
        pathArb,
        responseBodyArb,
        statusCodeArb,
        ttlArb,
        async (idempotencyKey, userId, method, requestPath, responseBody, statusCode, ttl) => {
          clearInFlightKeys();
          vi.clearAllMocks();

          // ─── Simulate an expired record scenario ─────────────────────────
          // The IdempotencyService.check() query uses `expires_at > NOW()`.
          // When a record has expired, the DB query returns no rows (undefined).
          // This means the middleware should call next() to execute the operation fresh.

          // Mock: check returns undefined (record expired, not matched by query)
          mockPrepare.mockImplementationOnce(() => ({
            get: vi.fn().mockResolvedValue(undefined),
          }));

          // Mock: store for the new execution
          mockPrepare.mockImplementationOnce(() => ({
            run: vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 }),
          }));

          const middleware = createIdempotencyMiddleware({ ttl });

          const req = createAuthenticatedRequest({
            method,
            path: requestPath,
            url: requestPath,
            headers: { 'x-idempotency-key': idempotencyKey },
            user: { id: userId },
          });
          const res = createMockResponse();
          (res as any).on = vi.fn();
          const next = createMockNext();

          await middleware(req, res as any, next);

          // Property: When the record is expired, next() IS called (fresh execution)
          expect(next).toHaveBeenCalled();

          // Simulate the handler producing a new response
          res.statusCode = statusCode;
          res.json(responseBody);

          // Allow microtask queue to flush for the async store
          await new Promise((resolve) => setImmediate(resolve));

          // Property: A new response is stored (the store query was called)
          // The second mockPrepare call is for the INSERT
          expect(mockPrepare).toHaveBeenCalledTimes(2);
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);

  it('non-expired records ARE returned (contrast with expiration behavior)', async () => {
    await fc.assert(
      fc.asyncProperty(
        idempotencyKeyArb,
        userIdArb,
        methodArb,
        pathArb,
        responseBodyArb,
        statusCodeArb,
        async (idempotencyKey, userId, method, requestPath, responseBody, statusCode) => {
          clearInFlightKeys();
          vi.clearAllMocks();

          // ─── Simulate a non-expired record scenario ──────────────────────
          // When the record has NOT expired, the DB query returns the stored record.
          // The middleware should return the stored response without calling next().

          // Mock: check returns the stored response (record is still valid)
          mockPrepare.mockImplementationOnce(() => ({
            get: vi.fn().mockResolvedValue({
              response_status: statusCode,
              response_body: JSON.stringify(responseBody),
            }),
          }));

          const middleware = createIdempotencyMiddleware();

          const req = createAuthenticatedRequest({
            method,
            path: requestPath,
            url: requestPath,
            headers: { 'x-idempotency-key': idempotencyKey },
            user: { id: userId },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await middleware(req, res as any, next);

          // Property: When the record is NOT expired, next() is NOT called
          expect(next).not.toHaveBeenCalled();

          // Property: The stored response is returned as-is
          expect(res.status).toHaveBeenCalledWith(statusCode);
          expect(res.json).toHaveBeenCalledWith(responseBody);
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);

  it('IdempotencyService.check uses expires_at > NOW() to filter expired records', async () => {
    await fc.assert(
      fc.asyncProperty(
        idempotencyKeyArb,
        userIdArb,
        methodArb,
        pathArb,
        async (idempotencyKey, userId, method, requestPath) => {
          vi.clearAllMocks();

          // Track the SQL query to verify it includes the expiration check
          let capturedSql = '';
          let capturedArgs: any[] = [];

          mockPrepare.mockImplementationOnce((sql: string) => {
            capturedSql = sql;
            return {
              get: vi.fn((...args: any[]) => {
                capturedArgs = args;
                return Promise.resolve(undefined);
              }),
            };
          });

          await IdempotencyService.check(idempotencyKey, userId, method, requestPath);

          // Property: The SQL query includes the expiration filter
          expect(capturedSql).toContain('expires_at > NOW()');

          // Property: The query is scoped to the specific key and user
          expect(capturedArgs).toContain(idempotencyKey);
          expect(capturedArgs).toContain(userId);
          expect(capturedArgs).toContain(method);
          expect(capturedArgs).toContain(requestPath);
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});
