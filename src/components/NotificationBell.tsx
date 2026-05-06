
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useNotificationContext } from '../context/NotificationContext';
import { Bell, Check, Trash2, ExternalLink, FileText, AlertTriangle, Info, UserPlus, Settings, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import InteractiveIcon from './InteractiveIcon';
import { useFormat } from '../services/formatService';
import { getTranslatedNotificationMessage, getTranslatedNotificationModule } from '../utils/notificationHelpers';

const NotificationBell: React.FC = () => {
  const { language } = useAppContext();
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotificationContext();
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
    if (notification.status === 'Unread') {
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
      case 'Created': return <FileText size={16} className="text-emerald-500" />;
      case 'Updated': return <Info size={16} className="text-blue-500" />;
      case 'Alert': return <AlertTriangle size={16} className="text-amber-500" />;
      case 'User': return <UserPlus size={16} className="text-purple-500" />;
      case 'Security': return <Shield size={16} className="text-rose-500" />;
      default: return <Bell size={16} className="text-slate-500" />;
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
        className="!p-2.5"
      />

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className={`absolute top-12 start-0 w-80 md:w-96 bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(10,125,133,0.12)] border border-slate-100 overflow-hidden z-50`}
          >
            <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-black text-slate-800 text-sm">{t('common.notifications')}</h3>
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
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-300">
                    <Bell size={24} />
                  </div>
                  <p className="text-xs font-bold text-slate-400">{t('common.noNotificationsYet')}</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {(Array.isArray(recentNotifications) ? recentNotifications : []).map(notification => (
                    <div 
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer ${notification.status === 'Unread' ? 'bg-blue-50/30' : ''}`}
                    >
                      <div className="flex gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${notification.status === 'Unread' ? 'bg-white shadow-sm' : 'bg-slate-100'}`}>
                          {getIcon(notification.event_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${notification.status === 'Unread' ? 'font-bold text-slate-800' : 'font-medium text-slate-600'}`}>
                            {getTranslatedNotificationMessage(notification.description, t, language)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              {getTranslatedNotificationModule(notification.related_module, t)}
                            </span>
                            <span className="text-[10px] text-slate-300">•</span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(notification.date).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        {notification.status === 'Unread' && (
                          <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-50 bg-slate-50/50 text-center">
              <button 
                onClick={() => {
                  navigate('/notifications');
                  setIsOpen(false);
                }}
                className="text-xs font-black text-slate-500 hover:text-primary uppercase tracking-widest transition-colors"
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
