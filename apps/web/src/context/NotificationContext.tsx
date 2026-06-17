import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback, useMemo } from 'react';
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

// ─── State & Actions ──────────────────────────────────────────────────────────

/** Read-only notification state exposed via value context. */
export interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  hasMore: boolean;
  isLoading: boolean;
  latestNotification: Notification | null;
  bellShake: boolean;
}

/** Dispatch functions exposed via dispatch context. */
export interface NotificationDispatch {
  fetchNotifications: (reset?: boolean) => void;
  loadMore: () => void;
  markAsRead: (id: string | number) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string | number) => void;
  clearLatest: () => void;
}

/** Legacy combined type for backward compatibility. */
interface NotificationContextType extends NotificationState, NotificationDispatch {}

// ─── Reducer ──────────────────────────────────────────────────────────────────

type NotificationAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_NOTIFICATIONS'; payload: { items: Notification[]; reset: boolean } }
  | { type: 'APPEND_NOTIFICATIONS'; payload: Notification[] }
  | { type: 'SET_HAS_MORE'; payload: boolean }
  | { type: 'SET_UNREAD_COUNT'; payload: number }
  | { type: 'INCREMENT_UNREAD' }
  | { type: 'MARK_READ'; payload: string | number }
  | { type: 'MARK_ALL_READ' }
  | { type: 'DELETE_NOTIFICATION'; payload: string | number }
  | { type: 'PREPEND_NOTIFICATION'; payload: Notification }
  | { type: 'SET_LATEST'; payload: Notification | null }
  | { type: 'SET_BELL_SHAKE'; payload: boolean }
  | { type: 'RESET' };

const defaultState: NotificationState = {
  notifications: [],
  unreadCount: 0,
  hasMore: true,
  isLoading: false,
  latestNotification: null,
  bellShake: false,
};

export function notificationReducer(state: NotificationState, action: NotificationAction): NotificationState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_NOTIFICATIONS':
      return {
        ...state,
        notifications: action.payload.reset
          ? action.payload.items
          : [...state.notifications, ...action.payload.items],
        hasMore: action.payload.items.length === 20,
      };
    case 'APPEND_NOTIFICATIONS':
      return {
        ...state,
        notifications: [...state.notifications, ...action.payload],
        hasMore: action.payload.length === 20,
      };
    case 'SET_HAS_MORE':
      return { ...state, hasMore: action.payload };
    case 'SET_UNREAD_COUNT':
      return { ...state, unreadCount: action.payload };
    case 'INCREMENT_UNREAD':
      return { ...state, unreadCount: state.unreadCount + 1 };
    case 'MARK_READ': {
      const notifications = state.notifications.map(n =>
        n.id === action.payload ? { ...n, is_read: true, status: 'Read' as const } : n
      );
      return {
        ...state,
        notifications,
        unreadCount: Math.max(0, state.unreadCount - (
          state.notifications.find(n => n.id === action.payload && !n.is_read) ? 1 : 0
        )),
      };
    }
    case 'MARK_ALL_READ':
      return {
        ...state,
        notifications: state.notifications.map(n => ({ ...n, is_read: true, status: 'Read' })),
        unreadCount: 0,
      };
    case 'DELETE_NOTIFICATION': {
      const target = state.notifications.find(n => n.id === action.payload);
      const wasUnread = target && !target.is_read;
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.payload),
        unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      };
    }
    case 'PREPEND_NOTIFICATION':
      return {
        ...state,
        notifications: [action.payload, ...state.notifications],
      };
    case 'SET_LATEST':
      return { ...state, latestNotification: action.payload };
    case 'SET_BELL_SHAKE':
      return { ...state, bellShake: action.payload };
    case 'RESET':
      return defaultState;
    default:
      return state;
  }
}

// ─── Contexts ─────────────────────────────────────────────────────────────────

const noopDispatch: NotificationDispatch = {
  fetchNotifications: () => {},
  loadMore: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
  deleteNotification: () => {},
  clearLatest: () => {},
};

const NotificationValueContext = createContext<NotificationState>(defaultState);
const NotificationDispatchContext = createContext<NotificationDispatch>(noopDispatch);

// Legacy combined context for backward compatibility
const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// ─── Exported Pure Helpers ────────────────────────────────────────────────────

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
 */
