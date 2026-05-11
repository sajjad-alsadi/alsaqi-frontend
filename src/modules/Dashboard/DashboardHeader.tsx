import React from 'react';
import { LayoutDashboard, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Language } from '../../constants';
import { useFormat } from '../../services/formatService';

interface DashboardHeaderProps {
  language: string;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = React.memo(({ language, activeFilter, setActiveFilter }) => {
  const { t } = useTranslation();
  const { formatDate } = useFormat();

  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
      <div className="flex items-center gap-6">
        <div className="w-16 h-16 bg-[var(--color-primary)] rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-[var(--color-primary)]/20">
          <LayoutDashboard size={32} />
        </div>
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tight">
            {t('dashboard.executiveDashboard')}
          </h1>
          <p className="text-sm text-slate-400 font-bold mt-2 flex items-center gap-2">
            <ShieldCheck size={18} className="text-[var(--color-success)]" />
            {t('dashboard.controlCenter')} • {formatDate(new Date())}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-[var(--color-card)] p-1.5 rounded-[1.5rem] shadow-sm border border-[var(--color-border-soft)]">
          {['all', 'operational', 'financial', 'it'].map(filter => (
            <button 
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${activeFilter === filter ? 'bg-[var(--color-primary)] text-white shadow-md' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'}`}
            >
              {t(`dashboard.${filter}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

export default DashboardHeader;
