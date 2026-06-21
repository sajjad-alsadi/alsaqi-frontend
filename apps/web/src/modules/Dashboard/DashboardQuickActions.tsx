import React from 'react';
import {
  Plus,
  Bell,
  BellOff,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { useFormat } from '../../utils/formatService';

interface QuickAction {
  label: string;
  icon: React.ElementType;
  link: string;
  color: string;
}

interface DashboardStats {
  recommendations: { overdue: number };
  correspondence: { pending_responses: number };
  [key: string]: unknown;
}

interface DashboardQuickActionsProps {
  t: TFunction;
  quickActions: QuickAction[];
  stats: DashboardStats;
}

const DashboardQuickActions: React.FC<DashboardQuickActionsProps> = React.memo(
  ({ t, quickActions, stats }) => {
    const navigate = useNavigate();
    const { formatNumber } = useFormat();

    const overdueCount: number = stats.recommendations?.overdue ?? 0;
    const pendingCount: number = stats.correspondence?.pending_responses ?? 0;
    const isAllClear = overdueCount === 0 && pendingCount === 0;
    const hasAlerts = !isAllClear;

    return (
      /*
       * Single unified panel:
       * - Quick Actions section (always visible, primary content)
       * - Thin divider
       * - Alert status section (compact when all-clear, expanded when alerts)
       *
       * This resolves the two-similar-glass-cards rhythm issue: the panel is
       * one coherent sidebar unit, not two stacked identical cards.
       */
      <div
        className={`glass-card overflow-hidden transition-colors duration-300 ${
          hasAlerts ? 'border-[var(--color-danger)]/20' : ''
        }`}
      >
        {/* ── Quick Actions ── */}
        <div className="p-6">
          <h3 className="text-base font-bold text-[var(--color-text-main)] mb-5 flex items-center gap-2.5">
            <Plus
              size={18}
              className="text-[var(--color-success)]"
              aria-hidden="true"
            />
            {t('dashboard.quickActions')}
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {quickActions.map((action) => (
              <button
                key={action.link}
                onClick={() => navigate(`/${action.link}`)}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border-soft)] hover:border-[var(--color-primary)] hover:shadow-sm transition-all text-start group"
              >
                <div
                  className={`w-9 h-9 rounded-xl ${action.color} text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform flex-shrink-0`}
                >
                  <action.icon size={18} aria-hidden="true" />
                </div>
                <span className="text-sm font-semibold text-[var(--color-text-main)]">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="h-px bg-[var(--color-border-soft)] mx-6" role="separator" />

        {/* ── Alert status — compact when all-clear, full when alerts ── */}
        <div className="p-6">
          {/* Header — always shown */}
          <div className="flex items-center gap-2.5 mb-4">
            {isAllClear ? (
              <BellOff
                size={16}
                className="text-[var(--color-success)]"
                aria-hidden="true"
              />
            ) : (
              <Bell
                size={16}
                className="text-[var(--color-danger)] animate-pulse"
                aria-hidden="true"
              />
            )}
            <h3 className="text-sm font-bold text-[var(--color-text-main)]">
              {t('dashboard.alerts')}
            </h3>
          </div>

          {isAllClear ? (
            /* ── Compact all-clear row ── */
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[var(--color-success)]/5 border border-[var(--color-success)]/15">
              <CheckCircle2
                size={16}
                className="text-[var(--color-success)] flex-shrink-0"
                aria-hidden="true"
              />
              <p className="text-xs font-semibold text-[var(--color-success)]">
                {t('dashboard.allClear')}
              </p>
            </div>
          ) : (
            /* ── Expanded alert rows ── */
            <div className="space-y-3">
              {/* Overdue recommendations */}
              <div
                className={`p-3.5 rounded-xl flex items-center gap-3 transition-colors ${
                  overdueCount > 0
                    ? 'bg-[var(--color-danger)]/5 border border-[var(--color-danger)]/15'
                    : 'bg-[var(--color-bg-main)] border border-[var(--color-border-soft)]'
                }`}
              >
                <AlertTriangle
                  size={20}
                  className={
                    overdueCount > 0
                      ? 'text-[var(--color-danger)] flex-shrink-0'
                      : 'text-[var(--color-text-muted)] flex-shrink-0'
                  }
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p
                    className={`text-xs font-semibold mb-0.5 ${
                      overdueCount > 0
                        ? 'text-[var(--color-danger)]'
                        : 'text-[var(--color-text-muted)]'
                    }`}
                  >
                    {t('dashboard.overdueRecommendations')}
                  </p>
                  <p className="text-xl font-bold text-[var(--color-text-main)] leading-none">
                    {formatNumber(overdueCount)}
                  </p>
                </div>
              </div>

              {/* Pending responses */}
              <div
                className={`p-3.5 rounded-xl flex items-center gap-3 transition-colors ${
                  pendingCount > 0
                    ? 'bg-[var(--color-warning)]/5 border border-[var(--color-warning)]/15'
                    : 'bg-[var(--color-bg-main)] border border-[var(--color-border-soft)]'
                }`}
              >
                <Clock
                  size={20}
                  className={
                    pendingCount > 0
                      ? 'text-[var(--color-warning)] flex-shrink-0'
                      : 'text-[var(--color-text-muted)] flex-shrink-0'
                  }
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p
                    className={`text-xs font-semibold mb-0.5 ${
                      pendingCount > 0
                        ? 'text-[var(--color-warning)]'
                        : 'text-[var(--color-text-muted)]'
                    }`}
                  >
                    {t('dashboard.pendingResponses')}
                  </p>
                  <p className="text-xl font-bold text-[var(--color-text-main)] leading-none">
                    {formatNumber(pendingCount)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

export default DashboardQuickActions;
