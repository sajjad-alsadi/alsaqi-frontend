import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { History, AlertCircle, LayoutDashboard, Terminal, Activity, ShieldCheck, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import api from '../api/httpClient';
import logger from '../utils/logger';

// Existing Module Logic
import AuditTrail from './AuditTrail';
import SystemErrorLogs from './SystemErrorLogs';

const SystemLogsManagement: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab ] = useState<'overview' | 'audit' | 'errors'>('overview');
  const [stats, setStats] = useState({ auditToday: 0, errorsCount: 0, healthPercent: 100, healthColor: 'text-emerald-500', healthStatus: 'stable' });
  const [loading, setLoading] = useState(false);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const [auditRes, errorsRes] = await Promise.all([
        api.get('/audit-trail'),
        api.get('/system-errors')
      ]);

      // Normalize data (some endpoints return { data: [], total: ... })
      const auditData = Array.isArray(auditRes.data) ? auditRes.data : (auditRes.data?.data || []);
      const errorsData = Array.isArray(errorsRes.data) ? errorsRes.data : (errorsRes.data?.data || []);

      // Calculate audit actions for today
      const today = new Date().toISOString().split('T')[0];
      const todayAudit = auditData.filter((item: any) => 
        item.timestamp?.startsWith(today)
      ).length;

      // Use pagination.total for accurate counts across all pages
      const totalErrors = errorsRes.data?.pagination?.total ?? errorsData.length;
      const totalAudit = auditRes.data?.pagination?.total ?? auditData.length;

      // Compute dynamic health percentage
      const health = (totalAudit > 0 || totalErrors > 0)
        ? (totalAudit / (totalAudit + totalErrors)) * 100
        : 100;

      // Determine color and status based on thresholds
      let healthColor: string;
      let healthStatus: string;
      if (health >= 90) {
        healthColor = 'text-emerald-500';
        healthStatus = 'stable';
      } else if (health >= 70) {
        healthColor = 'text-amber-500';
        healthStatus = 'degraded';
      } else {
        healthColor = 'text-rose-500';
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const tabs = [
    { id: 'overview', label: t('SystemLogsDashboard'), icon: LayoutDashboard },
    { id: 'audit', label: t('SystemLogsAudit'), icon: History },
    { id: 'errors', label: t('SystemLogsErrors'), icon: AlertCircle },
  ];

  return (
    <div className="space-y-8 pb-10">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
            <Terminal size={32} />
          </div>
          <div>
            <h2 className="text-2xl sm:text-4xl font-bold text-[var(--color-text-main)] tracking-tight">{t('SystemLogsManagement')}</h2>
            <p className="text-sm text-[var(--color-text-muted)] font-bold mt-2">{t('SystemLogsManagementDesc')}</p>
          </div>
        </div>
      </div>

      {/* Modern Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-[var(--color-bg-main)]/50 rounded-2xl w-fit self-start border border-[var(--color-border-soft)]/50">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                isActive 
                  ? 'bg-[var(--color-card)] text-[var(--color-primary)] shadow-sm shadow-[var(--color-border-soft)] border border-[var(--color-border-soft)]' 
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-card)]/50'
              }`}
            >
              <Icon size={18} className={isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Bento Grid Analytics */}
              <div className="p-8 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-2xl shadow-sm flex flex-col justify-between group">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-light)] flex items-center justify-center text-blue-500 mb-6 group-hover:scale-110 transition-transform">
                    <History size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-[var(--color-text-main)] mb-2">{t('SystemLogsAudit')}</h3>
                  <p className="text-sm font-bold text-[var(--color-text-muted)] leading-relaxed">
                    {t('systemLogsManagement.auditDesc')}
                  </p>
                </div>
                <button 
                  onClick={() => setActiveTab('audit')}
                  className="mt-8 flex items-center gap-2 text-blue-500 font-bold text-sm group/btn"
                >
                  {t('systemLogsManagement.openLog')} 
                  <Activity size={16} className="group-hover/btn:translate-x-1 transition-transform rtl:rotate-180" />
                </button>
              </div>

              <div className="p-8 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-2xl shadow-sm flex flex-col justify-between group">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 mb-6 group-hover:scale-110 transition-transform">
                    <AlertCircle size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-[var(--color-text-main)] mb-2">{t('SystemLogsErrors')}</h3>
                  <p className="text-sm font-bold text-[var(--color-text-muted)] leading-relaxed">
                    {t('systemLogsManagement.errorsDesc')}
                  </p>
                </div>
                <button 
                  onClick={() => setActiveTab('errors')}
                  className="mt-8 flex items-center gap-2 text-rose-500 font-bold text-sm group/btn"
                >
                  {t('systemLogsManagement.openLog')} 
                  <Activity size={16} className="group-hover/btn:translate-x-1 transition-transform rtl:rotate-180" />
                </button>
              </div>

              <div className="p-8 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-2xl shadow-sm flex flex-col justify-between group overflow-hidden relative">
                <div className="absolute top-0 end-0 p-8 opacity-[0.03] pointer-events-none">
                  <ShieldCheck size={120} className="text-emerald-500" />
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500 mb-6 group-hover:scale-110 transition-transform">
                    <ShieldCheck size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-[var(--color-text-main)] mb-2">{t('systemLogsManagement.systemHealth')}</h3>
                  <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('systemLogsManagement.serverStatus')}</p>
                  <div className="mt-6 flex items-end gap-2">
                    <span className={`text-5xl font-bold tracking-tighter ${stats.healthColor}`}>{new Intl.NumberFormat('ar-IQ', { style: 'percent', maximumFractionDigits: 1 }).format(stats.healthPercent / 100)}</span>
                    <span className="text-[var(--color-text-muted)] font-bold mb-1 text-xs uppercase tracking-widest">{t(`systemLogsManagement.${stats.healthStatus}`)}</span>
                  </div>
                </div>
                <div className="relative z-10 space-y-3 mt-8 pt-6 border-t border-[var(--color-border-soft)]">
                  <div className="flex justify-between items-center text-xs font-bold text-[var(--color-text-muted)]">
                    <span className="text-[var(--color-text-muted)]">{t('systemLogsManagement.auditToday')}</span>
                    <span>{stats.auditToday} {t('systemLogsManagement.actions')}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-rose-500">
                    <span>{t('systemLogsManagement.totalErrors')}</span>
                    <span>{stats.errorsCount} {t('systemLogsManagement.errorCount')}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audit' && <AuditTrail />}
          {activeTab === 'errors' && <SystemErrorLogs />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default SystemLogsManagement;
