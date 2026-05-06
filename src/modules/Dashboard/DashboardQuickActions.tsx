import React from 'react';
import { Plus, Bell, AlertTriangle, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFormat } from '../../services/formatService';

interface DashboardQuickActionsProps {
  t: any;
  quickActions: any[];
  stats: any;
}

const DashboardQuickActions: React.FC<DashboardQuickActionsProps> = React.memo(({ t, quickActions, stats }) => {
  const navigate = useNavigate();
  const { formatNumber } = useFormat();

  return (
    <div className="space-y-8">
      <div className="glass-card p-8">
        <h3 className="text-xl font-black text-[var(--color-text-main)] mb-8 flex items-center gap-3">
          <Plus className="text-[var(--color-success)]" />
          {t('dashboard.quickActions')}
        </h3>
        <div className="grid grid-cols-1 gap-4">
          {quickActions.map((action, idx) => (
            <button 
              key={idx}
              onClick={() => navigate(`/${action.link}`)}
              className="flex items-center gap-4 p-4 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border-soft)] hover:border-[var(--color-primary)] hover:shadow-md transition-all text-start group"
            >
              <div className={`w-10 h-10 rounded-[1rem] ${action.color} text-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>
                <action.icon size={20} />
              </div>
              <span className="text-sm font-bold text-[var(--color-text-main)] uppercase tracking-widest">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card p-8 border-[var(--color-danger)]/20">
        <h3 className="text-xl font-black text-[var(--color-text-main)] mb-8 flex items-center gap-3">
          <Bell className="text-[var(--color-danger)] animate-pulse" />
          {t('dashboard.alerts')}
        </h3>
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-[var(--color-danger)]/5 border border-[var(--color-danger)]/10 flex items-center gap-4">
            <AlertTriangle className="text-[var(--color-danger)]" size={28} />
            <div>
              <p className="text-xs font-bold text-[var(--color-danger)] uppercase tracking-widest mb-1">{t('dashboard.overdueRecommendations')}</p>
              <p className="text-2xl font-black text-[var(--color-text-main)] leading-none">{formatNumber(stats.recommendations.overdue)}</p>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[var(--color-warning)]/5 border border-[var(--color-warning)]/10 flex items-center gap-4">
            <Clock className="text-[var(--color-warning)]" size={28} />
            <div>
              <p className="text-xs font-bold text-[var(--color-warning)] uppercase tracking-widest mb-1">{t('dashboard.pendingResponses')}</p>
              <p className="text-2xl font-black text-[var(--color-text-main)] leading-none">{formatNumber(stats.correspondence.pending_responses)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default DashboardQuickActions;
