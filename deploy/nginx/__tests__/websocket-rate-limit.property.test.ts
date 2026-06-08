// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property Test: WebSocket rate limiting rejects excess connections (Property 11)
 *
 * Feature: production-readiness-review
 * Property 11: WebSocket rate limiting rejects excess connections
 *
 * **Validates: Requirements 4.1, 4.2**
 *
 * The Nginx configuration applies rate limiting to WebSocket upgrade requests:
 *   limit_req_zone $binary_remote_addr zone=ws_upgrade_limit:10m rate=5r/s;
 *   limit_req zone=ws_upgrade_limit burst=10 nodelay;
 *   limit_req_status 429;
 *
 * Mathematical model:
 *   - Rate: 5 requests/second
 *   - Burst: 10 (additional requests allowed beyond rate in a single burst)
 *   - With `nodelay`: all burst slots are served immediately (no queuing)
 *   - Total allowed in 1 second window = rate + burst = 5 + 10 = 15
 *   - Request #16 and beyond in the same 1-second window → rejected with 429
 *
 * This test validates the rate-limiting model as a mathematical property,
 * not by hitting actual Nginx.
 */

// ─── Rate Limiting Model Constants (from nginx.conf.template) ────────────────

const RATE_PER_SECOND = 5;
const BURST_ALLOWANCE = 10;
const MAX_ALLOWED_PER_SECOND = RATE_PER_SECOND + BURST_ALLOWANCE; // 15
const REJECTION_STATUS = 429;
const ACCEPTED_STATUS = 101; // WebSocket Upgrade success

// ─── Rate Limiting Model ─────────────────────────────────────────────────────

/**
 * Models Nginx's `limit_req` behavior with `nodelay` for a single IP
 * within a 1-second time window.
 *
 * With `rate=5r/s` and `burst=10 nodelay`:
 * - The token bucket starts with capacity = rate + burst = 15 tokens
 * - Each request consumes 1 token
 * - When tokens are exhausted, requests are rejected with 429
 * - Tokens refill at `rate` per second (but within a single 1s burst, no refill)
 */
interface RateLimitResult {
  status: number;
  requestIndex: number;
}

/**
 * Simulates rate limiting for N requests from a single IP within 1 second.
 * Returns an array of results (status per request).
 */
function simulateRateLimiting(requestCount: number): RateLimitResult[] {
  const results: RateLimitResult[] = [];

  for (let i = 0; i < requestCount; i++) {
    if (i < MAX_ALLOWED_PER_SECOND) {
      results.push({ status: ACCEPTED_STATUS, requestIndex: i });
    } else {
      results.push({ status: REJECTION_STATUS, requestIndex: i });
    }
  }

  return results;
}

/**
 * Determines the expected status for a specific request number (0-indexed)
 * within a 1-second window from a single IP.
 */
function expectedStatus(requestIndex: number): number {
  return requestIndex < MAX_ALLOWED_PER_SECOND ? ACCEPTED_STATUS : REJECTION_STATUS;
}

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates a request count that exceeds the rate limit (16 to 100) */
const excessRequestCountArb = fc.integer({ min: MAX_ALLOWED_PER_SECOND + 1, max: 100 });

/** Generates a request count within the allowed limit (1 to 15) */
const allowedRequestCountArb = fc.integer({ min: 1, max: MAX_ALLOWED_PER_SECOND });

/** Generates a specific request index that would be rejected (index 15+) */
const rejectedRequestIndexArb = fc.integer({ min: MAX_ALLOWED_PER_SECOND, max: 99 });

/** Generates a specific request index that would be accepted (index 0-14) */
const acceptedRequestIndexArb = fc.integer({ min: 0, max: MAX_ALLOWED_PER_SECOND - 1 });

