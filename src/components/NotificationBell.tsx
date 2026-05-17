
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePreferences } from '../context/PreferencesContext';
import { useNotificationContext } from '../context/NotificationContext';
import { Bell, Check, Trash2, ExternalLink, FileText, AlertTriangle, Info, UserPlus, Settings, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import InteractiveIcon from './InteractiveIcon';
import { useFormat } from '../services/formatService';
import { getTranslatedNotificationMessage, getTranslatedNotificationModule } from '../utils/notificationHelpers';

const NotificationBell: React.FC = () => {
  const { language } = usePreferences();
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, bellShake } = useNotificationContext();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { formatNumber } = useFormat();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = (notification: any) => {
    if (!notification.is_read && notification.status !== 'Read') {
      markAsRead(notification.id);
    }
    if (notification.link) {
      // Extract the tab name from the link (e.g., /audit-plans -> plan)
      // This mapping needs to be consistent with App.tsx switch cases
      const link = notification.link.replace('/', '');
      let tab = 'dashboard';
      if (link.includes('audit-plans')) tab = 'plan';
      else if (link.includes('audit-tasks')) tab = 'tasks';
      else if (link.includes('audit-programs')) tab = 'library';
      else if (link.includes('audit-findings')) tab = 'findings';
      else if (link.includes('audit-evidence')) tab = 'evidence';
      else if (link.includes('recommendations')) tab = 'recommendations';
      else if (link.includes('risk-register')) tab = 'risks';
      else if (link.includes('central-bank')) tab = 'compliance-matrix';
      else if (link.includes('law-bank')) tab = 'compliance-matrix';
      else if (link.includes('policies')) tab = 'compliance-matrix';
      else if (link.includes('fraud-log')) tab = 'fraud';
      else if (link.includes('departments')) tab = 'departments';
      else if (link.includes('org-structure')) tab = 'org';
      else if (link.includes('audit-trail')) tab = 'trail';
      else if (link.includes('users')) tab = 'users';
      else if (link.includes('notifications')) tab = 'notifications';
      
      navigate(`/${tab}`);
      setIsOpen(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'record_created':
      case 'Created': return <FileText size={16} className="text-emerald-500" />;
      case 'task_assigned':
      case 'plan_assigned':
      case 'Updated': return <Info size={16} className="text-blue-500" />;
      case 'recommendation_overdue':
      case 'recommendation_due_soon':
      case 'instruction_overdue':
      case 'Alert': return <AlertTriangle size={16} className="text-amber-500" />;
      case 'access_requested':
      case 'User': return <UserPlus size={16} className="text-purple-500" />;
      case 'account_locked':
      case 'password_reset_request':
      case 'permission_changed':
      case 'Security': return <Shield size={16} className="text-rose-500" />;
      case 'risk_added':
      case 'risk_updated':
      case 'risk_escalated':
        return <AlertTriangle size={16} className="text-rose-500" />;
      case 'finding_added':
      case 'evidence_uploaded':
        return <FileText size={16} className="text-blue-500" />;
      case 'comment_added':
      case 'comment_mentioned':
        return <Info size={16} className="text-indigo-500" />;
      case 'access_approved':
        return <Settings size={16} className="text-emerald-500" />;
      case 'access_rejected':
        return <Shield size={16} className="text-rose-500" />;
      case 'plan_started':
      case 'task_completed':
        return <FileText size={16} className="text-emerald-500" />;
      default: return <Bell size={16} className="text-[var(--color-text-muted)]" />;
    }
  };

  const recentNotifications = notifications.slice(0, 5);

  return (
    <div className="relative" ref={dropdownRef}>
      <InteractiveIcon 
        icon={Bell}
        onClick={() => setIsOpen(!isOpen)}
        badge={unreadCount > 0 ? (unreadCount > 9 ? formatNumber(9) + '+' : formatNumber(unreadCount)) : undefined}
        tooltip={t('common.notifications')}
        variant="outline"
        className={`!p-2.5 ${bellShake ? 'animate-[bell-ring_0.6s_ease-in-out]' : ''}`}
        ariaExpanded={isOpen}
      />

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className={`absolute top-12 start-0 w-80 md:w-96 bg-[var(--color-card)] rounded-2xl shadow-[0_8px_30px_rgb(10,125,133,0.12)] border border-[var(--color-border-soft)] overflow-hidden z-[9999]`}
          >
            <div className="p-4 border-b border-[var(--color-border-soft)] flex items-center justify-between bg-[var(--color-bg-soft)]/50">
              <h3 className="font-bold text-[var(--color-text-main)] text-sm">{t('common.notifications')}</h3>
              {unreadCount > 0 && (
                <InteractiveIcon 
                  icon={Check}
                  onClick={() => markAllAsRead()}
                  tooltip={t('common.markAllRead')}
                  variant="ghost"
                  className="!p-1.5"
                  size={14}
                >
                  <span className="ms-1 text-[10px] font-bold uppercase tracking-wider">{t('common.markAllRead')}</span>
                </InteractiveIcon>
              )}
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-12 h-12 bg-[var(--color-bg-soft)] rounded-full flex items-center justify-center mx-auto mb-3 text-[var(--color-text-muted)]">
                    <Bell size={24} />
                  </div>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">{t('common.noNotificationsYet')}</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--color-border-soft)]/50">
                  {(Array.isArray(recentNotifications) ? recentNotifications : []).map(notification => (
                    <div 
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`p-4 hover:bg-[var(--color-bg-soft)] transition-colors cursor-pointer ${(!notification.is_read && notification.status !== 'Read') ? 'bg-[var(--color-primary-light)]' : ''}`}
                    >
                      <div className="flex gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${(!notification.is_read && notification.status !== 'Read') ? 'bg-[var(--color-card)] shadow-sm' : 'bg-[var(--color-bg-soft)]'}`}>
                          {getIcon(notification.event_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          {notification.title && (
                            <p className={`text-xs font-bold ${(!notification.is_read && notification.status !== 'Read') ? 'text-[var(--color-text-main)]' : 'text-[var(--color-text-muted)]'}`}>
                              {notification.title}
                            </p>
                          )}
                          <p className={`text-sm ${(!notification.is_read && notification.status !== 'Read') ? 'font-bold text-[var(--color-text-main)]' : 'font-medium text-[var(--color-text-muted)]'}`}>
                            {getTranslatedNotificationMessage(notification.description, t, language)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                              {getTranslatedNotificationModule(notification.related_module, t)}
                            </span>
                            <span className="text-[10px] text-[var(--color-border-strong)]">•</span>
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              {new Date(notification.date).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        {(!notification.is_read && notification.status !== 'Read') && (
                          <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] shrink-0 mt-2" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-[var(--color-border-soft)] bg-[var(--color-bg-soft)]/50 text-center">
              <button 
                onClick={() => {
                  navigate('/notifications');
                  setIsOpen(false);
                }}
                className="text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-primary)] uppercase tracking-widest transition-colors"
              >
                {t('common.viewAllNotifications')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
