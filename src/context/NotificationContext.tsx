import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { Notification } from '../types';
import { useAppContext } from './AppContext';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  fetchNotifications: () => void;
  markAsRead: (id: number) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: number) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAppContext();
  const { isCheckingSession } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (isCheckingSession) return;
    if (user) {
      fetchNotifications();
      
      // Fetch on window focus to keep data fresh without aggressive polling
      const handleFocus = () => {
        fetchNotifications();
      };
      
      window.addEventListener('focus', handleFocus);
      
      // Much less frequent polling as a fallback (every 10 minutes)
      const interval = setInterval(fetchNotifications, 10 * 60 * 1000); 
      
      return () => {
        window.removeEventListener('focus', handleFocus);
        clearInterval(interval);
      };
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [user, isCheckingSession]);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data);
      setUnreadCount(res.data.filter((n: Notification) => n.status === 'Unread').length);
    } catch (err: any) {
      if (err.response?.status !== 401 && err.response?.status !== 403) {
        console.error('Failed to fetch notifications:', err);
      }
    }
  };

  const markAsRead = async (id: number) => {
    if (!user) return;
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'Read' } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    try {
      await api.put(`/notifications/mark-all-read`);
      setNotifications(prev => prev.map(n => ({ ...n, status: 'Read' })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const deleteNotification = async (id: number) => {
    if (!user) return;
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications(prev => {
        const notificationToDelete = prev.find(n => n.id === id);
        if (notificationToDelete?.status === 'Unread') {
          setUnreadCount(count => Math.max(0, count - 1));
        }
        return prev.filter(n => n.id !== id);
      });
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  return (
    <NotificationContext.Provider value={{
      notifications, unreadCount, fetchNotifications, markAsRead, markAllAsRead, deleteNotification
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
