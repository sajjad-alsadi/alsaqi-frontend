import React, { useEffect, useState } from 'react';
import { Undo2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';

interface UndoToastProps {
  /** Message to display */
  message: string;
  /** Callback when undo is clicked */
  onUndo: () => void;
  /** Callback when toast is dismissed (timeout or manual close) */
  onDismiss: () => void;
  /** Duration in ms before auto-dismiss (default: 5000) */
  duration?: number;
  /** Whether the toast is visible */
  isVisible: boolean;
}

/**
 * Undo toast notification — shows after a destructive action
 * with a countdown timer and undo button.
 * 
 * Better UX than confirmation dialogs: action happens immediately,
 * user can undo within 5 seconds if it was a mistake.
 * 
 * @example
 * const [showUndo, setShowUndo] = useState(false);
 * const [deletedItem, setDeletedItem] = useState(null);
 * 
 * const handleDelete = (item) => {
 *   setDeletedItem(item);
 *   setShowUndo(true);
 *   // Actually delete after timeout (or immediately with soft-delete)
 * };
 * 
 * <UndoToast
 *   isVisible={showUndo}
 *   message={t('common.itemDeleted')}
 *   onUndo={() => { restoreItem(deletedItem); setShowUndo(false); }}
 *   onDismiss={() => { confirmDelete(deletedItem); setShowUndo(false); }}
 * />
 */
const UndoToast: React.FC<UndoToastProps> = ({ 
  message, 
  onUndo, 
  onDismiss, 
  duration = 5000, 
  isVisible 
}) => {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!isVisible) {
      setProgress(100);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isVisible, duration, onDismiss]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="fixed bottom-8 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 z-[100] w-full max-w-sm"
          role="alert"
          aria-live="assertive"
        >
          <div className="bg-[var(--color-text-main)] text-[var(--color-bg-main)] rounded-2xl shadow-2xl overflow-hidden">
            {/* Progress bar */}
            <div className="h-1 bg-[var(--color-bg-main)]/20">
              <div 
                className="h-full bg-[var(--color-primary)] transition-all duration-100 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
            
            <div className="flex items-center gap-3 px-5 py-4">
              <p className="flex-1 text-sm font-medium">{message}</p>
              <button
                onClick={onUndo}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[var(--color-primary-hover)] transition-colors cursor-pointer"
              >
                <Undo2 size={14} />
                {t('common.undo') || 'Undo'}
              </button>
              <button
                onClick={onDismiss}
                className="p-1.5 hover:bg-[var(--color-bg-main)]/20 rounded-lg transition-colors cursor-pointer"
                aria-label={t('common.close') || 'Close'}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default UndoToast;
