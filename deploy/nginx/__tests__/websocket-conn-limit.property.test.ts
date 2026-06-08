// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property Test: WebSocket concurrent connection limit (Property 12)
 *
 * Feature: production-readiness-review
 * Property 12: WebSocket concurrent connection limit
 *
 * **Validates: Requirements 4.3, 4.4**
 *
 * The Nginx configuration uses:
 *   limit_conn ws_conn_limit 10;
 *   limit_conn_status 503;
 *
 * Mathematical property:
 * - Any single IP can have at most 10 concurrent WebSocket connections.
 * - The 11th (and subsequent) concurrent connections from the same IP are rejected with HTTP 503.
 * - Connections from different IPs are independent.
 */

// ─── Configuration Constants (from nginx.conf.template) ──────────────────────

const MAX_CONCURRENT_WS_CONNECTIONS_PER_IP = 10;
const CONN_LIMIT_REJECTION_STATUS = 503;
const WS_UPGRADE_SUCCESS_STATUS = 101;

// ─── Connection Limit Model ──────────────────────────────────────────────────

interface ConnectionState {
  /** Map of IP address → number of active concurrent connections */
  activeConnections: Map<string, number>;
}

interface ConnectionAttemptResult {
  ip: string;
  status: number;
  accepted: boolean;
}

/**
 * Models Nginx's limit_conn behavior for WebSocket connections.
 * Determines the response for a new connection attempt from a given IP.
 */
function attemptConnection(state: ConnectionState, ip: string): ConnectionAttemptResult {
  const currentActive = state.activeConnections.get(ip) ?? 0;

  if (currentActive >= MAX_CONCURRENT_WS_CONNECTIONS_PER_IP) {
    // Connection limit exceeded — reject with 503
    return { ip, status: CONN_LIMIT_REJECTION_STATUS, accepted: false };
  }

  // Connection accepted — increment active count
  state.activeConnections.set(ip, currentActive + 1);
  return { ip, status: WS_UPGRADE_SUCCESS_STATUS, accepted: true };
}

/**
 * Models a WebSocket disconnection — releases a connection slot for the IP.
 */
function releaseConnection(state: ConnectionState, ip: string): void {
  const currentActive = state.activeConnections.get(ip) ?? 0;
  if (currentActive > 0) {
    state.activeConnections.set(ip, currentActive - 1);
  }
}

/**
 * Creates a fresh connection state (no active connections).
 */
function createState(): ConnectionState {
  return { activeConnections: new Map() };
}

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/**
 * Generates a valid IPv4 address string.
 */
const ipAddressArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: 1, max: 254 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 1, max: 254 })
  )
  .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

/**
 * Generates a count of connections to attempt (more than the limit).
 */
const excessConnectionCountArb: fc.Arbitrary<number> = fc.integer({
  min: MAX_CONCURRENT_WS_CONNECTIONS_PER_IP + 1,
  max: 30,
});

/**
 * Generates a count of connections at or below the limit.
 */
const withinLimitConnectionCountArb: fc.Arbitrary<number> = fc.integer({
  min: 1,
  max: MAX_CONCURRENT_WS_CONNECTIONS_PER_IP,
});

/**
 * Generates multiple distinct IP addresses (for isolation testing).
 */
const multipleIpsArb: fc.Arbitrary<string[]> = fc
  .uniqueArray(ipAddressArb, { minLength: 2, maxLength: 5 })
  .filter((ips) => ips.length >= 2);

// ─── Stateful Action Model ───────────────────────────────────────────────────

type Action = { type: 'connect'; ip: string } | { type: 'disconnect'; ip: string };

/**
 * Generates a sequence of connect/disconnect actions for a single IP.
 */
