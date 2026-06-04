
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LucideIcon } from 'lucide-react';

interface InteractiveIconProps {
  icon?: LucideIcon;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  size?: number;
  className?: string;
  iconClassName?: string;
  tooltip?: string;
  disabled?: boolean;
  active?: boolean;
  variant?: 'ghost' | 'solid' | 'outline' | 'danger';
  badge?: string | number;
  ariaExpanded?: boolean;
}

const InteractiveIcon: React.FC<InteractiveIconProps> = ({
  icon: Icon,
  children,
  onClick,
  size = 20,
  className = '',
  iconClassName = '',
  tooltip,
  disabled = false,
  active = false,
  variant = 'ghost',
  badge,
  ariaExpanded
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (tooltip) {
      timeoutRef.current = setTimeout(() => {
        setShowTooltip(true);
      }, 1000);
    }
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  const getVariantClasses = () => {
    switch (variant) {
      case 'solid':
        return active 
          ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20' 
          : 'bg-[var(--color-bg-soft)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-main)]';
      case 'outline':
        return active
          ? 'border-2 border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/5'
          : 'border border-[var(--color-border-soft)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]';
      case 'danger':
        return 'text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] hover:text-[var(--color-danger)]';
      case 'ghost':
      default:
        return active
          ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-primary)]';
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <motion.button
        whileHover={{ 
          scale: 1.05,
          y: -1,
          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
        }}
        whileTap={{ scale: 0.95, y: 0 }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={onClick}
        disabled={disabled}
        aria-label={tooltip}
        aria-pressed={active}
        aria-expanded={ariaExpanded}
        className={`
          p-2.5 rounded-xl transition-all duration-200 flex items-center justify-center relative
          ${getVariantClasses()} 
          ${className} 
          ${disabled ? 'opacity-50 cursor-not-allowed grayscale' : 'cursor-pointer'}
        `}
      >
        {Icon && <Icon size={size} className={iconClassName} />}
        {children}
        {badge !== undefined && (
          <span className="absolute -top-1 -end-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white shadow-lg">
            {badge}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {tooltip && showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute bottom-full start-1/2 -translate-x-1/2 rtl:translate-x-1/2 mb-3 px-3 py-2 bg-[var(--color-text-main)] text-[var(--color-bg-main)] text-[11px] font-bold uppercase tracking-widest rounded-xl shadow-2xl z-[100] whitespace-nowrap pointer-events-none border border-[var(--color-border-soft)]"
          >
            {tooltip}
            <div className="absolute top-full start-1/2 -translate-x-1/2 rtl:translate-x-1/2 border-[6px] border-transparent border-t-[var(--color-text-main)]" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default InteractiveIcon;
