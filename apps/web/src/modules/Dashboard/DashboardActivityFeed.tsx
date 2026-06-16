import React from 'react';
import { History, Briefcase, FileSearch, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFormat } from '../../utils/formatService';
import { useScrollReveal } from '../../hooks/useScrollReveal';

interface ActivityItem {
  id?: string;
  module: string;
  action: string;
  user: string;
  timestamp?: string;
  created_at?: string;
}

interface DashboardActivityFeedProps {
  t: (key: string, ...args: unknown[]) => string;
  activity: ActivityItem[];
}

const DashboardActivityFeed: React.FC<DashboardActivityFeedProps> = React.memo(
  ({ t, activity }) => {
    const navigate = useNavigate();
    const { formatDateTime, translateName, translateAction, translateModule } = useFormat();
    const { ref, isVisible } = useScrollReveal<HTMLDivElement>();

    const items = Array.isArray(activity) ? activity : [];

    return (
      <div
        ref={ref}
        className={`lg:col-span-2 glass-card p-8 transition-all duration-500 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-bold text-[var(--color-text-main)] flex items-center gap-2.5">
            <History size={18} className="text-[var(--color-primary)]" aria-hidden="true" />
            {t('dashboard.recentActivity')}
          </h3>
          <button
            onClick={() => navigate('/trail')}
            className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
          >
            {t('dashboard.viewAll')}
          </button>
        </div>

        {items.length === 0 ? (
          <div className="empty-state py-10">
            <div className="empty-state-icon">
              <History size={24} aria-hidden="true" />
            </div>
            <p className="empty-state-title">{t('dashboard.noActivity')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              // Prefer stable item.id; fall back to composite key if absent
              const stableKey =
                item.id ?? `${item.module}-${item.action}-${item.timestamp ?? item.created_at ?? ''}`;

              return (
                <div
                  key={stableKey}
                  className="flex items-start gap-4 p-4 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border-soft)] hover:border-[var(--color-primary)]/30 transition-all"
                >
                  <div
                    aria-hidden="true"
                    className={`w-11 h-11 rounded-[0.875rem] flex items-center justify-center shrink-0 shadow-sm ${
                      item.module === 'Audit'
                        ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                        : item.module === 'Finding'
                        ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                        : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
                    }`}
                  >
                    {item.module === 'Audit' ? (
                      <Briefcase size={20} />
                    ) : item.module === 'Finding' ? (
                      <FileSearch size={20} />
                    ) : (
                      <ShieldAlert size={20} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <p className="text-sm font-semibold text-[var(--color-text-main)] truncate">
                        {translateAction(item.action)}
                      </p>
                      <span className="text-[10px] font-medium text-[var(--color-text-muted)] shrink-0 mt-0.5">
                        {formatDateTime(item.timestamp ?? item.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {translateModule(item.module)} &bull; {translateName(item.user)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);

export default DashboardActivityFeed;