function actionsForIpArb(ip: string): fc.Arbitrary<Action[]> {
  return fc
    .array(
      fc.oneof(
        fc.constant({ type: 'connect' as const, ip }),
        fc.constant({ type: 'disconnect' as const, ip })
      ),
      { minLength: 5, maxLength: 40 }
    );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 12: WebSocket concurrent connection limit', () => {
  describe('connections beyond limit are rejected with 503', () => {
    it('for any IP with 10 active connections, the 11th attempt is rejected with 503', () => {
      fc.assert(
        fc.property(ipAddressArb, (ip) => {
          const state = createState();

          // Establish exactly 10 connections (the maximum)
          for (let i = 0; i < MAX_CONCURRENT_WS_CONNECTIONS_PER_IP; i++) {
            const result = attemptConnection(state, ip);
            expect(result.accepted).toBe(true);
            expect(result.status).toBe(WS_UPGRADE_SUCCESS_STATUS);
          }

          // The 11th connection should be rejected
          const rejected = attemptConnection(state, ip);
          expect(rejected.accepted).toBe(false);
          expect(rejected.status).toBe(CONN_LIMIT_REJECTION_STATUS);
        }),
        { numRuns: 100 }
      );
    });

    it('for any IP attempting N > 10 connections, exactly N - 10 are rejected', () => {
      fc.assert(
        fc.property(ipAddressArb, excessConnectionCountArb, (ip, totalAttempts) => {
          const state = createState();
          let accepted = 0;
          let rejected = 0;

          for (let i = 0; i < totalAttempts; i++) {
            const result = attemptConnection(state, ip);
            if (result.accepted) {
              accepted++;
            } else {
              rejected++;
              expect(result.status).toBe(CONN_LIMIT_REJECTION_STATUS);
            }
          }

          expect(accepted).toBe(MAX_CONCURRENT_WS_CONNECTIONS_PER_IP);
          expect(rejected).toBe(totalAttempts - MAX_CONCURRENT_WS_CONNECTIONS_PER_IP);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('connections within limit are always accepted', () => {
    it('for any IP with fewer than 10 connections, new attempts succeed with 101', () => {
      fc.assert(
        fc.property(ipAddressArb, withinLimitConnectionCountArb, (ip, count) => {
          const state = createState();

          for (let i = 0; i < count; i++) {
            const result = attemptConnection(state, ip);
            expect(result.accepted).toBe(true);
            expect(result.status).toBe(WS_UPGRADE_SUCCESS_STATUS);
          }

          // Verify the active count matches
          expect(state.activeConnections.get(ip)).toBe(count);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('releasing connections allows new ones', () => {
    it('after disconnecting from a full pool, the next connection is accepted', () => {
      fc.assert(
        fc.property(ipAddressArb, (ip) => {
          const state = createState();

          // Fill to capacity
          for (let i = 0; i < MAX_CONCURRENT_WS_CONNECTIONS_PER_IP; i++) {
            attemptConnection(state, ip);
          }

          // Verify at capacity — next attempt rejected
          const rejectedBefore = attemptConnection(state, ip);
          expect(rejectedBefore.accepted).toBe(false);
          expect(rejectedBefore.status).toBe(CONN_LIMIT_REJECTION_STATUS);

          // Release one connection
          releaseConnection(state, ip);

          // Now a new connection should be accepted
          const acceptedAfter = attemptConnection(state, ip);
          expect(acceptedAfter.accepted).toBe(true);
          expect(acceptedAfter.status).toBe(WS_UPGRADE_SUCCESS_STATUS);
        }),
        { numRuns: 100 }
      );
    });

    it('releasing K connections from a full pool allows exactly K new connections', () => {
      fc.assert(
        fc.property(
          ipAddressArb,
          fc.integer({ min: 1, max: MAX_CONCURRENT_WS_CONNECTIONS_PER_IP }),
          (ip, releaseCount) => {
            const state = createState();

            // Fill to capacity
            for (let i = 0; i < MAX_CONCURRENT_WS_CONNECTIONS_PER_IP; i++) {
              attemptConnection(state, ip);
            }

            // Release K connections
            for (let i = 0; i < releaseCount; i++) {
              releaseConnection(state, ip);
            }

            // Exactly K new connections should succeed
            let accepted = 0;
            for (let i = 0; i < releaseCount + 1; i++) {
              const result = attemptConnection(state, ip);
              if (result.accepted) accepted++;
            }

            expect(accepted).toBe(releaseCount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('IP isolation — connections from different IPs are independent', () => {
    it('each IP has its own independent connection pool of 10', () => {
      fc.assert(
        fc.property(multipleIpsArb, (ips) => {
          const state = createState();

          // Fill all IPs to capacity
          for (const ip of ips) {
            for (let i = 0; i < MAX_CONCURRENT_WS_CONNECTIONS_PER_IP; i++) {
              const result = attemptConnection(state, ip);
              expect(result.accepted).toBe(true);
            }
          }

          // Verify each IP is at capacity independently
          for (const ip of ips) {
            expect(state.activeConnections.get(ip)).toBe(MAX_CONCURRENT_WS_CONNECTIONS_PER_IP);
          }

          // Each IP's 11th connection should be rejected independently
          for (const ip of ips) {
            const result = attemptConnection(state, ip);
            expect(result.accepted).toBe(false);
            expect(result.status).toBe(CONN_LIMIT_REJECTION_STATUS);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('releasing a connection from one IP does not affect another IP\'s limit', () => {
      fc.assert(
        fc.property(multipleIpsArb, (ips) => {
          const state = createState();
          const [ip1, ip2] = ips;

          // Fill both IPs to capacity
          for (let i = 0; i < MAX_CONCURRENT_WS_CONNECTIONS_PER_IP; i++) {
            attemptConnection(state, ip1);
            attemptConnection(state, ip2);
          }

          // Release a connection from ip1
          releaseConnection(state, ip1);

          // ip1 can now accept one more
          const resultIp1 = attemptConnection(state, ip1);
          expect(resultIp1.accepted).toBe(true);

          // ip2 should still be at capacity — rejected
          const resultIp2 = attemptConnection(state, ip2);
          expect(resultIp2.accepted).toBe(false);
          expect(resultIp2.status).toBe(CONN_LIMIT_REJECTION_STATUS);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('stateful model: invariant holds across arbitrary action sequences', () => {
    it('active connections for any IP never exceed the limit regardless of action order', () => {
      fc.assert(
        fc.property(ipAddressArb, actionsForIpArb('test-ip'), (_, actions) => {
          const state = createState();
          const ip = 'test-ip';

          for (const action of actions) {
            if (action.type === 'connect') {
              attemptConnection(state, ip);
            } else {
              releaseConnection(state, ip);
            }

            // Invariant: active connections never exceed the limit
            const active = state.activeConnections.get(ip) ?? 0;
            expect(active).toBeLessThanOrEqual(MAX_CONCURRENT_WS_CONNECTIONS_PER_IP);
            expect(active).toBeGreaterThanOrEqual(0);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('boundary behavior', () => {
    it('exactly 10 connections is the maximum allowed (not 9 or 11)', () => {
      expect(MAX_CONCURRENT_WS_CONNECTIONS_PER_IP).toBe(10);
    });

    it('rejection status is always 503 (Service Unavailable)', () => {
      expect(CONN_LIMIT_REJECTION_STATUS).toBe(503);
    });

    it('the limit matches the Nginx config: limit_conn ws_conn_limit 10', () => {
      // Documenting that the property test threshold matches the configured value
      // from deploy/nginx/nginx.conf.template: limit_conn ws_conn_limit 10;
      const state = createState();
      const ip = '192.168.1.1';

      // Connection 10 is accepted
      for (let i = 0; i < 10; i++) {
        const result = attemptConnection(state, ip);
        expect(result.accepted).toBe(true);
      }

      // Connection 11 is rejected with 503
      const result = attemptConnection(state, ip);
      expect(result.accepted).toBe(false);
      expect(result.status).toBe(503);
    });
  });
});
