import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/httpClient';
import { Notification } from '../types';
import { useUser } from './UserContext';
import { useAuth } from './AuthContext';
import logger from '../utils/logger';
import {
  createWebSocketClient,
  type WebSocketClient,
  type ConnectionState,
} from '../api/ws/websocket-client';
import { playNotificationSound } from '../utils/notificationSound';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  hasMore: boolean;
  isLoading: boolean;
  fetchNotifications: (reset?: boolean) => void;
  loadMore: () => void;
  markAsRead: (id: string | number) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string | number) => void;
  /** New real-time notification that just arrived (for toast) */
  latestNotification: Notification | null;
  clearLatest: () => void;
  /** Bell should shake */
  bellShake: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

/**
 * Authoritative unread count derived from a notification list.
 *
 * This is the single source of truth for "how many notifications are unread":
 * the invariant `unreadCount === recomputeUnread(notifications)` must hold after
 * every operation. (Requirement 8.5)
 *
 * Pure: depends only on its argument and has no side effects.
 */
export function recomputeUnread(list: Notification[]): number {
  return list.reduce((count, n) => (n.is_read ? count : count + 1), 0);
}

/**
 * Pure unread-counter delta between two notification lists.
 *
 * Returns the signed change in unread count when transitioning from `prev` to
 * `next` (`next` unread total minus `prev` unread total). Computing the delta as
 * a pure function of the two lists lets callers derive the change *before* and
 * *outside* of any React state-updater callback, which keeps updates idempotent
 * under React StrictMode double-invocation. (Requirements 8.3, 8.4)
 *
 * Pure: depends only on its arguments and has no side effects.
 */
