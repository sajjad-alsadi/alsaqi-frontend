import React from 'react';
import { useTranslation } from 'react-i18next';

interface BadgeProps {
  type: 'risk' | 'status' | 'default';
  value: string;
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({ type, value, className = '' }) => {
  const { t } = useTranslation();
  
  const getRiskClass = (val: string) => {
    if (!val) return 'bg-[var(--color-bg-main)] text-[var(--color-text-muted)]';
    const v = val.toLowerCase();
    if (v === 'critical') return 'badge-risk-critical';
    if (v === 'high') return 'badge-risk-high';
    if (v === 'medium' || v === 'med') return 'badge-risk-med';
    if (v === 'low') return 'badge-risk-low';
    return 'bg-[var(--color-bg-main)] text-[var(--color-text-muted)]';
  };

  const getStatusClass = (val: string) => {
    if (!val) return 'bg-[var(--color-bg-soft)] text-[var(--color-text-muted)]';
    const v = val.toLowerCase();
    if (v === 'closed' || v === 'implemented' || v === 'completed') return 'bg-emerald-500/10 text-emerald-500';
    if (v === 'fieldwork' || v === 'in progress' || v === 'active' || v === 'reporting') return 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]';
    if (v === 'planning' || v === 'open' || v === 'planned' || v === 'draft') return 'bg-[var(--color-bg-soft)] text-[var(--color-text-muted)]';
    if (v === 'overdue') return 'bg-rose-500/10 text-rose-500';
    return 'bg-[var(--color-bg-soft)] text-[var(--color-text-muted)]';
  };

  const baseClass = "inline-flex items-center px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all";
  const typeClass = type === 'risk' ? getRiskClass(value) : type === 'status' ? getStatusClass(value) : 'bg-[var(--color-bg-main)] text-[var(--color-text-muted)]';

  const displayValue = type === 'risk' ? (
    value && value.toLowerCase() === 'critical' ? t('critical') :
    value && value.toLowerCase() === 'high' ? t('high') :
    value && (value.toLowerCase() === 'medium' || value.toLowerCase() === 'med') ? t('medium') :
    value && value.toLowerCase() === 'low' ? t('low') : value
  ) : type === 'status' ? (
    value && value.toLowerCase() === 'closed' ? t('closed') :
    value && value.toLowerCase() === 'implemented' ? t('implemented') :
    value && value.toLowerCase() === 'completed' ? t('completed') :
    value && value.toLowerCase() === 'fieldwork' ? t('fieldwork') :
    value && value.toLowerCase() === 'in progress' ? t('inProgress') :
    value && value.toLowerCase() === 'active' ? t('active') :
    value && value.toLowerCase() === 'reporting' ? t('reporting') :
    value && value.toLowerCase() === 'planning' ? t('planning') :
    value && value.toLowerCase() === 'open' ? t('open') :
    value && value.toLowerCase() === 'planned' ? t('planned') :
    value && value.toLowerCase() === 'draft' ? t('draft') :
    value && value.toLowerCase() === 'overdue' ? t('overdue') : value
  ) : value;

  return (
    <span className={`${baseClass} ${typeClass} ${className}`}>
      {displayValue}
    </span>
  );
};

export default Badge;
