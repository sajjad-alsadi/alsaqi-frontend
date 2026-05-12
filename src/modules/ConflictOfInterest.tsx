import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, Plus, Edit, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import Modal from '../components/Modal';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useFormat } from '../services/formatService';

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
  const { token, user } = useAppContext();
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const [declarations, setDeclarations] = useState<COI[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedCOI, setSelectedCOI] = useState<COI | null>(null);
  
  const [formData, setFormData] = useState({
    description: '',
    related_party: ''
  });

  const [reviewData, setReviewData] = useState({
    status: 'Reviewed',
    reviewer_notes: ''
  });

  useEffect(() => {
    fetchDeclarations();
  }, []);

  const fetchDeclarations = async () => {
    try {
      const res = await api.get('/coi');
      if (res.data && res.data.data) {
        setDeclarations(res.data.data);
      } else {
        setDeclarations(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error(err);
      setDeclarations([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/coi', formData);
      setIsModalOpen(false);
      setFormData({ description: '', related_party: '' });
      fetchDeclarations();
    } catch (err) {
      console.error(err);
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
      fetchDeclarations();
    } catch (err) {
      console.error(err);
      toast.error(t('errorOccurred'));
    }
  };

  const isAdminOrCompliance = user?.role === 'Admin' || user?.role === 'Administrator' || user?.role === 'Compliance' || user?.role === 'Compliance Officer';

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-bold text-[var(--color-text-main)] tracking-tight">{t('integrity.conflicts')}</h2>
          <p className="text-sm text-[var(--color-text-muted)] font-bold mt-2">{t('integrity.coiSubtitle')}</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          {t('integrity.declareConflict')}
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-start">{t('common.id')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-start">{t('common.user')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-start">{t('integrity.declarationDate')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-start">{t('integrity.relatedParty')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-start">{t('common.statusLabel')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-start"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(Array.isArray(declarations) ? declarations : []).map((coi, idx) => (
                <motion.tr 
                  key={coi.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="hover:bg-primary/5 transition-colors group"
                >
                  <td className="px-6 py-4 text-xs font-bold text-slate-300">#{coi.id}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-600">{coi.user_name}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-500">{formatDate(coi.declaration_date)}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-500">{coi.related_party}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest ${
                      coi.status === 'Resolved' ? 'bg-emerald-100 text-emerald-600' :
                      coi.status === 'Reviewed' ? 'bg-blue-100 text-blue-600' :
                      'bg-amber-100 text-amber-600'
                    }`}>
                      {coi.status === 'Resolved' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                      {coi.status === 'Resolved' ? t('integrity.resolved') : coi.status === 'Reviewed' ? t('integrity.reviewed') : t('integrity.pending')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-end">
                    {isAdminOrCompliance && (
                      <button 
                        onClick={() => {
                          setSelectedCOI(coi);
                          setReviewData({ status: coi.status, reviewer_notes: coi.reviewer_notes || '' });
                          setIsReviewModalOpen(true);
                        }}
                        className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-xl transition-colors"
                      >
                        <Edit size={18} />
                      </button>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Declare Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t('integrity.declareConflict')}>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">{t('common.description')}</label>
            <textarea
              required
              rows={4}
              className="input-field py-4"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">{t('integrity.relatedParty')}</label>
            <input
              type="text"
              required
              className="input-field"
              value={formData.related_party}
              onChange={(e) => setFormData({ ...formData, related_party: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-4 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors">
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary">
              {t('common.save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Review Modal */}
      <Modal isOpen={isReviewModalOpen} onClose={() => setIsReviewModalOpen(false)} title={t('common.edit')}>
        <form onSubmit={handleReviewSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">{t('common.statusLabel')}</label>
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
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">{t('integrity.reviewerNotes')}</label>
            <textarea
              rows={4}
              className="input-field py-4"
              value={reviewData.reviewer_notes}
              onChange={(e) => setReviewData({ ...reviewData, reviewer_notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-4 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsReviewModalOpen(false)} className="px-6 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors">
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary">
              {t('common.save')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ConflictOfInterest;
