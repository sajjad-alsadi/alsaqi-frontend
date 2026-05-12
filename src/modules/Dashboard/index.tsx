import React, { useState, useMemo } from 'react';
import { 
  Activity, AlertCircle, CheckCircle2, Clock, FileText, ShieldAlert, 
  Inbox, Send, Briefcase, AlertTriangle, TrendingUp, FileSearch, History,
  Plus, Scale
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../../context/AppContext';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { Language } from '../../constants';

// Sub-components
import DashboardHeader from './DashboardHeader';
import DashboardKpiGrid from './DashboardKpiGrid';
import DashboardAuditProgress from './DashboardAuditProgress';
import DashboardRiskOverview from './DashboardRiskOverview';
import DashboardActivityFeed from './DashboardActivityFeed';
import DashboardQuickActions from './DashboardQuickActions';

const Dashboard: React.FC = () => {
  const { language } = useAppContext();
  const { t } = useTranslation();
  const isRtl = language === Language.AR;
  
  const [activeFilter, setActiveFilter] = useState('all');
  const { stats, loading, error } = useDashboardStats(activeFilter);

  const COLORS = useMemo(() => ['#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6'], []);

  const kpiCards = useMemo(() => {
    if (!stats) return [];
    
    // Real calculation for completion trend instead of hardcoded '85%'
    const completionRate = stats.audits.total > 0 
      ? Math.round((stats.audits.completed / stats.audits.total) * 100) 
      : 0;

    return [
      { id: 'audits', title: t('dashboard.totalAudits'), value: stats.audits.total, icon: Briefcase, color: 'text-[var(--color-primary)]', bg: 'bg-[var(--color-primary)]/10', link: '/plan' },
      { id: 'completed', title: t('dashboard.completedAudits'), value: stats.audits.completed, icon: CheckCircle2, color: 'text-[var(--color-success)]', bg: 'bg-[var(--color-success)]/10', trend: `${completionRate}%`, trendUp: true, link: '/plan' },
      { id: 'findings', title: t('dashboard.openFindings'), value: stats.findings.summary.open, icon: FileText, color: 'text-[var(--color-warning)]', bg: 'bg-[var(--color-warning)]/10', link: '/findings' },
      { id: 'high-risk', title: t('dashboard.highRiskFindings'), value: stats.findings.summary.high_risk_open, icon: AlertCircle, color: 'text-[var(--color-danger)]', bg: 'bg-[var(--color-danger)]/10', trend: t('dashboard.critical'), trendUp: false, link: '/findings' },
      { id: 'recommendations', title: t('dashboard.openRecommendations'), value: stats.recommendations.open, icon: TrendingUp, color: 'text-[var(--color-info)]', bg: 'bg-[var(--color-info)]/10', trend: t('dashboard.active'), trendUp: true, link: '/recommendations' },
      { id: 'overdue', title: t('dashboard.overdueRecommendations'), value: stats.recommendations.overdue, icon: Clock, color: 'text-[var(--color-danger)]', bg: 'bg-[var(--color-danger)]/10', trend: t('dashboard.urgent'), trendUp: false, link: '/recommendations' },
      { id: 'risks', title: t('dashboard.totalRisks'), value: stats.risks.summary.total, icon: ShieldAlert, color: 'text-[var(--color-text-main)]', bg: 'bg-[var(--color-bg-main)]', trend: t('dashboard.monitored'), trendUp: true, link: '/risks' },
      { id: 'high-risks', title: t('dashboard.highRisks'), value: stats.risks.summary.high, icon: AlertTriangle, color: 'text-[var(--color-danger)]', bg: 'bg-[var(--color-danger)]/10', trend: t('dashboard.highPriority'), trendUp: false, link: '/risks' },
      { id: 'incoming', title: t('dashboard.incomingCorrespondence'), value: stats.correspondence.incoming_total, icon: Inbox, color: 'text-[var(--color-success)]', bg: 'bg-[var(--color-success)]/10', trend: t('dashboard.official'), trendUp: true, link: '/cms' },
      { id: 'outgoing', title: t('dashboard.outgoingCorrespondence'), value: stats.correspondence.outgoing_total, icon: Send, color: 'text-[var(--color-primary)]', bg: 'bg-[var(--color-primary)]/10', trend: t('dashboard.official'), trendUp: true, link: '/cms' },
      { id: 'pending-resp', title: t('dashboard.pendingResponses'), value: stats.correspondence.pending_responses, icon: Clock, color: 'text-[var(--color-warning)]', bg: 'bg-[var(--color-warning)]/10', trend: t('dashboard.actionRequired'), trendUp: false, link: '/cms' },
      { id: 'compliance', title: t('dashboard.activeInstructions'), value: stats.compliance.total, icon: Scale, color: 'text-[var(--color-primary)]', bg: 'bg-[var(--color-primary)]/10', trend: t('dashboard.regulatory'), trendUp: true, link: '/regulatory' },
    ];
  }, [stats, t]);

  const quickActions = useMemo(() => [
    { label: t('dashboard.addAuditEngagement'), icon: Plus, link: 'plan', color: 'bg-[var(--color-primary)]' },
    { label: t('dashboard.addAuditFinding'), icon: FileSearch, link: 'findings', color: 'bg-[var(--color-warning)]' },
    { label: t('dashboard.addRisk'), icon: ShieldAlert, link: 'risks', color: 'bg-[var(--color-danger)]' },
    { label: t('dashboard.addIncomingLetter'), icon: Inbox, link: 'cms', color: 'bg-[var(--color-success)]' },
  ], [t]);

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
      'Operational': t('dashboard.operationalAudit'),
      'Financial': t('dashboard.financialAudit'),
      'Compliance': t('dashboard.complianceAudit'),
      'IT': t('dashboard.itAudit'),
      'AML': t('dashboard.amlAudit')
    };

    // Initialize with zeros for known categories to ensure they always show up
    const trackedData: Record<string, {name: string, planned: number, completed: number}> = {
      'Operational': { name: typeMapping['Operational'], planned: 0, completed: 0 },
      'Financial': { name: typeMapping['Financial'], planned: 0, completed: 0 },
      'Compliance': { name: typeMapping['Compliance'], planned: 0, completed: 0 },
      'IT': { name: typeMapping['IT'], planned: 0, completed: 0 },
      'AML': { name: typeMapping['AML'], planned: 0, completed: 0 }
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
          completed: Number(item.completed || 0)
        };
      }
    });

    return Object.values(trackedData);
  }, [stats, t]);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--color-bg-main)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[var(--color-text-muted)] font-bold uppercase tracking-widest text-xs">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--color-bg-main)]">
        <div className="glass-card p-8 text-center max-w-md">
          <AlertCircle size={48} className="text-[var(--color-danger)] mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">{t('common.error')}</h2>
          <p className="text-[var(--color-text-muted)] mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="btn-primary w-full"
          >
            {t('dashboard.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto min-h-screen pb-12">
      <DashboardHeader 
        language={language} 
        activeFilter={activeFilter} 
        setActiveFilter={setActiveFilter} 
      />

      <DashboardKpiGrid cards={kpiCards} />

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
  );
};

export default Dashboard;
