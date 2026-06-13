/**
 * Unit tests for WebSocket authentication-failure handling and HTTP polling
 * fallback transitions.
 *
 * Covers:
 *  - Req 5.2: the `{ type: 'auth', token }` message is sent as the first
 *    post-connect message on open (and nothing is sent when relying on the
 *    cookie session, i.e. a null token).
 *  - Req 5.3: a post-connect auth failure — reported either via an `auth_error`
 *    message OR via an auth-coded close (1008 / 4001 / 4003) — closes the socket,
 *    invokes `onAuthFailure`, and suppresses further reconnection.
 *  - Req 6.1/6.2/6.3: the polling fallback starts when reconnect attempts are
 *    exhausted, keeps delivering notifications while active, and stops once a
 *    WebSocket connection is successfully re-established.
 *
 * `getToken` is async (Requirement 7); the socket is constructed in a microtask
 * after the awaited token resolves, so tests flush with
 * `vi.advanceTimersByTimeAsync(0)` (or the reconnect-delay async advance) before
 * touching `mockWsInstances`.
 *
 * Requirements: 5.2, 5.3, 6.1, 6.2, 6.3
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createWebSocketClient,
  WS_AUTH_CLOSE_CODES,
  MAX_RECONNECT_ATTEMPTS,
  type WebSocketClientConfig,
} from '../websocket-client';
import { errorReporter } from '../../../utils/errorReporter';

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
  closeCalled = false;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.closeCalled = true;
    this.readyState = MockWebSocket.CLOSED;
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: unknown): void {
    const event = new MessageEvent('message', { data: JSON.stringify(data) });
    this.onmessage?.(event);
  }

  simulateClose(code?: number): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', code !== undefined ? { code } : undefined));
  }
}

let mockWsInstances: MockWebSocket[] = [];

const WS_URL = 'ws://localhost:3000/ws';
const HTTP_BASE_URL = 'http://localhost:3000/api';
const POLLING_INTERVAL_MS = 30_000;

/** Flush the awaited per-attempt token so the socket gets constructed. */
function flush(): Promise<void> {
  return vi.advanceTimersByTimeAsync(0);
}

function parseSent(ws: MockWebSocket, type: string): Array<Record<string, unknown>> {
  return ws.sentMessages
    .map((m) => JSON.parse(m) as Record<string, unknown>)
    .filter((m) => m['type'] === type);
}

