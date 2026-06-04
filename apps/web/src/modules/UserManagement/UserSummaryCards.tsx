import React from 'react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../utils/formatService';

interface UserSummaryCardsProps {
  summary: any;
}

const UserSummaryCards: React.FC<UserSummaryCardsProps> = ({ summary }) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="glass-card p-4 border-[var(--color-success)]/20">
        <p className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-0.5">{t('userManagement.summary.totalUsers')}</p>
        <p className="text-2xl font-bold text-[var(--color-text-main)]">{formatNumber(summary?.total || 0)}</p>
        <div className="mt-1 flex items-center gap-1.5 text-[9px] font-bold text-[var(--color-success)]">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
          {formatNumber(summary?.active || 0)} {t('userManagement.summary.active')}
        </div>
      </div>
      <div className="glass-card p-4 border-[var(--color-warning)]/20">
        <p className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-0.5">{t('userManagement.summary.suspendedUsers')}</p>
        <p className="text-2xl font-bold text-[var(--color-text-main)]">{formatNumber(summary?.suspended || 0)}</p>
        <div className="mt-1 text-[9px] font-bold text-[var(--color-warning)]">
          {t('userManagement.summary.requiresReview')}
        </div>
      </div>
      <div className="glass-card p-4 border-[var(--color-danger)]/20">
        <p className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-0.5">{t('userManagement.summary.lockedAccounts')}</p>
        <p className="text-2xl font-bold text-[var(--color-text-main)]">{formatNumber(summary?.locked || 0)}</p>
        <div className="mt-1 text-[9px] font-bold text-[var(--color-danger)]">
          {t('userManagement.summary.dueToFailedAttempts')}
        </div>
      </div>
      <div className="glass-card p-4 border-[var(--color-border-soft)]">
        <p className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-0.5">{t('userManagement.summary.departments')}</p>
        <p className="text-2xl font-bold text-[var(--color-text-main)]">{formatNumber(summary?.departments_count || 0)}</p>
        <div className="mt-1 text-[9px] font-bold text-[var(--color-text-muted)]">
          {t('userManagement.summary.fullCoverage')}
        </div>
      </div>
    </div>
  );
};

export default UserSummaryCards;
