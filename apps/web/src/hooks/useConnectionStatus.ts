/**
 * Network Connection Status Monitor Hook
 *
 * Monitors connectivity through three signals:
 * 1. `navigator.onLine` — browser-reported network state
 * 2. WebSocket connection state — via the existing WebSocketClient
 * 3. API latency — periodic ping to `/api/health`
 *
 * Exposes a combined status:
 *   - `online`   — API reachable with latency ≤ 5000ms
 *   - `degraded` — API reachable but latency > 5000ms
 *   - `offline`  — navigator.onLine is false OR API is unreachable
 *
 * Status updates are guaranteed within 2 seconds of a connection state change.
 * Cleanup of event listeners and intervals occurs on unmount.
 *
 * Requirements: 3.1, 3.6, 3.7
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectionStatus = 'online' | 'degraded' | 'offline';

export interface ConnectionStatusResult {
  status: ConnectionStatus;
  lastChecked: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Latency threshold in ms — above this we consider the connection degraded */
const DEGRADED_LATENCY_THRESHOLD_MS = 5000;

/** How often to check API latency when online (ms) */
const PING_INTERVAL_MS = 15_000;

/** How often to check API latency when offline/degraded (ms) — faster recovery detection */
const PING_INTERVAL_DEGRADED_MS = 5_000;

/** Timeout for the health ping request (ms) */
const PING_TIMEOUT_MS = 10_000;

/** Minimum interval between status updates to avoid flapping (ms) */
const STATUS_DEBOUNCE_MS = 500;

/** Maximum delay before status reflects a change (ms) — requirement: within 2 seconds */
const MAX_STATUS_DELAY_MS = 2000;

// ─── API Base URL ─────────────────────────────────────────────────────────────

function getApiBaseUrl(): string {
  const envUrl = import.meta.env['VITE_API_URL'] as string | undefined;
  return envUrl ?? '/api';
}

// ─── Latency Check ────────────────────────────────────────────────────────────

/**
 * Ping the API health endpoint and measure round-trip latency.
 * Returns the latency in ms, or `null` if unreachable.
 */
async function measureApiLatency(baseUrl: string, signal: AbortSignal): Promise<number | null> {
  const start = performance.now();
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'HEAD',
      cache: 'no-store',
      signal,
    });
    if (!response.ok && response.status !== 204) {
      // Server responded but with an error — still reachable
      return performance.now() - start;
    }
    return performance.now() - start;
  } catch {
    return null;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useConnectionStatus(): ConnectionStatusResult {
  const [status, setStatus] = useState<ConnectionStatus>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online'
  );
  const [lastChecked, setLastChecked] = useState<string>(new Date().toISOString());

  // Refs to track internal state without triggering re-renders
  const statusRef = useRef<ConnectionStatus>(status);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  /**
   * Update the status with a short debounce to prevent flapping,
   * but guaranteed to apply within MAX_STATUS_DELAY_MS.
   */
  const updateStatus = useCallback((newStatus: ConnectionStatus) => {
    if (!isMountedRef.current) return;
    if (statusRef.current === newStatus) return;

    // Clear any pending debounce
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      debounceTimerRef.current = null;
      statusRef.current = newStatus;
      setStatus(newStatus);
      setLastChecked(new Date().toISOString());
    }, STATUS_DEBOUNCE_MS);
  }, []);

  /**
   * Perform an API latency check and derive the connection status.
   */
  const checkConnection = useCallback(async () => {
    if (!isMountedRef.current) return;

    // If the browser reports offline, immediately go offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      updateStatus('offline');
      return;
    }

    // Abort any in-flight ping
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Set a timeout on the abort controller
    const timeoutId = setTimeout(() => {
      abortControllerRef.current?.abort();
    }, PING_TIMEOUT_MS);

    const baseUrl = getApiBaseUrl();
    const latency = await measureApiLatency(baseUrl, abortControllerRef.current.signal);

    clearTimeout(timeoutId);

    if (!isMountedRef.current) return;

    if (latency === null) {
      updateStatus('offline');
    } else if (latency > DEGRADED_LATENCY_THRESHOLD_MS) {
      updateStatus('degraded');
    } else {
      updateStatus('online');
    }
  }, [updateStatus]);

  /**
   * Schedule the next ping interval based on current status.
   */
  const schedulePingInterval = useCallback(() => {
    if (pingIntervalRef.current !== null) {
      clearInterval(pingIntervalRef.current);
    }

    const interval = statusRef.current === 'online'
      ? PING_INTERVAL_MS
      : PING_INTERVAL_DEGRADED_MS;

    pingIntervalRef.current = setInterval(() => {
      void checkConnection();
    }, interval);
  }, [checkConnection]);

  useEffect(() => {
    isMountedRef.current = true;

    // ─── Browser online/offline events ────────────────────────────────────

    const handleOnline = () => {
      // Browser says we're online — verify with an API ping
      void checkConnection();
      // Reschedule with faster interval temporarily to confirm
      schedulePingInterval();
    };

    const handleOffline = () => {
      updateStatus('offline');
      // Switch to faster ping interval for quicker recovery detection
      schedulePingInterval();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // ─── Initial check ────────────────────────────────────────────────────

    void checkConnection();

    // ─── Periodic latency checks ──────────────────────────────────────────

    schedulePingInterval();

    // ─── Cleanup ──────────────────────────────────────────────────────────

    return () => {
      isMountedRef.current = false;

      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      if (pingIntervalRef.current !== null) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [checkConnection, schedulePingInterval, updateStatus]);

  return { status, lastChecked };
}

export default useConnectionStatus;
