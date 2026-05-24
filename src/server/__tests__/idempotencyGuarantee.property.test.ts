// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

/**
 * Property Test: Idempotency Guarantee (Property 6)
 *
 * Feature: api-audit-improvements
 * Property 6: Idempotency Guarantee
 *
 * **Validates: Requirements 13.1, 13.2, 13.3, 13.5**
 *
 * For any request with an idempotency key K sent by user U, the first execution
 * SHALL store the response, and any subsequent request with the same key K from
 * the same user U (before TTL expiry) SHALL return the identical stored response
 * without re-executing the operation or creating duplicate records.
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 6: Idempotency Guarantee', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearInFlightKeys();
  });

  afterEach(() => {
    clearInFlightKeys();
  });

  it('same key + user returns identical stored response without re-execution', async () => {
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

          // ─── Simulate second request where stored record exists ───────────
          // This directly tests the core property: when a stored response exists
          // for key K + user U, the middleware returns it without calling next()

          // Mock: check returns the stored response (simulating first request already completed)
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

          // Property: Handler was NOT re-executed (next was NOT called)
          expect(next).not.toHaveBeenCalled();

          // Property: Returned status code matches the stored original
          expect(res.status).toHaveBeenCalledWith(statusCode);

          // Property: Returned body is identical to the stored original
          expect(res.json).toHaveBeenCalledWith(responseBody);
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);

  it('first execution calls next and stores response on completion', async () => {
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

          // Track store calls
          let storeCalled = false;
          let storedArgs: any[] = [];

          // Mock: check returns null (no existing record - first execution)
          mockPrepare.mockImplementationOnce(() => ({
            get: vi.fn().mockResolvedValue(undefined),
          }));

          // Mock: store captures the arguments
          mockPrepare.mockImplementationOnce(() => ({
            run: vi.fn((...args: any[]) => {
              storeCalled = true;
              storedArgs = args;
              return Promise.resolve({ lastInsertRowid: 1, changes: 1 });
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
          (res as any).on = vi.fn();
          const next = createMockNext();

          await middleware(req, res as any, next);

          // Property: First execution calls next (handler executes)
          expect(next).toHaveBeenCalled();

          // Simulate handler producing a response via the overridden res.json
          res.statusCode = statusCode;
          res.json(responseBody);

          // Allow microtask queue to flush for the async store
          await new Promise((resolve) => setImmediate(resolve));

          // Property: The response was stored for future retrieval
          expect(storeCalled).toBe(true);

          // Property: Stored arguments include the idempotency key, user, and response
          expect(storedArgs).toContain(idempotencyKey);
          expect(storedArgs).toContain(userId);
          expect(storedArgs).toContain(statusCode);
          expect(storedArgs).toContain(JSON.stringify(responseBody));
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);

  it('idempotency keys are scoped per user (different users with same key execute independently)', async () => {
    await fc.assert(
      fc.asyncProperty(
        idempotencyKeyArb,
        userIdArb,
        userIdArb,
        methodArb,
        pathArb,
        async (idempotencyKey, userA, userB, method, requestPath) => {
          // Skip if users happen to be the same
          fc.pre(userA !== userB);

          clearInFlightKeys();
          vi.clearAllMocks();

          const middleware = createIdempotencyMiddleware();

          // Use a stateful mock that returns different results based on the userId argument
          // The IdempotencyService.check query includes userId as the 2nd argument
          const storedResponseA = { id: 'item-a', user: userA };

          mockPrepare.mockImplementation((sql: string) => {
            if (sql.includes('SELECT')) {
              return {
                get: vi.fn((...args: any[]) => {
                  // The check query passes: idempotencyKey, userId, method, path
                  const queriedUserId = args[1];
                  if (queriedUserId === userA) {
                    // User A has a stored response
                    return Promise.resolve({
                      response_status: 201,
                      response_body: JSON.stringify(storedResponseA),
                    });
                  }
                  // User B has no stored response
                  return Promise.resolve(undefined);
                }),
              };
            }
            // INSERT for storing User B's response
            return {
              run: vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 }),
            };
          });

          // ─── User A: has a stored response ───────────────────────────────
          const reqA = createAuthenticatedRequest({
            method,
            path: requestPath,
            url: requestPath,
            headers: { 'x-idempotency-key': idempotencyKey },
            user: { id: userA },
          });
          const resA = createMockResponse();
          const nextA = createMockNext();

          await middleware(reqA, resA as any, nextA);

          // User A gets stored response (no re-execution)
          expect(nextA).not.toHaveBeenCalled();
          expect(resA.status).toHaveBeenCalledWith(201);
          expect(resA.json).toHaveBeenCalledWith(storedResponseA);

          // ─── User B: same key, no stored response ────────────────────────
          const reqB = createAuthenticatedRequest({
            method,
            path: requestPath,
            url: requestPath,
            headers: { 'x-idempotency-key': idempotencyKey },
            user: { id: userB },
          });
          const resB = createMockResponse();
          (resB as any).on = vi.fn();
          const nextB = createMockNext();

          await middleware(reqB, resB as any, nextB);

          // Property: User B's handler executes (keys are scoped per user)
          // Same key K but different user means independent execution
          expect(nextB).toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});
