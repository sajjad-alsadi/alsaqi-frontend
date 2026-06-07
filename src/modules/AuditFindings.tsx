import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { AuditFinding, AuditPlan } from '../types';
import { Plus, AlertTriangle, FolderOpen, ChevronDown, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuditFindings } from '../hooks/useAuditFindings';
import { RiskLevel } from '../constants';
import toast from 'react-hot-toast';
import api from '../services/api';
import logger from '../utils/logger';

import Modal from '../components/Modal';
import FindingForm from '../components/FindingForm';
import Badge from '../components/Badge';
import LoadingSpinner from '../components/LoadingSpinner';
import FindingCard from '../components/FindingCard';

const AuditFindings: React.FC = () => {
  const { setActiveTab } = useAppContext();
  const { token } = useAuth();
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  const { findings, loading, fetchFindings } = useAuditFindings();
  const [plans, setPlans] = useState<AuditPlan[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFinding, setEditingFinding] = useState<AuditFinding | null>(null);
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get('/audit-plans')
      .then(res => setPlans(Array.isArray(res.data) ? res.data : (res.data.data || [])))
      .catch(() => setPlans([]));
  }, []);

  const handleAddSuccess = () => {
    toast.success(t(editingFinding ? 'updateSuccess' : 'createSuccess'));
    setIsModalOpen(false);
    setEditingFinding(null);
    fetchFindings();
  };

  const handleEdit = (finding: AuditFinding) => {
    setEditingFinding(finding);
    setIsModalOpen(true);
  };

  const togglePlan = (planId: string) => {
    setExpandedPlans(prev => {
      const next = new Set(prev);
      next.has(planId) ? next.delete(planId) : next.add(planId);
      return next;
    });
  };

  // Group findings by plan (audit_id)
  const findingsByPlan: Record<string, AuditFinding[]> = {};
  (Array.isArray(findings) ? findings : []).forEach(f => {
    const planId = String(f.audit_id);
    if (!findingsByPlan[planId]) findingsByPlan[planId] = [];
    findingsByPlan[planId].push(f);
  });

  const getPlanInfo = (planId: string) => plans.find(p => String(p.id) === planId);

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
            <AlertTriangle size={32} />
          </div>
          <div>
            <h2 className="text-2xl sm:text-4xl font-bold text-[var(--color-text-main)] tracking-tight">{t('findings.title')}</h2>
            <p className="text-sm text-[var(--color-text-muted)] font-bold mt-2">{t('findings.professionalFramework')}</p>
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsModalOpen(true)}
          className="btn-primary flex items-center justify-center gap-3"
        >
          <Plus size={24} />
          <span>{t('plan.add')}</span>
        </motion.button>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingFinding(null); }}
        title={(editingFinding ? t('common.edit') : t('plan.add')) + ' ' + t('findings.title')}
      >
        <FindingForm
          onSuccess={handleAddSuccess}
          onCancel={() => { setIsModalOpen(false); setEditingFinding(null); }}
          initialData={editingFinding}
        />
      </Modal>

      {/* Content */}
      {loading ? (
        <div className="glass-card p-20">
          <LoadingSpinner size="lg" />
          <p className="text-center text-[var(--color-text-muted)] font-bold mt-4 uppercase tracking-widest text-xs">{t('findings.loadingFindings')}</p>
        </div>
      ) : Object.keys(findingsByPlan).length === 0 ? (
        <div className="glass-card p-20 text-center">
          <AlertTriangle size={48} className="mx-auto text-[var(--color-border-strong)] mb-4" />
          <p className="text-[var(--color-text-muted)] font-bold">{t('common.noFindings') || 'لا توجد ملاحظات'}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(findingsByPlan).map(([planId, planFindings]) => {
            const plan = getPlanInfo(planId);
            const isExpanded = expandedPlans.has(planId);
            return (
              <div key={planId} className="glass-card overflow-hidden">
                {/* Folder Header */}
                <button
                  onClick={() => togglePlan(planId)}
                  className="w-full flex items-center justify-between p-6 hover:bg-[var(--color-primary)]/5 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[var(--color-primary)]/10 rounded-xl flex items-center justify-center">
                      <FolderOpen size={24} className="text-[var(--color-primary)]" />
                    </div>
                    <div className="text-start">
                      <h3 className="text-lg font-bold text-[var(--color-text-main)]">
                        {plan?.title || `${t('common.auditPlan')} #${planId.slice(0, 8)}`}
                      </h3>
                      <p className="text-xs text-[var(--color-text-muted)] font-bold mt-0.5">
                        {plan?.plan_code || ''} • {planFindings.length} {t('findings.title')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge type="status" value={plan?.status || 'Planned'} />
                    {isExpanded
                      ? <ChevronDown size={20} className="text-[var(--color-text-muted)]" />
                      : <ChevronLeft size={20} className="text-[var(--color-text-muted)]" />
                    }
                  </div>
                </button>

                {/* Findings inside folder */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="border-t border-[var(--color-border-soft)] overflow-hidden"
                    >
                      <div className="p-6 space-y-6">
                        {planFindings.map((finding, idx) => (
                          <FindingCard
                            key={finding.id}
                            finding={finding}
                            idx={idx}
                            isRTL={isRTL}
                            t={t}
                            handleEdit={handleEdit}
                            setActiveTab={setActiveTab}
                            onStatusChanged={fetchFindings}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AuditFindings;
