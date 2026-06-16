
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePreferences } from '../context/PreferencesContext';
import { useNotificationContext } from '../context/NotificationContext';
import { useTranslation } from 'react-i18next';
import { Bell, Check, Trash2, Search, Calendar, FileText, Info, AlertTriangle, UserPlus, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Modal from '../components/Modal';
import { getTranslatedNotificationMessage, getTranslatedNotificationModule } from '../utils/notificationHelpers';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '../components/LoadingSpinner';
import { CardSkeleton } from '../components/SkeletonLoader';

const Notifications: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { language } = usePreferences();
  const { notifications, markAsRead, markAllAsRead, deleteNotification, loadMore, hasMore, isLoading } = useNotificationContext();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [notificationToDelete, setNotificationToDelete] = useState<string | number | null>(null);

  const handleNotificationClick = (notification: any) => {
    if (!notification.is_read && notification.status !== 'Read') {
      markAsRead(notification.id);
    }
    if (notification.link) {
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
      else if (link.includes('audit-trail')) tab = 'trail';
      else if (link.includes('users')) tab = 'users';
      
      navigate(`/${tab}`);
    }
  };

  const isUnread = (n: any) => !n.is_read && n.status !== 'Read';

  const filteredNotifications = (Array.isArray(notifications) ? notifications : []).filter(n => {
    const matchesFilter = filter === 'all' ? true : 
                          filter === 'unread' ? isUnread(n) : 
                          !isUnread(n);
    const matchesSearch = (n.description?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                          (n.related_module?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                          (n.title?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'Created': return <FileText size={20} className="text-emerald-500" />;
      case 'Updated': return <Info size={20} className="text-blue-500" />;
      case 'Alert': return <AlertTriangle size={20} className="text-amber-500" />;
      case 'User': return <UserPlus size={20} className="text-purple-500" />;
      case 'Security': return <Shield size={20} className="text-rose-500" />;
      default: return <Bell size={20} className="text-[var(--color-text-muted)]" />;
    }
  };

  return (
    <div className="space-y-8" dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
            <Bell size={32} />
          </div>
          <div>
            <h2 className="text-2xl sm:text-4xl font-bold text-[var(--color-text-main)] tracking-tight mb-2">{t('common.notifications')}</h2>
            <p className="text-sm text-[var(--color-text-muted)] font-bold">{t('common.stayUpdated')}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button 
            onClick={() => markAllAsRead()}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Check size={18} />
            <span>{t('common.markAllRead')}</span>
          </Button>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex gap-2 p-1.5 bg-[var(--color-card)] rounded-2xl w-fit border border-[var(--color-border-soft)]">
            <button 
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${filter === 'all' ? 'bg-[var(--color-primary)] text-white shadow-md shadow-[var(--color-primary)]/20' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-bg-soft)]'}`}
            >
              {t('common.all')}
            </button>
            <button 
              onClick={() => setFilter('unread')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${filter === 'unread' ? 'bg-[var(--color-primary)] text-white shadow-md shadow-[var(--color-primary)]/20' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-bg-soft)]'}`}
            >
              {t('common.unread')}
            </button>
            <button 
              onClick={() => setFilter('read')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${filter === 'read' ? 'bg-[var(--color-primary)] text-white shadow-md shadow-[var(--color-primary)]/20' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-bg-soft)]'}`}
            >
              {t('common.read')}
            </button>
          </div>
          <div className="relative flex-1">
            <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={18} />
            <input 
              type="text" 
              placeholder={t('common.searchNotifications')} 
              className="input-field !ps-12"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-4">
          {isLoading && notifications.length === 0 ? (
            <CardSkeleton count={6} />
          ) : (
          <AnimatePresence>
            {filteredNotifications.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20"
              >
                <div className="w-20 h-20 bg-[var(--color-bg-soft)] rounded-full flex items-center justify-center mx-auto mb-4 text-[var(--color-border-strong)]">
                  <Bell size={40} />
                </div>
                <h3 className="text-xl font-bold text-[var(--color-text-main)] mb-2">{t('common.noNotificationsFound')}</h3>
                <p className="text-[var(--color-text-muted)] text-sm font-bold">{t('common.tryAdjustingFilters')}</p>
              </motion.div>
            ) : (
              (Array.isArray(filteredNotifications) ? filteredNotifications : []).map((notification) => (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  onClick={() => handleNotificationClick(notification)}
                  className={`relative group p-6 rounded-2xl border transition-all cursor-pointer ${isUnread(notification) ? 'bg-[var(--color-card)] border-[var(--color-primary)]/20 shadow-lg shadow-[var(--color-primary)]/5' : 'bg-[var(--color-bg-soft)]/50 border-[var(--color-border-soft)]'}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isUnread(notification) ? 'bg-[var(--color-primary)]/10 shadow-inner' : 'bg-[var(--color-card)] border border-[var(--color-border-soft)]'}`}>
                      {getIcon(notification.event_type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1 pe-12">
                        <span className={`text-xs font-bold uppercase tracking-widest ${isUnread(notification) ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}>
                          {getTranslatedNotificationModule(notification.related_module, t)}
                        </span>
                        <span className="text-xs font-bold text-[var(--color-text-muted)] flex items-center gap-1">
                          <Calendar size={12} />
                          {new Date(notification.date).toLocaleString(i18n.language)}
                        </span>
                      </div>
                      
                      {notification.title && (
                        <p className={`text-sm font-bold mb-1 ${isUnread(notification) ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}>
                          {notification.title}
                        </p>
                      )}
                      
                      <h3 className={`text-lg font-bold mb-2 pe-12 ${isUnread(notification) ? 'text-[var(--color-text-main)]' : 'text-[var(--color-text-muted)]'}`}>
                        {getTranslatedNotificationMessage(notification.description, t, language)}
                      </h3>
                      
                      <div className="flex items-center gap-4 mt-4">
                        {isUnread(notification) && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              notification.id && markAsRead(notification.id);
                            }}
                            className="text-xs font-bold text-[var(--color-primary)] hover:text-[var(--color-primary)]/80 uppercase tracking-wider flex items-center gap-1"
                          >
                            <Check size={14} /> {t('common.markAsRead')}
                          </button>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (notification.id) {
                              setNotificationToDelete(notification.id);
                              setIsDeleteModalOpen(true);
                            }
                          }}
                          className="text-xs font-bold text-[var(--color-text-muted)] hover:text-rose-500 uppercase tracking-wider flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={14} /> {t('common.delete')}
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {isUnread(notification) && (
                    <div className="absolute top-1/2 -translate-y-1/2 end-6 w-3 h-3 bg-[var(--color-primary)] rounded-full shadow-lg shadow-[var(--color-primary)]/20 animate-pulse" />
                  )}
                </motion.div>
              ))
            )}
          </AnimatePresence>
          )}
          
          {/* Load More Button */}
          {hasMore && !isLoading && (
            <div className="text-center pt-6">
              <Button 
                onClick={loadMore}
                variant="outline"
                className="px-8"
              >
                {t('common.loadMore')}
              </Button>
            </div>
          )}
          {isLoading && notifications.length > 0 && (
            <div className="text-center py-6">
              <LoadingSpinner size="sm" />
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setNotificationToDelete(null);
        }}
        title={t('deleteConfirm')}
      >
        <div className="space-y-6">
          <p className="text-[var(--color-text-muted)] font-medium">
            {t('deleteMessage')}
          </p>
          <div className="flex justify-end gap-4">
            <Button
              onClick={() => {
                setIsDeleteModalOpen(false);
                setNotificationToDelete(null);
              }}
              variant="outline"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (notificationToDelete) {
                  deleteNotification(notificationToDelete);
                  setIsDeleteModalOpen(false);
                  setNotificationToDelete(null);
                }
              }}
              variant="destructive"
            >
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Notifications;
