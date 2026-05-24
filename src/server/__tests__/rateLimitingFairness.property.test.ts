// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

/**
 * Property Test: Per-User Rate Limiting Fairness (Property 10)
 *
 * Feature: api-audit-improvements
 * Property 10: Per-User Rate Limiting Fairness
 *
 * **Validates: Requirements 14.1, 14.4**
 *
 * For any two authenticated users sharing the same IP address, one user
 * exhausting their rate limit SHALL NOT reduce the available quota of the
 * other user, and each user's request count SHALL be tracked independently.
 */

import {
  createRateLimiter,
  resetRateLimiterStore,
  stopRateLimiterCleanup,
} from '../../server/middleware/rateLimiter';
import {
  createAuthenticatedRequest,
  createMockResponse,
  createMockNext,
} from '../../server/__tests__/helpers/apiTestUtils';

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates valid user IDs (distinct from each other) */
const userIdArb = fc.uuid();

/** Generates valid IP addresses */
const ipArb = fc.tuple(
  fc.integer({ min: 1, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 1, max: 254 })
).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

/** Generates rate limit values (small for fast testing) */
const limitArb = fc.integer({ min: 3, max: 20 });

/** Generates request counts for exhausting a user's limit */
const requestCountArb = fc.integer({ min: 1, max: 20 });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 10: Per-User Rate Limiting Fairness', () => {
  afterEach(() => {
    resetRateLimiterStore();
    stopRateLimiterCleanup();
  });

  it('two users on same IP have independent quotas', () => {
    fc.assert(
      fc.property(
        userIdArb,
        userIdArb,
        ipArb,
        limitArb,
        requestCountArb,
        (userIdA, userIdB, sharedIp, limit, requestCount) => {
          // Ensure users are distinct
          fc.pre(userIdA !== userIdB);

          // Clamp requestCount to not exceed limit
          const numRequests = Math.min(requestCount, limit);

          resetRateLimiterStore();

          const rateLimiter = createRateLimiter({
            authenticatedLimit: limit,
            unauthenticatedLimit: limit,
            windowSeconds: 60,
          });

          // ─── User A makes numRequests requests ─────────────────────────
          for (let i = 0; i < numRequests; i++) {
            const req = createAuthenticatedRequest({
              user: { id: userIdA },
              ip: sharedIp,
            });
            const res = createMockResponse();
            const next = createMockNext();
            rateLimiter(req, res as any, next);
          }

          // ─── User B makes their first request on the same IP ───────────
          const reqB = createAuthenticatedRequest({
            user: { id: userIdB },
            ip: sharedIp,
          });
          const resB = createMockResponse();
          const nextB = createMockNext();
          rateLimiter(reqB, resB as any, nextB);

          // Property: User B's request is allowed (next was called)
          expect(nextB).toHaveBeenCalled();

          // Property: User B has full quota minus 1 (their own request)
          const remainingB = parseInt(resB._headers['x-ratelimit-remaining']);
          expect(remainingB).toBe(limit - 1);

          // Property: User B's limit is the full configured limit
          const limitB = parseInt(resB._headers['x-ratelimit-limit']);
          expect(limitB).toBe(limit);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('one user exhausting limit does not reduce other user\'s quota', () => {
    fc.assert(
      fc.property(
        userIdArb,
        userIdArb,
        ipArb,
        limitArb,
        (userIdA, userIdB, sharedIp, limit) => {
          // Ensure users are distinct
          fc.pre(userIdA !== userIdB);

          resetRateLimiterStore();

          const rateLimiter = createRateLimiter({
            authenticatedLimit: limit,
            unauthenticatedLimit: limit,
            windowSeconds: 60,
          });

          // ─── User A exhausts their entire limit ────────────────────────
          for (let i = 0; i < limit; i++) {
            const req = createAuthenticatedRequest({
              user: { id: userIdA },
              ip: sharedIp,
            });
            const res = createMockResponse();
            const next = createMockNext();
            rateLimiter(req, res as any, next);
            // All should pass
            expect(next).toHaveBeenCalled();
          }

          // ─── Verify User A is now rate limited ─────────────────────────
          const reqABlocked = createAuthenticatedRequest({
            user: { id: userIdA },
            ip: sharedIp,
          });
          const resABlocked = createMockResponse();
          const nextABlocked = createMockNext();
          rateLimiter(reqABlocked, resABlocked as any, nextABlocked);

          // User A should be blocked (429)
          expect(nextABlocked).not.toHaveBeenCalled();
          expect(resABlocked.statusCode).toBe(429);

          // ─── User B should have full quota available ───────────────────
          const reqB = createAuthenticatedRequest({
            user: { id: userIdB },
            ip: sharedIp,
          });
          const resB = createMockResponse();
          const nextB = createMockNext();
          rateLimiter(reqB, resB as any, nextB);

          // Property: User B's request succeeds (not affected by User A)
          expect(nextB).toHaveBeenCalled();

          // Property: User B has full quota minus 1 (only their own request counted)
          const remainingB = parseInt(resB._headers['x-ratelimit-remaining']);
          expect(remainingB).toBe(limit - 1);

          // Property: User B's limit header shows the full configured limit
          const limitHeaderB = parseInt(resB._headers['x-ratelimit-limit']);
          expect(limitHeaderB).toBe(limit);
        }
      ),
      { numRuns: 100 }
    );
  });
});
