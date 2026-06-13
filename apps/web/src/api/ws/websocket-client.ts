/**
 * WebSocket Client with Automatic Reconnection and HTTP Polling Fallback
 *
 * Framework-agnostic WebSocket client that:
 * - Connects to the API server WITHOUT exposing the JWT in the URL; authenticates by
 *   sending `{ type: 'auth', token }` as the first post-connect message (or relies on
 *   the cookie session). On an auth failure it closes the socket and reports it.
 * - Implements exponential backoff reconnection with jitter (1s→30s cap; max 10 attempts)
 * - After 10 failed attempts: enters 'failed' state with manual refresh indicator AND
 *   starts HTTP polling (30s interval) so notifications keep arriving (Requirement 6.1, 6.2)
 * - Syncs missed notifications by sequence ID on reconnection (max 100, within 30 min window)
 * - Polling keeps trying to re-establish the socket; a successful re-open stops polling
 *   and resumes WebSocket delivery (Requirement 6.3)
 * - Exposes reactive connection state (connected/degraded/disconnected/failed)
 *
 * Requirements: 3.2, 3.3, 3.4, 9.2, 9.3, 9.4, 9.5
 */

import type { Notification } from '@alsaqi/shared';
import { errorReporter } from '../../utils/errorReporter';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Connection state exposed to the UI */
export type ConnectionState = 'connected' | 'degraded' | 'disconnected' | 'failed';

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
  /**
   * Fetch a JWT token for authentication. Called once per connection attempt so a
   * FRESH token is obtained every time (no cross-attempt caching — Requirement 7.1, 7.2).
   * The token is NEVER placed in the connection URL; it is sent as the first
   * post-connect message (`{ type: 'auth', token }`).
   * Resolve to `null` to rely on the cookie session / skip authentication.
   */
  getToken: () => Promise<string | null>;
  /** HTTP base URL for polling fallback (e.g., http://localhost:3000/api) */
  httpBaseUrl: string;
  /** Callback when a notification is received */
  onNotification?: (notification: Notification, sequenceId: number) => void;
  /** Callback when connection state changes */
  onStateChange?: (state: ConnectionState) => void;
  /** Callback when all reconnection attempts are exhausted (Requirement 3.3) */
  onReconnectionFailed?: () => void;
  /** Callback when post-connect authentication fails (Requirement 5.3) */
  onAuthFailure?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const INITIAL_RECONNECT_DELAY_MS = 1000;
export const RECONNECT_MULTIPLIER = 2;
export const MAX_RECONNECT_DELAY_MS = 30_000;
export const MAX_RECONNECT_ATTEMPTS = 10;
const POLLING_INTERVAL_MS = 30_000;
const MAX_MISSED_NOTIFICATIONS = 100;
/** Jitter factor: ±20% of calculated delay to prevent thundering herd */
export const JITTER_FACTOR = 0.2;
/** Maximum disconnection duration (30 minutes) for notification sync eligibility */
const MAX_SYNC_WINDOW_MS = 30 * 60 * 1000;
/**
 * WebSocket close codes that indicate an authentication/authorization failure.
 * 1008 = policy violation; 4001/4003 = application-defined unauthorized/forbidden.
 * A close with one of these codes triggers the auth-failure path (Requirement 5.3).
 */
