import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationContext } from '../context/NotificationContext';
import { motion, AnimatePresence } from 'motion/react';
import { X, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTranslatedNotificationMessage } from '../utils/notificationHelpers';
import { useAppContext } from '../context/AppContext';

const TOAST_DURATION = 5000; // 5 seconds

const NotificationToast: React.FC = () => {
  const { latestNotification, clearLatest, markAsRead } = useNotificationContext();
  const { language } = useAppContext();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (latestNotification) {
      setVisible(true);
      setProgress(100);
    }
  }, [latestNotification]);

  useEffect(() => {
    if (!visible || isPaused) return;

    const startTime = Date.now();
    const remaining = (progress / 100) * TOAST_DURATION;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.max(0, ((remaining - elapsed) / TOAST_DURATION) * 100);
      setProgress(newProgress);
      if (newProgress <= 0) {
        clearInterval(interval);
        handleDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [visible, isPaused]);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(clearLatest, 300);
  };

  const handleClick = () => {
    if (latestNotification) {
      if (latestNotification.id) {
        markAsRead(latestNotification.id);
      }
      if (latestNotification.link) {
        const link = latestNotification.link.replace('/', '');
        navigate(`/${link}`);
      }
    }
    handleDismiss();
  };

  return (
    <div className="fixed bottom-4 end-4 z-[10000] pointer-events-none">
      <AnimatePresence>
        {visible && latestNotification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="pointer-events-auto w-80 bg-[var(--color-card)] rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.15)] border border-[var(--color-border-soft)] overflow-hidden cursor-pointer"
            onClick={handleClick}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            role="alert"
            aria-live="polite"
          >
            {/* Progress bar */}
            <div className="h-0.5 bg-[var(--color-bg-soft)] w-full">
              <motion.div
                className="h-full bg-[var(--color-primary)]"
                style={{ width: `${progress}%` }}
                transition={{ duration: 0.05 }}
              />
            </div>

            <div className="p-3 flex gap-3 items-start">
              <div className="w-8 h-8 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center shrink-0">
                <Bell size={14} className="text-[var(--color-primary)]" />
              </div>
              <div className="flex-1 min-w-0">
                {latestNotification.title && (
                  <p className="text-xs font-bold text-[var(--color-text-main)] truncate">
                    {latestNotification.title}
                  </p>
                )}
                <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 mt-0.5">
                  {getTranslatedNotificationMessage(latestNotification.description, t, language)}
                </p>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-1 opacity-70">
                  {t('common.now') || 'الآن'}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
                className="shrink-0 p-1 rounded-md hover:bg-[var(--color-bg-soft)] transition-colors"
                aria-label={t('common.close')}
              >
                <X size={14} className="text-[var(--color-text-muted)]" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationToast;
