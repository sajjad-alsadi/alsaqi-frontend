import React from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExecData } from '../types';

interface TopRisksListProps {
  risks: ExecData['topRisks'];
}

const TopRisksList: React.FC<TopRisksListProps> = ({ risks }) => {
  const { t } = useTranslation();

  return (
    <div className="glass-card p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-danger)]/10 text-[var(--color-danger)] flex items-center justify-center">
            <AlertTriangle size={20} />
          </div>
          <h3 className="text-xl font-bold text-[var(--color-text-main)]">{t('reports.topRisks')}</h3>
        </div>
        <button 
          className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest flex items-center gap-1 hover:gap-2 transition-all"
        >
          {t('reports.viewAll')} <ArrowRight size={14} />
        </button>
      </div>
      <div className="space-y-4">
        {risks.map((risk, idx) => (
          <div key={idx} className="p-4 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border-soft)] flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-[var(--color-text-main)]">{risk.description}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{risk.owner}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              risk.rating === 'High' ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' :
              risk.rating === 'Medium' ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' :
              'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
            }`}>
              {risk.rating}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TopRisksList;
