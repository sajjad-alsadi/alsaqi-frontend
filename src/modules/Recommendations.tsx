import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useTranslation } from 'react-i18next';
import { Recommendation, AuditFinding } from '../types';
import { Plus, Search, MoreVertical, CheckCircle2, Clock, AlertCircle, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import { useFormat } from '../services/formatService';
import logger from '../utils/logger';

import Modal from '../components/Modal';
import RecommendationForm from '../components/RecommendationForm';
import Badge from '../components/Badge';
import LoadingSpinner from '../components/LoadingSpinner';

const RecommendationsModule: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { formatDate, formatNumber } = useFormat();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRec, setEditingRec] = useState<Recommendation | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [recToDelete, setRecToDelete] = useState<string | number | null>(null);

  useEffect(() => {
    fetchRecommendations();
    fetchFindings();
  }, []);

  const fetchRecommendations = async () => {
    try {
      const res = await api.get('/recommendations', { params: { pageSize: 100 } });
      if (res.data && res.data.data) {
        setRecommendations(res.data.data);
      } else {
        setRecommendations(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      logger.error('Operation failed', err);
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFindings = async () => {
    try {
      const res = await api.get('/audit-findings', { params: { pageSize: 100 } });
      if (res.data && res.data.data) {
        setFindings(res.data.data);
      } else {
        setFindings(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      logger.error('Operation failed', err);
      setFindings([]);
    }
  };

  const handleAddSuccess = () => {
    setIsModalOpen(false);
    setEditingRec(null);
    fetchRecommendations();
  };

  const handleEdit = (rec: Recommendation) => {
    setEditingRec(rec);
    setIsModalOpen(true);
  };

  const initiateDelete = (id: string | number) => {
    setRecToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!recToDelete) return;
    try {
      await api.delete(`/recommendations/${recToDelete}`);
      fetchRecommendations();
      setIsDeleteModalOpen(false);
      setRecToDelete(null);
    } catch (err) {
      logger.error('Operation failed', err);
    }
  };

  const getFindingRecommendation = (id: string | number) => {
    return findings.find(f => String(f.id) === String(id))?.recommendation || `${t('findings.findingNumber')} #${formatNumber(id)}`;
  };

  const filteredRecs = (recommendations || []).filter(r => 
    (r.department?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (r.responsible?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-10">
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
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="relative flex-1 min-w-[300px]">
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
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingRec(null);
        }} 
        title={editingRec ? (t('recommendations.edit') + " " + t('recommendations.title')) : (t('recommendations.add') + " " + t('recommendations.title'))}
      >
        <RecommendationForm 
          onSuccess={handleAddSuccess} 
          onCancel={() => {
            setIsModalOpen(false);
            setEditingRec(null);
          }} 
          findings={findings}
          initialData={editingRec}
        />
      </Modal>

      <Modal 
        isOpen={isDeleteModalOpen} 
        onClose={() => {
          setIsDeleteModalOpen(false);
          setRecToDelete(null);
        }} 
        title={t('recommendations.deleteConfirm')}
      >
        <div className="space-y-6">
          <p className="text-[var(--color-text-main)] font-medium">
            {t('recommendations.deleteMessage')}
          </p>
          <div className="flex justify-end gap-4">
            <button 
              onClick={() => {
                setIsDeleteModalOpen(false);
                setRecToDelete(null);
              }}
              className="px-6 py-3 rounded-2xl bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-bold hover:bg-[var(--color-border-soft)] transition-colors border border-[var(--color-border-soft)]"
            >
              {t('common.cancel')}
            </button>
            <button 
              onClick={confirmDelete}
              className="px-6 py-3 rounded-2xl bg-[var(--color-danger)] text-white font-bold hover:bg-[var(--color-danger)]/90 transition-colors shadow-lg shadow-[var(--color-danger)]/20"
            >
              {t('recommendations.delete')}
            </button>
          </div>
        </div>
      </Modal>

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
                  <th className="px-10 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('recommendations.id')}</th>
                  <th className="px-10 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('recommendations.recommendation')}</th>
                  <th className="px-10 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('recommendations.department')}</th>
                  <th className="px-10 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('recommendations.responsible')}</th>
                  <th className="px-10 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('recommendations.dueDate')}</th>
                  <th className="px-10 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('recommendations.riskLevel')}</th>
                  <th className="px-10 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]">{t('recommendations.status')}</th>
                  <th className="px-10 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-soft)]">
                {(Array.isArray(filteredRecs) ? filteredRecs : []).map((rec, idx) => (
                  <motion.tr 
                    key={rec.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="hover:bg-[var(--color-primary)]/5 transition-colors group cursor-pointer"
                  >
                    <td className="px-10 py-6 text-xs font-bold text-[var(--color-text-muted)] tracking-widest">#{formatNumber(rec.id)}</td>
                    <td className="px-10 py-6 max-w-xs">
                      <p className="text-sm font-bold text-[var(--color-text-main)] group-hover:text-[var(--color-primary)] transition-colors line-clamp-2">{getFindingRecommendation(rec.finding_id)}</p>
                    </td>
                    <td className="px-10 py-6 text-sm font-bold text-[var(--color-text-main)]">{t(rec.department?.toLowerCase() || '')}</td>
                    <td className="px-10 py-6 text-sm font-bold text-[var(--color-text-muted)]">{rec.responsible}</td>
                    <td className="px-10 py-6 text-sm font-bold text-[var(--color-text-muted)]">{formatDate(rec.due_date)}</td>
                    <td className="px-10 py-6">
                      <Badge type="risk" value={rec.risk_level} />
                    </td>
                    <td className="px-10 py-6">
                      <Badge type="status" value={rec.status} />
                    </td>
                    <td className="px-10 py-6 text-end">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleEdit(rec)}
                          className="w-10 h-10 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 rounded-xl transition-all"
                        >
                          <span className="text-[10px] font-bold uppercase tracking-widest">{t('recommendations.edit')}</span>
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecommendationsModule;
