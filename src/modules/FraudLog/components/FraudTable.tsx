import React, { useState } from 'react';
import { Eye, EyeOff as EyeHide } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../../services/formatService';
import { FraudCase } from '../types';

interface FraudTableProps {
  cases: FraudCase[];
}

export const FraudTable: React.FC<FraudTableProps> = ({ cases }) => {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const [showSuspects, setShowSuspects] = useState<Record<string, boolean>>({});

  const toggleSuspectVisibility = (id: string) => {
    setShowSuspects(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getCategoryLabel = (cat: string) => {
    switch(cat) {
      case 'Financial': return t('integrity.financial');
      case 'Operational': return t('integrity.operational');
      case 'Compliance': return t('integrity.compliance');
      case 'Reputational': return t('integrity.reputational');
      default: return cat;
    }
  };

  const getStatusLabel = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (s === 'open') return t('common.open');
    if (s === 'closed') return t('common.closed');
    if (s === 'in progress') return t('common.inProgress');
    if (s === 'under investigation') return t('integrity.underInvestigation');
    if (s.includes('convicted')) return t('integrity.closedConvicted');
    if (s.includes('insufficient')) return t('integrity.closedInsufficientEvidence');
    
    const translated = t(`integrity.${status.charAt(0).toLowerCase() + status.slice(1)}`);
    if (translated !== `integrity.${status.charAt(0).toLowerCase() + status.slice(1)}`) return translated;
    
    return status;
  };

  return (
    <div className="glass-card shadow-2xl border-white/40 overflow-hidden">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full">
          <thead className="bg-[var(--color-bg-soft)] border-b border-[var(--color-border-soft)]">
            <tr>
              <th className="p-6 text-start text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('integrity.refNumber')}</th>
              <th className="p-6 text-start text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('integrity.date')}</th>
              <th className="p-6 text-start text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('integrity.riskCategory')}</th>
              <th className="p-6 text-start text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('common.description')}</th>
              <th className="p-6 text-start text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('integrity.suspects')}</th>
              <th className="p-6 text-start text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('integrity.impact')}</th>
              <th className="p-6 text-start text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('common.statusLabel')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-soft)]">
            {cases.map((item) => (
              <tr key={item.id} className="hover:bg-[var(--color-primary)]/5 transition-colors group">
                <td className="p-6 font-mono text-[10px] font-bold text-[var(--color-text-main)] tracking-normal min-w-[140px]">
                  <span className="block truncate" title={item.id}>{item.id}</span>
                </td>
                <td className="p-6 text-xs font-bold text-[var(--color-text-main)] whitespace-nowrap">{formatDate(item.detectionDate)}</td>
                <td className="p-6">
                  <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest leading-none ${
                    item.riskCategory === 'Financial' ? 'bg-rose-100 text-rose-800' :
                    item.riskCategory === 'Operational' ? 'bg-amber-100 text-amber-800' :
                    item.riskCategory === 'Compliance' ? 'bg-blue-100 text-blue-800' :
                    'bg-purple-100 text-purple-800'
                  }`}>
                    {getCategoryLabel(item.riskCategory)}
                  </span>
                </td>
                <td className="p-6 text-sm font-bold text-[var(--color-text-main)] min-w-[200px]" title={item.condition}>
                  <p className="line-clamp-2 leading-relaxed">{item.condition}</p>
                </td>
                <td className="p-6">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-[var(--color-text-main)] tracking-[0.2em]">
                      {showSuspects[item.id] ? item.suspects : '••••••••'}
                    </span>
                    <button 
                      onClick={() => toggleSuspectVisibility(item.id)}
                      className="p-1.5 rounded-lg hover:bg-[var(--color-bg-main)] text-[var(--color-text-muted)] hover:text-primary transition-all shadow-sm border border-[var(--color-border-soft)] bg-[var(--color-card)]"
                    >
                      {showSuspects[item.id] ? <EyeHide size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </td>
                <td className="p-6 text-sm font-bold text-rose-700 whitespace-nowrap">{item.financialImpact}</td>
                <td className="p-6">
                  <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm ${
                    item.status === 'Open' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                    item.status === 'Under Investigation' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                    item.status.includes('Convicted') ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                    'bg-slate-200 text-[var(--color-text-main)] border border-[var(--color-border-strong)]'
                  }`}>
                    {getStatusLabel(item.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