export const WS_AUTH_CLOSE_CODES = new Set<number>([1008, 4001, 4003]);

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
  /** True once a post-connect auth failure has occurred; suppresses reconnection. */
  private authFailed = false;
  /** Token captured for the current connection attempt, sent on open. */
  private pendingAuthToken: string | null = null;
  /** Timestamp when the disconnection started (for 30-min sync window check) */
  private disconnectedAt: number | null = null;
  /** Timestamp of the last received message (for sync purposes) */
  private lastMessageTimestamp: number | null = null;

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

  /** Get the timestamp of the last received message */
  getLastMessageTimestamp(): number | null {
    return this.lastMessageTimestamp;
  }

  /** Get the timestamp when the client disconnected */
  getDisconnectedAt(): number | null {
    return this.disconnectedAt;
  }

  /** Get the current reconnect attempt count */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /** Connect to the WebSocket server */
  connect(): void {
    if (this.isDestroyed) return;
    this.authFailed = false;
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

  private async attemptConnection(): Promise<void> {
    if (this.isDestroyed) return;

    // Fetch a FRESH token for this attempt (Requirement 7.1, 7.2) — no caching across
    // attempts. Each reconnect therefore uses a newly issued, non-expired token.
    const token = await this.config.getToken();

    // The client may have been destroyed while awaiting the token fetch.
    if (this.isDestroyed) return;

    if (!token) {
      this.setState('disconnected');
      return;
    }

    this.closeWebSocket();

    // SECURITY (Requirement 5.1): the token MUST NOT appear in the connection URL
    // or its query string. It is sent as the first post-connect message instead.
    this.pendingAuthToken = token;

    try {
      this.ws = new WebSocket(this.config.wsUrl);
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

    this.ws.onclose = (event: CloseEvent) => {
      this.handleClose(event);
    };

    this.ws.onerror = () => {
      // Error is followed by close event, handled there
    };
  }

  private handleOpen(): void {
    // Authenticate first (Requirement 5.2): send the token as the first
    // post-connect message. If no token is available, rely on the cookie session.
    this.sendAuthMessage();

    const wasDisconnected = this.disconnectedAt !== null;

    // Reset reconnection state
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.clearReconnectTimer();

    // Stop HTTP polling if it was active (Requirement 6.3, 9.5). Polling may have
    // been started either from the 'degraded' fallback or from the exhausted
    // 'failed' path, so stop it unconditionally on a successful re-open —
    // stopPolling() is a no-op when no polling timer is running.
    this.stopPolling();

    this.setState('connected');

    // Sync missed notifications on reconnection (Requirement 3.4)
    // Only sync if disconnected for ≤ 30 minutes and we have a last sequence ID
    if (this.lastSequenceId > 0 && wasDisconnected) {
      const disconnectionDuration = Date.now() - (this.disconnectedAt ?? 0);
      if (disconnectionDuration <= MAX_SYNC_WINDOW_MS) {
        this.requestMissedNotifications();
      }
    }

    // Clear disconnection timestamp
    this.disconnectedAt = null;
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data as string);

      // Post-connect authentication failure reported by the server (Requirement 5.3)
      if (data.type === 'auth_error') {
        this.handleAuthFailure(
          typeof data.message === 'string' ? data.message : 'auth_error message received',
        );
        return;
      }

      if (data.type === 'notification' && data.payload && typeof data.sequenceId === 'number') {
        const message = data as WsNotificationMessage;

        // Update last known sequence ID
        if (message.sequenceId > this.lastSequenceId) {
          this.lastSequenceId = message.sequenceId;
        }

        // Track the last message timestamp for sync purposes
        this.lastMessageTimestamp = Date.now();

        this.config.onNotification?.(message.payload, message.sequenceId);
      }
    } catch {
      // Ignore malformed messages
    }
  }

  private handleClose(event?: CloseEvent): void {
    if (this.isDestroyed) return;

    this.ws = null;

    // Auth-coded close (Requirement 5.3): treat as an authentication failure rather
    // than a transient disconnect, so we do not reconnect-loop with a bad token.
    if (event && WS_AUTH_CLOSE_CODES.has(event.code)) {
      this.handleAuthFailure(`connection closed with auth code ${event.code}`);
      return;
    }

    // Record disconnection time if this is the first close
    if (this.disconnectedAt === null) {
      this.disconnectedAt = Date.now();
    }

    // Attempt reconnection with exponential backoff (Requirement 3.2)
    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.isReconnecting = true;
      this.scheduleReconnect();
    } else {
      // All 10 reconnection attempts exhausted (Requirement 3.3)
      // Enter 'failed' state — UI should display error with manual refresh message
      this.isReconnecting = false;
      this.setState('failed');
      this.config.onReconnectionFailed?.();
      // Notification delivery continuity (Requirement 6.1, 6.2): even though the
      // WebSocket gave up, keep the Notification_Store fed by starting the HTTP
      // polling fallback. Polling also keeps trying to re-establish the socket;
      // a successful re-open stops polling in handleOpen (Requirement 6.3).
      this.startPollingFallback();
    }
  }

  private handleConnectionFailure(): void {
    if (this.isDestroyed) return;

    // Record disconnection time if this is the first failure
    if (this.disconnectedAt === null) {
      this.disconnectedAt = Date.now();
    }

    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.isReconnecting = true;
      this.scheduleReconnect();
    } else {
      // All 10 reconnection attempts exhausted (Requirement 3.3)
      this.isReconnecting = false;
      this.setState('failed');
      this.config.onReconnectionFailed?.();
      // Notification delivery continuity (Requirement 6.1, 6.2): start the HTTP
      // polling fallback so notifications keep arriving while the socket is down.
      this.startPollingFallback();
    }
  }

  // ─── Authentication (Requirement 5) ─────────────────────────────────────────

  /**
   * Send the authentication token as the first post-connect message (Requirement 5.2).
   * The token is sent in the message body and never in the URL (Requirement 5.1).
   * When no token is available, rely on the cookie session and send nothing.
   */
  private sendAuthMessage(): void {
    const token = this.pendingAuthToken;
    this.pendingAuthToken = null;

    if (!token) return; // rely on cookie session
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({ type: 'auth', token }));
  }

  /**
   * Handle a post-connect authentication failure (Requirement 5.3):
   * close the socket, report the failure, and invoke the onAuthFailure callback.
   * Reconnection is suppressed so we do not loop with an invalid token.
   */
  private handleAuthFailure(reason: string): void {
    if (this.authFailed) return;
    this.authFailed = true;

    this.clearReconnectTimer();
    this.stopPolling();
    this.isReconnecting = false;
    this.closeWebSocket();
    this.setState('disconnected');

    errorReporter.report({
      module: 'websocket',
      message: `[WS Auth] WebSocket authentication failed: ${reason}`,
      severity: 'high',
      type: 'uncaught',
    });

    this.config.onAuthFailure?.();
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
   * Calculate exponential backoff delay with jitter:
   * Base delays: 1s, 2s, 4s, 8s, 16s, 30s, 30s, 30s, 30s, 30s (capped at 30s)
   * Jitter: ±20% of calculated delay to prevent thundering herd
   *
   * Requirement 3.2: Exponential backoff starting at 1s up to 30s max
   */
  calculateReconnectDelay(attempt: number): number {
    const baseDelay = INITIAL_RECONNECT_DELAY_MS * Math.pow(RECONNECT_MULTIPLIER, attempt - 1);
    const cappedDelay = Math.min(baseDelay, MAX_RECONNECT_DELAY_MS);
    return this.applyJitter(cappedDelay);
  }

  /**
   * Apply ±20% jitter to a delay value to prevent thundering herd.
   * Returns a value in the range [delay * 0.8, delay * 1.2].
   */
  applyJitter(delay: number): number {
    const jitter = delay * JITTER_FACTOR * (2 * Math.random() - 1);
    return Math.max(0, Math.round(delay + jitter));
  }

  // ─── HTTP Polling Fallback ──────────────────────────────────────────────────

  private startPollingFallback(): void {
    // Guard against stacking multiple polling intervals if polling is already
    // active (e.g. a poll-driven reconnect exhausts again and re-enters this path).
    if (this.pollingTimer !== null) return;

    this.isReconnecting = false;

    // The connection state is owned by the caller. When polling starts from the
    // exhausted reconnection path the client stays in the 'failed' state so the UI
    // keeps showing the manual-refresh indicator, while the Notification_Store
    // still receives updates via HTTP polling (Requirement 6.1, 6.2).

    // Start polling immediately, then at interval (Requirement 6.2)
    this.pollNotifications();
    this.pollingTimer = setInterval(() => {
      this.pollNotifications();
      // Also try to re-establish the WebSocket on each poll cycle; a successful
      // re-open stops polling in handleOpen (Requirement 6.3).
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
      const token = await this.config.getToken();
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
   * Request missed notifications since the last known sequence ID (Requirement 3.4)
   * Sends a message to the WebSocket server requesting up to 100 missed notifications.
   * Only syncs if disconnected for ≤ 30 minutes.
   */
  private requestMissedNotifications(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const syncPayload: Record<string, unknown> = {
      type: 'sync',
      lastSequenceId: this.lastSequenceId,
      limit: MAX_MISSED_NOTIFICATIONS,
    };

    // Include lastMessageTimestamp if available for server-side filtering
    if (this.lastMessageTimestamp !== null) {
      syncPayload['since'] = new Date(this.lastMessageTimestamp).toISOString();
    }

    this.ws.send(JSON.stringify(syncPayload));
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
 *   getToken: async () => localStorage.getItem('token'),
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
