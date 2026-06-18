import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '../context/UserContext';
import { useTranslation } from 'react-i18next';
import { Plus, Edit, CheckCircle2, AlertCircle, Search, X } from 'lucide-react';
import { motion } from 'motion/react';
import Modal from '../components/Modal';
import api from '../api/httpClient';
import toast from 'react-hot-toast';
import { useFormat } from '../utils/formatService';
import { Button } from '@/components/ui/button';
import { UserRole } from '../constants';
import logger from '../utils/logger';
import { getStaggerDelay } from '../utils/animation';

interface COI {
  id: number;
  user_id: number;
  user_name: string;
  declaration_date: string;
  description: string;
  related_party: string;
  status: string;
  reviewer_notes: string;
}

const ConflictOfInterest: React.FC = () => {
  const { user } = useUser();
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const queryClient = useQueryClient();

  const { data: declarations = [], isLoading } = useQuery({
    queryKey: ['coi'],
    queryFn: async () => {
      const res = await api.get('/coi');
      if (res.data && res.data.data) {
        return res.data.data as COI[];
      }
      return Array.isArray(res.data) ? res.data as COI[] : [];
    },
    staleTime: 5 * 60_000,
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedCOI, setSelectedCOI] = useState<COI | null>(null);
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [formData, setFormData] = useState({
    description: '',
    related_party: ''
  });

  const [reviewData, setReviewData] = useState({
    status: 'Reviewed',
    reviewer_notes: ''
  });

  // Filtered & sorted declarations
  const filteredDeclarations = useMemo(() => {
    let result = Array.isArray(declarations) ? declarations : [];
    
    if (statusFilter !== 'all') {
      result = result.filter(coi => coi.status === statusFilter);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(coi =>
        coi.user_name?.toLowerCase().includes(q) ||
        coi.related_party?.toLowerCase().includes(q) ||
        coi.description?.toLowerCase().includes(q)
      );
    }
    
    // Sort by date descending (newest first)
    return [...result].sort((a, b) => 
      new Date(b.declaration_date).getTime() - new Date(a.declaration_date).getTime()
    );
  }, [declarations, statusFilter, searchQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/coi', formData);
      setIsModalOpen(false);
      setFormData({ description: '', related_party: '' });
      queryClient.invalidateQueries({ queryKey: ['coi'] });
    } catch (err) {
      logger.error('Operation failed', err);
      toast.error(t('errorOccurred'));
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCOI) return;
    try {
      await api.put(`/coi/${selectedCOI.id}`, reviewData);
      setIsReviewModalOpen(false);
      setSelectedCOI(null);
      queryClient.invalidateQueries({ queryKey: ['coi'] });
    } catch (err) {
      logger.error('Operation failed', err);
      toast.error(t('errorOccurred'));
    }
  };

  const isAdminOrCompliance = user?.role === UserRole.ADMIN || user?.role === UserRole.COMPLIANCE_OFFICER;

  const statusOptions = [
    { value: 'all', label: t('common.all') },
    { value: 'Pending', label: t('integrity.pending') },
    { value: 'Reviewed', label: t('integrity.reviewed') },
    { value: 'Resolved', label: t('integrity.resolved') },
  ];

  return (
    <div className="space-y-5">
      {/* Action bar — no redundant header, straight to tools */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder={t('common.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field ps-9 pe-8 py-2 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[var(--color-bg-soft)] text-[var(--color-text-muted)]"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field py-2 text-sm w-auto min-w-[120px]"
          >
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <Button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 shrink-0"
        >
          <Plus size={18} />
          {t('integrity.declareConflict')}
        </Button>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="bg-[var(--color-bg-soft)]/50 border-b border-[var(--color-border-soft)]">
                <th className="px-5 py-3 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.15em] text-start">{t('common.id')}</th>
                <th className="px-5 py-3 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.15em] text-start">{t('common.user')}</th>
                <th className="px-5 py-3 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.15em] text-start">{t('integrity.declarationDate')}</th>
                <th className="px-5 py-3 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.15em] text-start">{t('integrity.relatedParty')}</th>
                <th className="px-5 py-3 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.15em] text-start">{t('common.statusLabel')}</th>
                <th className="px-5 py-3 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.15em] text-start"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-soft)]/50">
              {isLoading ? (
                // Skeleton rows
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx}>
                    <td className="px-5 py-3.5"><div className="h-4 w-8 rounded animate-shimmer" /></td>
                    <td className="px-5 py-3.5"><div className="h-4 w-24 rounded animate-shimmer" /></td>
                    <td className="px-5 py-3.5"><div className="h-4 w-20 rounded animate-shimmer" /></td>
                    <td className="px-5 py-3.5"><div className="h-4 w-28 rounded animate-shimmer" /></td>
                    <td className="px-5 py-3.5"><div className="h-4 w-16 rounded animate-shimmer" /></td>
                    <td className="px-5 py-3.5"></td>
                  </tr>
                ))
              ) : filteredDeclarations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <div className="empty-state">
                      <div className="empty-state-icon"><Search size={24} /></div>
                      <p className="empty-state-title">{searchQuery || statusFilter !== 'all' ? t('common.noResults') : t('integrity.noDeclarations')}</p>
                      <p className="empty-state-description">{searchQuery ? t('common.tryDifferentSearch') : t('integrity.noDeclarationsDesc')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDeclarations.map((coi, idx) => (
                  <motion.tr 
                    key={coi.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: getStaggerDelay(idx) }}
                    className="hover:bg-[var(--color-primary)]/[0.03] transition-colors"
                  >
                    <td className="px-5 py-3.5 text-xs font-mono text-[var(--color-border-strong)]">#{coi.id}</td>
                    <td className="px-5 py-3.5 text-sm text-[var(--color-text-main)]">{coi.user_name}</td>
                    <td className="px-5 py-3.5 text-sm text-[var(--color-text-muted)]">{formatDate(coi.declaration_date)}</td>
                    <td className="px-5 py-3.5 text-sm text-[var(--color-text-main)]">{coi.related_party}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider ${
                        coi.status === 'Resolved' ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' :
                        coi.status === 'Reviewed' ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]' :
                        'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                      }`}>
                        {coi.status === 'Resolved' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                        {coi.status === 'Resolved' ? t('integrity.resolved') : coi.status === 'Reviewed' ? t('integrity.reviewed') : t('integrity.pending')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-end">
                      {isAdminOrCompliance && (
                        <button 
                          onClick={() => {
                            setSelectedCOI(coi);
                            setReviewData({ status: coi.status, reviewer_notes: coi.reviewer_notes || '' });
                            setIsReviewModalOpen(true);
                          }}
                          className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-lg transition-colors"
                          aria-label={t('common.edit')}
                        >
                          <Edit size={16} />
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Declare Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t('integrity.declareConflict')}>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">{t('common.description')}</label>
            <textarea
              required
              rows={4}
              className="input-field py-3"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">{t('integrity.relatedParty')}</label>
            <input
              type="text"
              required
              className="input-field"
              value={formData.related_party}
              onChange={(e) => setFormData({ ...formData, related_party: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-border-soft)]">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Review Modal */}
      <Modal isOpen={isReviewModalOpen} onClose={() => setIsReviewModalOpen(false)} title={t('common.edit')}>
        <form onSubmit={handleReviewSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">{t('common.statusLabel')}</label>
            <select
              className="input-field"
              value={reviewData.status}
              onChange={(e) => setReviewData({ ...reviewData, status: e.target.value })}
            >
              <option value="Pending">{t('integrity.pending')}</option>
              <option value="Reviewed">{t('integrity.reviewed')}</option>
              <option value="Resolved">{t('integrity.resolved')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">{t('integrity.reviewerNotes')}</label>
            <textarea
              rows={4}
              className="input-field py-3"
              value={reviewData.reviewer_notes}
              onChange={(e) => setReviewData({ ...reviewData, reviewer_notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-border-soft)]">
            <Button type="button" variant="outline" onClick={() => setIsReviewModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ConflictOfInterest;
