import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Scale, Users, ShieldAlert, Plus, ChevronRight, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useUser } from '../context/UserContext';
import api from '../api/httpClient';
import { UserRole } from '../constants';
import logger from '../utils/logger';
import { useFormat } from '../utils/formatService';

// Existing Module Logic
import ConflictOfInterest from './ConflictOfInterest';
import FraudLog from './FraudLog';

interface IntegrityStats {
  conflicts: { total: number; pending: number };
  fraud: { total: number; open: number };
  summary: { total: number; active: number };
}

const IntegrityManagement: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = useUser();
  const { formatDate } = useFormat();
  const [activeTab, setActiveTab] = useState<'overview' | 'conflicts' | 'fraud'>('overview');
  const [stats, setStats] = useState<IntegrityStats>({
    conflicts: { total: 0, pending: 0 },
    fraud: { total: 0, open: 0 },
    summary: { total: 0, active: 0 }
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await api.get('/integrity/stats');
      setStats(res.data);
    } catch (error) {
      logger.error('Error fetching integrity stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchStats();
    }
  }, [activeTab]);

  const tabs = [
    { id: 'overview' as const, label: t('integrity.dashboard'), icon: Scale },
    { id: 'conflicts' as const, label: t('integrity.conflicts'), icon: Users },
    { id: 'fraud' as const, label: t('integrity.fraud'), icon: ShieldAlert },
  ];

  return (
    <div className="space-y-6 pb-10">
      {/* Header — single source of truth for page identity */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-[var(--color-primary)] rounded-xl flex items-center justify-center text-white shadow-sm shadow-[var(--color-primary)]/15">
          <Scale size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-main)]">{t('integrity.title')}</h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{t('integrity.subTitle')}</p>
        </div>
      </div>

      {/* Tabs — proper ARIA tablist */}
      <div
        role="tablist"
        aria-label={t('integrity.title')}
        className="flex flex-wrap gap-1 p-1 bg-[var(--color-card)] rounded-xl w-fit border border-[var(--color-border-soft)]"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[var(--color-primary)] text-white shadow-sm shadow-[var(--color-primary)]/20'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-bg-soft)]'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'overview' && (
            <OverviewPanel
              stats={stats}
              loading={loading}
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === 'conflicts' && <ConflictOfInterest />}
          {activeTab === 'fraud' && <FraudLog />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

/* ─── Overview Panel: Activity-driven, not decorative ─── */

interface OverviewPanelProps {
  stats: IntegrityStats;
  loading: boolean;
  onNavigate: (tab: 'conflicts' | 'fraud') => void;
}

const OverviewPanel: React.FC<OverviewPanelProps> = ({ stats, loading, onNavigate }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* Compact stat summary — inline, not hero-metric */}
      <div className="flex flex-wrap gap-4">
        <StatChip
          label={t('integrity.conflictOfInterestLabel')}
          value={stats.conflicts.total}
          accent={stats.conflicts.pending > 0 ? 'warning' : 'muted'}
          sub={stats.conflicts.pending > 0 ? `${stats.conflicts.pending} ${t('integrity.pending')}` : undefined}
          loading={loading}
        />
        <StatChip
          label={t('integrity.fraudLabel')}
          value={stats.fraud.total}
          accent={stats.fraud.open > 0 ? 'danger' : 'muted'}
          sub={stats.fraud.open > 0 ? `${stats.fraud.open} ${t('common.open')}` : undefined}
          loading={loading}
        />
      </div>

      {/* Action cards — task-oriented, not decorative */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActionCard
          icon={Users}
          iconColor="var(--color-warning)"
          title={t('integrity.conflicts')}
          description={t('integrity.conflictsDesc')}
          actionLabel={t('integrity.goToLog')}
          onClick={() => onNavigate('conflicts')}
          badge={stats.conflicts.pending > 0 ? String(stats.conflicts.pending) : undefined}
          loading={loading}
        />
        <ActionCard
          icon={ShieldAlert}
          iconColor="var(--color-danger)"
          title={t('integrity.fraud')}
          description={t('integrity.fraudDesc')}
          actionLabel={t('integrity.goToLog')}
          onClick={() => onNavigate('fraud')}
          badge={stats.fraud.open > 0 ? String(stats.fraud.open) : undefined}
          loading={loading}
        />
      </div>
    </div>
  );
};

/* ─── Stat Chip: Compact inline indicator ─── */

interface StatChipProps {
  label: string;
  value: number;
  accent: 'warning' | 'danger' | 'muted';
  sub?: string | undefined;
  loading: boolean;
}

const StatChip: React.FC<StatChipProps> = ({ label, value, accent, sub, loading }) => {
  const accentColors = {
    warning: 'text-[var(--color-warning)]',
    danger: 'text-[var(--color-danger)]',
    muted: 'text-[var(--color-text-main)]',
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl">
      <div className="flex flex-col">
        <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
        <div className="flex items-baseline gap-2">
          {loading ? (
            <div className="h-5 w-8 rounded animate-shimmer" />
          ) : (
            <span className={`text-lg font-bold ${accentColors[accent]}`}>{value}</span>
          )}
          {sub && !loading && (
            <span className="text-[10px] font-semibold text-[var(--color-text-muted)]">{sub}</span>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── Action Card: Navigate to sub-section ─── */

interface ActionCardProps {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
  badge?: string | undefined;
  loading: boolean;
}

const ActionCard: React.FC<ActionCardProps> = ({
  icon: Icon,
  iconColor,
  title,
  description,
  actionLabel,
  onClick,
  badge,
  loading,
}) => {
  return (
    <button
      onClick={onClick}
      className="glass-card p-5 flex items-start gap-4 text-start w-full group cursor-pointer hover:border-[var(--color-border-strong)] transition-colors"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `color-mix(in srgb, ${iconColor} 10%, transparent)`, color: iconColor }}
      >
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-[var(--color-text-main)]">{title}</span>
          {badge && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-[var(--color-danger)]/10 text-[var(--color-danger)]">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed line-clamp-2">{description}</p>
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] group-hover:gap-2 transition-all">
          {actionLabel}
          <ChevronRight size={14} className="rtl:rotate-180" />
        </span>
      </div>
    </button>
  );
};

export default IntegrityManagement;