export function unreadDelta(prev: Notification[], next: Notification[]): number {
  return recomputeUnread(next) - recomputeUnread(prev);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const { isCheckingSession } = useAuth();
  const [state, dispatch] = useReducer(notificationReducer, defaultState);
  const pageRef = React.useRef(1);

  /** Resilient WebSocket client (exponential backoff + jitter + HTTP polling fallback). */
  const wsClientRef = useRef<WebSocketClient | null>(null);
  const bellShakeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchNotifications = useCallback(async (reset = false) => {
    if (!user || state.isLoading) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const targetPage = reset ? 1 : pageRef.current;
      const res = await api.get(`/notifications?page=${targetPage}&pageSize=20`);
      const items: Notification[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);

      dispatch({ type: 'SET_NOTIFICATIONS', payload: { items, reset } });
      if (reset) {
        pageRef.current = 2;
      } else {
        pageRef.current += 1;
      }
    } catch (err: any) {
      if (err.response?.status !== 401 && err.response?.status !== 403) {
        logger.error('Failed to fetch notifications:', err);
      }
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [user, state.isLoading]);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/notifications/unread-count');
      dispatch({ type: 'SET_UNREAD_COUNT', payload: res.data?.count || 0 });
    } catch { /* ignore */ }
  }, [user]);

  const loadMore = useCallback(() => {
    if (state.hasMore && !state.isLoading) {
      fetchNotifications(false);
    }
  }, [state.hasMore, state.isLoading, fetchNotifications]);

  /**
   * Handle an incoming real-time notification from the WebSocket client.
   */
  const handleIncomingNotification = useCallback((payload: Notification) => {
    const newNotif: Notification = {
      ...payload,
      is_read: false,
      status: 'Unread',
    };
    dispatch({ type: 'PREPEND_NOTIFICATION', payload: newNotif });
    dispatch({ type: 'INCREMENT_UNREAD' });
    dispatch({ type: 'SET_LATEST', payload: newNotif });
    dispatch({ type: 'SET_BELL_SHAKE', payload: true });
    if (bellShakeTimeoutRef.current) clearTimeout(bellShakeTimeoutRef.current);
    bellShakeTimeoutRef.current = setTimeout(() => dispatch({ type: 'SET_BELL_SHAKE', payload: false }), 1000);
    playNotificationSound();
  }, []);

  /**
   * Establish the real-time connection using the resilient WebSocketClient.
   */
  const connect = useCallback(async () => {
    if (!user) return;

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

  // Store callbacks in refs so the connection effect can re-run
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
      dispatch({ type: 'RESET' });
      pageRef.current = 1;
      if (wsClientRef.current) { wsClientRef.current.disconnect(); wsClientRef.current = null; }
    }
  }, [user, isCheckingSession]);

  const markAsRead = useCallback(async (id: string | number) => {
    if (!user) return;
    try {
      await api.put(`/notifications/${id}/read`);
      dispatch({ type: 'MARK_READ', payload: id });
    } catch (err) { logger.error('Failed to mark notification as read:', err); }
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    try {
      await api.put('/notifications/mark-all-read');
      dispatch({ type: 'MARK_ALL_READ' });
    } catch (err) { logger.error('Failed to mark all as read:', err); }
  }, [user]);

  const deleteNotification = useCallback(async (id: string | number) => {
    if (!user) return;
    try {
      await api.delete(`/notifications/${id}`);
      dispatch({ type: 'DELETE_NOTIFICATION', payload: id });
    } catch (err) { logger.error('Failed to dismiss notification:', err); }
  }, [user]);

  const clearLatest = useCallback(() => {
    dispatch({ type: 'SET_LATEST', payload: null });
  }, []);

  // ── Dispatch object (stable reference: only changes when action callbacks change) ──
  const dispatchActions = useMemo<NotificationDispatch>(() => ({
    fetchNotifications,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearLatest,
  }), [fetchNotifications, loadMore, markAsRead, markAllAsRead, deleteNotification, clearLatest]);

  // Legacy combined value
  const combined = useMemo<NotificationContextType>(() => ({
    ...state,
    ...dispatchActions,
  }), [state, dispatchActions]);

  return (
    <NotificationContext.Provider value={combined}>
      <NotificationDispatchContext.Provider value={dispatchActions}>
        <NotificationValueContext.Provider value={state}>
          {children}
        </NotificationValueContext.Provider>
      </NotificationDispatchContext.Provider>
    </NotificationContext.Provider>
  );
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Read-only notification state. Re-renders only when state values change. */
export function useNotificationValue(): NotificationState {
  return useContext(NotificationValueContext);
}

/** Notification dispatch actions. Stable reference — rarely causes re-renders. */
export function useNotificationDispatch(): NotificationDispatch {
  return useContext(NotificationDispatchContext);
}

/** Legacy hook — returns combined value + dispatch. Use useNotificationValue/useNotificationDispatch for selective subscriptions. */
export const useNotificationContext = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotificationContext must be used within NotificationProvider');
  return context;
};
