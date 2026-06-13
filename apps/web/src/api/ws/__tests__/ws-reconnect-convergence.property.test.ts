/**
 * Property-based test for WebSocket reconnect convergence.
 *
 * Feature: frontend-production-readiness-10
 * Property 5: Reconnect convergence
 *
 * *For any* WebSocket drop, the client either reconnects within ≤10 backoff
 * attempts (1s→30s with jitter) or enters the `failed` state and starts 30s
 * HTTP polling — it NEVER silently stops delivering notifications.
 *
 * Strategy: generate random drop timings/sequences (a random number of failed
 * reconnect attempts, with or without an eventual successful re-open, and real
 * ±20% jitter on every backoff delay) and assert the client always converges to
 * one of the two delivering terminal states:
 *   - 'connected'  → notifications resume over the WebSocket, or
 *   - 'failed' + active HTTP polling → notifications resume over polling.
 * No generated sequence is allowed to leave the client in a non-delivering
 * (silently-stopped) state.
 *
 * The mock WebSocket + fake-timers pattern mirrors `websocket-client.test.ts`
 * and `ws-auth.property.test.ts`. `getToken` is async (Requirement 7), so the
 * awaited per-attempt token fetch is flushed with the async timer advances
 * before touching `mockWsInstances`.
 *
 * **Validates: Requirements 1.2**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import type { Notification } from '@alsaqi/shared';
import {
  createWebSocketClient,
  MAX_RECONNECT_DELAY_MS,
  MAX_RECONNECT_ATTEMPTS,
  type WebSocketClientConfig,
  type ConnectionState,
} from '../websocket-client';

// Avoid real I/O from the auth-failure error reporter path.
vi.mock('../../../utils/errorReporter', () => ({
  errorReporter: { report: vi.fn() },
}));

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
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }

  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }
}

let mockWsInstances: MockWebSocket[] = [];

const WS_URL = 'ws://localhost:3000/ws';
const HTTP_BASE_URL = 'http://localhost:3000/api';

/** A backoff advance large enough to fire any jittered delay (cap +20%, doubled). */
const ADVANCE_PAST_BACKOFF_MS = MAX_RECONNECT_DELAY_MS * 2;

/** Flush the awaited per-attempt token fetch so the socket gets constructed. */
function flush(): Promise<void> {
  return vi.advanceTimersByTimeAsync(0);
}

/** Index of the most recently created mock socket. */
function lastSocket(): MockWebSocket {
  return mockWsInstances[mockWsInstances.length - 1];
}

const sampleNotification: Notification = {
  id: 1,
  event_type: 'task_assigned',
  description: 'recovered notification',
  related_module: 'tasks',
  date: '2024-01-01',
} as unknown as Notification;

describe('WebSocket reconnect convergence (Property 5)', () => {
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

    // Default fetch stub; the exhaust branch re-stubs with a delivering mock.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [] }) })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Each scenario describes a random drop timing/sequence:
  //  - 'recover': the socket re-opens after `failedReconnects` failed attempts
  //    (0..MAX-1), i.e. it reconnects within the 10-attempt budget.
  //  - 'exhaust': every one of the 10 reconnect attempts fails, driving the
  //    client into the 'failed' state with HTTP polling fallback.
  const scenarioArb = fc.oneof(
    fc.record({
      kind: fc.constant<'recover'>('recover'),
      failedReconnects: fc.integer({ min: 0, max: MAX_RECONNECT_ATTEMPTS - 1 }),
    }),
    fc.record({ kind: fc.constant<'exhaust'>('exhaust') })
  );

  it('always converges to reconnected or polling — never a silent stop', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        mockWsInstances = [];

        const onNotification = vi.fn();
        const onReconnectionFailed = vi.fn();
        const states: ConnectionState[] = [];

        // A delivering polling response so we can prove notification delivery
        // resumes via HTTP polling once the socket has given up.
        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            success: true,
            data: [{ ...sampleNotification, sequenceId: 7 }],
          }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const config: WebSocketClientConfig = {
          wsUrl: WS_URL,
          httpBaseUrl: HTTP_BASE_URL,
          getToken: async () => 'token',
          onNotification,
          onReconnectionFailed,
          onStateChange: (s) => states.push(s),
        };
        const client = createWebSocketClient(config);

        // Establish the initial connection, then drop it (the "drop timing").
        client.connect();
        await flush();
        lastSocket().simulateOpen();
        expect(client.getState()).toBe('connected');
        lastSocket().simulateClose();

        if (scenario.kind === 'recover') {
          // Drive `failedReconnects` failed reconnect attempts (real jitter).
          for (let i = 0; i < scenario.failedReconnects; i++) {
            await vi.advanceTimersByTimeAsync(ADVANCE_PAST_BACKOFF_MS);
            lastSocket().simulateClose();
          }
          // The next backoff attempt succeeds: the socket re-opens.
          await vi.advanceTimersByTimeAsync(ADVANCE_PAST_BACKOFF_MS);
          lastSocket().simulateOpen();

          // CONVERGENCE: reconnected within the 10-attempt budget.
          expect(client.getState()).toBe('connected');
          expect(client.getReconnectAttempts()).toBe(0);
          expect(mockWsInstances.length).toBeLessThanOrEqual(1 + MAX_RECONNECT_ATTEMPTS);

          // Notification delivery resumes over the WebSocket, exactly once.
          lastSocket().simulateMessage({
            type: 'notification',
            payload: sampleNotification,
            sequenceId: 7,
          });
          expect(onNotification).toHaveBeenCalledTimes(1);
          expect(onNotification).toHaveBeenCalledWith(sampleNotification, 7);
        } else {
          // Exhaust all 10 reconnect attempts. After the initial drop close
          // scheduled attempt 1, ten advance→close cycles drive the count to
          // MAX_RECONNECT_ATTEMPTS and the final close trips the failed path.
          for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
            await vi.advanceTimersByTimeAsync(ADVANCE_PAST_BACKOFF_MS);
            lastSocket().simulateClose();
          }

          // CONVERGENCE: failed state with the HTTP polling fallback engaged.
          expect(client.getState()).toBe('failed');
          expect(onReconnectionFailed).toHaveBeenCalledTimes(1);

          // Polling started immediately on entering 'failed' (Requirement 1.2):
          // flush its awaited getToken()+fetch and assert delivery resumes.
          await flush();
          await flush();
          expect(fetchMock).toHaveBeenCalled();
          expect(onNotification).toHaveBeenCalled();

          // Polling keeps delivering on each 30s cycle — not a one-shot.
          const callsAfterFirst = fetchMock.mock.calls.length;
          await vi.advanceTimersByTimeAsync(30_000);
          await flush();
          expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
        }

        // INVARIANT (never a silent stop): the client only ever settled into a
        // delivering terminal state — 'connected' or 'failed'. It is never left
        // 'disconnected' (no socket, no polling) after a drop.
        const terminal = client.getState();
        expect(terminal === 'connected' || terminal === 'failed').toBe(true);

        client.disconnect();
      }),
      { numRuns: 60 }
    );
  });
});
