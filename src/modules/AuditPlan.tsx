import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import { useAuditPlans } from '../hooks/useAuditPlans';
import { auditService } from '../services/auditService';
import { AuditPlan } from '../types';
import { Plus, Search, Filter, Download, MoreVertical, Calendar, User, Tag, Edit, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generatePdf, PdfSection } from '../utils/pdfExport';
import InteractiveIcon from '../components/InteractiveIcon';
import { useFormat } from '../services/formatService';
import { useDebounce } from '../hooks/useDebounce';
import { AuditStatus } from '../constants';
import api from '../services/api';
import toast from 'react-hot-toast';

import Modal from '../components/Modal';
import AuditPlanForm from '../components/AuditPlanForm';
import Badge from '../components/Badge';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';

const AuditPlanModule: React.FC = () => {
  const { token } = useAppContext();
  const { t, i18n } = useTranslation();
  const { formatDate, formatNumber } = useFormat();
  
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  
  const { plans, loading, pagination, fetchPlans } = useAuditPlans({
    page,
    pageSize,
    search: debouncedSearchTerm || undefined
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<AuditPlan | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<string | number | null>(null);

  const handleAddSuccess = () => {
    toast.success(t(selectedPlan ? 'updateSuccess' : 'createSuccess'));
    setIsModalOpen(false);
    setSelectedPlan(null);
    fetchPlans({ page, pageSize, search: searchTerm });
  };

  const initiateDelete = (id: string | number) => {
    setPlanToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!planToDelete) return;
    
    try {
      await auditService.deletePlan(planToDelete);
      toast.success(t('deleteSuccess'));
      fetchPlans({ page, pageSize, search: searchTerm });
      setIsDeleteModalOpen(false);
      setPlanToDelete(null);
    } catch (err: any) {
      console.error("Network error during delete:", err);
      toast.error(t('errorOccurred'));
    }
  };

  const editPlan = (plan: AuditPlan) => {
    setSelectedPlan(plan);
    setIsModalOpen(true);
  };

  const exportPDF = async () => {
    const sections: PdfSection[] = [{
      type: 'table',
      columns: [
        { header: t('code'), dataKey: 'plan_code' },
        { header: t('title'), dataKey: 'title' },
        { header: t('department'), dataKey: 'department' },
        { header: t('type'), dataKey: 'type' },
        { header: t('riskRating'), dataKey: 'risk_rating' },
        { header: t('startDate'), dataKey: 'planned_start_date' },
        { header: t('status'), dataKey: 'status' }
      ],
      data: (Array.isArray(plans) ? plans : []).map(p => ({
        plan_code: p.plan_code || `#${p.id}`,
        title: p.title,
        department: p.department,
        type: p.type,
        risk_rating: p.risk_rating,
        planned_start_date: p.planned_start_date,
        status: p.status
      }))
    }];

    await generatePdf(t('auditPlan'), sections, token, (i18n.language === 'ar' ? 'ar' : 'en') as 'ar' | 'en', t('plan.auditPlanReport'), {
      title: t('auditPlan'),
      report_date: new Date().toLocaleDateString(i18n.language === 'ar' ? 'ar-SA' : 'en-US'),
      plans: filteredPlans
    });
  };

  const filteredPlans = plans;

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-[var(--color-primary)]/20">
            <Calendar size={32} />
          </div>
          <div>
            <h2 className="text-4xl font-bold text-[var(--color-text-main)] tracking-tight">{t('common.auditPlan')}</h2>
            <p className="text-sm text-[var(--color-text-muted)] font-bold mt-2">{t('plan.strategicInternalAuditRoadmap')}</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute start-5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={20} />
            <input 
              type="text"
              placeholder={t('plan.search')}
              className="input-field !ps-14"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4">
            <InteractiveIcon 
              icon={Download}
              onClick={exportPDF}
              tooltip={t('plan.exportToPdf')}
              variant="outline"
              className="!w-14 !h-14 !rounded-xl"
              size={24}
            />
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setSelectedPlan(null);
                setIsModalOpen(true);
              }}
              className="btn-primary flex items-center justify-center gap-3 whitespace-nowrap"
            >
              <Plus size={24} />
              <span>{t('plan.add')}</span>
            </motion.button>
          </div>
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setSelectedPlan(null);
        }} 
        title={selectedPlan ? t('plan.editPlan') : t('plan.addPlan')}
      >
        <AuditPlanForm 
          onSuccess={handleAddSuccess} 
          onCancel={() => {
            setIsModalOpen(false);
            setSelectedPlan(null);
          }}
          initialData={selectedPlan}
        />
      </Modal>

      <Modal 
        isOpen={isDeleteModalOpen} 
        onClose={() => {
          setIsDeleteModalOpen(false);
          setPlanToDelete(null);
        }} 
        title={t('plan.deleteConfirm')}
      >
        <div className="space-y-6">
          <p className="text-[var(--color-text-main)] font-medium">
            {t('plan.deleteMessage')}
          </p>
          <div className="flex justify-end gap-4">
            <button 
              onClick={() => {
                setIsDeleteModalOpen(false);
                setPlanToDelete(null);
              }}
              className="px-6 py-3 rounded-2xl bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-bold hover:bg-[var(--color-border-soft)] transition-colors border border-[var(--color-border-soft)]"
            >
              {t('common.cancel')}
            </button>
            <button 
              onClick={confirmDelete}
              className="px-6 py-3 rounded-2xl bg-[var(--color-danger)] text-white font-bold hover:bg-[var(--color-danger)]/90 transition-colors shadow-lg shadow-[var(--color-danger)]/20"
            >
              {t('plan.delete')}
            </button>
          </div>
        </div>
      </Modal>
      
      {loading ? (
        <div className="glass-card p-20">
          <LoadingSpinner size="lg" />
          <p className="text-center text-[var(--color-text-muted)] font-bold mt-4 uppercase tracking-widest text-xs">{t('plan.loadingAuditPlans')}</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="bg-[var(--color-bg-main)] border-b border-[var(--color-border-soft)]">
                <th className="px-10 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('plan.code')}</th>
                <th className="px-10 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('plan.title')}</th>
                <th className="px-10 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('plan.department')}</th>
                <th className="px-10 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('plan.type')}</th>
                <th className="px-10 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('plan.riskRating')}</th>
                <th className="px-10 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('plan.startDate')}</th>
                <th className="px-10 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('plan.status')}</th>
                <th className="px-10 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-soft)]">
              {(Array.isArray(filteredPlans) ? filteredPlans : []).map((plan, idx) => (
                <motion.tr 
                  key={plan.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="hover:bg-[var(--color-primary)]/5 transition-colors group cursor-pointer"
                >
                  <td className="px-10 py-6 text-xs font-bold text-[var(--color-text-muted)] tracking-widest">{plan.plan_code || `#${formatNumber(plan.id)}`}</td>
                  <td className="px-10 py-6">
                    <p className="text-sm font-bold text-[var(--color-text-main)] group-hover:text-[var(--color-primary)] transition-colors">{plan.title}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] font-bold mt-1 uppercase tracking-wider">{plan.lead_auditor}</p>
                  </td>
                  <td className="px-10 py-6 text-sm font-bold text-[var(--color-text-main)]">{plan.department}</td>
                  <td className="px-10 py-6">
                    <span className="inline-flex items-center px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-[var(--color-bg-main)] text-[var(--color-text-muted)] border border-[var(--color-border-soft)]">
                      {t(`plan.${plan.type?.toLowerCase() || ''}`)}
                    </span>
                  </td>
                  <td className="px-10 py-6">
                    <Badge type="risk" value={plan.risk_rating} />
                  </td>
                  <td className="px-10 py-6 text-sm font-bold text-[var(--color-text-muted)]">{formatDate(plan.planned_start_date)}</td>
                  <td className="px-10 py-6">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${
                        plan.status === AuditStatus.CLOSED ? 'bg-[var(--color-success)]' :
                        plan.status === AuditStatus.FIELDWORK ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border-soft)]'
                      }`} />
                      <Badge type="status" value={plan.status} />
                    </div>
                  </td>
                  <td className="px-10 py-6 text-end flex items-center justify-end gap-2">
                    <InteractiveIcon 
                      icon={Edit}
                      onClick={() => editPlan(plan)}
                      tooltip={t('plan.edit')}
                      variant="ghost"
                      size={16}
                      className="!p-2"
                    />
                    <InteractiveIcon 
                      icon={Trash2}
                      onClick={() => initiateDelete(plan.id!)}
                      tooltip={t('plan.delete')}
                      variant="danger"
                      size={16}
                      className="!p-2"
                    />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      <Pagination 
        currentPage={page}
        totalPages={pagination.totalPages}
        onPageChange={(p) => setPage(p)}
        pageSize={pageSize}
        onPageSizeChange={(ps) => {
          setPageSize(ps);
          setPage(1);
        }}
        totalItems={pagination.total}
      />

    </div>
  );
};

export default AuditPlanModule;
