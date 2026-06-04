/**
 * WebSocket Client with Automatic Reconnection and HTTP Polling Fallback
 *
 * Framework-agnostic WebSocket client that:
 * - Connects to the API server with JWT auth via ?token= query parameter
 * - Implements exponential backoff reconnection (1s, 2s, 4s, 8s, 16s; capped at 30s; max 5 attempts)
 * - Falls back to HTTP polling (30s interval) when WebSocket reconnection fails
 * - Syncs missed notifications by sequence ID on reconnection (max 100)
 * - Stops polling and resumes WebSocket when connection is re-established
 * - Exposes reactive connection state (connected/degraded/disconnected)
 *
 * Requirements: 9.2, 9.3, 9.4, 9.5
 */

import type { Notification } from '@alsaqi/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Connection state exposed to the UI */
export type ConnectionState = 'connected' | 'degraded' | 'disconnected';

/** WebSocket message from the server */
export interface WsNotificationMessage {
  type: 'notification';
  payload: Notification;
  sequenceId: number;
}

/** Configuration for the WebSocket client */
export interface WebSocketClientConfig {
  /** WebSocket server URL (e.g., ws://localhost:3000 or wss://example.com) */
  wsUrl: string;
  /** JWT token for authentication (appended as ?token= query param) */
  getToken: () => string | null;
  /** HTTP base URL for polling fallback (e.g., http://localhost:3000/api) */
  httpBaseUrl: string;
  /** Callback when a notification is received */
  onNotification?: (notification: Notification, sequenceId: number) => void;
  /** Callback when connection state changes */
  onStateChange?: (state: ConnectionState) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_RECONNECT_DELAY_MS = 1000;
const RECONNECT_MULTIPLIER = 2;
const MAX_RECONNECT_DELAY_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const POLLING_INTERVAL_MS = 30_000;
const MAX_MISSED_NOTIFICATIONS = 100;

// ─── WebSocket Client Class ───────────────────────────────────────────────────

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private config: WebSocketClientConfig;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private lastSequenceId = 0;
  private isDestroyed = false;
  private isReconnecting = false;

