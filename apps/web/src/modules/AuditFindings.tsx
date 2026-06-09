import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { AuditFinding } from '../types';
import { Plus, AlertTriangle, FileText, CheckCircle2, MoreVertical, Search, Eye } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuditFindings } from '../hooks/useAuditFindings';
import { auditService } from '../api/compat/auditService';
import InteractiveIcon from '../components/InteractiveIcon';
import { RiskLevel } from '../constants';
import toast from 'react-hot-toast';

import Modal from '../components/Modal';
import FindingForm from '../components/FindingForm';
import Badge from '../components/Badge';
import LoadingSpinner from '../components/LoadingSpinner';
import FindingCard from '../components/FindingCard';

const AuditFindings: React.FC = () => {
  const { setActiveTab } = useAppContext();
  const { token } = useAuth();
  const { t, i18n } = useTranslation();
  
  const { findings, loading, fetchFindings } = useAuditFindings();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFinding, setEditingFinding] = useState<AuditFinding | null>(null);
  const isRTL = i18n.language === 'ar';

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

  return (
    <div className="space-y-10">
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
          className="bg-primary text-white hover:bg-primary-hover inline-flex items-center justify-center rounded-xl text-sm font-semibold h-10 px-6 py-2.5 cursor-pointer gap-3 shadow-[0_4px_14px_rgba(10,125,133,0.25)]"
        >
          <Plus size={24} />
          <span>{t('plan.add')}</span>
        </motion.button>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingFinding(null);
        }} 
        title={(editingFinding ? t('common.edit') : t('plan.add')) + " " + t('findings.title')}
      >
        <FindingForm 
          onSuccess={handleAddSuccess} 
          onCancel={() => {
            setIsModalOpen(false);
            setEditingFinding(null);
          }} 
          initialData={editingFinding}
        />
      </Modal>
      
      {loading ? (
        <div className="glass-card p-20">
          <LoadingSpinner size="lg" />
          <p className="text-center text-[var(--color-text-muted)] font-bold mt-4 uppercase tracking-widest text-xs">{t('findings.loadingFindings')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          {(Array.isArray(findings) ? findings : []).map((finding, idx) => (
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
      )}
    </div>
  );
};

export default AuditFindings;
