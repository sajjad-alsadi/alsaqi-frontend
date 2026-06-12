/**
 * Property-based tests for the WebSocket client reconnection backoff.
 *
 * Feature: web-production-readiness-remediation, Property 1: Reconnection backoff
 * is bounded, capped, and jittered
 *
 * For any reconnect attempt n (1 ≤ n ≤ MAX_RECONNECT_ATTEMPTS), the delay produced
 * by WebSocketClient.calculateReconnectDelay(n) is non-negative, never exceeds
 * MAX_RECONNECT_DELAY_MS * (1 + JITTER_FACTOR), and its pre-jitter base is
 * monotonically non-decreasing in n and clamped at MAX_RECONNECT_DELAY_MS; and for
 * any run, the client schedules no more than MAX_RECONNECT_ATTEMPTS reconnects
 * before entering the 'failed' state.
 *
 * **Validates: Requirements 3.2**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  WebSocketClient,
  createWebSocketClient,
  INITIAL_RECONNECT_DELAY_MS,
  RECONNECT_MULTIPLIER,
  MAX_RECONNECT_DELAY_MS,
  MAX_RECONNECT_ATTEMPTS,
  JITTER_FACTOR,
  type WebSocketClientConfig,
} from '../websocket-client';

// ─── Mock WebSocket ─────────────────────────────────────────────────────────

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(): void {}

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }
}

let mockWsInstances: MockWebSocket[] = [];

/** The pre-jitter base delay, computed independently from the implementation. */
function baseDelay(attempt: number): number {
  return Math.min(
    INITIAL_RECONNECT_DELAY_MS * Math.pow(RECONNECT_MULTIPLIER, attempt - 1),
    MAX_RECONNECT_DELAY_MS
  );
}

// ─── Property 1a: delay is bounded, non-negative, and capped+jittered ────────

describe('Feature: web-production-readiness-remediation, Property 1: Reconnection backoff is bounded, capped, and jittered', () => {
  const baseConfig: WebSocketClientConfig = {
    wsUrl: 'ws://localhost:3000/ws',
    getToken: () => 'test-token',
    httpBaseUrl: 'http://localhost:3000/api',
  };

  it('calculateReconnectDelay is non-negative and never exceeds the capped+jittered bound for any attempt', () => {
    const upperBound = MAX_RECONNECT_DELAY_MS * (1 + JITTER_FACTOR);
    const client = new WebSocketClient(baseConfig);

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: MAX_RECONNECT_ATTEMPTS }),
        // Random jitter source for applyJitter (Math.random replacement)
        fc.double({ min: 0, max: 1, noNaN: true }),
        (attempt, rand) => {
          const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(rand);
          try {
            const delay = client.calculateReconnectDelay(attempt);
            // Non-negative
            expect(delay).toBeGreaterThanOrEqual(0);
            // Never exceeds MAX_RECONNECT_DELAY_MS * (1 + JITTER_FACTOR)
            expect(delay).toBeLessThanOrEqual(upperBound);
            // Within ±JITTER_FACTOR of the base (rounding tolerance ±1)
            const base = baseDelay(attempt);
            expect(delay).toBeGreaterThanOrEqual(Math.round(base * (1 - JITTER_FACTOR)) - 1);
            expect(delay).toBeLessThanOrEqual(Math.round(base * (1 + JITTER_FACTOR)) + 1);
          } finally {
            randomSpy.mockRestore();
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('pre-jitter base is monotonically non-decreasing in n and clamped at MAX_RECONNECT_DELAY_MS', () => {
    // With Math.random() === 0.5, applyJitter contributes 0, so the returned
    // delay equals the pre-jitter base exactly.
    const client = new WebSocketClient(baseConfig);

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: MAX_RECONNECT_ATTEMPTS - 1 }),
        (attempt) => {
          const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
          try {
            const current = client.calculateReconnectDelay(attempt);
            const next = client.calculateReconnectDelay(attempt + 1);
            // Monotonically non-decreasing
            expect(next).toBeGreaterThanOrEqual(current);
            // Clamped at the cap
            expect(current).toBeLessThanOrEqual(MAX_RECONNECT_DELAY_MS);
            expect(next).toBeLessThanOrEqual(MAX_RECONNECT_DELAY_MS);
            // Matches the independently computed base
            expect(current).toBe(baseDelay(attempt));
          } finally {
            randomSpy.mockRestore();
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  // ─── Property 1b: client schedules ≤ MAX_RECONNECT_ATTEMPTS reconnects ─────

  describe('attempt bound before failed state', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      mockWsInstances = [];
      vi.stubGlobal(
        'WebSocket',
        class extends MockWebSocket {
          constructor(url: string) {
            super(url);
            mockWsInstances.push(this);
          }
          static override CONNECTING = 0;
          static override OPEN = 1;
          static override CLOSING = 2;
          static override CLOSED = 3;
        }
      );
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('schedules no more than MAX_RECONNECT_ATTEMPTS reconnects, then enters failed state', () => {
      fc.assert(
        fc.property(
          // Vary the jitter source so timing varies across runs
          fc.double({ min: 0, max: 1, noNaN: true }),
          (rand) => {
            mockWsInstances = [];
            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(rand);
            const onReconnectionFailed = vi.fn();
            const onStateChange = vi.fn();
            const client = createWebSocketClient({
              wsUrl: 'ws://localhost:3000/ws',
              getToken: () => 'test-token',
              httpBaseUrl: 'http://localhost:3000/api',
              onReconnectionFailed,
              onStateChange,
            });

            try {
              client.connect();
              mockWsInstances[0].simulateOpen();

              // Drive MAX_RECONNECT_ATTEMPTS reconnection cycles
              for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
                const lastIdx = mockWsInstances.length - 1;
                mockWsInstances[lastIdx].simulateClose();
                // Advance well past the maximum possible jittered delay
                vi.advanceTimersByTime(MAX_RECONNECT_DELAY_MS * 2);
              }

              // Final close after attempts are exhausted -> failed state
              const lastIdx = mockWsInstances.length - 1;
              mockWsInstances[lastIdx].simulateClose();

              // Exactly 1 initial + MAX_RECONNECT_ATTEMPTS reconnect sockets
              expect(mockWsInstances.length).toBe(1 + MAX_RECONNECT_ATTEMPTS);
              // No more than MAX_RECONNECT_ATTEMPTS reconnects were scheduled
              expect(mockWsInstances.length - 1).toBeLessThanOrEqual(MAX_RECONNECT_ATTEMPTS);
              // Terminal failed state reached exactly once
              expect(client.getState()).toBe('failed');
              expect(onReconnectionFailed).toHaveBeenCalledTimes(1);

              // No further reconnects after failed state
              const countAtFailure = mockWsInstances.length;
              vi.advanceTimersByTime(MAX_RECONNECT_DELAY_MS * 4);
              expect(mockWsInstances.length).toBe(countAtFailure);
            } finally {
              client.disconnect();
              randomSpy.mockRestore();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
