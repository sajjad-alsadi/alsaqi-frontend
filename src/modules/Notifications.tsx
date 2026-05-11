
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useNotificationContext } from '../context/NotificationContext';
import { useTranslation } from 'react-i18next';
import { Bell, Check, Trash2, Filter, Search, Calendar, FileText, Info, AlertTriangle, UserPlus, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Modal from '../components/Modal';
import { getTranslatedNotificationMessage, getTranslatedNotificationModule } from '../utils/notificationHelpers';

const Notifications: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { language } = useAppContext();
  const { notifications, markAsRead, markAllAsRead, deleteNotification } = useNotificationContext();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [notificationToDelete, setNotificationToDelete] = useState<number | null>(null);

  const handleNotificationClick = (notification: any) => {
    if (notification.status === 'Unread') {
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

  const filteredNotifications = notifications.filter(n => {
    const matchesFilter = filter === 'all' ? true : 
                          filter === 'unread' ? n.status === 'Unread' : 
                          n.status === 'Read';
    const matchesSearch = (n.description?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                          (n.related_module?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'Created': return <FileText size={20} className="text-emerald-500" />;
      case 'Updated': return <Info size={20} className="text-blue-500" />;
      case 'Alert': return <AlertTriangle size={20} className="text-amber-500" />;
      case 'User': return <UserPlus size={20} className="text-purple-500" />;
      case 'Security': return <Shield size={20} className="text-rose-500" />;
      default: return <Bell size={20} className="text-slate-500" />;
    }
  };

  return (
    <div className="space-y-8" dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-[var(--color-primary)]/20">
            <Bell size={32} />
          </div>
          <div>
            <h2 className="text-4xl font-black text-slate-800 tracking-tight mb-2">{t('common.notifications')}</h2>
            <p className="text-sm text-slate-400 font-bold">{t('common.stayUpdated')}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => markAllAsRead()}
            className="btn-secondary flex items-center gap-2"
          >
            <Check size={18} />
            <span>{t('common.markAllRead')}</span>
          </button>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit">
            <button 
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${filter === 'all' ? 'bg-white shadow-sm text-primary' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {t('common.all')}
            </button>
            <button 
              onClick={() => setFilter('unread')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${filter === 'unread' ? 'bg-white shadow-sm text-primary' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {t('common.unread')}
            </button>
            <button 
              onClick={() => setFilter('read')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${filter === 'read' ? 'bg-white shadow-sm text-primary' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {t('common.read')}
            </button>
          </div>
          <div className="relative flex-1">
            <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
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
          <AnimatePresence>
            {filteredNotifications.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20"
              >
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                  <Bell size={40} />
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-2">{t('common.noNotificationsFound')}</h3>
                <p className="text-slate-400 text-sm font-bold">{t('common.tryAdjustingFilters')}</p>
              </motion.div>
            ) : (
              (Array.isArray(filteredNotifications) ? filteredNotifications : []).map((notification) => (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  onClick={() => handleNotificationClick(notification)}
                  className={`relative group p-6 rounded-2xl border transition-all cursor-pointer ${notification.status === 'Unread' ? 'bg-white border-primary/20 shadow-lg shadow-primary/5' : 'bg-slate-50/50 border-slate-100'}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${notification.status === 'Unread' ? 'bg-primary/10 shadow-inner' : 'bg-white border border-slate-100'}`}>
                      {getIcon(notification.event_type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1 pe-12">
                        <span className={`text-xs font-black uppercase tracking-widest ${notification.status === 'Unread' ? 'text-primary' : 'text-slate-400'}`}>
                          {getTranslatedNotificationModule(notification.related_module, t)}
                        </span>
                        <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                          <Calendar size={12} />
                          {new Date(notification.date).toLocaleString(i18n.language)}
                        </span>
                      </div>
                      
                      <h3 className={`text-lg font-bold mb-2 pe-12 ${notification.status === 'Unread' ? 'text-slate-800' : 'text-slate-600'}`}>
                        {getTranslatedNotificationMessage(notification.description, t, language)}
                      </h3>
                      
                      <div className="flex items-center gap-4 mt-4">
                        {notification.status === 'Unread' && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              notification.id && markAsRead(notification.id);
                            }}
                            className="text-xs font-black text-primary hover:text-primary/80 uppercase tracking-wider flex items-center gap-1"
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
                          className="text-xs font-black text-slate-400 hover:text-rose-500 uppercase tracking-wider flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={14} /> {t('common.delete')}
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {notification.status === 'Unread' && (
                    <div className="absolute top-1/2 -translate-y-1/2 end-6 w-3 h-3 bg-primary rounded-full shadow-lg shadow-primary/20 animate-pulse" />
                  )}
                </motion.div>
              ))
            )}
          </AnimatePresence>
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
          <p className="text-slate-600 font-medium">
            {t('deleteMessage')}
          </p>
          <div className="flex justify-end gap-4">
            <button
              onClick={() => {
                setIsDeleteModalOpen(false);
                setNotificationToDelete(null);
              }}
              className="px-6 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => {
                if (notificationToDelete) {
                  deleteNotification(notificationToDelete);
                  setIsDeleteModalOpen(false);
                  setNotificationToDelete(null);
                }
              }}
              className="px-6 py-3 rounded-2xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-200"
            >
              {t('delete')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Notifications;
