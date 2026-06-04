import React from 'react';
import { LayoutDashboard, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Language } from '../../constants';
import { useFormat } from '../../utils/formatService';

interface DashboardHeaderProps {
  language: string;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = React.memo(({ language, activeFilter, setActiveFilter }) => {
  const { t } = useTranslation();
  const { formatDate } = useFormat();

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex flex-col md:flex-row md:items-end justify-between gap-6"
    >
      <div className="flex items-center gap-5">
        <div className="w-14 h-14 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
          <LayoutDashboard size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-main)] tracking-tight">
            {t('dashboard.executiveDashboard')}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5 flex items-center gap-2">
            <ShieldCheck size={16} className="text-[var(--color-success)]" />
            {t('dashboard.controlCenter')} • {formatDate(new Date())}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-[var(--color-card)] p-1 rounded-xl border border-[var(--color-border-soft)]">
          {['all', 'operational', 'financial', 'it'].map(filter => (
            <button 
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                activeFilter === filter 
                  ? 'bg-[var(--color-primary)] text-white shadow-sm' 
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-bg-soft)]'
              }`}
            >
              {t(`dashboard.${filter}`)}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
});

export default DashboardHeader;
