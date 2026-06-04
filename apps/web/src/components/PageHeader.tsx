import React from 'react';
import { motion } from 'motion/react';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({ icon: Icon, title, subtitle, children }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex flex-col md:flex-row md:items-end justify-between gap-6"
    >
      <div className="flex items-center gap-5">
        <div className="w-14 h-14 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
          <Icon size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-main)] tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      
      {children && (
        <div className="flex items-center gap-3">
          {children}
        </div>
      )}
    </motion.div>
  );
};

export default PageHeader;
