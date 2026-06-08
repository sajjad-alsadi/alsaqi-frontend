/**
 * Unit tests for the WebSocket client with reconnection and polling fallback.
 * Tests exponential backoff, HTTP polling, missed notification sync,
 * and connection state transitions.
 *
 * Requirements: 9.2, 9.3, 9.4, 9.5
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WebSocketClient,
  createWebSocketClient,
  type WebSocketClientConfig,
  type ConnectionState,
} from './websocket-client';
import type { Notification } from '@alsaqi/shared';

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

  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }

  simulateError(): void {
    this.onerror?.(new Event('error'));
  }
}

// Store references to created WebSocket instances for test assertions
let mockWsInstances: MockWebSocket[] = [];

// ─── Test Setup ───────────────────────────────────────────────────────────────

describe('WebSocketClient', () => {
  let config: WebSocketClientConfig;
  let onNotification: ((notification: Notification, sequenceId: number) => void) | undefined;
  let onStateChange: any;

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

    config = {
      wsUrl: 'ws://localhost:3000/ws',
      getToken: () => 'test-jwt-token',
      httpBaseUrl: 'http://localhost:3000/api',
      onNotification,
      onStateChange,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ─── Connection ─────────────────────────────────────────────────────────────

  describe('Connection', () => {
    it('should connect to the WebSocket server with JWT token', () => {
      const client = createWebSocketClient(config);
      client.connect();

      expect(mockWsInstances).toHaveLength(1);
      expect(mockWsInstances[0].url).toBe(
        'ws://localhost:3000/ws?token=test-jwt-token'
      );
    });

    it('should URL-encode the token parameter', () => {
      config.getToken = () => 'token with spaces&special=chars';
      const client = createWebSocketClient(config);
      client.connect();

      expect(mockWsInstances[0].url).toContain(
        '?token=token%20with%20spaces%26special%3Dchars'
      );
    });

    it('should set state to connected on successful WebSocket open', () => {
      const client = createWebSocketClient(config);
      client.connect();
      mockWsInstances[0].simulateOpen();

      expect(client.getState()).toBe('connected');
      expect(onStateChange).toHaveBeenCalledWith('connected');
    });

    it('should not connect if token is null', () => {
      config.getToken = () => null;
      const client = createWebSocketClient(config);
      client.connect();

      expect(mockWsInstances).toHaveLength(0);
      expect(client.getState()).toBe('disconnected');
    });

    it('should set state to disconnected when disconnect is called', () => {
      const client = createWebSocketClient(config);
      client.connect();
      mockWsInstances[0].simulateOpen();

      client.disconnect();

      expect(client.getState()).toBe('disconnected');
      expect(onStateChange).toHaveBeenCalledWith('disconnected');
    });
  });

  // ─── Notification Handling ──────────────────────────────────────────────────

  describe('Notification Handling', () => {
    it('should emit notification on valid message', () => {
      const client = createWebSocketClient(config);
      client.connect();
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

    it('should update lastSequenceId on notification', () => {
      const client = createWebSocketClient(config);
      client.connect();
      mockWsInstances[0].simulateOpen();

      mockWsInstances[0].simulateMessage({
        type: 'notification',
        payload: { event_type: 'test', description: 'x', related_module: 'm', date: 'd' },
        sequenceId: 10,
      });

      expect(client.getLastSequenceId()).toBe(10);
    });

    it('should not decrease lastSequenceId for older notifications', () => {
      const client = createWebSocketClient(config);
      client.connect();
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

    it('should ignore malformed messages', () => {
      const client = createWebSocketClient(config);
      client.connect();
      mockWsInstances[0].simulateOpen();

      // Message without type
      mockWsInstances[0].simulateMessage({ something: 'else' });
      // Message with wrong type
      mockWsInstances[0].simulateMessage({ type: 'ping' });

      expect(onNotification).not.toHaveBeenCalled();
    });
  });

  // ─── Reconnection with Exponential Backoff ──────────────────────────────────

  describe('Reconnection (Requirement 9.2)', () => {
    it('should attempt reconnection with exponential backoff on disconnect', () => {
      const client = createWebSocketClient(config);
      client.connect();
      mockWsInstances[0].simulateOpen();
      mockWsInstances[0].simulateClose();

      // Should schedule reconnection — advance 1s for first attempt
      vi.advanceTimersByTime(1000);

      // A new WebSocket instance should have been created
      expect(mockWsInstances).toHaveLength(2);
    });

    it('should use correct backoff delays: 1s, 2s, 4s, 8s, 16s', () => {
      const client = new WebSocketClient(config);

      expect(client.calculateReconnectDelay(1)).toBe(1000);
      expect(client.calculateReconnectDelay(2)).toBe(2000);
      expect(client.calculateReconnectDelay(3)).toBe(4000);
      expect(client.calculateReconnectDelay(4)).toBe(8000);
      expect(client.calculateReconnectDelay(5)).toBe(16000);
    });

    it('should cap reconnect delay at 30 seconds', () => {
      const client = new WebSocketClient(config);

      // Even at very high attempts, should not exceed 30s
      expect(client.calculateReconnectDelay(6)).toBe(30000);
      expect(client.calculateReconnectDelay(10)).toBe(30000);
    });

    it('should stop reconnecting after 5 attempts and fall back to polling', () => {
      const client = createWebSocketClient(config);
      client.connect();
      mockWsInstances[0].simulateOpen();

      // Simulate 5 failed reconnections
      for (let i = 0; i < 5; i++) {
        const lastIdx = mockWsInstances.length - 1;
        mockWsInstances[lastIdx].simulateClose();

        // Advance past the reconnect delay
        const delay = 1000 * Math.pow(2, i);
        vi.advanceTimersByTime(Math.min(delay, 30000));
      }

      // After the 5th attempt fails
      const lastIdx = mockWsInstances.length - 1;
      mockWsInstances[lastIdx].simulateClose();

      // Should now be in degraded mode
      expect(client.getState()).toBe('degraded');
      expect(onStateChange).toHaveBeenCalledWith('degraded');
    });

    it('should reset reconnect counter on successful connection', () => {
      const client = createWebSocketClient(config);
      client.connect();
      mockWsInstances[0].simulateOpen();
      mockWsInstances[0].simulateClose();

      // First reconnect attempt
      vi.advanceTimersByTime(1000);
      expect(mockWsInstances).toHaveLength(2);

      // Success!
      mockWsInstances[1].simulateOpen();
      expect(client.getState()).toBe('connected');

      // Disconnect again
      mockWsInstances[1].simulateClose();

      // Should start fresh with 1s delay (not 2s)
      vi.advanceTimersByTime(1000);
      expect(mockWsInstances).toHaveLength(3);
    });
  });

  // ─── HTTP Polling Fallback ──────────────────────────────────────────────────

  describe('HTTP Polling Fallback (Requirement 9.3)', () => {
    function exhaustReconnectionAttempts(client: WebSocketClient): void {
      client.connect();
      mockWsInstances[0].simulateOpen();

      // Exhaust all 5 reconnection attempts
      for (let i = 0; i < 5; i++) {
        const lastIdx = mockWsInstances.length - 1;
        mockWsInstances[lastIdx].simulateClose();
        const delay = 1000 * Math.pow(2, i);
        vi.advanceTimersByTime(Math.min(delay, 30000));
      }

      // Final close triggers degraded mode
      const lastIdx = mockWsInstances.length - 1;
      mockWsInstances[lastIdx].simulateClose();
    }

    it('should start HTTP polling at 30s interval after reconnection exhausted', () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createWebSocketClient(config);
      exhaustReconnectionAttempts(client);

      expect(client.getState()).toBe('degraded');

      // Polling should have fired immediately
      expect(mockFetch).toHaveBeenCalled();

      // Reset and advance 30s for next poll
      mockFetch.mockClear();
      vi.advanceTimersByTime(30000);

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should display degraded mode state when polling', () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      }));

      const client = createWebSocketClient(config);
      exhaustReconnectionAttempts(client);

      expect(client.getState()).toBe('degraded');
      expect(onStateChange).toHaveBeenCalledWith('degraded');
    });

    it('should include authorization header in polling requests', () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createWebSocketClient(config);
      exhaustReconnectionAttempts(client);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-jwt-token',
          }),
        })
      );
    });

    it('should pass lastSequenceId in polling request URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createWebSocketClient(config);
      client.connect();
      mockWsInstances[0].simulateOpen();

      // Receive a notification to set lastSequenceId
      mockWsInstances[0].simulateMessage({
        type: 'notification',
        payload: { event_type: 'test', description: 'x', related_module: 'm', date: 'd' },
        sequenceId: 50,
      });

      // Now exhaust reconnection
      for (let i = 0; i < 5; i++) {
        const lastIdx = mockWsInstances.length - 1;
        mockWsInstances[lastIdx].simulateClose();
        const delay = 1000 * Math.pow(2, i);
        vi.advanceTimersByTime(Math.min(delay, 30000));
      }
      const lastIdx = mockWsInstances.length - 1;
      mockWsInstances[lastIdx].simulateClose();

      // Polling should include sequenceId
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/notifications/since?sequenceId=50&limit=100',
        expect.any(Object)
      );
    });

    it('should process notifications received via polling', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: [
              {
                event_type: 'polled',
                description: 'From poll',
                related_module: 'tasks',
                date: '2024-01-01',
                sequenceId: 100,
              },
            ],
          }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createWebSocketClient(config);
      exhaustReconnectionAttempts(client);

      // Allow the async poll to complete
      await vi.advanceTimersByTimeAsync(0);

      expect(onNotification).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: 'polled', description: 'From poll' }),
        100
      );
    });
  });

  // ─── Resume WebSocket from Polling ──────────────────────────────────────────

  describe('Resume WebSocket (Requirement 9.5)', () => {
    it('should stop polling and resume WebSocket when connection re-established', () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createWebSocketClient(config);

      // Enter degraded mode
      client.connect();
      mockWsInstances[0].simulateOpen();
      for (let i = 0; i < 5; i++) {
        const lastIdx = mockWsInstances.length - 1;
        mockWsInstances[lastIdx].simulateClose();
        const delay = 1000 * Math.pow(2, i);
        vi.advanceTimersByTime(Math.min(delay, 30000));
      }
      const lastIdx = mockWsInstances.length - 1;
      mockWsInstances[lastIdx].simulateClose();

      expect(client.getState()).toBe('degraded');
      mockFetch.mockClear();

      // On next poll cycle, the client attempts WebSocket reconnection
      vi.advanceTimersByTime(30000);

      // A new WS instance was created during the polling cycle
      const newWsIdx = mockWsInstances.length - 1;
      mockWsInstances[newWsIdx].simulateOpen();

      expect(client.getState()).toBe('connected');

      // Polling should have stopped — no more fetch calls after connection
      mockFetch.mockClear();
      vi.advanceTimersByTime(60000);

      // Only the poll during the reconnection cycle should have happened
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should transition state from degraded to connected', () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createWebSocketClient(config);
      client.connect();
      mockWsInstances[0].simulateOpen();

      // Enter degraded mode
      for (let i = 0; i < 5; i++) {
        const lastIdx = mockWsInstances.length - 1;
        mockWsInstances[lastIdx].simulateClose();
        const delay = 1000 * Math.pow(2, i);
        vi.advanceTimersByTime(Math.min(delay, 30000));
      }
      mockWsInstances[mockWsInstances.length - 1].simulateClose();

      expect(client.getState()).toBe('degraded');
      onStateChange.mockClear();

      // Trigger reconnection from polling
      vi.advanceTimersByTime(30000);
      mockWsInstances[mockWsInstances.length - 1].simulateOpen();

      expect(onStateChange).toHaveBeenCalledWith('connected');
    });
  });

  // ─── Missed Notification Sync ───────────────────────────────────────────────

  describe('Missed Notification Sync (Requirement 9.4)', () => {
    it('should send sync request on reconnection with last sequence ID', () => {
      const client = createWebSocketClient(config);
      client.connect();
      mockWsInstances[0].simulateOpen();

      // Receive a notification to set lastSequenceId
      mockWsInstances[0].simulateMessage({
        type: 'notification',
        payload: { event_type: 'test', description: 'x', related_module: 'm', date: 'd' },
        sequenceId: 25,
      });

      // Disconnect and reconnect
      mockWsInstances[0].simulateClose();
      vi.advanceTimersByTime(1000);
      mockWsInstances[1].simulateOpen();

      // Should have sent a sync message
      expect(mockWsInstances[1].sentMessages).toHaveLength(1);
      const syncMsg = JSON.parse(mockWsInstances[1].sentMessages[0]);
      expect(syncMsg).toEqual({
        type: 'sync',
        lastSequenceId: 25,
        limit: 100,
      });
    });

    it('should not send sync request on first connection (no lastSequenceId)', () => {
      const client = createWebSocketClient(config);
      client.connect();
      mockWsInstances[0].simulateOpen();

      expect(mockWsInstances[0].sentMessages).toHaveLength(0);
    });

    it('should request max 100 missed notifications', () => {
      const client = createWebSocketClient(config);
      client.connect();
      mockWsInstances[0].simulateOpen();

      // Set lastSequenceId
      mockWsInstances[0].simulateMessage({
        type: 'notification',
        payload: { event_type: 'test', description: 'x', related_module: 'm', date: 'd' },
        sequenceId: 999,
      });

      // Reconnect
      mockWsInstances[0].simulateClose();
      vi.advanceTimersByTime(1000);
      mockWsInstances[1].simulateOpen();

      const syncMsg = JSON.parse(mockWsInstances[1].sentMessages[0]);
      expect(syncMsg.limit).toBe(100);
    });
  });

  // ─── Disconnect & Cleanup ───────────────────────────────────────────────────

  describe('Cleanup', () => {
    it('should not attempt reconnection after disconnect()', () => {
      const client = createWebSocketClient(config);
      client.connect();
      mockWsInstances[0].simulateOpen();

      client.disconnect();
      vi.advanceTimersByTime(60000);

      // Should only have the initial instance
      expect(mockWsInstances).toHaveLength(1);
    });

    it('should clear polling timer on disconnect', () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createWebSocketClient(config);
      client.connect();
      mockWsInstances[0].simulateOpen();

      // Enter degraded mode
      for (let i = 0; i < 5; i++) {
        const lastIdx = mockWsInstances.length - 1;
        mockWsInstances[lastIdx].simulateClose();
        const delay = 1000 * Math.pow(2, i);
        vi.advanceTimersByTime(Math.min(delay, 30000));
      }
      mockWsInstances[mockWsInstances.length - 1].simulateClose();

      expect(client.getState()).toBe('degraded');
      mockFetch.mockClear();

      // Disconnect should stop polling
      client.disconnect();
      vi.advanceTimersByTime(60000);

      expect(mockFetch).not.toHaveBeenCalled();
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
});
