import React from 'react';
import { History, Briefcase, FileSearch, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFormat } from '../../services/formatService';

interface DashboardActivityFeedProps {
  t: any;
  activity: any[];
}

const DashboardActivityFeed: React.FC<DashboardActivityFeedProps> = React.memo(({ t, activity }) => {
  const navigate = useNavigate();
  const { formatDateTime, translateName, translateAction, translateModule } = useFormat();

  return (
    <div className="lg:col-span-2 glass-card p-8">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xl font-black text-[var(--color-text-main)] flex items-center gap-3">
          <History className="text-[var(--color-primary)]" />
          {t('dashboard.recentActivity')}
        </h3>
        <button 
          onClick={() => navigate('/trail')}
          className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest hover:underline"
        >
          {t('dashboard.viewAll')}
        </button>
      </div>
      <div className="space-y-4">
        {(Array.isArray(activity) ? activity : []).map((item, idx) => (
          <div key={idx} className="flex items-start gap-4 p-4 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border-soft)] hover:border-[var(--color-primary)]/30 transition-all">
            <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 shadow-sm ${
              item.module === 'Audit' ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]' : 
              item.module === 'Finding' ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
            }`}>
              {item.module === 'Audit' ? <Briefcase size={22} /> : 
               item.module === 'Finding' ? <FileSearch size={22} /> : <ShieldAlert size={22} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-bold text-[var(--color-text-main)] truncate pe-4">
                  {translateAction(item.action)}
                </p>
                <span className="text-[10px] font-bold text-[var(--color-text-muted)] shrink-0">{formatDateTime(item.timestamp || item.created_at)}</span>
              </div>
              <p className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">
                {translateModule(item.module)} • {translateName(item.user)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default DashboardActivityFeed;
