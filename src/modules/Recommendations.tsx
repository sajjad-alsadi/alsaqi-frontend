import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useTranslation } from 'react-i18next';
import { Recommendation, AuditFinding, AuditPlan } from '../types';
import { Search, TrendingUp, Filter } from 'lucide-react';
import { motion } from 'motion/react';
import { useFormat } from '../services/formatService';
import logger from '../utils/logger';

import Modal from '../components/Modal';
import Badge from '../components/Badge';
import LoadingSpinner from '../components/LoadingSpinner';

const RecommendationsModule: React.FC = () => {
  const { t } = useTranslation();
  const { formatDate, formatNumber } = useFormat();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [plans, setPlans] = useState<AuditPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // Filters
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterPlanId, setFilterPlanId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [editingRec, setEditingRec] = useState<Recommendation | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [recToDelete, setRecToDelete] = useState<string | number | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [recRes, findRes, planRes] = await Promise.all([
        api.get('/recommendations', { params: { pageSize: 200 } }),
        api.get('/audit-findings', { params: { pageSize: 200 } }),
        api.get('/audit-plans'),
      ]);
      setRecommendations(recRes.data?.data || (Array.isArray(recRes.data) ? recRes.data : []));
      setFindings(findRes.data?.data || (Array.isArray(findRes.data) ? findRes.data : []));
      setPlans(planRes.data?.data || (Array.isArray(planRes.data) ? planRes.data : []));
    } catch (err) {
      logger.error('Operation failed', err);
    } finally {
      setLoading(false);
    }
  };

  const initiateDelete = (id: string | number) => {
    setRecToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!recToDelete) return;
    try {
      await api.delete(`/recommendations/${recToDelete}`);
      fetchAll();
      setIsDeleteModalOpen(false);
      setRecToDelete(null);
    } catch (err) {
      logger.error('Operation failed', err);
    }
  };

  const getFinding = (id: string | number) => findings.find(f => String(f.id) === String(id));
  const getPlan = (id: string | number | undefined) => plans.find(p => String(p.id) === String(id));

  // unique departments from recommendations
  const departments = [...new Set(recommendations.map(r => r.department).filter(Boolean))];
  const statuses = ['Open', 'In Progress', 'Implemented', 'Overdue', 'Closed'];

  const filteredRecs = (recommendations || []).filter(r => {
    const finding = getFinding(r.finding_id);
    const matchSearch = (r.department?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                        (r.responsible?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                        (finding?.title?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchDept = !filterDepartment || r.department === filterDepartment;
    const matchStatus = !filterStatus || r.status === filterStatus;
    const matchPlan = !filterPlanId || String(r.plan_id) === String(filterPlanId) ||
                      String(finding?.audit_id) === String(filterPlanId);
    return matchSearch && matchDept && matchStatus && matchPlan;
  });

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
            <TrendingUp size={32} />
          </div>
          <div>
            <h2 className="text-2xl sm:text-4xl font-bold text-[var(--color-text-main)] tracking-tight">{t('recommendations.title')}</h2>
            <p className="text-sm text-[var(--color-text-muted)] font-bold mt-2">{t('recommendations.trackingManagementActionPlans')}</p>
          </div>
        </div>
        <div className="relative flex-1 min-w-[300px] max-w-md">
          <Search className="absolute start-5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={20} />
          <input
            type="text"
            placeholder={t('recommendations.search')}
            className="input-field !ps-14"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Filter size={18} className="text-[var(--color-primary)]" />
          <span className="text-sm font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('filters.filters') || 'تصفية'}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Filter by Plan */}
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2 block">{t('filters.byPlan')}</label>
            <select className="input-field" value={filterPlanId} onChange={e => setFilterPlanId(e.target.value)}>
              <option value="">{t('common.all') || 'الكل'}</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          {/* Filter by Department */}
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2 block">{t('filters.byDepartment')}</label>
            <select className="input-field" value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)}>
              <option value="">{t('common.all') || 'الكل'}</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {/* Filter by Status */}
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2 block">{t('filters.byStatus')}</label>
            <select className="input-field" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">{t('common.all') || 'الكل'}</option>
              {statuses.map(s => {
                const tKey = s === 'In Progress' ? 'common.inProgress'
                           : s === 'Implemented' ? 'common.implemented'
                           : s === 'Overdue' ? 'common.overdue'
                           : s === 'Closed' ? 'common.closed'
                           : 'common.open';
                return <option key={s} value={s}>{t(tKey)}</option>;
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Delete Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setRecToDelete(null); }}
        title={t('recommendations.deleteConfirm')}
      >
        <div className="space-y-6">
          <p className="text-[var(--color-text-main)] font-medium">{t('recommendations.deleteMessage')}</p>
          <div className="flex justify-end gap-4">
            <button onClick={() => { setIsDeleteModalOpen(false); setRecToDelete(null); }}
              className="px-6 py-3 rounded-2xl bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-bold hover:bg-[var(--color-border-soft)] transition-colors border border-[var(--color-border-soft)]">
              {t('common.cancel')}
            </button>
            <button onClick={confirmDelete}
              className="px-6 py-3 rounded-2xl bg-[var(--color-danger)] text-white font-bold hover:bg-[var(--color-danger)]/90 transition-colors shadow-lg shadow-[var(--color-danger)]/20">
              {t('recommendations.delete')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Table */}
      {loading ? (
        <div className="glass-card p-20">
          <LoadingSpinner size="lg" />
          <p className="text-center text-[var(--color-text-muted)] font-bold mt-4 uppercase tracking-widest text-xs">{t('recommendations.loadingRecommendations')}</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="bg-[var(--color-bg-main)] border-b border-[var(--color-border-soft)]">
                  <th className="px-8 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('recommendations.id')}</th>
                  <th className="px-8 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('findings.findingTitle')}</th>
                  <th className="px-8 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('recommendations.recommendation')}</th>
                  <th className="px-8 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('common.auditPlan')}</th>
                  <th className="px-8 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('recommendations.department')}</th>
                  <th className="px-8 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('recommendations.responsible')}</th>
                  <th className="px-8 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('recommendations.dueDate')}</th>
                  <th className="px-8 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('recommendations.riskLevel')}</th>
                  <th className="px-8 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('recommendations.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-soft)]">
                {filteredRecs.map((rec, idx) => {
                  const finding = getFinding(rec.finding_id);
                  const plan = getPlan(rec.plan_id || finding?.audit_id);
                  return (
                    <motion.tr
                      key={rec.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="hover:bg-[var(--color-primary)]/5 transition-colors"
                    >
                      <td className="px-8 py-5 text-xs font-bold text-[var(--color-text-muted)] tracking-widest">{rec.rec_number || `#${formatNumber(rec.id)}`}</td>
                      <td className="px-8 py-5 max-w-[180px]">
                        <p className="text-xs font-bold text-[var(--color-text-main)] line-clamp-2">{finding?.title || `#${formatNumber(rec.finding_id)}`}</p>
                      </td>
                      <td className="px-8 py-5 max-w-xs">
                        <p className="text-sm text-[var(--color-text-muted)] line-clamp-2">{finding?.recommendation || '—'}</p>
                      </td>
                      <td className="px-8 py-5 text-xs font-bold text-[var(--color-text-muted)]">{plan?.title || '—'}</td>
                      <td className="px-8 py-5 text-sm font-bold text-[var(--color-text-main)]">{rec.department}</td>
                      <td className="px-8 py-5 text-sm text-[var(--color-text-muted)]">{rec.responsible}</td>
                      <td className="px-8 py-5 text-sm text-[var(--color-text-muted)]">{formatDate(rec.due_date)}</td>
                      <td className="px-8 py-5"><Badge type="risk" value={rec.risk_level} /></td>
                      <td className="px-8 py-5"><Badge type="status" value={rec.status} /></td>
                    </motion.tr>
                  );
                })}
                {filteredRecs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-8 py-20 text-center text-[var(--color-text-muted)] font-bold text-sm">
                      {t('recommendations.noRecommendations') || 'لا توجد توصيات'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecommendationsModule;
