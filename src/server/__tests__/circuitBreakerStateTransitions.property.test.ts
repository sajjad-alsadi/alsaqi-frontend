// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// Use vi.hoisted to create mock references
const { mockPrepare } = vi.hoisted(() => ({
  mockPrepare: vi.fn(),
}));

// Mock the database module
vi.mock('../db/index', () => ({
  db: {
    prepare: mockPrepare,
  },
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock axios
vi.mock('axios', () => {
  const mockAxios: any = {
    post: vi.fn(),
    get: vi.fn(),
    isAxiosError: vi.fn((err: any) => err?.isAxiosError === true),
  };
  return { default: mockAxios };
});

import { CircuitBreaker, CircuitState } from '../services/CircuitBreaker';
import axios from 'axios';

/**
 * Property Test: Circuit Breaker State Transitions (Property 17)
 *
 * Feature: api-audit-improvements
 * Property 17: Circuit Breaker State Transitions
 *
 * **Validates: Requirements 17.2, 17.3**
 *
 * For any sequence of consecutive external service failures reaching the threshold (5),
 * the circuit breaker SHALL transition to open state and prevent further calls.
 * While open, failed events SHALL be stored in the dead letter queue.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Creates a network error that simulates an external service failure */
function createNetworkError(message: string = 'Connection refused'): Error {
  const error = new Error(message);
  (error as any).isAxiosError = true;
  (error as any).code = 'ECONNREFUSED';
  return error;
}

/**
 * Creates a circuit breaker with minimal backoff for fast testing.
 * Uses maxRetries=1 so each call() counts as one failure attempt quickly.
 */
function createTestBreaker(overrides: Partial<{
  failureThreshold: number;
  failureWindowMs: number;
  maxRetries: number;
  initialBackoffMs: number;
}> = {}): CircuitBreaker {
  return new CircuitBreaker('http://test-service.local/webhook', {}, {
    maxRetries: overrides.maxRetries ?? 1,
    initialBackoffMs: overrides.initialBackoffMs ?? 1, // 1ms backoff for speed
    failureThreshold: overrides.failureThreshold ?? 5,
    failureWindowMs: overrides.failureWindowMs ?? 60000,
    healthProbeIntervalMs: 999999, // Prevent auto health probes during tests
    healthProbeTimeoutMs: 5000,
    requestTimeoutMs: 5000,
  });
}

/**
 * Forces the circuit breaker open by calling it with failures.
 * Uses real timers (no fake timers needed since backoff is 1ms).
 */
async function forceCircuitOpen(breaker: CircuitBreaker): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await breaker.call(`setup_${i}`, { index: i });
  }
}

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates a valid event type string (lowercase letters and underscores) */
const eventTypeArb = fc.stringMatching(/^[a-z_]{1,20}$/);

/** Generates a valid event payload */
const payloadArb = fc.oneof(
  fc.record({ id: fc.uuid(), action: fc.string() }),
  fc.record({ userId: fc.string(), data: fc.string() }),
  fc.record({ key: fc.string(), value: fc.integer() })
);

/** Generates a failure count that is at least the threshold (5) */
const atLeastThresholdArb = fc.integer({ min: 5, max: 15 });

/** Generates a failure count below the threshold */
const belowThresholdArb = fc.integer({ min: 1, max: 4 });

/** Generates a list of events to send while circuit is open */
const openCircuitEventsArb = fc.array(
  fc.record({ eventType: eventTypeArb, payload: payloadArb }),
  { minLength: 1, maxLength: 8 }
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 17: Circuit Breaker State Transitions', () => {
  let mockRun: ReturnType<typeof vi.fn>;
  let dlqEntries: Array<{ eventType: string; payload: string; reason: string }>;

  beforeEach(() => {
    vi.clearAllMocks();
    dlqEntries = [];

    mockRun = vi.fn().mockImplementation((eventType: string, payload: string, reason: string) => {
      dlqEntries.push({ eventType, payload, reason });
      return Promise.resolve({ lastInsertRowid: 1, changes: 1 });
    });
    mockPrepare.mockReturnValue({ run: mockRun });

    // Default: all HTTP calls fail with network error
    const networkError = createNetworkError();
    (axios.isAxiosError as any).mockReturnValue(true);
    (axios.post as any).mockRejectedValue(networkError);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Circuit opens after 5 consecutive failures (Requirement 17.2)', () => {
    it('for any number of failures >= threshold, circuit transitions to OPEN', async () => {
      await fc.assert(
        fc.asyncProperty(atLeastThresholdArb, async (failureCount) => {
          const breaker = createTestBreaker();

          try {
            for (let i = 0; i < failureCount; i++) {
              await breaker.call(`event_${i}`, { index: i });

              // Once we hit threshold (5th failure), circuit should be open
              if (i >= 4) {
                expect(breaker.state).toBe(CircuitState.OPEN);
              }
            }

            // Final state must be OPEN
            expect(breaker.state).toBe(CircuitState.OPEN);
          } finally {
            breaker.destroy();
          }
        }),
        { numRuns: 50 }
      );
    });

    it('for any number of failures < threshold, circuit remains CLOSED', async () => {
      await fc.assert(
        fc.asyncProperty(belowThresholdArb, async (failureCount) => {
          const breaker = createTestBreaker();

          try {
            for (let i = 0; i < failureCount; i++) {
              await breaker.call(`event_${i}`, { index: i });
            }

            // Circuit should still be CLOSED
            expect(breaker.state).toBe(CircuitState.CLOSED);
          } finally {
            breaker.destroy();
          }
        }),
        { numRuns: 50 }
      );
    });

    it('exactly 5 consecutive failures transitions from CLOSED to OPEN', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(eventTypeArb, { minLength: 5, maxLength: 5 }),
          async (eventTypes) => {
            const breaker = createTestBreaker();

            try {
              // After 4 failures, still CLOSED
              for (let i = 0; i < 4; i++) {
                await breaker.call(eventTypes[i], { step: i });
              }
              expect(breaker.state).toBe(CircuitState.CLOSED);
              expect(breaker.consecutiveFailures).toBe(4);

              // 5th failure opens the circuit
              await breaker.call(eventTypes[4], { step: 4 });
              expect(breaker.state).toBe(CircuitState.OPEN);
            } finally {
              breaker.destroy();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('a success resets the failure counter, preventing circuit from opening', async () => {
      await fc.assert(
        fc.asyncProperty(
          belowThresholdArb,
          eventTypeArb,
          async (failuresBeforeSuccess, successEvent) => {
            const breaker = createTestBreaker();

            try {
              // Accumulate some failures (below threshold)
              for (let i = 0; i < failuresBeforeSuccess; i++) {
                await breaker.call(`fail_${i}`, {});
              }
              expect(breaker.state).toBe(CircuitState.CLOSED);
              expect(breaker.consecutiveFailures).toBe(failuresBeforeSuccess);

              // Now succeed - this resets the counter
              (axios.post as any).mockResolvedValueOnce({ status: 200, data: {} });
              const result = await breaker.call(successEvent, {});
              expect(result).toBe(true);
              expect(breaker.consecutiveFailures).toBe(0);

              // Re-enable failures for subsequent calls
              (axios.post as any).mockRejectedValue(createNetworkError());

              // Now we need another full threshold of failures to open
              for (let i = 0; i < 4; i++) {
                await breaker.call(`after_${i}`, {});
              }
              // Still CLOSED because we only have 4 failures after the reset
              expect(breaker.state).toBe(CircuitState.CLOSED);
              expect(breaker.consecutiveFailures).toBe(4);
            } finally {
              breaker.destroy();
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Open circuit stores events in dead letter queue (Requirement 17.3)', () => {
    it('while open, any event is stored in DLQ without making HTTP calls', async () => {
      await fc.assert(
        fc.asyncProperty(openCircuitEventsArb, async (events) => {
          const breaker = createTestBreaker();

          try {
            // Open the circuit with 5 failures
            await forceCircuitOpen(breaker);
            expect(breaker.state).toBe(CircuitState.OPEN);

            // Clear mocks to track only new calls
            (axios.post as any).mockClear();
            dlqEntries = [];

            // Send events while circuit is open
            for (const event of events) {
              const result = await breaker.call(event.eventType, event.payload);
              expect(result).toBe(false); // Should return false (not sent)
            }

            // No HTTP calls should have been made
            expect(axios.post).not.toHaveBeenCalled();

            // All events should be stored in DLQ
            expect(dlqEntries.length).toBe(events.length);

            // Each DLQ entry should have the correct event type and reason
            for (let i = 0; i < events.length; i++) {
              expect(dlqEntries[i].eventType).toBe(events[i].eventType);
              expect(dlqEntries[i].reason).toBe('Circuit breaker is open');
            }
          } finally {
            breaker.destroy();
          }
        }),
        { numRuns: 50 }
      );
    });

    it('DLQ entries contain serialized payload matching the original event data', async () => {
      await fc.assert(
        fc.asyncProperty(eventTypeArb, payloadArb, async (eventType, payload) => {
          const breaker = createTestBreaker();

          try {
            // Open the circuit
            await forceCircuitOpen(breaker);
            expect(breaker.state).toBe(CircuitState.OPEN);

            // Clear and track
            dlqEntries = [];

            // Send event while open
            await breaker.call(eventType, payload);

            // Verify DLQ entry payload matches
            expect(dlqEntries.length).toBe(1);
            expect(dlqEntries[0].eventType).toBe(eventType);
            expect(JSON.parse(dlqEntries[0].payload)).toEqual(payload);
          } finally {
            breaker.destroy();
          }
        }),
        { numRuns: 100 }
      );
    });

    it('open circuit returns false for all calls and remains open', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({ eventType: eventTypeArb, payload: payloadArb }),
            { minLength: 1, maxLength: 10 }
          ),
          async (events) => {
            const breaker = createTestBreaker();

            try {
              // Open the circuit
              await forceCircuitOpen(breaker);
              expect(breaker.state).toBe(CircuitState.OPEN);

              // All calls while open should return false
              for (const event of events) {
                const result = await breaker.call(event.eventType, event.payload);
                expect(result).toBe(false);
              }

              // Circuit remains open throughout
              expect(breaker.state).toBe(CircuitState.OPEN);
            } finally {
              breaker.destroy();
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('State transition invariants', () => {
    it('circuit state is always one of CLOSED, OPEN, or HALF_OPEN', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 8 }),
          async (numCalls) => {
            const breaker = createTestBreaker();

            try {
              for (let i = 0; i < numCalls; i++) {
                await breaker.call(`event_${i}`, {});

                expect([CircuitState.CLOSED, CircuitState.OPEN, CircuitState.HALF_OPEN]).toContain(
                  breaker.state
                );
              }
            } finally {
              breaker.destroy();
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('consecutive failure count never exceeds the threshold while circuit is closed', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (numCalls) => {
            const breaker = createTestBreaker();

            try {
              for (let i = 0; i < numCalls; i++) {
                await breaker.call(`event_${i}`, {});

                if (breaker.state === CircuitState.CLOSED) {
                  // While closed, failures must be below threshold
                  expect(breaker.consecutiveFailures).toBeLessThan(5);
                }
              }
            } finally {
              breaker.destroy();
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
