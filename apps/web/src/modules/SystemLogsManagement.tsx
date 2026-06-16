import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { History, AlertCircle, Terminal, Activity, ShieldCheck, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import api from '../api/httpClient';
import logger from '../utils/logger';

// Existing Module Logic
import AuditTrail from './AuditTrail';
import SystemErrorLogs from './SystemErrorLogs';

const SystemLogsManagement: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'audit' | 'errors'>('audit');
  const [stats, setStats] = useState({ auditToday: 0, errorsCount: 0, healthPercent: 100, healthColor: 'text-[var(--color-success)]', healthStatus: 'stable' });
  const [showHealthTooltip, setShowHealthTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const fetchStats = async () => {
    try {
      const [auditRes, errorsRes] = await Promise.all([
        api.get('/audit-trail'),
        api.get('/system-errors')
      ]);

      const auditData = Array.isArray(auditRes.data) ? auditRes.data : (auditRes.data?.data || []);
      const errorsData = Array.isArray(errorsRes.data) ? errorsRes.data : (errorsRes.data?.data || []);

      const today = new Date().toISOString().split('T')[0];
      const todayAudit = auditData.filter((item: any) => 
        item.timestamp?.startsWith(today)
      ).length;

      const totalErrors = errorsRes.data?.pagination?.total ?? errorsData.length;
      const totalAudit = auditRes.data?.pagination?.total ?? auditData.length;

      const health = (totalAudit > 0 || totalErrors > 0)
        ? (totalAudit / (totalAudit + totalErrors)) * 100
        : 100;

      let healthColor: string;
      let healthStatus: string;
      if (health >= 90) {
        healthColor = 'text-[var(--color-success)]';
        healthStatus = 'stable';
      } else if (health >= 70) {
        healthColor = 'text-[var(--color-warning)]';
        healthStatus = 'degraded';
      } else {
        healthColor = 'text-[var(--color-danger)]';
        healthStatus = 'critical';
      }

      setStats({
        auditToday: todayAudit,
        errorsCount: totalErrors,
        healthPercent: health,
        healthColor,
        healthStatus
      });
    } catch (error) {
      logger.error('Error fetching logs stats:', error);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Close tooltip on Escape or click outside
  useEffect(() => {
    if (!showHealthTooltip) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowHealthTooltip(false);
    };
    const handleClick = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowHealthTooltip(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [showHealthTooltip]);

  const tabs = [
    { id: 'audit', label: t('SystemLogsAudit'), icon: History },
    { id: 'errors', label: t('SystemLogsErrors'), icon: AlertCircle },
  ] as const;

  const tabPanelId = `tabpanel-${activeTab}`;

  return (
    <div className="space-y-6 pb-10">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 bg-[var(--color-primary)] rounded-xl flex items-center justify-center text-white shadow-[var(--shadow-primary)]">
            <Terminal size={22} />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text-main)] tracking-tight">{t('SystemLogsManagement')}</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{t('SystemLogsManagementDesc')}</p>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="flex flex-wrap items-center gap-6 px-5 py-3.5 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl shadow-sm">
        <div className="flex items-center gap-2" ref={tooltipRef}>
          <ShieldCheck size={16} className={stats.healthColor} />
          <span className={`text-sm font-semibold ${stats.healthColor}`}>
            {stats.healthPercent.toFixed(1)}%
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">{t(`systemLogsManagement.${stats.healthStatus}`)}</span>
          <button
            type="button"
            className="relative p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
            aria-label={t('systemLogsManagement.healthExplanation')}
            aria-expanded={showHealthTooltip}
            onClick={() => setShowHealthTooltip(!showHealthTooltip)}
          >
            <Info size={14} />
            {showHealthTooltip && (
              <div 
                role="tooltip"
                className="absolute top-full start-0 mt-2 p-3 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl shadow-lg text-xs text-[var(--color-text-main)] w-56 z-10"
              >
                {t('systemLogsManagement.healthTooltip')}
              </div>
            )}
          </button>
        </div>
        <span className="w-px h-5 bg-[var(--color-border-soft)]" aria-hidden="true" />
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-[var(--color-text-muted)]" />
          <span className="text-sm text-[var(--color-text-main)]">{stats.auditToday}</span>
          <span className="text-xs text-[var(--color-text-muted)]">{t('systemLogsManagement.auditToday')}</span>
        </div>
        <span className="w-px h-5 bg-[var(--color-border-soft)]" aria-hidden="true" />
        <div className="flex items-center gap-2">
          <AlertCircle size={14} className="text-[var(--color-danger)]" />
          <span className="text-sm font-medium text-[var(--color-danger)]">{stats.errorsCount}</span>
          <span className="text-xs text-[var(--color-text-muted)]">{t('systemLogsManagement.totalErrors')}</span>
        </div>
      </div>

      {/* Tabs with ARIA semantics */}
      <div 
        role="tablist" 
        aria-label={t('SystemLogsManagement')}
        className="flex flex-wrap gap-1.5 p-1 bg-[var(--color-bg-soft)] rounded-xl w-fit border border-[var(--color-border-soft)]/50"
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
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                isActive 
                  ? 'bg-[var(--color-card)] text-[var(--color-primary)] shadow-sm border border-[var(--color-border-soft)]' 
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-card)]/50'
              }`}
            >
              <Icon size={16} className={isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          id={`tabpanel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'audit' && <AuditTrail embedded />}
          {activeTab === 'errors' && <SystemErrorLogs embedded />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default SystemLogsManagement;
