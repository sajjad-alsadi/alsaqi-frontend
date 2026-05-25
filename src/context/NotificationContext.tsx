import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { Notification } from '../types';
import { useUser } from './UserContext';
import { useAuth } from './AuthContext';
import logger from '../utils/logger';

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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  // WebSocket connection for real-time notifications
  const connectWebSocket = useCallback(async () => {
    if (!user) return;
    try {
      // Fetch a short-lived WebSocket token from the server
      const res = await api.get('/auth/ws-token');
      const wsToken = res.data?.token;
      if (!wsToken) return;

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${protocol}://${window.location.host}?token=${wsToken}`);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'NEW_NOTIFICATION') {
            const newNotif: Notification = {
              ...msg.notification,
              is_read: false,
              status: 'Unread',
            };
            // Prepend to list
            setNotifications(prev => [newNotif, ...prev]);
            setUnreadCount(prev => prev + 1);
            // Trigger toast
            setLatestNotification(newNotif);
            // Trigger bell shake
            setBellShake(true);
            if (bellShakeTimeoutRef.current) clearTimeout(bellShakeTimeoutRef.current);
            bellShakeTimeoutRef.current = setTimeout(() => setBellShake(false), 1000);
            // Play sound
            playNotificationSound();
          }
        } catch { /* ignore non-JSON */ }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (user) {
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
        }
      };

      ws.onerror = () => { ws.close(); };
      wsRef.current = ws;
    } catch { /* WebSocket not available or token fetch failed */ }
  }, [user]);

  const playNotificationSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch { /* audio not available */ }
  };

  useEffect(() => {
    if (isCheckingSession) return;
    if (user) {
      fetchNotifications(true);
      fetchUnreadCount();
      connectWebSocket();

      const handleFocus = () => { fetchUnreadCount(); };
      window.addEventListener('focus', handleFocus);
      const interval = setInterval(fetchUnreadCount, 3 * 60 * 1000);

      return () => {
        window.removeEventListener('focus', handleFocus);
        clearInterval(interval);
        if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        if (bellShakeTimeoutRef.current) clearTimeout(bellShakeTimeoutRef.current);
      };
    } else {
      setNotifications([]);
      setUnreadCount(0);
      setPage(1);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    }
  }, [user, isCheckingSession]);

  const markAsRead = async (id: string | number) => {
    if (!user) return;
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true, status: 'Read' } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
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
      setNotifications(prev => {
        const n = prev.find(x => x.id === id);
        if (n && !n.is_read && n.status !== 'Read') {
          setUnreadCount(c => Math.max(0, c - 1));
        }
        return prev.filter(x => x.id !== id);
      });
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
