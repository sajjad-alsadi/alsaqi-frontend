import React from 'react';
import { motion } from 'motion/react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  fullPage?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', className = '', fullPage = false }) => {
  const sizes = {
    sm: 'w-6 h-6 border-2',
    md: 'w-10 h-10 border-4',
    lg: 'w-16 h-16 border-4'
  };

  const spinner = (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
      className={`${sizes[size]} rounded-full border-[var(--color-primary)] border-t-transparent ${className}`}
      role="status"
      aria-label="Loading"
    />
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 bg-[var(--color-card)]/50 backdrop-blur-sm flex items-center justify-center z-[9999]" aria-live="polite">
        {spinner}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-8" aria-live="polite">
      {spinner}
    </div>
  );
};

export default LoadingSpinner;
