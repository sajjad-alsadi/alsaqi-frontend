import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuditPlans } from '../hooks/useAuditPlans';
import { api } from '../api';
import { AuditPlan } from '../types';
import { Plus, Search, Calendar, Edit, Trash2, Archive } from 'lucide-react';
import { motion } from 'motion/react';
import { useFormat } from '../utils/formatService';
import { useDebounce } from '../hooks/useDebounce';
import { AuditStatus } from '../constants';
import toast from 'react-hot-toast';
import logger from '../utils/logger';

import Modal from '../components/Modal';
import InteractiveIcon from '../components/InteractiveIcon';
import AuditPlanForm from '../components/AuditPlanForm';
import Badge from '../components/Badge';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';

interface AuditPlanRow extends AuditPlan {
  year?: number | string;
  quarter?: string;
  is_archived?: boolean;
}

const AuditPlanModule: React.FC = () => {
  const { t } = useTranslation();
  const { formatDate, formatNumber } = useFormat();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const { plans, loading, pagination, fetchPlans } = useAuditPlans({ page, pageSize, search: debouncedSearchTerm || undefined });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<AuditPlan | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<string | number | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [planToArchive, setPlanToArchive] = useState<AuditPlanRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  const handleAddSuccess = () => {
    toast.success(t(selectedPlan ? 'updateSuccess' : 'createSuccess'));
    setIsModalOpen(false);
    setSelectedPlan(null);
    fetchPlans({ page, pageSize, search: searchTerm });
  };

  const confirmDelete = async () => {
    if (!planToDelete) return;
    try {
      await api.auditPlans.delete(String(planToDelete));
      toast.success(t('deleteSuccess'));
      fetchPlans({ page, pageSize, search: searchTerm });
      setIsDeleteModalOpen(false);
      setPlanToDelete(null);
    } catch (err) {
      logger.error('delete failed', err);
      toast.error(t('errorOccurred'));
    }
  };

  const confirmArchive = async () => {
    if (!planToArchive?.id) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/audit-plans/${planToArchive.id}/archive`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.error?.message || data?.error || t('errorOccurred');
        throw new Error(typeof msg === 'string' ? msg : t('errorOccurred'));
      }
      toast.success(t('archive.success'));
      fetchPlans({ page, pageSize, search: searchTerm });
      setIsArchiveModalOpen(false);
      setPlanToArchive(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errorOccurred'));
    } finally {
      setArchiving(false);
    }
  };

  const getQuarterLabel = (q: string) => {
    if (!q || q === 'Annual') return t('plans.quarterOptions.Annual');
    return t(`plans.quarterOptions.${q}`);
  };

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
            <Calendar size={32} />
          </div>
          <div>
            <h2 className="text-2xl sm:text-4xl font-bold text-[var(--color-text-main)] tracking-tight">{t('common.auditPlan')}</h2>
            <p className="text-sm text-[var(--color-text-muted)] font-bold mt-2">{t('plan.strategicInternalAuditRoadmap')}</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute start-5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={20} />
            <input type="text" placeholder={t('plan.search')} className="input-field !ps-14" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => { setSelectedPlan(null); setIsModalOpen(true); }}
            className="bg-primary text-white hover:bg-primary-hover inline-flex items-center justify-center rounded-xl text-sm font-semibold h-10 px-6 py-2.5 cursor-pointer gap-3 whitespace-nowrap shadow-[0_4px_14px_rgba(10,125,133,0.25)]">
            <Plus size={24} /><span>{t('plan.add')}</span>
          </motion.button>
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setSelectedPlan(null); }} title={selectedPlan ? t('plan.editPlan') : t('plan.addPlan')}>
        <AuditPlanForm onSuccess={handleAddSuccess} onCancel={() => { setIsModalOpen(false); setSelectedPlan(null); }} initialData={selectedPlan} />
      </Modal>

      <Modal isOpen={isDeleteModalOpen} onClose={() => { setIsDeleteModalOpen(false); setPlanToDelete(null); }} title={t('plan.deleteConfirm')}>
        <div className="space-y-6">
          <p className="text-[var(--color-text-main)] font-medium">{t('plan.deleteMessage')}</p>
          <div className="flex justify-end gap-4">
            <button onClick={() => { setIsDeleteModalOpen(false); setPlanToDelete(null); }} className="px-6 py-3 rounded-2xl bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-bold hover:bg-[var(--color-border-soft)] transition-colors border border-[var(--color-border-soft)]">{t('common.cancel')}</button>
            <button onClick={confirmDelete} className="px-6 py-3 rounded-2xl bg-[var(--color-danger)] text-white font-bold hover:bg-[var(--color-danger)]/90 transition-colors">{t('plan.delete')}</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isArchiveModalOpen} onClose={() => { setIsArchiveModalOpen(false); setPlanToArchive(null); }} title={t('archive.confirmTitle')}>
        <div className="space-y-6">
          <p className="text-[var(--color-text-main)] font-medium">{t('archive.action')}: <span className="font-bold text-[var(--color-primary)]">{planToArchive?.title}</span></p>
          <p className="text-sm text-[var(--color-text-muted)]">{t('archive.openItemsError', { count: 0 })}</p>
          <div className="flex justify-end gap-4">
            <button onClick={() => { setIsArchiveModalOpen(false); setPlanToArchive(null); }} className="px-6 py-3 rounded-2xl bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-bold hover:bg-[var(--color-border-soft)] transition-colors border border-[var(--color-border-soft)]">{t('common.cancel')}</button>
            <button onClick={confirmArchive} disabled={archiving} className="px-6 py-3 rounded-2xl bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-2">
              <Archive size={16} />{archiving ? t('common.loading') : t('archive.action')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Table */}
      {loading ? (
        <div className="glass-card p-20"><LoadingSpinner size="lg" /><p className="text-center text-[var(--color-text-muted)] font-bold mt-4 uppercase tracking-widest text-xs">{t('plan.loadingAuditPlans')}</p></div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="bg-[var(--color-bg-main)] border-b border-[var(--color-border-soft)]">
                  {['plan.code','plan.title','plans.year','plans.quarter','plan.department','plan.type','plan.riskRating','plan.startDate','plan.status',''].map((k,i) => (
                    <th key={i} className="px-6 py-5 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{k ? t(k) : ''}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-soft)]">
                {((Array.isArray(plans) ? plans : []) as unknown as AuditPlanRow[]).map((plan, idx) => (
                  <motion.tr key={plan.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}
                    className={`hover:bg-[var(--color-primary)]/5 transition-colors group cursor-pointer ${plan.is_archived ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4 text-xs font-bold text-[var(--color-text-muted)] tracking-widest">{plan.plan_code || `#${formatNumber(plan.id)}`}</td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-[var(--color-text-main)] group-hover:text-[var(--color-primary)]">{plan.title}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)] font-bold mt-0.5 uppercase tracking-wider">{plan.lead_auditor}</p>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-[var(--color-text-main)]">{plan.year || '—'}</td>
                    <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">{plan.quarter ? getQuarterLabel(plan.quarter) : '—'}</td>
                    <td className="px-6 py-4 text-sm font-bold text-[var(--color-text-main)]">{plan.department}</td>
                    <td className="px-6 py-4"><span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-[var(--color-bg-main)] text-[var(--color-text-muted)] border border-[var(--color-border-soft)]">{t(`plan.${plan.type?.toLowerCase() || ''}`)}</span></td>
                    <td className="px-6 py-4"><Badge type="risk" value={plan.risk_rating} /></td>
                    <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">{formatDate(plan.planned_start_date)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${plan.status === AuditStatus.CLOSED ? 'bg-[var(--color-success)]' : plan.status === AuditStatus.FIELDWORK ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border-soft)]'}`} />
                        <Badge type="status" value={plan.status} />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-end">
                      <div className="flex items-center justify-end gap-1">
                        {!plan.is_archived && <InteractiveIcon icon={Archive} onClick={() => { setPlanToArchive(plan); setIsArchiveModalOpen(true); }} tooltip={t('archive.action')} variant="ghost" size={14} className="!p-2 !text-amber-500" />}
                        <InteractiveIcon icon={Edit} onClick={() => { setSelectedPlan(plan); setIsModalOpen(true); }} tooltip={t('plan.edit')} variant="ghost" size={14} className="!p-2" />
                        <InteractiveIcon icon={Trash2} onClick={() => { setPlanToDelete(plan.id!); setIsDeleteModalOpen(true); }} tooltip={t('plan.delete')} variant="danger" size={14} className="!p-2" />
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination currentPage={page} totalPages={pagination.totalPages} onPageChange={(p) => setPage(p)} pageSize={pageSize} onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }} totalItems={pagination.total} />
    </div>
  );
};

export default AuditPlanModule;
