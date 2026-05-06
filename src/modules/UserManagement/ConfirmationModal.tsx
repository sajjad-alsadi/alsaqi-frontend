import React from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'danger' | 'warning' | 'success';
  onClose: () => void;
  onConfirm: () => void;
  error?: string;
  success?: string;
  children?: React.ReactNode;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  confirmVariant = 'primary',
  onClose,
  onConfirm,
  error,
  success,
  children
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const variantClasses = {
    primary: 'bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90',
    danger: 'bg-[var(--color-danger)] hover:bg-[var(--color-danger)]/90',
    warning: 'bg-[var(--color-warning)] hover:bg-[var(--color-warning)]/90',
    success: 'bg-[var(--color-success)] hover:bg-[var(--color-success)]/90'
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[var(--color-card)] p-8 rounded-[2rem] shadow-2xl max-w-md w-full mx-4 border border-[var(--color-border-soft)]"
      >
        <h3 className="text-xl font-black text-[var(--color-text-main)] mb-4">{title}</h3>
        <p className="text-[var(--color-text-muted)] mb-6 font-bold">{message}</p>
        
        {children}

        {error && (
          <div className="mb-4 p-4 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-2xl text-sm font-bold border border-[var(--color-danger)]/20">
            {error}
          </div>
        )}
        
        {success && (
          <div className="mb-4 p-4 bg-[var(--color-success)]/10 text-[var(--color-success)] rounded-2xl text-sm font-bold border border-[var(--color-success)]/20">
            {success}
          </div>
        )}

        <div className="flex justify-end gap-4 mt-8">
          <button 
            onClick={onClose}
            className="px-6 py-3 rounded-xl text-[var(--color-text-muted)] font-black uppercase tracking-widest text-[10px] hover:bg-[var(--color-bg-soft)] transition-all"
          >
            {t('common.cancel')}
          </button>
          <button 
            onClick={onConfirm}
            className={`px-8 py-3 rounded-xl text-white font-black uppercase tracking-widest text-[10px] transition-all shadow-lg ${variantClasses[confirmVariant]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ConfirmationModal;
