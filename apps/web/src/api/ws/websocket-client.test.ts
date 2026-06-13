/**
 * Unit tests for the WebSocket client with reconnection and polling fallback.
 * Tests exponential backoff with jitter, max 10 reconnection attempts,
 * 'failed' state after exhaustion, missed notification sync with 30-min window,
 * and connection state transitions.
 *
 * NOTE: `getToken` is async (Requirement 7) and `attemptConnection` awaits it
 * before constructing the socket, so the socket is created in a microtask. Tests
 * use fake timers and flush the awaited token with `vi.advanceTimersByTimeAsync(0)`
 * (or the reconnect-delay async advance) before touching `mockWsInstances`.
 *
 * Requirements: 3.2, 3.3, 3.4, 9.2, 9.3, 9.4, 9.5
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WebSocketClient,
  createWebSocketClient,
  type WebSocketClientConfig,
} from './websocket-client';
import type { Notification } from '@alsaqi/shared';

// Mock the error reporter so an auth-failure report never performs real I/O.
vi.mock('../../utils/errorReporter', () => ({
  errorReporter: { report: vi.fn() },
}));

// ─── Mock WebSocket ───────────────────────────────────────────────────────────

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

  // Test helpers
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

  simulateError(): void {
    this.onerror?.(new Event('error'));
  }
}

// Store references to created WebSocket instances for test assertions
let mockWsInstances: MockWebSocket[] = [];

/** Flush the awaited per-attempt token fetch so the socket gets constructed. */
function flush(): Promise<void> {
  return vi.advanceTimersByTimeAsync(0);
}

/** Parse the messages a socket has sent and return only those of a given type. */
function sentOfType(ws: MockWebSocket, type: string): Array<Record<string, unknown>> {
  return ws.sentMessages
    .map((m) => JSON.parse(m) as Record<string, unknown>)
    .filter((m) => m['type'] === type);
}

// ─── Test Setup ───────────────────────────────────────────────────────────────

