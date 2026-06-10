/**
 * Offline Guard Hook
 *
 * Prevents form submission while the application is offline and notifies the
 * user via a toast. React-hook-form already preserves form data in component
 * state — this hook simply wraps the submit handler to block the network call
 * until connectivity is restored.
 *
 * Usage:
 * ```ts
 * const { guardedSubmit, isOffline } = useOfflineGuard();
 * const onSubmit = guardedSubmit(async (data) => { await api.post(...) });
 * ```
 *
 * Requirements: 3.5
 */

import { useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { useConnectionStatus } from './useConnectionStatus';
import type { ConnectionStatus } from './useConnectionStatus';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OfflineGuardResult {
  /** Whether the connection is currently offline */
  isOffline: boolean;
  /** Whether the connection is degraded (high latency) */
  isDegraded: boolean;
  /** Current connection status */
  status: ConnectionStatus;
  /**
   * Wraps a submit handler so that it is blocked when offline.
   * The original handler is only called when the connection is online or degraded.
   * When offline, a toast notification informs the user.
   */
  guardedSubmit: <TData>(
    handler: (data: TData) => Promise<void> | void
  ) => (data: TData) => Promise<void>;
}

// ─── Toast throttle ───────────────────────────────────────────────────────────

/** Minimum interval between offline toast notifications (ms) */
const TOAST_THROTTLE_MS = 3000;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOfflineGuard(): OfflineGuardResult {
  const { status } = useConnectionStatus();
  const lastToastRef = useRef<number>(0);

  const isOffline = status === 'offline';
  const isDegraded = status === 'degraded';

  const guardedSubmit = useCallback(
    <TData>(handler: (data: TData) => Promise<void> | void) => {
      return async (data: TData): Promise<void> => {
        if (status === 'offline') {
          // Throttle toast to avoid spamming the user
          const now = Date.now();
          if (now - lastToastRef.current > TOAST_THROTTLE_MS) {
            lastToastRef.current = now;
            toast.error(
              'لا يمكن إرسال البيانات أثناء انقطاع الاتصال. سيتم الاحتفاظ ببياناتك حتى يعود الاتصال.',
              { duration: 4000, id: 'offline-submit-blocked' }
            );
          }
          // Do NOT call the handler — form data stays in react-hook-form state
          return;
        }

        // Connection is online or degraded — allow submission
        await handler(data);
      };
    },
    [status]
  );

  return {
    isOffline,
    isDegraded,
    status,
    guardedSubmit,
  };
}

export default useOfflineGuard;
