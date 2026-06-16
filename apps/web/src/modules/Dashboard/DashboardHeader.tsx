import React from 'react';
import { LayoutDashboard, ShieldCheck, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { useFormat } from '../../utils/formatService';
import Tooltip from '../../components/ui/Tooltip';

interface DashboardHeaderProps {
  language: string;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  /** True while a filter-change refetch is in progress */
  isLoading?: boolean;
}

const FILTERS = ['all', 'operational', 'financial', 'it'] as const;
type Filter = (typeof FILTERS)[number];

const DashboardHeader: React.FC<DashboardHeaderProps> = React.memo(
  ({ language, activeFilter, setActiveFilter, isLoading = false }) => {
    const { t } = useTranslation();
    const { formatDate } = useFormat();

    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-6"
      >
        {/* ── Title block ── */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-md shadow-[var(--color-primary)]/20 flex-shrink-0">
            <LayoutDashboard size={24} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-main)] tracking-tight">
              {t('dashboard.executiveDashboard')}
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5 flex items-center gap-2">
              <ShieldCheck
                size={14}
                className="text-[var(--color-success)]"
                aria-hidden="true"
              />
              {formatDate(new Date())}
            </p>
          </div>
        </div>

        {/* ── Filter tabs + loading indicator ── */}
        <div className="flex items-center gap-3">
          {isLoading && (
            <Loader2
              size={16}
              className="text-[var(--color-primary)] animate-spin"
              aria-label={t('common.loading')}
            />
          )}

          <div
            role="group"
            aria-label={t('dashboard.filterScope')}
            className="flex items-center gap-1 bg-[var(--color-card)] p-1 rounded-xl border border-[var(--color-border-soft)]"
          >
            {FILTERS.map((filter: Filter) => (
              <Tooltip
                key={filter}
                content={t(`dashboard.${filter}Desc`)}
                side="bottom"
              >
                <button
                  onClick={() => setActiveFilter(filter)}
                  aria-pressed={activeFilter === filter}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                    activeFilter === filter
                      ? 'bg-[var(--color-primary)] text-white shadow-sm'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-bg-soft)]'
                  }`}
                >
                  {t(`dashboard.${filter}`)}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }
);

export default DashboardHeader;