describe('WebSocketClient', () => {
  let config: WebSocketClientConfig;
  let onNotification: ((notification: Notification, sequenceId: number) => void) | undefined;
  let onStateChange: ReturnType<typeof vi.fn>;
  let onReconnectionFailed: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWsInstances = [];

    // Mock global WebSocket
    vi.stubGlobal('WebSocket', class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        mockWsInstances.push(this);
      }

      static override CONNECTING = 0;
      static override OPEN = 1;
      static override CLOSING = 2;
      static override CLOSED = 3;
    });

    // Mock fetch for polling
    vi.stubGlobal('fetch', vi.fn());

    onNotification = vi.fn();
    onStateChange = vi.fn();
    onReconnectionFailed = vi.fn();

    config = {
      wsUrl: 'ws://localhost:3000/ws',
      getToken: async () => 'test-jwt-token',
      httpBaseUrl: 'http://localhost:3000/api',
      onNotification,
      onStateChange,
      onReconnectionFailed,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ─── Connection ─────────────────────────────────────────────────────────────

  describe('Connection', () => {
    it('should connect to the WebSocket server using the bare wsUrl (no token in URL)', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();

      expect(mockWsInstances).toHaveLength(1);
      expect(mockWsInstances[0].url).toBe('ws://localhost:3000/ws');
    });

    it('should never place the token in the connection URL', async () => {
      config.getToken = async () => 'token with spaces&special=chars';
      const client = createWebSocketClient(config);
      client.connect();
      await flush();

      expect(mockWsInstances[0].url).toBe('ws://localhost:3000/ws');
      expect(mockWsInstances[0].url).not.toContain('token');
      expect(mockWsInstances[0].url).not.toContain('?');
    });

    it('should set state to connected on successful WebSocket open', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      expect(client.getState()).toBe('connected');
      expect(onStateChange).toHaveBeenCalledWith('connected');
    });

    it('should not connect if token is null', async () => {
      config.getToken = async () => null;
      const client = createWebSocketClient(config);
      client.connect();
      await flush();

      expect(mockWsInstances).toHaveLength(0);
      expect(client.getState()).toBe('disconnected');
    });

    it('should set state to disconnected when disconnect is called', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      client.disconnect();

      expect(client.getState()).toBe('disconnected');
      expect(onStateChange).toHaveBeenCalledWith('disconnected');
    });
  });

  // ─── Notification Handling ──────────────────────────────────────────────────

  describe('Notification Handling', () => {
    it('should emit notification on valid message', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      const notification = {
        id: 1,
        event_type: 'task_assigned',
        description: 'New task',
        related_module: 'tasks',
        date: '2024-01-01',
      };

      mockWsInstances[0].simulateMessage({
        type: 'notification',
        payload: notification,
        sequenceId: 42,
      });

      expect(onNotification).toHaveBeenCalledWith(notification, 42);
    });

    it('should update lastSequenceId on notification', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      mockWsInstances[0].simulateMessage({
        type: 'notification',
        payload: { event_type: 'test', description: 'x', related_module: 'm', date: 'd' },
        sequenceId: 10,
      });

      expect(client.getLastSequenceId()).toBe(10);
    });

    it('should track lastMessageTimestamp on notification', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      const before = Date.now();
      mockWsInstances[0].simulateMessage({
        type: 'notification',
        payload: { event_type: 'test', description: 'x', related_module: 'm', date: 'd' },
        sequenceId: 10,
      });
      const after = Date.now();

      const timestamp = client.getLastMessageTimestamp();
      expect(timestamp).not.toBeNull();
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should not decrease lastSequenceId for older notifications', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      mockWsInstances[0].simulateMessage({
        type: 'notification',
        payload: { event_type: 'test', description: 'x', related_module: 'm', date: 'd' },
        sequenceId: 10,
      });

      mockWsInstances[0].simulateMessage({
        type: 'notification',
        payload: { event_type: 'test', description: 'x', related_module: 'm', date: 'd' },
        sequenceId: 5,
      });

      expect(client.getLastSequenceId()).toBe(10);
    });

    it('should ignore malformed messages', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      // Message without type
      mockWsInstances[0].simulateMessage({ something: 'else' });
      // Message with wrong type
      mockWsInstances[0].simulateMessage({ type: 'ping' });

      expect(onNotification).not.toHaveBeenCalled();
    });
  });

  // ─── Reconnection with Exponential Backoff ──────────────────────────────────

  describe('Reconnection (Requirement 3.2)', () => {
    it('should attempt reconnection on disconnect', async () => {
      // Mock Math.random to return 0.5 (no jitter effect)
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();
      mockWsInstances[0].simulateClose();

      // Should schedule reconnection — advance 1s for first attempt (base delay)
      await vi.advanceTimersByTimeAsync(1000);

      // A new WebSocket instance should have been created
      expect(mockWsInstances).toHaveLength(2);
    });

    it('should use exponential backoff base delays capped at 30s', () => {
      // Mock Math.random to return 0.5 (no jitter effect, since (2*0.5-1) = 0)
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const client = new WebSocketClient(config);

      // Base delays: 1s, 2s, 4s, 8s, 16s, 30s (capped), 30s, 30s, 30s, 30s
      expect(client.calculateReconnectDelay(1)).toBe(1000);
      expect(client.calculateReconnectDelay(2)).toBe(2000);
      expect(client.calculateReconnectDelay(3)).toBe(4000);
      expect(client.calculateReconnectDelay(4)).toBe(8000);
      expect(client.calculateReconnectDelay(5)).toBe(16000);
      expect(client.calculateReconnectDelay(6)).toBe(30000); // capped
      expect(client.calculateReconnectDelay(7)).toBe(30000);
      expect(client.calculateReconnectDelay(8)).toBe(30000);
      expect(client.calculateReconnectDelay(9)).toBe(30000);
      expect(client.calculateReconnectDelay(10)).toBe(30000);
    });

    it('should apply ±20% jitter to backoff delays', () => {
      const client = new WebSocketClient(config);

      // Math.random() = 0 → jitter = delay * 0.2 * (2*0 - 1) = -0.2*delay
      vi.spyOn(Math, 'random').mockReturnValue(0);
      expect(client.calculateReconnectDelay(1)).toBe(800); // 1000 - 200

      // Math.random() = 1 → jitter = delay * 0.2 * (2*1 - 1) = +0.2*delay
      vi.spyOn(Math, 'random').mockReturnValue(1);
      expect(client.calculateReconnectDelay(1)).toBe(1200); // 1000 + 200

      // Math.random() = 0.5 → jitter = delay * 0.2 * (2*0.5 - 1) = 0
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      expect(client.calculateReconnectDelay(1)).toBe(1000); // no jitter
    });

    it('should apply jitter within ±20% range for capped delays', () => {
      const client = new WebSocketClient(config);

      // At attempt 6+ the base is capped at 30000ms
      // Min jitter: 30000 - 6000 = 24000
      vi.spyOn(Math, 'random').mockReturnValue(0);
      expect(client.calculateReconnectDelay(6)).toBe(24000);

      // Max jitter: 30000 + 6000 = 36000
      vi.spyOn(Math, 'random').mockReturnValue(1);
      expect(client.calculateReconnectDelay(6)).toBe(36000);
    });

    it('should enter failed state after 10 reconnection attempts (Requirement 3.3)', async () => {
      // Use no jitter for predictable timing
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      // Simulate 10 failed reconnections
      for (let i = 0; i < 10; i++) {
        const lastIdx = mockWsInstances.length - 1;
        mockWsInstances[lastIdx].simulateClose();

        // Advance past the reconnect delay (also flushes the awaited token)
        const baseDelay = 1000 * Math.pow(2, i);
        await vi.advanceTimersByTimeAsync(Math.min(baseDelay, 30000));
      }

      // After the 10th attempt fails
      const lastIdx = mockWsInstances.length - 1;
      mockWsInstances[lastIdx].simulateClose();

      // Should now be in failed mode (Requirement 3.3)
      expect(client.getState()).toBe('failed');
      expect(onStateChange).toHaveBeenCalledWith('failed');
      expect(onReconnectionFailed).toHaveBeenCalledTimes(1);
    });

    it('should reset reconnect counter on successful connection', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();
      mockWsInstances[0].simulateClose();

      // First reconnect attempt
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockWsInstances).toHaveLength(2);

      // Success!
      mockWsInstances[1].simulateOpen();
      expect(client.getState()).toBe('connected');
      expect(client.getReconnectAttempts()).toBe(0);

      // Disconnect again
      mockWsInstances[1].simulateClose();

      // Should start fresh with 1s delay (not 2s)
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockWsInstances).toHaveLength(3);
    });

    it('should track disconnectedAt timestamp on first close', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      expect(client.getDisconnectedAt()).toBeNull();

      const before = Date.now();
      mockWsInstances[0].simulateClose();
      const after = Date.now();

      expect(client.getDisconnectedAt()).toBeGreaterThanOrEqual(before);
      expect(client.getDisconnectedAt()).toBeLessThanOrEqual(after);
    });

    it('should clear disconnectedAt on successful reconnection', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();
      mockWsInstances[0].simulateClose();

      expect(client.getDisconnectedAt()).not.toBeNull();

      await vi.advanceTimersByTimeAsync(1000);
      mockWsInstances[1].simulateOpen();

      expect(client.getDisconnectedAt()).toBeNull();
    });
  });

  // ─── Failed State (Requirement 3.3) ────────────────────────────────────────

  describe('Failed State (Requirement 3.3)', () => {
    async function exhaustReconnectionAttempts(client: WebSocketClient): Promise<void> {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      // Exhaust all 10 reconnection attempts
      for (let i = 0; i < 10; i++) {
        const lastIdx = mockWsInstances.length - 1;
        mockWsInstances[lastIdx].simulateClose();
        const baseDelay = 1000 * Math.pow(2, i);
        await vi.advanceTimersByTimeAsync(Math.min(baseDelay, 30000));
      }

      // Final close triggers failed mode
      const lastIdx = mockWsInstances.length - 1;
      mockWsInstances[lastIdx].simulateClose();
    }

    it('should display failed state after all reconnection attempts exhausted', async () => {
      const client = createWebSocketClient(config);
      await exhaustReconnectionAttempts(client);

      expect(client.getState()).toBe('failed');
      expect(onStateChange).toHaveBeenCalledWith('failed');
    });

    it('should call onReconnectionFailed callback when all attempts exhausted', async () => {
      const client = createWebSocketClient(config);
      await exhaustReconnectionAttempts(client);

      expect(onReconnectionFailed).toHaveBeenCalledTimes(1);
    });

    it('should not attempt further WebSocket reconnections (only polling-driven) after entering failed state', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createWebSocketClient(config);
      await exhaustReconnectionAttempts(client);

      const instanceCount = mockWsInstances.length;

      // Within a single polling interval there are no extra socket attempts.
      await vi.advanceTimersByTimeAsync(29000);
      expect(mockWsInstances.length).toBe(instanceCount);
    });
  });

  // ─── HTTP Polling Fallback ──────────────────────────────────────────────────

  describe('HTTP Polling Fallback (Requirement 9.3)', () => {
    it('should remain connected and not poll while the socket is healthy', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      expect(client.getState()).toBe('connected');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should track lastSequenceId used by the polling request URL', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      // Receive a notification to set lastSequenceId
      mockWsInstances[0].simulateMessage({
        type: 'notification',
        payload: { event_type: 'test', description: 'x', related_module: 'm', date: 'd' },
        sequenceId: 50,
      });

      expect(client.getLastSequenceId()).toBe(50);
    });
  });

  // ─── Missed Notification Sync (Requirement 3.4) ─────────────────────────────

  describe('Missed Notification Sync (Requirement 3.4)', () => {
    it('should send sync request on reconnection with last sequence ID', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      // Receive a notification to set lastSequenceId
      mockWsInstances[0].simulateMessage({
        type: 'notification',
        payload: { event_type: 'test', description: 'x', related_module: 'm', date: 'd' },
        sequenceId: 25,
      });

      // Disconnect and reconnect
      mockWsInstances[0].simulateClose();
      await vi.advanceTimersByTimeAsync(1000);
      mockWsInstances[1].simulateOpen();

      // The auth message is sent first, then the sync request.
      const syncMessages = sentOfType(mockWsInstances[1], 'sync');
      expect(syncMessages).toHaveLength(1);
      expect(syncMessages[0]['lastSequenceId']).toBe(25);
      expect(syncMessages[0]['limit']).toBe(100);
    });

    it('should include since timestamp in sync request when available', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      // Receive a notification to set lastSequenceId and lastMessageTimestamp
      mockWsInstances[0].simulateMessage({
        type: 'notification',
        payload: { event_type: 'test', description: 'x', related_module: 'm', date: 'd' },
        sequenceId: 25,
      });

      // Disconnect and reconnect
      mockWsInstances[0].simulateClose();
      await vi.advanceTimersByTimeAsync(1000);
      mockWsInstances[1].simulateOpen();

      const syncMsg = sentOfType(mockWsInstances[1], 'sync')[0];
      expect(syncMsg['since']).toBeDefined();
      // since should be a valid ISO string
      expect(new Date(syncMsg['since'] as string).toISOString()).toBe(syncMsg['since']);
    });

    it('should not send sync request on first connection (no lastSequenceId)', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      expect(sentOfType(mockWsInstances[0], 'sync')).toHaveLength(0);
    });

    it('should request max 100 missed notifications', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      // Set lastSequenceId
      mockWsInstances[0].simulateMessage({
        type: 'notification',
        payload: { event_type: 'test', description: 'x', related_module: 'm', date: 'd' },
        sequenceId: 999,
      });

      // Reconnect
      mockWsInstances[0].simulateClose();
      await vi.advanceTimersByTimeAsync(1000);
      mockWsInstances[1].simulateOpen();

      const syncMsg = sentOfType(mockWsInstances[1], 'sync')[0];
      expect(syncMsg['limit']).toBe(100);
    });

    it('should NOT sync notifications if disconnected for more than 30 minutes', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      // Set lastSequenceId
      mockWsInstances[0].simulateMessage({
        type: 'notification',
        payload: { event_type: 'test', description: 'x', related_module: 'm', date: 'd' },
        sequenceId: 50,
      });

      // Disconnect
      mockWsInstances[0].simulateClose();

      // Advance time past 30 minutes (also fires reconnect timers + flushes tokens)
      await vi.advanceTimersByTimeAsync(31 * 60 * 1000);

      // Manually open the latest socket (simulating a later reconnection)
      const lastIdx = mockWsInstances.length - 1;
      mockWsInstances[lastIdx].simulateOpen();

      // Should NOT have sent a sync message because disconnection > 30 min
      expect(sentOfType(mockWsInstances[lastIdx], 'sync')).toHaveLength(0);
    });

    it('should sync notifications if disconnected for less than 30 minutes', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      // Set lastSequenceId
      mockWsInstances[0].simulateMessage({
        type: 'notification',
        payload: { event_type: 'test', description: 'x', related_module: 'm', date: 'd' },
        sequenceId: 50,
      });

      // Disconnect
      mockWsInstances[0].simulateClose();

      // Advance only 1 second (within 30-min window)
      await vi.advanceTimersByTimeAsync(1000);

      // Reconnect
      mockWsInstances[1].simulateOpen();

      // Should have sent sync message
      const syncMessages = sentOfType(mockWsInstances[1], 'sync');
      expect(syncMessages).toHaveLength(1);
      expect(syncMessages[0]['lastSequenceId']).toBe(50);
    });
  });

  // ─── Disconnect & Cleanup ───────────────────────────────────────────────────

  describe('Cleanup', () => {
    it('should not attempt reconnection after disconnect()', async () => {
      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      client.disconnect();
      await vi.advanceTimersByTimeAsync(60000);

      // Should only have the initial instance
      expect(mockWsInstances).toHaveLength(1);
    });

    it('should clear polling timer on disconnect', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      // Disconnect should clean up everything
      client.disconnect();
      await vi.advanceTimersByTimeAsync(60000);

      expect(client.getState()).toBe('disconnected');
    });
  });

  // ─── Factory Function ───────────────────────────────────────────────────────

  describe('createWebSocketClient', () => {
    it('should return a WebSocketClient instance', () => {
      const client = createWebSocketClient(config);
      expect(client).toBeInstanceOf(WebSocketClient);
    });

    it('should start in disconnected state', () => {
      const client = createWebSocketClient(config);
      expect(client.getState()).toBe('disconnected');
    });
  });

  // ─── Additional coverage for critical-path branches (Task 7.2) ───────────────

  /** Drive the client through all 10 reconnection attempts into the failed state. */
  async function exhaustToFailed(client: WebSocketClient): Promise<void> {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    client.connect();
    await flush();
    mockWsInstances[0].simulateOpen();

    for (let i = 0; i < 10; i++) {
      const lastIdx = mockWsInstances.length - 1;
      mockWsInstances[lastIdx].simulateClose();
      await vi.advanceTimersByTimeAsync(Math.min(1000 * Math.pow(2, i), 30000));
    }
    const lastIdx = mockWsInstances.length - 1;
    mockWsInstances[lastIdx].simulateClose();
  }

  describe('Lifecycle guards', () => {
    it('ignores connect() after the client has been destroyed', async () => {
      const client = createWebSocketClient(config);
      client.disconnect();
      client.connect();
      await flush();

      expect(mockWsInstances).toHaveLength(0);
    });

    it('aborts the connection if destroyed while awaiting the token', async () => {
      let resolveToken!: (t: string | null) => void;
      config.getToken = () =>
        new Promise<string | null>((resolve) => {
          resolveToken = resolve;
        });

      const client = createWebSocketClient(config);
      client.connect();
      // The token fetch is pending; destroy before it resolves.
      client.disconnect();
      resolveToken('late-token');
      await flush();

      expect(mockWsInstances).toHaveLength(0);
    });

    it('handles a WebSocket constructor throw by scheduling a reconnect', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      let shouldThrow = true;
      vi.stubGlobal(
        'WebSocket',
        class extends MockWebSocket {
          constructor(url: string) {
            super(url);
            if (shouldThrow) {
              shouldThrow = false;
              throw new Error('construct failed');
            }
            mockWsInstances.push(this);
          }
          static override CONNECTING = 0;
          static override OPEN = 1;
          static override CLOSING = 2;
          static override CLOSED = 3;
        }
      );

      const client = createWebSocketClient(config);
      client.connect();
      await flush(); // first attempt throws → handleConnectionFailure → scheduleReconnect

      expect(mockWsInstances).toHaveLength(0);
      expect(client.getDisconnectedAt()).not.toBeNull();

      // The scheduled retry (1s) succeeds since the constructor no longer throws.
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockWsInstances).toHaveLength(1);
    });
  });

  describe('Authentication failure (Requirement 5.3)', () => {
    it('treats an auth_error message as an authentication failure', async () => {
      const onAuthFailure = vi.fn();
      config.onAuthFailure = onAuthFailure;

      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      mockWsInstances[0].simulateMessage({ type: 'auth_error', message: 'bad token' });
      // A second auth_error must not re-trigger the callback (authFailed guard).
      mockWsInstances[0].simulateMessage({ type: 'auth_error' });

      expect(onAuthFailure).toHaveBeenCalledTimes(1);
      expect(client.getState()).toBe('disconnected');
    });

    it('treats an auth-coded close as an authentication failure and stops reconnecting', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const onAuthFailure = vi.fn();
      config.onAuthFailure = onAuthFailure;

      const client = createWebSocketClient(config);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      mockWsInstances[0].simulateClose(1008); // policy violation → auth failure

      expect(onAuthFailure).toHaveBeenCalledTimes(1);
      expect(client.getState()).toBe('disconnected');

      // No reconnection is scheduled after an auth failure.
      await vi.advanceTimersByTimeAsync(10000);
      expect(mockWsInstances).toHaveLength(1);
    });
  });

  describe('HTTP polling delivery after failure (Requirement 6.1, 6.2)', () => {
    it('polls /notifications/recent and delivers notifications when no sequence is known', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: [
              {
                id: 1,
                event_type: 't',
                description: 'x',
                related_module: 'm',
                date: 'd',
                sequenceId: 7,
              },
            ],
          }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createWebSocketClient(config);
      await exhaustToFailed(client);
      expect(client.getState()).toBe('failed');

      // Flush the immediate poll (await getToken → fetch → json).
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalled();
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/notifications/recent');
      expect(onNotification).toHaveBeenCalledWith(
        expect.objectContaining({ sequenceId: 7 }),
        7
      );
      expect(client.getLastSequenceId()).toBe(7);
    });

    it('polls /notifications/since when a last sequence id is known', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createWebSocketClient(config);
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      client.connect();
      await flush();
      mockWsInstances[0].simulateOpen();

      // Receive a notification so lastSequenceId becomes 3.
      mockWsInstances[0].simulateMessage({
        type: 'notification',
        payload: { event_type: 't', description: 'x', related_module: 'm', date: 'd' },
        sequenceId: 3,
      });

      // Now exhaust reconnection to enter polling.
      for (let i = 0; i < 10; i++) {
        const lastIdx = mockWsInstances.length - 1;
        mockWsInstances[lastIdx].simulateClose();
        await vi.advanceTimersByTimeAsync(Math.min(1000 * Math.pow(2, i), 30000));
      }
      mockWsInstances[mockWsInstances.length - 1].simulateClose();

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/notifications/since?sequenceId=3');
    });

    it('skips delivery when the polling response is not ok', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createWebSocketClient(config);
      await exhaustToFailed(client);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalled();
      expect(onNotification).not.toHaveBeenCalled();
    });

    it('re-establishes the WebSocket from polling mode and stops polling on reopen', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createWebSocketClient(config);
      await exhaustToFailed(client);
      expect(client.getState()).toBe('failed');

      const countAfterFailed = mockWsInstances.length;

      // One polling interval triggers a WebSocket reconnect attempt.
      await vi.advanceTimersByTimeAsync(30000);
      expect(mockWsInstances.length).toBe(countAfterFailed + 1);

      // Opening the new socket stops polling and restores the connected state.
      mockWsInstances[mockWsInstances.length - 1].simulateOpen();
      expect(client.getState()).toBe('connected');

      const fetchCallsAtReconnect = mockFetch.mock.calls.length;
      await vi.advanceTimersByTimeAsync(90000);
      expect(mockFetch.mock.calls.length).toBe(fetchCallsAtReconnect);
    });
  });
});