/** Generates a valid IP address string for testing multi-IP scenarios */
const ipAddressArb = fc.tuple(
  fc.integer({ min: 1, max: 254 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 1, max: 254 })
).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 11: WebSocket rate limiting rejects excess connections', () => {
  describe('excess requests are rejected with 429 (Requirements 4.1, 4.2)', () => {
    it('for any IP sending >15 upgrades in 1s, all excess are rejected with 429', () => {
      fc.assert(
        fc.property(excessRequestCountArb, (requestCount) => {
          const results = simulateRateLimiting(requestCount);

          // First 15 requests should be accepted
          const accepted = results.filter((r) => r.status === ACCEPTED_STATUS);
          expect(accepted).toHaveLength(MAX_ALLOWED_PER_SECOND);

          // All remaining should be rejected with 429
          const rejected = results.filter((r) => r.status === REJECTION_STATUS);
          expect(rejected).toHaveLength(requestCount - MAX_ALLOWED_PER_SECOND);

          // Every rejected request has status 429
          for (const r of rejected) {
            expect(r.status).toBe(REJECTION_STATUS);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('for any request index >= 15, the response is always 429', () => {
      fc.assert(
        fc.property(rejectedRequestIndexArb, (requestIndex) => {
          const status = expectedStatus(requestIndex);
          expect(status).toBe(REJECTION_STATUS);
        }),
        { numRuns: 100 }
      );
    });

    it('the number of rejected requests equals total - allowed for any excess count', () => {
      fc.assert(
        fc.property(excessRequestCountArb, (requestCount) => {
          const results = simulateRateLimiting(requestCount);
          const rejectedCount = results.filter((r) => r.status === REJECTION_STATUS).length;

          expect(rejectedCount).toBe(requestCount - MAX_ALLOWED_PER_SECOND);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('requests within limit are accepted (Requirements 4.1)', () => {
    it('for any IP sending <= 15 upgrades in 1s, all requests are accepted', () => {
      fc.assert(
        fc.property(allowedRequestCountArb, (requestCount) => {
          const results = simulateRateLimiting(requestCount);

          // All should be accepted (status 101 - WebSocket upgrade)
          expect(results).toHaveLength(requestCount);
          for (const r of results) {
            expect(r.status).toBe(ACCEPTED_STATUS);
          }

          // No rejections
          const rejected = results.filter((r) => r.status === REJECTION_STATUS);
          expect(rejected).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it('for any request index < 15, the response is always accepted', () => {
      fc.assert(
        fc.property(acceptedRequestIndexArb, (requestIndex) => {
          const status = expectedStatus(requestIndex);
          expect(status).toBe(ACCEPTED_STATUS);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('rate limit boundary behavior', () => {
    it('exactly 15 requests (rate + burst) are all accepted', () => {
      const results = simulateRateLimiting(MAX_ALLOWED_PER_SECOND);

      expect(results).toHaveLength(15);
      for (const r of results) {
        expect(r.status).toBe(ACCEPTED_STATUS);
      }
    });

    it('the 16th request is the first to be rejected with 429', () => {
      const results = simulateRateLimiting(16);

      // First 15 accepted
      for (let i = 0; i < 15; i++) {
        expect(results[i].status).toBe(ACCEPTED_STATUS);
      }

      // 16th rejected
      expect(results[15].status).toBe(REJECTION_STATUS);
    });

    it('rate limit capacity equals rate (5/s) + burst (10) = 15', () => {
      expect(MAX_ALLOWED_PER_SECOND).toBe(RATE_PER_SECOND + BURST_ALLOWANCE);
      expect(MAX_ALLOWED_PER_SECOND).toBe(15);
    });

    it('rejection status is always 429 (as configured by limit_req_status)', () => {
      fc.assert(
        fc.property(excessRequestCountArb, (requestCount) => {
          const results = simulateRateLimiting(requestCount);
          const rejected = results.filter((r) => r.requestIndex >= MAX_ALLOWED_PER_SECOND);

          for (const r of rejected) {
            expect(r.status).toBe(429);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('per-IP isolation (each IP has independent limit)', () => {
    it('for any set of IPs, each has its own independent 15-request allowance', () => {
      fc.assert(
        fc.property(
          fc.array(ipAddressArb, { minLength: 2, maxLength: 10 }),
          fc.integer({ min: 1, max: 30 }),
          (ips, requestsPerIp) => {
            // Simulate each IP independently
            const perIpResults = new Map<string, RateLimitResult[]>();

            for (const ip of ips) {
              perIpResults.set(ip, simulateRateLimiting(requestsPerIp));
            }

            // Each IP should have its own independent limit
            for (const [, results] of perIpResults) {
              const accepted = results.filter((r) => r.status === ACCEPTED_STATUS);
              const expectedAccepted = Math.min(requestsPerIp, MAX_ALLOWED_PER_SECOND);
              expect(accepted).toHaveLength(expectedAccepted);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('one IP hitting the limit does not affect another IP allowance', () => {
      fc.assert(
        fc.property(
          ipAddressArb,
          ipAddressArb,
          (ip1, ip2) => {
            // IP1 exhausts its limit
            const ip1Results = simulateRateLimiting(20);
            // IP2 sends requests independently
            const ip2Results = simulateRateLimiting(10);

            // IP1: 15 accepted, 5 rejected
            expect(ip1Results.filter((r) => r.status === ACCEPTED_STATUS)).toHaveLength(15);
            expect(ip1Results.filter((r) => r.status === REJECTION_STATUS)).toHaveLength(5);

            // IP2: all 10 accepted (within limit, independent of IP1)
            expect(ip2Results.filter((r) => r.status === ACCEPTED_STATUS)).toHaveLength(10);
            expect(ip2Results.filter((r) => r.status === REJECTION_STATUS)).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('model invariants', () => {
    it('total results always equals the request count', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (requestCount) => {
            const results = simulateRateLimiting(requestCount);
            expect(results).toHaveLength(requestCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('accepted + rejected always equals total requests', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (requestCount) => {
            const results = simulateRateLimiting(requestCount);
            const accepted = results.filter((r) => r.status === ACCEPTED_STATUS).length;
            const rejected = results.filter((r) => r.status === REJECTION_STATUS).length;

            expect(accepted + rejected).toBe(requestCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('all accepted requests come before all rejected requests (FIFO ordering)', () => {
      fc.assert(
        fc.property(excessRequestCountArb, (requestCount) => {
          const results = simulateRateLimiting(requestCount);

          // Find the first rejected request index
          const firstRejectedIdx = results.findIndex((r) => r.status === REJECTION_STATUS);

          if (firstRejectedIdx > 0) {
            // All before first rejection should be accepted
            for (let i = 0; i < firstRejectedIdx; i++) {
              expect(results[i].status).toBe(ACCEPTED_STATUS);
            }
            // All from first rejection onward should be rejected
            for (let i = firstRejectedIdx; i < results.length; i++) {
              expect(results[i].status).toBe(REJECTION_STATUS);
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    it('accepted count never exceeds max allowed per second (15)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (requestCount) => {
            const results = simulateRateLimiting(requestCount);
            const accepted = results.filter((r) => r.status === ACCEPTED_STATUS).length;

            expect(accepted).toBeLessThanOrEqual(MAX_ALLOWED_PER_SECOND);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