  constructor(config: WebSocketClientConfig) {
    this.config = config;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Get the current connection state */
  getState(): ConnectionState {
    return this.state;
  }

  /** Get the last received sequence ID */
  getLastSequenceId(): number {
    return this.lastSequenceId;
  }

  /** Connect to the WebSocket server */
  connect(): void {
    if (this.isDestroyed) return;
    this.attemptConnection();
  }

  /** Disconnect and clean up all resources */
  disconnect(): void {
    this.isDestroyed = true;
    this.clearReconnectTimer();
    this.stopPolling();
    this.closeWebSocket();
    this.setState('disconnected');
  }

  // ─── Connection Management ──────────────────────────────────────────────────

  private attemptConnection(): void {
    const token = this.config.getToken();
    if (!token) {
      this.setState('disconnected');
      return;
    }

    this.closeWebSocket();

    const url = `${this.config.wsUrl}?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.handleConnectionFailure();
      return;
    }

    this.ws.onopen = () => {
      this.handleOpen();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event);
    };

    this.ws.onclose = () => {
      this.handleClose();
    };

    this.ws.onerror = () => {
      // Error is followed by close event, handled there
    };
  }

  private handleOpen(): void {
    const wasInDegradedMode = this.state === 'degraded';

    // Reset reconnection state
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.clearReconnectTimer();

    // Stop HTTP polling if it was active (Requirement 9.5)
    if (wasInDegradedMode) {
      this.stopPolling();
    }

    this.setState('connected');

    // Sync missed notifications on reconnection (Requirement 9.4)
    if (this.lastSequenceId > 0) {
      this.requestMissedNotifications();
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data as string);

      if (data.type === 'notification' && data.payload && typeof data.sequenceId === 'number') {
        const message = data as WsNotificationMessage;

        // Update last known sequence ID
        if (message.sequenceId > this.lastSequenceId) {
          this.lastSequenceId = message.sequenceId;
        }

        this.config.onNotification?.(message.payload, message.sequenceId);
      }
    } catch {
      // Ignore malformed messages
    }
  }

  private handleClose(): void {
    if (this.isDestroyed) return;

    this.ws = null;

    // Attempt reconnection with exponential backoff (Requirement 9.2)
    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.isReconnecting = true;
      this.scheduleReconnect();
    } else {
      // All reconnection attempts exhausted — fall back to polling (Requirement 9.3)
      this.startPollingFallback();
    }
  }

  private handleConnectionFailure(): void {
    if (this.isDestroyed) return;

    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.isReconnecting = true;
      this.scheduleReconnect();
    } else {
      this.startPollingFallback();
    }
  }

  // ─── Reconnection with Exponential Backoff ──────────────────────────────────

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectAttempts++;

    const delay = this.calculateReconnectDelay(this.reconnectAttempts);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isDestroyed) {
        this.attemptConnection();
      }
    }, delay);
  }

  /**
   * Calculate exponential backoff delay:
   * Attempt 1: 1s, Attempt 2: 2s, Attempt 3: 4s, Attempt 4: 8s, Attempt 5: 16s
   * Capped at 30s max
   */
  calculateReconnectDelay(attempt: number): number {
    const delay = INITIAL_RECONNECT_DELAY_MS * Math.pow(RECONNECT_MULTIPLIER, attempt - 1);
    return Math.min(delay, MAX_RECONNECT_DELAY_MS);
  }

  // ─── HTTP Polling Fallback ──────────────────────────────────────────────────

  private startPollingFallback(): void {
    this.isReconnecting = false;
    this.setState('degraded');

    // Start polling immediately, then at interval (Requirement 9.3)
    this.pollNotifications();
    this.pollingTimer = setInterval(() => {
      this.pollNotifications();
      // Also try to re-establish WebSocket on each poll cycle
      this.attemptWebSocketReconnectFromPolling();
    }, POLLING_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollingTimer !== null) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  private async pollNotifications(): Promise<void> {
    try {
      const token = this.config.getToken();
      if (!token) return;

      const url = this.lastSequenceId > 0
        ? `${this.config.httpBaseUrl}/notifications/since?sequenceId=${this.lastSequenceId}&limit=${MAX_MISSED_NOTIFICATIONS}`
        : `${this.config.httpBaseUrl}/notifications/recent?limit=${MAX_MISSED_NOTIFICATIONS}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) return;

      const data = await response.json();

      // Process notifications from the polling response
      if (data.success && Array.isArray(data.data)) {
        for (const item of data.data) {
          const sequenceId = item.sequenceId ?? item.sequence_id ?? 0;
          if (typeof sequenceId === 'number' && sequenceId > this.lastSequenceId) {
            this.lastSequenceId = sequenceId;
          }
          this.config.onNotification?.(item as Notification, sequenceId);
        }
      }
    } catch {
      // Polling errors are silent — will retry on next interval
    }
  }

  /**
   * Attempt to re-establish WebSocket while in polling mode (Requirement 9.5)
   * If successful, polling will be stopped in handleOpen()
   */
  private attemptWebSocketReconnectFromPolling(): void {
    if (this.isDestroyed || this.ws !== null) return;

    // Reset attempts to allow a fresh connection attempt
    this.reconnectAttempts = 0;
    this.attemptConnection();
  }

  // ─── Missed Notification Sync ───────────────────────────────────────────────

  /**
   * Request missed notifications since the last known sequence ID (Requirement 9.4)
   * Sends a message to the WebSocket server requesting up to 100 missed notifications
   */
  private requestMissedNotifications(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        type: 'sync',
        lastSequenceId: this.lastSequenceId,
        limit: MAX_MISSED_NOTIFICATIONS,
      })
    );
  }

  // ─── State Management ───────────────────────────────────────────────────────

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.config.onStateChange?.(newState);
    }
  }

  // ─── Cleanup Helpers ────────────────────────────────────────────────────────

  private closeWebSocket(): void {
    if (this.ws) {
      // Remove handlers to prevent triggering reconnect
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;

      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// ─── Factory Function ─────────────────────────────────────────────────────────

/**
 * Create a new WebSocket client instance.
 *
 * @example
 * ```ts
 * const wsClient = createWebSocketClient({
 *   wsUrl: 'wss://api.example.com/ws',
 *   getToken: () => localStorage.getItem('token'),
 *   httpBaseUrl: 'https://api.example.com/api',
 *   onNotification: (notification, seqId) => {
 *     console.log('New notification:', notification, seqId);
 *   },
 *   onStateChange: (state) => {
 *     console.log('Connection state:', state);
 *   },
 * });
 *
 * wsClient.connect();
 * // later...
 * wsClient.disconnect();
 * ```
 */
export function createWebSocketClient(config: WebSocketClientConfig): WebSocketClient {
  return new WebSocketClient(config);
}
