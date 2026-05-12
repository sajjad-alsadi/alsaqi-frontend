import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Scale, AlertTriangle, Users, History, LayoutDashboard, ShieldAlert, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppContext } from '../context/AppContext';
import api from '../services/api';

// Existing Module Logic
import ConflictOfInterest from './ConflictOfInterest';
import FraudLog from './FraudLog';

const IntegrityManagement: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAppContext();
  const [activeTab, setActiveTab] = useState<'overview' | 'conflicts' | 'fraud'>('overview');
  const [stats, setStats] = useState({
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
      console.error('Error fetching integrity stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchStats();
    }
  }, [activeTab]);

  const getMonthName = () => {
    return new Intl.DateTimeFormat(i18n.language || 'en', { month: 'long' }).format(new Date());
  };

  const tabs = [
    { id: 'overview', label: t('integrity.dashboard'), icon: LayoutDashboard },
    { id: 'conflicts', label: t('integrity.conflicts'), icon: Users },
    { id: 'fraud', label: t('integrity.fraud'), icon: ShieldAlert },
  ];

  const isAdmin = user?.role === 'Admin' || user?.role === 'Administrator' || user?.role === 'Manager';

  return (
    <div className="space-y-8 pb-10">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-[var(--color-primary)]/20">
            <Scale size={32} />
          </div>
          <div>
            <h2 className="text-4xl font-bold text-[var(--color-text-main)] tracking-tight">{t('integrity.title')}</h2>
            <p className="text-sm text-[var(--color-text-muted)] font-bold mt-2">{t('integrity.subTitle')}</p>
          </div>
        </div>
      </div>

      {/* Modern Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-[var(--color-bg-main)]/50 rounded-2xl w-fit self-start">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                isActive 
                  ? 'bg-[var(--color-card)] text-[var(--color-primary)] shadow-sm shadow-[var(--color-border-soft)]' 
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
              {/* Quick Stats Bento Grid */}
              <div className="p-8 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-2xl shadow-sm flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 mb-6">
                    <Users size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-[var(--color-text-main)] mb-2">{t('integrity.conflicts')}</h3>
                  <p className="text-sm font-bold text-[var(--color-text-muted)] leading-relaxed">
                    {t('integrity.conflictsDesc')}
                  </p>
                </div>
                <button 
                  onClick={() => setActiveTab('conflicts')}
                  className="mt-8 flex items-center gap-2 text-[var(--color-primary)] font-bold text-sm group"
                >
                  {t('integrity.goToLog')} 
                  <Plus size={16} className="group-hover:rotate-90 transition-transform" />
                </button>
              </div>

              <div className="p-8 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-2xl shadow-sm flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 mb-6">
                    <ShieldAlert size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-[var(--color-text-main)] mb-2">{t('integrity.fraud')}</h3>
                  <p className="text-sm font-bold text-[var(--color-text-muted)] leading-relaxed">
                    {t('integrity.fraudDesc')}
                  </p>
                </div>
                <button 
                  onClick={() => setActiveTab('fraud')}
                  className="mt-8 flex items-center gap-2 text-rose-500 font-bold text-sm group"
                >
                  {t('integrity.goToLog')} 
                  <Plus size={16} className="group-hover:rotate-90 transition-transform" />
                </button>
              </div>

              <div className="p-8 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-2xl shadow-sm flex flex-col justify-between group overflow-hidden relative">
                <div className="absolute top-0 end-0 p-8 opacity-[0.03] pointer-events-none">
                  <Scale size={120} className="text-[var(--color-primary)]" />
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)] mb-6 group-hover:scale-110 transition-transform">
                    <Scale size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-[var(--color-text-main)] mb-2">{t('integrity.totalReports')}</h3>
                  <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('integrity.integrityActivity')} {getMonthName()} {new Date().getFullYear()}</p>
                  <div className="mt-6 flex items-end gap-2">
                    <span className="text-5xl font-bold tracking-tighter text-[var(--color-text-main)]">
                      {loading ? '...' : stats.summary.total}
                    </span>
                    <span className="text-[var(--color-text-muted)] font-bold mb-1 text-xs uppercase tracking-widest">{t('integrity.activeStatus')}</span>
                  </div>
                </div>
                <div className="relative z-10 space-y-3 mt-8 pt-6 border-t border-[var(--color-border-soft)]">
                  <div className="flex justify-between items-center text-xs font-bold text-[var(--color-text-muted)]">
                    <span className="text-[var(--color-text-muted)]">{t('integrity.conflictOfInterestLabel')}</span>
                    <span>{loading ? '...' : stats.conflicts.total} {t('integrity.disclosures')}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-rose-500">
                    <span>{t('integrity.fraudLabel')}</span>
                    <span>{loading ? '...' : stats.fraud.total} {t('integrity.cases')}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'conflicts' && <ConflictOfInterest />}
          {activeTab === 'fraud' && <FraudLog />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default IntegrityManagement;
