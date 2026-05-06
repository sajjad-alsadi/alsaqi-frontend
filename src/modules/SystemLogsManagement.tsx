import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { History, AlertCircle, LayoutDashboard, Terminal, Activity, ShieldCheck, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import api from '../services/api';

// Existing Module Logic
import AuditTrail from './AuditTrail';
import SystemErrorLogs from './SystemErrorLogs';

const SystemLogsManagement: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab ] = useState<'overview' | 'audit' | 'errors'>('overview');
  const [stats, setStats] = useState({ auditToday: 0, errorsCount: 0 });
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

      setStats({
        auditToday: todayAudit,
        errorsCount: errorsData.length
      });
    } catch (error) {
      console.error('Error fetching logs stats:', error);
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
          <div className="w-16 h-16 bg-[var(--color-primary)] rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-[var(--color-primary)]/20">
            <Terminal size={32} />
          </div>
          <div>
            <h2 className="text-4xl font-black text-slate-800 tracking-tight">{t('SystemLogsManagement')}</h2>
            <p className="text-sm text-slate-400 font-bold mt-2">{t('SystemLogsManagementDesc')}</p>
          </div>
        </div>
      </div>

      {/* Modern Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100/50 rounded-2xl w-fit self-start border border-slate-200/50">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-black transition-all ${
                isActive 
                  ? 'bg-white text-[var(--color-primary)] shadow-sm shadow-slate-200 border border-slate-100' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <Icon size={18} className={isActive ? 'text-[var(--color-primary)]' : 'text-slate-400'} />
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
              <div className="p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm flex flex-col justify-between group">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500 mb-6 group-hover:scale-110 transition-transform">
                    <History size={24} />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 mb-2">{t('SystemLogsAudit')}</h3>
                  <p className="text-sm font-bold text-slate-400 leading-relaxed">
                    {t('systemLogsManagement.auditDesc', 'تتبع كافة إجراءات المستخدمين، عمليات الدخول، والتعديلات على البيانات لضمان المرجعية.')}
                  </p>
                </div>
                <button 
                  onClick={() => setActiveTab('audit')}
                  className="mt-8 flex items-center gap-2 text-blue-500 font-black text-sm group/btn"
                >
                  {t('systemLogsManagement.openLog', 'فتح السجل')} 
                  <Activity size={16} className="group-hover/btn:translate-x-1 transition-transform rtl:rotate-180" />
                </button>
              </div>

              <div className="p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm flex flex-col justify-between group">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 mb-6 group-hover:scale-110 transition-transform">
                    <AlertCircle size={24} />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 mb-2">{t('SystemLogsErrors')}</h3>
                  <p className="text-sm font-bold text-slate-400 leading-relaxed">
                    {t('systemLogsManagement.errorsDesc', 'مراقبة استثناءات النظام، أخطاء الخادم، والتنبيهات التقنية لتحسين استقرار التطبيق.')}
                  </p>
                </div>
                <button 
                  onClick={() => setActiveTab('errors')}
                  className="mt-8 flex items-center gap-2 text-rose-500 font-black text-sm group/btn"
                >
                  {t('systemLogsManagement.openLog', 'فتح السجل')} 
                  <Activity size={16} className="group-hover/btn:translate-x-1 transition-transform rtl:rotate-180" />
                </button>
              </div>

              <div className="p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm flex flex-col justify-between group overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                  <ShieldCheck size={120} className="text-emerald-500" />
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500 mb-6 group-hover:scale-110 transition-transform">
                    <ShieldCheck size={24} />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 mb-2">{t('systemLogsManagement.systemHealth', 'سلامة النظام')}</h3>
                  <p className="text-sm font-bold text-slate-400">{t('systemLogsManagement.serverStatus', 'حالة الخادم والخدمات السحابية')}</p>
                  <div className="mt-6 flex items-end gap-2">
                    <span className="text-5xl font-black tracking-tighter text-emerald-500">99.9%</span>
                    <span className="text-slate-400 font-bold mb-1 text-xs uppercase tracking-widest">{t('systemLogsManagement.stable', 'مستقر')}</span>
                  </div>
                </div>
                <div className="relative z-10 space-y-3 mt-8 pt-6 border-t border-slate-100">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-600">
                    <span className="text-slate-400">{t('systemLogsManagement.auditToday', 'إجراءات التدقيق اليوم')}</span>
                    <span>{stats.auditToday} {t('systemLogsManagement.actions', 'إجراء')}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-rose-500">
                    <span>{t('systemLogsManagement.totalErrors', 'سجل الأخطاء (إجمالي)')}</span>
                    <span>{stats.errorsCount} {t('systemLogsManagement.errorCount', 'خطأ')}</span>
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
