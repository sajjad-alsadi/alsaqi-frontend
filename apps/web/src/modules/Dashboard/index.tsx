import React, { useRef, useState, useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  ShieldAlert,
  Inbox,
  Send,
  Briefcase,
  AlertTriangle,
  TrendingUp,
  FileSearch,
  Plus,
  Scale,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { usePreferences } from '../../context/PreferencesContext';
import { useDashboardStats } from '../../api/hooks/useDashboardStats';
import { Language } from '../../constants';
import { StatsSkeleton } from '../../components/SkeletonLoader';

// Sub-components
import DashboardHeader from './DashboardHeader';
import DashboardKpiGrid, { KpiCard, KpiGroup } from './DashboardKpiGrid';
import DashboardAuditProgress from './DashboardAuditProgress';
import DashboardRiskOverview from './DashboardRiskOverview';
import DashboardActivityFeed from './DashboardActivityFeed';
import DashboardQuickActions from './DashboardQuickActions';

const Dashboard: React.FC = () => {
  const { language } = usePreferences();
  const { t } = useTranslation();
  const isRtl = language === Language.AR;

  const [activeFilter, setActiveFilter] = useState('all');
  // Track whether this is the first load (show full skeleton) or a filter
  // change (show subtle overlay on existing data).
  const isFirstLoad = useRef(true);
  const { stats, loading, error } = useDashboardStats(activeFilter);

  // Once we have data for the first time, mark first load as complete.
  if (stats && isFirstLoad.current) {
    isFirstLoad.current = false;
  }

  const isFilterRefetching = loading && !isFirstLoad.current;

  const COLORS = useMemo(
    () => ['#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6'],
    []
  );

  // ── KPI cards ────────────────────────────────────────────────────────────
  const { highlightCards, groups } = useMemo<{
    highlightCards: KpiCard[];
    groups: KpiGroup[];
  }>(() => {
    if (!stats) return { highlightCards: [], groups: [] };

    const completionRate =
      stats.audits.total > 0
        ? Math.round((stats.audits.completed / stats.audits.total) * 100)
        : 0;

    // ── Highlight row: the 4 most critical metrics ──
    const highlightCards: KpiCard[] = [
      {
        id: 'high-risk',
        title: t('dashboard.highRiskFindings'),
        description: t('dashboard.highRiskFindingsDesc'),
        value: stats.findings.summary.high_risk_open,
        icon: AlertCircle,
        color: 'text-[var(--color-danger)]',
        bg: 'bg-[var(--color-danger)]/10',
        trend: t('dashboard.critical'),
        trendUp: false,
        link: '/findings',
        highlight: true,
      },
      {
        id: 'overdue',
        title: t('dashboard.overdueRecommendations'),
        description: t('dashboard.overdueRecommendationsDesc'),
        value: stats.recommendations.overdue,
        icon: Clock,
        color: 'text-[var(--color-danger)]',
        bg: 'bg-[var(--color-danger)]/10',
        trend: t('dashboard.urgent'),
        trendUp: false,
        link: '/recommendations',
        highlight: true,
      },
      {
        id: 'findings',
        title: t('dashboard.openFindings'),
        description: t('dashboard.openFindingsDesc'),
        value: stats.findings.summary.open,
        icon: FileText,
        color: 'text-[var(--color-warning)]',
        bg: 'bg-[var(--color-warning)]/10',
        link: '/findings',
        highlight: true,
      },
      {
        id: 'completed',
        title: t('dashboard.completedAudits'),
        description: t('dashboard.completedAuditsDesc'),
        value: stats.audits.completed,
        icon: CheckCircle2,
        color: 'text-[var(--color-success)]',
        bg: 'bg-[var(--color-success)]/10',
        trend: `${completionRate}%`,
        trendUp: true,
        link: '/plan',
        highlight: true,
      },
    ];

    // ── Secondary group 1: Audits & Recommendations ──
    const auditsGroup: KpiGroup = {
      label: t('dashboard.groupAudits'),
      cards: [
        {
          id: 'audits',
          title: t('dashboard.totalAudits'),
          description: t('dashboard.totalAuditsDesc'),
          value: stats.audits.total,
          icon: Briefcase,
          color: 'text-[var(--color-primary)]',
          bg: 'bg-[var(--color-primary)]/10',
          link: '/plan',
        },
        {
          id: 'recommendations',
          title: t('dashboard.openRecommendations'),
          description: t('dashboard.openRecommendationsDesc'),
          value: stats.recommendations.open,
          icon: TrendingUp,
          color: 'text-[var(--color-info)]',
          bg: 'bg-[var(--color-info)]/10',
          trend: t('dashboard.active'),
          trendUp: true,
          link: '/recommendations',
        },
      ],
    };

    // ── Secondary group 2: Risks ──
    const risksGroup: KpiGroup = {
      label: t('dashboard.groupRisks'),
      cards: [
        {
          id: 'risks',
          title: t('dashboard.totalRisks'),
          description: t('dashboard.totalRisksDesc'),
          value: stats.risks.summary.total,
          icon: ShieldAlert,
          color: 'text-[var(--color-text-main)]',
          bg: 'bg-[var(--color-bg-main)]',
          trend: t('dashboard.monitored'),
          trendUp: true,
          link: '/risks',
        },
        {
          id: 'high-risks',
          title: t('dashboard.highRisks'),
          description: t('dashboard.highRisksDesc'),
          value: stats.risks.summary.high,
          icon: AlertTriangle,
          color: 'text-[var(--color-danger)]',
          bg: 'bg-[var(--color-danger)]/10',
          trend: t('dashboard.highPriority'),
          trendUp: false,
          link: '/risks',
        },
      ],
    };

    // ── Secondary group 3: Correspondence & Compliance ──
    const correspondenceGroup: KpiGroup = {
      label: t('dashboard.groupCorrespondence'),
      cards: [
        {
          id: 'incoming',
          title: t('dashboard.incomingCorrespondence'),
          description: t('dashboard.incomingCorrespondenceDesc'),
          value: stats.correspondence.incoming_total,
          icon: Inbox,
          color: 'text-[var(--color-success)]',
          bg: 'bg-[var(--color-success)]/10',
          trend: t('dashboard.official'),
          trendUp: true,
          link: '/cms',
        },
        {
          id: 'outgoing',
          title: t('dashboard.outgoingCorrespondence'),
          description: t('dashboard.outgoingCorrespondenceDesc'),
          value: stats.correspondence.outgoing_total,
          icon: Send,
          color: 'text-[var(--color-primary)]',
          bg: 'bg-[var(--color-primary)]/10',
          trend: t('dashboard.official'),
          trendUp: true,
          link: '/cms',
        },
        {
          id: 'pending-resp',
          title: t('dashboard.pendingResponses'),
          description: t('dashboard.pendingResponsesDesc'),
          value: stats.correspondence.pending_responses,
          icon: Clock,
          color: 'text-[var(--color-warning)]',
          bg: 'bg-[var(--color-warning)]/10',
          trend: t('dashboard.actionRequired'),
          trendUp: false,
          link: '/cms',
        },
        {
          id: 'compliance',
          title: t('dashboard.activeInstructions'),
          description: t('dashboard.activeInstructionsDesc'),
          value: stats.compliance.total,
          icon: Scale,
          color: 'text-[var(--color-primary)]',
          bg: 'bg-[var(--color-primary)]/10',
          trend: t('dashboard.regulatory'),
          trendUp: true,
          link: '/compliance-matrix',
        },
      ],
    };

    return {
      highlightCards,
      groups: [auditsGroup, risksGroup, correspondenceGroup],
    };
  }, [stats, t]);

  const quickActions = useMemo(
    () => [
      {
        label: t('dashboard.addAuditEngagement'),
        icon: Plus,
        link: 'plan',
        color: 'bg-[var(--color-primary)]',
      },
      {
        label: t('dashboard.addAuditFinding'),
        icon: FileSearch,
        link: 'findings',
        color: 'bg-[var(--color-warning)]',
      },
      {
        label: t('dashboard.addRisk'),
        icon: ShieldAlert,
        link: 'risks',
        color: 'bg-[var(--color-danger)]',
      },
      {
        label: t('dashboard.addIncomingLetter'),
        icon: Inbox,
        link: 'cms',
        color: 'bg-[var(--color-success)]',
      },
    ],
    [t]
  );

  const auditProgressData = useMemo(() => {
    if (!stats?.audits?.progress_by_type) {
      return [
        { name: t('dashboard.operationalAudit'), planned: 0, completed: 0 },
        { name: t('dashboard.financialAudit'), planned: 0, completed: 0 },
        { name: t('dashboard.complianceAudit'), planned: 0, completed: 0 },
        { name: t('dashboard.itAudit'), planned: 0, completed: 0 },
        { name: t('dashboard.amlAudit'), planned: 0, completed: 0 },
      ];
    }

    const typeMapping: Record<string, string> = {
      Operational: t('dashboard.operationalAudit'),
      Financial: t('dashboard.financialAudit'),
      Compliance: t('dashboard.complianceAudit'),
      IT: t('dashboard.itAudit'),
      AML: t('dashboard.amlAudit'),
    };

    const trackedData: Record<
      string,
      { name: string; planned: number; completed: number }
    > = {
      Operational: { name: typeMapping['Operational'] ?? '', planned: 0, completed: 0 },
      Financial: { name: typeMapping['Financial'] ?? '', planned: 0, completed: 0 },
      Compliance: { name: typeMapping['Compliance'] ?? '', planned: 0, completed: 0 },
      IT: { name: typeMapping['IT'] ?? '', planned: 0, completed: 0 },
      AML: { name: typeMapping['AML'] ?? '', planned: 0, completed: 0 },
    };

    stats.audits.progress_by_type.forEach((item: any) => {
      const dbType = item.type || 'Other';
      if (trackedData[dbType]) {
        trackedData[dbType].planned += Number(item.planned || 0);
        trackedData[dbType].completed += Number(item.completed || 0);
      } else {
        trackedData[dbType] = {
          name: dbType,
          planned: Number(item.planned || 0),
          completed: Number(item.completed || 0),
        };
      }
    });

    return Object.values(trackedData);
  }, [stats, t]);

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--color-bg-main)]">
        <div className="glass-card p-8 text-center max-w-md">
          <AlertCircle
            size={48}
            className="text-[var(--color-danger)] mx-auto mb-4"
            aria-hidden="true"
          />
          <h2 className="text-xl font-bold mb-2">{t('common.error')}</h2>
          <p className="text-[var(--color-text-muted)] mb-6">{error}</p>
          {/* Retry without a hard page reload — let the hook refetch */}
          <Button
            onClick={() => {
              // Toggling the filter briefly forces a refetch via hook dependency
              setActiveFilter((f) => (f === 'all' ? '__retry__' : 'all'));
              setTimeout(() => setActiveFilter('all'), 0);
            }}
            className="w-full"
          >
            {t('dashboard.retry')}
          </Button>
        </div>
      </div>
    );
  }

  // ── First-load skeleton ───────────────────────────────────────────────────
  if (isFirstLoad.current && (loading || !stats)) {
    return (
      <div
        className="space-y-8 max-w-[1600px] mx-auto min-h-screen pb-12"
        aria-busy="true"
        aria-label={t('common.loading')}
      >
        <StatsSkeleton count={8} />
      </div>
    );
  }

  if (!stats) return null;

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 max-w-[1600px] mx-auto min-h-screen pb-12">
      <DashboardHeader
        language={language}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        isLoading={isFilterRefetching}
      />

      {/*
        Filter-change loading overlay: dims ALL data sections, keeps structure
        visible so users can see the filter took effect. Previously only wrapped
        the KPI grid; now covers charts and activity feed too so the scope is clear.
      */}
      <div
        className={`space-y-8 transition-opacity duration-300 ${
          isFilterRefetching ? 'opacity-50 pointer-events-none' : 'opacity-100'
        }`}
        aria-busy={isFilterRefetching}
      >
        {/* Filter scope badge — shown when a non-"all" filter is active */}
        {activeFilter !== 'all' && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-xs font-semibold text-[var(--color-primary)]">
              {t(`dashboard.${activeFilter}`)}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {t('dashboard.filterScopeActive')}
            </span>
            <button
              onClick={() => setActiveFilter('all')}
              className="text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] transition-colors"
              aria-label={t('dashboard.clearFilter')}
            >
              ×
            </button>
          </div>
        )}

        <DashboardKpiGrid
          highlightCards={highlightCards}
          groups={groups}
          priorityLabel={t('dashboard.priorityIndicators')}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <DashboardAuditProgress
            t={t}
            isRtl={isRtl}
            data={auditProgressData}
            totalPlanned={stats.audits.total}
            totalCompleted={stats.audits.completed}
          />
          <DashboardRiskOverview t={t} stats={stats} colors={COLORS} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <DashboardActivityFeed t={t} activity={stats.activity} />
          <DashboardQuickActions t={t} quickActions={quickActions} stats={stats} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