describe('WebSocket auth-failure handling and polling transitions', () => {
  let onNotification: ReturnType<typeof vi.fn>;
  let onStateChange: ReturnType<typeof vi.fn>;
  let onReconnectionFailed: ReturnType<typeof vi.fn>;
  let onAuthFailure: ReturnType<typeof vi.fn>;
  let config: WebSocketClientConfig;

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

    // Deterministic backoff (Math.random() === 0.5 → zero jitter).
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    // The auth-failure path reports through errorReporter (which would otherwise
    // hit the network). Silence it so tests focus on the client's own behaviour.
    vi.spyOn(errorReporter, 'report').mockImplementation(() => {});

    onNotification = vi.fn();
    onStateChange = vi.fn();
    onReconnectionFailed = vi.fn();
    onAuthFailure = vi.fn();

    config = {
      wsUrl: WS_URL,
      httpBaseUrl: HTTP_BASE_URL,
      getToken: async () => 'jwt-token',
      onNotification,
      onStateChange,
      onReconnectionFailed,
      onAuthFailure,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ─── Req 5.2: auth message on open ──────────────────────────────────────────

  describe('auth message on open (Requirement 5.2)', () => {
    it('sends { type: "auth", token } as the first post-connect message', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      expect(mockWsInstances[0].sentMessages.length).toBeGreaterThanOrEqual(1);
      const firstMsg = JSON.parse(mockWsInstances[0].sentMessages[0]);
      expect(firstMsg.type).toBe('auth');
      expect(firstMsg.token).toBe('jwt-token');

      client.disconnect();
    });

    it('does not send an auth message when relying on the cookie session (null token)', async () => {
      // A null token means "rely on the cookie session" — no connection is opened,
      // so no auth message can be sent.
      config.getToken = async () => null;
      const client = createWebSocketClient(config);
      client.connect();
      await flush();

      expect(mockWsInstances).toHaveLength(0);
      expect(client.getState()).toBe('disconnected');

      client.disconnect();
    });
  });

  // ─── Req 5.3: auth failure via auth_error message ───────────────────────────

  describe('auth failure via auth_error message (Requirement 5.3)', () => {
    it('closes the socket, reports the failure, and invokes onAuthFailure', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      const socket = mockWsInstances[0];
      socket.simulateMessage({ type: 'auth_error', message: 'invalid token' });

      expect(onAuthFailure).toHaveBeenCalledTimes(1);
      expect(socket.closeCalled).toBe(true);
      expect(client.getState()).toBe('disconnected');
      expect(errorReporter.report).toHaveBeenCalledTimes(1);

      client.disconnect();
    });

    it('does not reconnect after an auth_error failure', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      mockWsInstances[0].simulateMessage({ type: 'auth_error', message: 'bad' });

      const countAfterFailure = mockWsInstances.length;
      // Advance well past any backoff window — no new sockets should appear.
      await vi.advanceTimersByTimeAsync(120_000);
      expect(mockWsInstances.length).toBe(countAfterFailure);

      client.disconnect();
    });

    it('invokes onAuthFailure only once even if more auth errors arrive', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      mockWsInstances[0].simulateMessage({ type: 'auth_error', message: 'bad' });
      mockWsInstances[0].simulateMessage({ type: 'auth_error', message: 'bad again' });

      expect(onAuthFailure).toHaveBeenCalledTimes(1);

      client.disconnect();
    });
  });

  // ─── Req 5.3: auth failure via auth-coded close ─────────────────────────────

  describe('auth failure via auth-coded close (Requirement 5.3)', () => {
    for (const code of [...WS_AUTH_CLOSE_CODES]) {
      it(`treats close code ${code} as an auth failure (onAuthFailure, no reconnect)`, async () => {
        const client = createWebSocketClient(config);
        client.connect();
        await flush();
        mockWsInstances[0].simulateOpen();

        mockWsInstances[0].simulateClose(code);

        expect(onAuthFailure).toHaveBeenCalledTimes(1);
        expect(client.getState()).toBe('disconnected');

        // No reconnection is scheduled for an auth-coded close.
        const countAfterFailure = mockWsInstances.length;
        await vi.advanceTimersByTimeAsync(120_000);
        expect(mockWsInstances.length).toBe(countAfterFailure);

        client.disconnect();
      });
    }

    it('does NOT treat a normal close code as an auth failure (reconnects instead)', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      // 1006 (abnormal closure) is not an auth code → schedule a reconnect.
      mockWsInstances[0].simulateClose(1006);

      expect(onAuthFailure).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);
      expect(mockWsInstances).toHaveLength(2);

      client.disconnect();
    });
  });

  // ─── Req 6.1/6.2/6.3: polling fallback transitions ──────────────────────────

  describe('polling fallback transitions (Requirements 6.1, 6.2, 6.3)', () => {
    async function reachFailedState(): Promise<ReturnType<typeof createWebSocketClient>> {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
        const lastIdx = mockWsInstances.length - 1;
        mockWsInstances[lastIdx].simulateClose();
        const baseDelay = 1000 * Math.pow(2, i);
        await vi.advanceTimersByTimeAsync(Math.min(baseDelay, 30_000));
      }
      // Final close exhausts attempts and enters the 'failed' state.
      const lastIdx = mockWsInstances.length - 1;
      mockWsInstances[lastIdx].simulateClose();
      return client;
    }

    it('starts the polling fallback when reconnect attempts are exhausted (Req 6.1)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = await reachFailedState();

      expect(client.getState()).toBe('failed');
      expect(onReconnectionFailed).toHaveBeenCalledTimes(1);

      // Polling begins immediately — flush the awaited token + fetch.
      await flush();
      expect(mockFetch).toHaveBeenCalled();
      const firstUrl = mockFetch.mock.calls[0][0] as string;
      expect(firstUrl).toContain(`${HTTP_BASE_URL}/notifications`);

      client.disconnect();
    });

    it('keeps delivering notifications to the store while polling is active (Req 6.2)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: [
              {
                sequenceId: 7,
                event_type: 'task_assigned',
                description: 'polled',
                related_module: 'tasks',
                date: '2024-01-01',
              },
            ],
          }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = await reachFailedState();

      // First (immediate) poll delivers a notification.
      await flush();
      expect(onNotification).toHaveBeenCalledTimes(1);
      expect(onNotification).toHaveBeenLastCalledWith(
        expect.objectContaining({ description: 'polled' }),
        7
      );

      // A subsequent polling interval continues delivering notifications.
      await vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS);
      expect(onNotification.mock.calls.length).toBeGreaterThanOrEqual(2);
      // The client remains in 'failed' state while polling sustains delivery.
      expect(client.getState()).toBe('failed');

      client.disconnect();
    });

    it('stops the polling fallback once the WebSocket reconnects (Req 6.3)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = await reachFailedState();
      await flush();

      // On the next poll cycle the client also tries to re-establish the socket.
      const countBeforeInterval = mockWsInstances.length;
      await vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS);
      expect(mockWsInstances.length).toBe(countBeforeInterval + 1);

      // Successfully re-open the freshly created socket → polling stops, state
      // transitions back to 'connected' (Req 6.3).
      const newSocket = mockWsInstances[mockWsInstances.length - 1];
      newSocket.simulateOpen();
      expect(client.getState()).toBe('connected');

      // No further polling requests occur after the socket is healthy again.
      const fetchCallsAtReopen = mockFetch.mock.calls.length;
      await vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS * 2);
      expect(mockFetch.mock.calls.length).toBe(fetchCallsAtReopen);

      client.disconnect();
    });
  });
});