export function unreadDelta(prev: Notification[], next: Notification[]): number {
  return recomputeUnread(next) - recomputeUnread(prev);
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const { isCheckingSession } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [latestNotification, setLatestNotification] = useState<Notification | null>(null);
  const [bellShake, setBellShake] = useState(false);
  /** Resilient WebSocket client (exponential backoff + jitter + HTTP polling fallback). */
  const wsClientRef = useRef<WebSocketClient | null>(null);
  const bellShakeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchNotifications = useCallback(async (reset = false) => {
    if (!user || isLoading) return;
    setIsLoading(true);
    try {
      const targetPage = reset ? 1 : page;
      const res = await api.get(`/notifications?page=${targetPage}&pageSize=20`);
      // API returns { data: Notification[], pagination: {...} }
      const items: Notification[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      
      if (reset) {
        setNotifications(items);
        setPage(2);
      } else {
        setNotifications(prev => [...prev, ...items]);
        setPage(prev => prev + 1);
      }
      setHasMore(items.length === 20);
    } catch (err: any) {
      if (err.response?.status !== 401 && err.response?.status !== 403) {
        logger.error('Failed to fetch notifications:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user, page, isLoading]);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/notifications/unread-count');
      setUnreadCount(res.data?.count || 0);
    } catch { /* ignore */ }
  }, [user]);

  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      fetchNotifications(false);
    }
  }, [hasMore, isLoading, fetchNotifications]);

  /**
   * Handle an incoming real-time notification from the WebSocket client.
   * Maps the server payload onto the local Notification shape, prepends it,
   * bumps the unread count, raises a toast, shakes the bell, and plays a sound.
   */
  const handleIncomingNotification = useCallback((payload: Notification) => {
    const newNotif: Notification = {
      ...payload,
      is_read: false,
      status: 'Unread',
    };
    setNotifications(prev => [newNotif, ...prev]);
    setUnreadCount(prev => prev + 1);
    setLatestNotification(newNotif);
    setBellShake(true);
    if (bellShakeTimeoutRef.current) clearTimeout(bellShakeTimeoutRef.current);
    bellShakeTimeoutRef.current = setTimeout(() => setBellShake(false), 1000);
    playNotificationSound();
  }, []);

  /**
   * Establish the real-time connection using the resilient WebSocketClient.
   * A fresh short-lived ws-token is fetched per connection attempt via the
   * client's async `getToken` (Requirement 7.1, 7.2) — no token is cached across
   * attempts, so each reconnect uses a newly issued, non-expired token.
   */
  const connect = useCallback(async () => {
    if (!user) return;

    // Tear down any existing client before opening a new connect cycle.
    if (wsClientRef.current) {
      wsClientRef.current.disconnect();
      wsClientRef.current = null;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const env = (import.meta as any).env as Record<string, string> | undefined;
      const wsUrl = env?.['VITE_WS_URL'] || `${protocol}://${window.location.host}`;
      const httpBaseUrl = env?.['VITE_API_URL'] || '/api';

      const client = createWebSocketClient({
        wsUrl,
        // Fetch a FRESH short-lived ws-token on every connection attempt (no caching).
        getToken: async () => {
          try {
            const res = await api.get('/auth/ws-token');
            return res.data?.token ?? null;
          } catch {
            return null;
          }
        },
        httpBaseUrl,
        onNotification: (payload) => {
          handleIncomingNotification(payload as unknown as Notification);
        },
        onStateChange: (state: ConnectionState) => {
          if (import.meta.env.DEV) {
            logger.debug('Notification WebSocket state:', state);
          }
        },
        onReconnectionFailed: () => {
          if (import.meta.env.DEV) {
            logger.warn('Notification WebSocket reconnection attempts exhausted');
          }
        },
      });

      wsClientRef.current = client;
      client.connect();
    } catch {
      /* WebSocket not available */
    }
  }, [user, handleIncomingNotification]);

  // Store callbacks in refs so the connection effect can re-run on auth
  // user-state changes using current references without listing every callback
  // as a dependency (fixes the stale-closure effect-dependency bug).
  const connectRef = useRef(connect);
  const fetchNotificationsRef = useRef(fetchNotifications);
  const fetchUnreadCountRef = useRef(fetchUnreadCount);

  useEffect(() => { connectRef.current = connect; }, [connect]);
  useEffect(() => { fetchNotificationsRef.current = fetchNotifications; }, [fetchNotifications]);
  useEffect(() => { fetchUnreadCountRef.current = fetchUnreadCount; }, [fetchUnreadCount]);

  useEffect(() => {
    if (isCheckingSession) return;
    if (user) {
      fetchNotificationsRef.current(true);
      fetchUnreadCountRef.current();
      connectRef.current();

      const handleFocus = () => { fetchUnreadCountRef.current(); };
      window.addEventListener('focus', handleFocus);
      const interval = setInterval(() => fetchUnreadCountRef.current(), 3 * 60 * 1000);

      return () => {
        window.removeEventListener('focus', handleFocus);
        clearInterval(interval);
        if (wsClientRef.current) { wsClientRef.current.disconnect(); wsClientRef.current = null; }
        if (bellShakeTimeoutRef.current) clearTimeout(bellShakeTimeoutRef.current);
      };
    } else {
      setNotifications([]);
      setUnreadCount(0);
      setPage(1);
      if (wsClientRef.current) { wsClientRef.current.disconnect(); wsClientRef.current = null; }
    }
  }, [user, isCheckingSession]);

  const markAsRead = async (id: string | number) => {
    if (!user) return;
    try {
      await api.put(`/notifications/${id}/read`);
      // Compute the next list and the unread delta OUTSIDE the state-updater path
      // (no setUnreadCount inside the setNotifications callback) so the change is
      // pure and React StrictMode double-invocation is harmless (Req 8.3, 8.4).
      // The delta is non-zero only when the target was actually unread (Req 8.1, 8.2).
      const next = notifications.map(n => n.id === id ? { ...n, is_read: true, status: 'Read' as const } : n);
      const delta = unreadDelta(notifications, next);
      if (delta !== 0) setUnreadCount(c => Math.max(0, c + delta));
      setNotifications(next);
    } catch (err) { logger.error('Failed to mark notification as read:', err); }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    try {
      await api.put('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true, status: 'Read' })));
      setUnreadCount(0);
    } catch (err) { logger.error('Failed to mark all as read:', err); }
  };

  const deleteNotification = async (id: string | number) => {
    if (!user) return;
    try {
      await api.delete(`/notifications/${id}`);
      // Compute the next list and the unread delta BEFORE calling the state
      // updater (not inside the setNotifications callback), so the update is
      // StrictMode-safe and idempotent (Req 8.3, 8.4).
      const next = notifications.filter(x => x.id !== id);
      const delta = unreadDelta(notifications, next);
      if (delta !== 0) setUnreadCount(c => Math.max(0, c + delta));
      setNotifications(next);
    } catch (err) { logger.error('Failed to dismiss notification:', err); }
  };

  const clearLatest = () => setLatestNotification(null);

  return (
    <NotificationContext.Provider value={{
      notifications, unreadCount, hasMore, isLoading,
      fetchNotifications, loadMore, markAsRead, markAllAsRead, deleteNotification,
      latestNotification, clearLatest, bellShake
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotificationContext = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotificationContext must be used within NotificationProvider');
  return context;
};
