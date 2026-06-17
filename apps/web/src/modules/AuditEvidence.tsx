import React, { useState, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useUser } from '../context/UserContext';
import { usePreferences } from '../context/PreferencesContext';
import api from '../api/httpClient';
import { useTranslation } from 'react-i18next';
import { AuditEvidence as AuditEvidenceType, AuditPlan, AuditFinding } from '../types';
import { 
  FileText, Search, Plus, Download, Trash2, 
  Image as ImageIcon, Mail, FileCode, FileSignature, AlertCircle, Eye, Edit, FolderOpen
} from 'lucide-react';
import { motion } from 'motion/react';
import { UserRole } from '../constants';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import { useFormat } from '../utils/formatService';
import logger from '../utils/logger';
import { Button } from '@/components/ui/button';
import { useFileUploadValidation } from '../hooks/useFileUploadValidation';

// Lazy-load PdfViewer (and its react-pdf/pdfjs-dist dependencies) so the chunk
// only loads when a PDF is actually previewed.
const PdfViewer = React.lazy(() => import('../components/PdfViewer'));

const AuditEvidence: React.FC = () => {
  const { token } = useAuth();
  const { language } = usePreferences();
  const { user } = useUser();
  const { t } = useTranslation();
  const { formatDate, formatNumber } = useFormat();
  const queryClient = useQueryClient();

  const { data: evidence = [], isLoading: loading } = useQuery({
    queryKey: ['audit-evidence'],
    queryFn: async () => {
      const res = await api.get('/audit-evidence');
      return (res.data.data || (Array.isArray(res.data) ? res.data : [])) as AuditEvidenceType[];
    },
    staleTime: 5 * 60_000,
  });

  const { data: audits = [] } = useQuery({
    queryKey: ['audit-plans-ref'],
    queryFn: async () => {
      const res = await api.get('/audit-plans');
      return (res.data.data || (Array.isArray(res.data) ? res.data : [])) as AuditPlan[];
    },
    staleTime: 5 * 60_000,
  });

  const { data: findings = [] } = useQuery({
    queryKey: ['audit-findings-ref'],
    queryFn: async () => {
      const res = await api.get('/audit-findings');
      return (res.data.data || (Array.isArray(res.data) ? res.data : [])) as AuditFinding[];
    },
    staleTime: 5 * 60_000,
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAudit, setSelectedAudit] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  
  // Edit State
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | number | null>(null);

  // Preview State
  const [previewItem, setPreviewItem] = useState<AuditEvidenceType | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<AuditEvidenceType>>({
    type: 'Document'
  });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { validateAndFilter } = useFileUploadValidation();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const validFiles = await validateAndFilter([e.target.files[0]]);
      if (validFiles.length > 0) {
        setFile(validFiles[0]!);
      } else {
        setFile(null);
        e.target.value = '';
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file && !editingId) {
      setError(t('evidence.pleaseSelectFile'));
      return;
    }

    const submitData = async (base64Data?: string) => {
      const payload: any = {
        audit_id: formData.audit_id,
        finding_id: formData.finding_id,
        type: formData.type,
        description: formData.description || '',
        uploaded_by: user?.name || 'Unknown',
        upload_date: new Date().toISOString().split('T')[0],
      };

      if (base64Data && file) {
        payload.file_name = file.name;
        payload.file_data = base64Data;
      }

      try {
        const url = editingId ? `/audit-evidence/${editingId}` : '/audit-evidence';
        
        if (editingId) {
          await api.put(url, payload);
        } else {
          await api.post(url, payload);
        }

        queryClient.invalidateQueries({ queryKey: ['audit-evidence'] });
        setShowForm(false);
        setFormData({ type: 'Document' });
        setFile(null);
        setEditingId(null);
      } catch (err: any) {
        logger.error('Operation failed', err);
        const apiError = err.response?.data?.error;
        if (typeof apiError === 'string') {
          setError(apiError);
        } else if (apiError && typeof apiError === 'object') {
          setError(apiError.message || t('evidence.operationFailed'));
        } else {
          setError(t('evidence.operationFailed'));
        }
      }
    };

    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => submitData(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      submitData();
    }
  };

  const handleEdit = (ev: AuditEvidenceType) => {
    setFormData({
      audit_id: ev.audit_id,
      finding_id: ev.finding_id,
      type: ev.type,
      description: ev.description
    });
    setEditingId(ev.id || null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string | number) => {
    setItemToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (itemToDelete === null) return;
    try {
      await api.delete(`/audit-evidence/${itemToDelete}`);
      queryClient.invalidateQueries({ queryKey: ['audit-evidence'] });
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    } catch (err) {
      logger.error('Operation failed', err);
    }
  };

  const handleDownload = (ev: AuditEvidenceType) => {
    if (!ev.file_data) {
      setError(t('evidence.noFileDataAvailable'));
      return;
    }
    const a = document.createElement('a');
    a.href = ev.file_data;
    a.download = ev.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const filteredEvidence = evidence.filter(e => {
    const matchesSearch = (e.description?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                          (e.file_name?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesAudit = selectedAudit === 'all' || (e.audit_id && e.audit_id.toString() === selectedAudit);
    return matchesSearch && matchesAudit;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'Document': return <FileText size={24} />;
      case 'Email': return <Mail size={24} />;
      case 'Screenshot': return <ImageIcon size={24} />;
      case 'System Log': return <FileCode size={24} />;
      case 'Contract': return <FileSignature size={24} />;
      default: return <FileText size={24} />;
    }
  };

  const canEdit = user?.role === UserRole.ADMIN || user?.role === UserRole.INTERNAL_AUDITOR;

  return (
    <div className="space-y-10">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
            <FolderOpen size={32} />
          </div>
          <div>
            <h2 className="text-2xl sm:text-4xl font-bold text-[var(--color-text-main)] tracking-tight">{t('evidence.title')}</h2>
            <p className="text-sm text-[var(--color-text-muted)] font-bold mt-2">{t('evidence.secureDocumentRepository')}</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <select 
            className="input-field min-w-[200px]"
            value={selectedAudit}
            onChange={(e) => setSelectedAudit(e.target.value)}
          >
            <option value="all">{t('evidence.allAudits')}</option>
            {audits.map(a => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute start-5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={20} />
            <input 
              type="text"
              placeholder={t('common.search')}
              className="input-field !ps-14"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {canEdit && (
            <Button 
              onClick={() => {
                setEditingId(null);
                setFormData({ type: 'Document' });
                setFile(null);
                setError(null);
                setShowForm(true);
              }} 
              className="flex items-center justify-center gap-3 whitespace-nowrap"
            >
              <Plus size={24} />
              <span>{t('evidence.uploadEvidence')}</span>
            </Button>
          )}
        </div>
      </div>

      {error && !showForm && (
        <div className="p-4 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 font-bold text-sm">
          {error}
        </div>
      )}

      {showForm && canEdit && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-10 border-[var(--color-primary)]/20"
        >
          <h3 className="text-xl font-bold text-[var(--color-text-main)] mb-8">
            {editingId ? (t('evidence.editEvidence')) : (t('evidence.uploadNewEvidence'))}
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('evidence.auditEngagement')}</label>
              <select 
                required
                className="input-field"
                value={formData.audit_id || ''}
                onChange={e => setFormData({...formData, audit_id: e.target.value})}
              >
                <option value="">{t('evidence.selectAudit')}</option>
                {audits.map(a => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-3">
              <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('evidence.relatedFindingOptional')}</label>
              <select 
                className="input-field"
                value={formData.finding_id || ''}
                onChange={e => setFormData({...formData, finding_id: e.target.value})}
              >
                <option value="">{t('evidence.none')}</option>
                {findings.filter(f => !formData.audit_id || String(f.audit_id) === String(formData.audit_id)).map(f => (
                  <option key={f.id} value={f.id}>{(f.condition || '').substring(0, 50)}...</option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('evidence.evidenceType')}</label>
              <select 
                required
                className="input-field"
                value={formData.type || ''}
                onChange={e => setFormData({...formData, type: e.target.value as any})}
              >
                <option value="Document">{t('evidence.document')}</option>
                <option value="Email">{t('evidence.emailType')}</option>
                <option value="Screenshot">{t('evidence.screenshot')}</option>
                <option value="System Log">{t('evidence.systemLog')}</option>
                <option value="Contract">{t('evidence.contract')}</option>
              </select>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">
                {t('evidence.fileAttachment')} {editingId && (t('evidence.optional'))}
              </label>
              <input 
                type="file" 
                required={!editingId}
                onChange={handleFileChange}
                className="input-field file:me-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-[var(--color-primary)]/10 file:text-[var(--color-primary)] hover:file:bg-[var(--color-primary)]/20"
              />
            </div>

            <div className="md:col-span-2 space-y-3">
              <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('evidence.description')}</label>
              <textarea 
                required
                className="input-field min-h-[100px]"
                value={formData.description || ''}
                onChange={e => setFormData({...formData, description: e.target.value})}
                placeholder={t('evidence.describeEvidence')}
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-4 mt-4">
              <button 
                type="button" 
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setFormData({ type: 'Document' });
                  setFile(null);
                }} 
                className="px-8 py-4 rounded-xl font-bold text-[var(--color-text-muted)] hover:bg-[var(--color-bg-main)] transition-all uppercase tracking-widest text-xs"
              >
                {t('common.cancel')}
              </button>
              <Button type="submit">
                {editingId ? t('common.save') : (t('evidence.upload'))}
              </Button>
            </div>
          </form>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {filteredEvidence.map((ev, idx) => {
          const audit = audits.find(a => String(a.id) === String(ev.audit_id));
          return (
            <motion.div 
              key={ev.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="glass-card p-8 group hover:border-[var(--color-primary)]/30 transition-all flex flex-col"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="w-14 h-14 rounded-2xl bg-[var(--color-bg-soft)] flex items-center justify-center text-[var(--color-primary)] shadow-inner overflow-hidden">
                  {ev.file_data && (ev.file_data.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(ev.file_name)) ? (
                    <img 
                      src={ev.file_data} 
                      alt={ev.file_name} 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    getIcon(ev.type)
                  )}
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setPreviewItem(ev)}
                    className="w-10 h-10 rounded-xl bg-[var(--color-bg-soft)] text-[var(--color-text-muted)] hover:text-blue-600 hover:bg-[var(--color-primary-light)] flex items-center justify-center transition-all"
                    title={t('evidence.preview')}
                  >
                    <Eye size={18} />
                  </button>
                  <button onClick={() => handleDownload(ev)} className="w-10 h-10 rounded-xl bg-[var(--color-bg-soft)] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 flex items-center justify-center transition-all" title={t('evidence.download')}>
                    <Download size={18} />
                  </button>
                  {canEdit && (
                    <>
                      <button 
                        onClick={() => handleEdit(ev)}
                        className="w-10 h-10 rounded-xl bg-[var(--color-bg-soft)] text-[var(--color-text-muted)] hover:text-amber-600 hover:bg-amber-50 flex items-center justify-center transition-all"
                        title={t('common.edit')}
                      >
                        <Edit size={18} />
                      </button>
                      <button onClick={() => ev.id && handleDelete(ev.id)} className="w-10 h-10 rounded-xl bg-[var(--color-bg-soft)] text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-all" title={t('common.delete')}>
                        <Trash2 size={18} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <h3 className="text-lg font-bold text-[var(--color-text-main)] mb-2 line-clamp-2" title={ev.file_name}>
                {ev.file_name}
              </h3>
              <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-6">
                {ev.type} • {formatDate(ev.upload_date)}
              </p>

              <div className="flex-1">
                <p className="text-sm text-[var(--color-text-muted)] font-medium line-clamp-3 mb-6">
                  {ev.description}
                </p>
              </div>

              <div className="space-y-3 pt-6 border-t border-[var(--color-border-soft)]">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] shrink-0" />
                  <p className="text-xs font-bold text-[var(--color-text-muted)] truncate">
                    {t('common.auditPlan')}: {audit?.title || (t('evidence.unknown'))}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                  <p className="text-xs font-bold text-[var(--color-text-muted)] truncate">
                    {t('evidence.uploadedBy')}{ev.uploaded_by}
                  </p>
                </div>
                {ev.finding_id && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                    <p className="text-xs font-bold text-rose-500 truncate">
                      {t('evidence.linkedToFinding')}{formatNumber(ev.finding_id)}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
        
        {filteredEvidence.length === 0 && !loading && (
          <div className="col-span-full glass-card p-20 text-center">
            <div className="w-24 h-24 bg-[var(--color-bg-soft)] rounded-2xl flex items-center justify-center mx-auto mb-8 text-[var(--color-border-strong)] shadow-inner">
              <AlertCircle size={48} />
            </div>
            <h3 className="text-2xl font-bold text-[var(--color-text-main)] mb-3 tracking-tight">{t('evidence.noEvidenceFound')}</h3>
            <p className="text-[var(--color-text-muted)] font-bold uppercase tracking-widest text-xs">{t('evidence.uploadDocumentsToBuildTrail')}</p>
          </div>
        )}
      </div>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setItemToDelete(null);
        }}
        title={t('plan.deleteConfirm')}
      >
        <div className="space-y-6">
          <p className="text-[var(--color-text-muted)] font-medium">
            {t('plan.deleteMessage')}
          </p>
          <div className="flex justify-end gap-4">
            <button
              onClick={() => {
                setIsDeleteModalOpen(false);
                setItemToDelete(null);
              }}
              className="px-6 py-3 rounded-xl bg-[var(--color-bg-main)] text-[var(--color-text-muted)] font-bold hover:bg-[var(--color-bg-main)] transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={confirmDelete}
              className="px-6 py-3 rounded-xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-200"
            >
              {t('common.delete')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!previewItem}
        onClose={() => setPreviewItem(null)}
        title={previewItem?.file_name || (t('evidence.preview'))}
        size="full"
      >
        <div className="w-full h-full bg-[var(--color-bg-soft)] rounded-xl overflow-hidden">
          {previewItem?.file_data ? (
            previewItem.file_data.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(previewItem.file_name) ? (
              <img 
                src={previewItem.file_data} 
                alt={previewItem.file_name} 
                className="max-w-full max-h-full object-contain mx-auto" 
                referrerPolicy="no-referrer"
              />
            ) : previewItem.file_data.startsWith('data:application/pdf') || /\.pdf$/i.test(previewItem.file_name) || (previewItem.file_data && !previewItem.file_data.startsWith('data:') && !previewItem.file_data.startsWith('http') && !previewItem.file_data.startsWith('/') && previewItem.file_data.length > 100) ? (
              <div className="w-full h-full">
                <Suspense fallback={<LoadingSpinner />}>
                  <PdfViewer url={previewItem.file_data} />
                </Suspense>
              </div>
            ) : (
              <div className="text-center p-10">
                <FileText size={48} className="mx-auto text-[var(--color-border-strong)] mb-4" />
                <p className="text-[var(--color-text-muted)] font-bold">{t('evidence.previewNotAvailableForThisFile')}</p>
                <Button 
                  onClick={() => previewItem && handleDownload(previewItem)}
                  className="mt-4"
                >
                  {t('tasks.downloadFile')}
                </Button>
              </div>
            )
          ) : (
            <p className="text-[var(--color-text-muted)]">{t('evidence.noFileDataAvailable')}</p>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default AuditEvidence;
