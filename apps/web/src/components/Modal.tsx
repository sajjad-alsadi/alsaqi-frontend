import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import Portal from './Portal';
import { FocusTrap } from './FocusTrap';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95vw] h-[90vh]'
  };

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <FocusTrap active={isOpen} onEscape={onClose}>
            <div 
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                aria-hidden="true"
              />
              <motion.div
                ref={modalRef}
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className={`relative bg-[var(--color-card)] w-full ${sizeClasses[size]} rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-[var(--color-border-soft)]`}
              >
                <div className="px-8 py-6 border-b border-[var(--color-border-soft)] flex items-center justify-between shrink-0">
                  <h3 id="modal-title" className="text-xl font-bold text-[var(--color-text-main)]">{title}</h3>
                  <button 
                    onClick={onClose} 
                    className="p-2 hover:bg-[var(--color-bg-soft)] rounded-full transition-all text-[var(--color-text-muted)] cursor-pointer"
                    aria-label={t('accessibility.closeModal')}
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className={`p-8 overflow-y-auto ${size === 'full' ? 'flex-1 p-0' : 'max-h-[70vh]'}`}>
                  {children}
                </div>
              </motion.div>
            </div>
          </FocusTrap>
        )}
      </AnimatePresence>
    </Portal>
  );
};

export default Modal;
