import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95vw] h-[90vh]'
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={`relative bg-[var(--color-card)] w-full ${sizeClasses[size]} rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-[var(--color-border-soft)]`}
          >
            <div className="px-8 py-6 border-b border-[var(--color-border-soft)] flex items-center justify-between shrink-0">
              <h3 className="text-xl font-bold text-[var(--color-text-main)]">{title}</h3>
              <button onClick={onClose} className="p-2 hover:bg-[var(--color-bg-soft)] rounded-full transition-all text-[var(--color-text-muted)]">
                <X size={20} />
              </button>
            </div>
            <div className={`p-8 overflow-y-auto ${size === 'full' ? 'flex-1 p-0' : 'max-h-[80vh]'}`}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Modal;
