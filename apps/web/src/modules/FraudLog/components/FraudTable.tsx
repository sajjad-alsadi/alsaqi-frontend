import React, { useState, useMemo } from 'react';
import { Eye, EyeOff as EyeHide, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../../utils/formatService';
import { FraudCase } from '../types';

interface FraudTableProps {
  cases: FraudCase[];
}

export const FraudTable: React.FC<FraudTableProps> = ({ cases }) => {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const [showSuspects, setShowSuspects] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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

  // Filtered cases
  const filteredCases = useMemo(() => {
    let result = cases;
    
    if (statusFilter !== 'all') {
      result = result.filter(c => c.status === statusFilter);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.condition?.toLowerCase().includes(q) ||
        c.id?.toLowerCase().includes(q) ||
        c.riskCategory?.toLowerCase().includes(q)
      );
    }
    
    // Sort by date descending
    return [...result].sort((a, b) => 
      new Date(b.detectionDate).getTime() - new Date(a.detectionDate).getTime()
    );
  }, [cases, statusFilter, searchQuery]);

  const statusOptions = [
    { value: 'all', label: t('common.all') },
    { value: 'Open', label: t('common.open') },
    { value: 'Under Investigation', label: t('integrity.underInvestigation') },
    { value: 'Closed - Convicted', label: t('integrity.closedConvicted') },
    { value: 'Closed - Insufficient Evidence', label: t('integrity.closedInsufficientEvidence') },
  ];

  return (
    <div className="space-y-4">
      {/* Search & Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
          <input
            type="text"
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field ps-9 pe-8 py-2 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[var(--color-bg-soft)] text-[var(--color-text-muted)]"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field py-2 text-sm w-auto min-w-[160px]"
        >
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Table — shadow-sm (not shadow-2xl), consistent with design system */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full">
            <thead className="bg-[var(--color-bg-soft)] border-b border-[var(--color-border-soft)]">
              <tr>
                <th className="px-5 py-3 text-start text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.15em]">{t('integrity.refNumber')}</th>
                <th className="px-5 py-3 text-start text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.15em]">{t('integrity.date')}</th>
                <th className="px-5 py-3 text-start text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.15em]">{t('integrity.riskCategory')}</th>
                <th className="px-5 py-3 text-start text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.15em]">{t('common.description')}</th>
                <th className="px-5 py-3 text-start text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.15em]">{t('integrity.suspects')}</th>
                <th className="px-5 py-3 text-start text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.15em]">{t('integrity.impact')}</th>
                <th className="px-5 py-3 text-start text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.15em]">{t('common.statusLabel')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-soft)]">
              {filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="empty-state">
                      <div className="empty-state-icon"><Search size={24} /></div>
                      <p className="empty-state-title">{searchQuery || statusFilter !== 'all' ? t('common.noResults') : t('integrity.noCases')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCases.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--color-primary)]/[0.03] transition-colors">
                    <td className="px-5 py-3.5 font-mono text-[10px] text-[var(--color-text-main)] tracking-normal min-w-[120px]">
                      <span className="block truncate" title={item.id}>{item.id}</span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-[var(--color-text-main)] whitespace-nowrap">{formatDate(item.detectionDate)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider leading-none ${
                        item.riskCategory === 'Financial' ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' :
                        item.riskCategory === 'Operational' ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' :
                        item.riskCategory === 'Compliance' ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]' :
                        'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300'
                      }`}>
                        {getCategoryLabel(item.riskCategory)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[var(--color-text-main)] min-w-[180px]" title={item.condition}>
                      <p className="line-clamp-2 leading-relaxed">{item.condition}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[var(--color-text-main)]">
                          {showSuspects[item.id] ? item.suspects : '••••••••'}
                        </span>
                        <button 
                          onClick={() => toggleSuspectVisibility(item.id)}
                          aria-label={showSuspects[item.id] ? t('common.hide') : t('common.show')}
                          className="p-1.5 rounded-lg hover:bg-[var(--color-bg-main)] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors border border-[var(--color-border-soft)]"
                        >
                          {showSuspects[item.id] ? <EyeHide size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[var(--color-danger)] whitespace-nowrap">{item.financialImpact}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                        item.status === 'Open' ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/20' :
                        item.status === 'Under Investigation' ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/20' :
                        item.status.includes('Convicted') ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/20' :
                        'bg-[var(--color-bg-soft)] text-[var(--color-text-muted)] border border-[var(--color-border-soft)]'
                      }`}>
                        {getStatusLabel(item.status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
