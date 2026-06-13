/**
 * Property-based tests for WebSocket token URL safety and per-attempt freshness.
 *
 * These tests stub the global `WebSocket` constructor to capture the URL each
 * connection attempt is opened with and to simulate `open`/`close` events that
 * drive the client's reconnection cycle. `getToken` is an async, per-attempt
 * token source (Requirement 7), so fake timers are advanced with the async
 * variants to flush the awaited token fetch before the socket is constructed.
 *
 * Feature: frontend-audit-remediation, Property 6: WebSocket token never appears
 * in the connection URL
 * Feature: frontend-audit-remediation, Property 7: Fresh token fetched per
 * connection attempt
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  createWebSocketClient,
  MAX_RECONNECT_DELAY_MS,
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

  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }
}

let mockWsInstances: MockWebSocket[] = [];

const WS_URL = 'ws://localhost:3000/ws';
const HTTP_BASE_URL = 'http://localhost:3000/api';

/**
 * Wait for the next created socket. `attemptConnection` awaits `getToken()`
 * before constructing the WebSocket, so we advance fake timers asynchronously
 * (which also flushes the awaited microtasks) until a new instance appears.
 */
async function flushPendingConnection(): Promise<void> {
  // Advancing by 0 flushes the pending awaited token fetch for the initial
  // (non-timer) connection attempt; this is a no-op for timer-scheduled ones.
  await vi.advanceTimersByTimeAsync(0);
}

describe('WebSocket authentication: token URL safety and freshness', () => {
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

    // Deterministic backoff delays (Math.random() === 0.5 → zero jitter).
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ─── Property 6 ───────────────────────────────────────────────────────────
  // Feature: frontend-audit-remediation, Property 6: WebSocket token never
  // appears in the connection URL
  //
  // For any WS_Token value, the URL passed to the WebSocket constructor SHALL
  // NOT contain the token string or a `token` query parameter; the token is
  // instead delivered as the first post-connect message.
  // Validates: Requirements 5.1
  describe('Property 6: WebSocket token never appears in the connection URL', () => {
    it('opens the socket with the bare wsUrl and sends the token post-connect', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Non-empty token (an empty/null token skips connection by design).
          fc.string({ minLength: 1, maxLength: 64 }),
          async (token) => {
            mockWsInstances = [];
            const config: WebSocketClientConfig = {
              wsUrl: WS_URL,
              httpBaseUrl: HTTP_BASE_URL,
              getToken: async () => token,
            };
            const client = createWebSocketClient(config);

            client.connect();
            await flushPendingConnection();

            expect(mockWsInstances).toHaveLength(1);
            const openedUrl = mockWsInstances[0].url;

            // The constructed URL is exactly the configured wsUrl — the token
            // was NOT appended as a query parameter or anywhere in the URL.
            expect(openedUrl).toBe(WS_URL);
            expect(openedUrl).not.toContain('token=');
            expect(openedUrl).not.toContain('?');

            // The token is delivered securely as the first post-connect message.
            mockWsInstances[0].simulateOpen();
            expect(mockWsInstances[0].sentMessages).toHaveLength(1);
            const authMsg = JSON.parse(mockWsInstances[0].sentMessages[0]);
            expect(authMsg.type).toBe('auth');
            expect(authMsg.token).toBe(token);

            client.disconnect();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ─── Property 7 ───────────────────────────────────────────────────────────
  // Feature: frontend-audit-remediation, Property 7: Fresh token fetched per
  // connection attempt
  //
  // For any sequence of N connection attempts, the client SHALL invoke getToken
  // exactly N times and SHALL NOT reuse a token across separate attempts.
  // Validates: Requirements 7.1, 7.2
  describe('Property 7: Fresh token fetched per connection attempt', () => {
    it('invokes getToken once per attempt with no token reused across attempts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (extraReconnects) => {
            // Total attempts = 1 initial connect + extraReconnects reconnections.
            const totalAttempts = 1 + extraReconnects;
            mockWsInstances = [];

            let tokenCallCount = 0;
            const issuedTokens: string[] = [];
            const config: WebSocketClientConfig = {
              wsUrl: WS_URL,
              httpBaseUrl: HTTP_BASE_URL,
              // A fresh, unique token per invocation.
              getToken: async () => {
                tokenCallCount += 1;
                const t = `fresh-token-${tokenCallCount}`;
                issuedTokens.push(t);
                return t;
              },
            };
            const client = createWebSocketClient(config);

            // Attempt 1 (initial connect).
            client.connect();
            await flushPendingConnection();

            // Drive `extraReconnects` reconnection cycles: open, capture the
            // auth token sent, then close to schedule the next attempt.
            for (let i = 0; i < extraReconnects; i++) {
              const idx = mockWsInstances.length - 1;
              mockWsInstances[idx].simulateOpen();
              mockWsInstances[idx].simulateClose();
              // Advance past the maximum possible backoff so the reconnect
              // timer fires and its awaited getToken() resolves.
              await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS * 2);
            }

            // Open the final socket so every attempt sends its auth token.
            const lastIdx = mockWsInstances.length - 1;
            mockWsInstances[lastIdx].simulateOpen();

            // getToken was invoked exactly once per connection attempt (7.1).
            expect(tokenCallCount).toBe(totalAttempts);
            expect(mockWsInstances).toHaveLength(totalAttempts);

            // Collect the token actually sent on each opened socket.
            const sentTokens = mockWsInstances.map((ws) => {
              const auth = JSON.parse(ws.sentMessages[0]);
              return auth.token as string;
            });

            // No token is reused across attempts (7.2): all distinct, and each
            // matches the freshly issued token for that attempt.
            expect(new Set(sentTokens).size).toBe(totalAttempts);
            expect(sentTokens).toEqual(issuedTokens);

            client.disconnect();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
