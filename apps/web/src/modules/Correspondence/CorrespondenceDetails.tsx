import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Mail, 
  Send, 
  Clock, 
  CheckCircle, 
  Archive, 
  AlertCircle,
  FileText,
  Link as LinkIcon,
  Paperclip,
  Share2,
  History,
  User,
  Building,
  Calendar,
  Tag,
  Download,
  Plus,
  X,
  ChevronRight,
  ChevronDown,
  Search
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/httpClient';
import { motion, AnimatePresence } from 'motion/react';
import { useFormat } from '../../utils/formatService';
import logger from '../../utils/logger';

interface CorrespondenceDetailsProps {
  type: 'Incoming' | 'Outgoing';
  id: number;
  language: 'ar' | 'en';
  onBack: () => void;
}

const CorrespondenceDetails: React.FC<CorrespondenceDetailsProps> = ({ type, id, language, onBack }) => {
  const { t } = useTranslation();
  const { formatNumber, formatDate, formatDateTime } = useFormat();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'history' | 'referrals' | 'attachments'>('info');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showReferModal, setShowReferModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);

  useEffect(() => {
    fetchDetails();
  }, [type, id]);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      const endpoint = type === 'Incoming' 
        ? `/correspondence/details/incoming/${id}` 
        : `/correspondence/details/outgoing/${id}`;
      const response = await api.get(endpoint);
      setData(response.data);
    } catch (error) {
      logger.error("Failed to fetch details", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-10 text-center">
        <p className="text-[var(--color-text-muted)]">{t('correspondence.dataNotFound')}</p>
        <button onClick={onBack} className="mt-4 text-[var(--color-primary)] hover:underline">{t('correspondence.goBack')}</button>
      </div>
    );
  }

  const mainData = data.main;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs">
        <ol className="flex items-center gap-1.5 list-none p-0 m-0">
          <li className="flex items-center gap-1.5">
            <button onClick={onBack} className="font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors cursor-pointer">
              {t('common.cms')}
            </button>
          </li>
          <li className="flex items-center gap-1.5">
            <ChevronRight size={12} className="text-[var(--color-border-strong)] rtl:rotate-180" />
            <button onClick={onBack} className="font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors cursor-pointer">
              {t(`correspondence.${type.toLowerCase()}`)}
            </button>
          </li>
          <li className="flex items-center gap-1.5">
            <ChevronRight size={12} className="text-[var(--color-border-strong)] rtl:rotate-180" />
            <span className="font-semibold text-[var(--color-text-main)]" aria-current="page">
              #{formatNumber(mainData.sequence_number)}
            </span>
          </li>
        </ol>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-[var(--color-bg-main)] rounded-full transition-colors text-[var(--color-text-main)]"
            aria-label={t('common.goBack') || 'Go back'}
          >
            <ArrowLeft size={24} className="rtl:rotate-180" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${type === 'Incoming' ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'bg-[var(--color-info)]/10 text-[var(--color-info)]'}`}>
                {t('correspondence.' + type.toLowerCase())}
              </span>
              <h1 className="text-2xl font-bold text-[var(--color-text-main)]">{formatNumber(mainData.sequence_number)}</h1>
            </div>
            <p className="text-[var(--color-text-muted)] flex items-center gap-2">
              <FileText size={16} />
              {mainData.subject}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {type !== 'Outgoing' && (
            <>
              <button 
                onClick={() => setShowStatusModal(true)}
                className="btn-secondary flex items-center gap-2"
              >
                <Clock size={18} />
                {t('correspondence.updateStatus')}
              </button>
              <button 
                onClick={() => setShowReferModal(true)}
                className="btn-secondary flex items-center gap-2"
              >
                <Share2 size={18} />
                {t('correspondence.refer')}
              </button>
            </>
          )}
          <button 
            onClick={() => setShowArchiveModal(true)}
            className="px-4 py-2 bg-[var(--color-text-muted)] text-white rounded-lg hover:bg-[var(--color-text-main)] flex items-center gap-2 transition-colors font-bold"
          >
            <Archive size={18} />
            {t('correspondence.archive')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border-soft)] shadow-sm overflow-hidden">
            <div className="flex border-b border-[var(--color-border-soft)] overflow-x-auto">
              <DetailTab active={activeTab === 'info'} onClick={() => setActiveTab('info')} label={t('correspondence.basicInfo')} icon={<FileText size={18} />} />
              <DetailTab active={activeTab === 'history'} onClick={() => setActiveTab('history')} label={t('correspondence.statusHistory')} icon={<History size={18} />} />
              {type !== 'Outgoing' && (
                <DetailTab active={activeTab === 'referrals'} onClick={() => setActiveTab('referrals')} label={t('correspondence.referrals')} icon={<Share2 size={18} />} />
              )}
              <DetailTab active={activeTab === 'attachments'} onClick={() => setActiveTab('attachments')} label={t('correspondence.attachments')} icon={<Paperclip size={18} />} />
            </div>

            <div className="p-6">
              {activeTab === 'info' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                  <InfoItem label={t('correspondence.letterNo')} value={formatNumber(mainData.letter_number || mainData.official_number || mainData.sequence_number)} />
                  <InfoItem label={t('correspondence.date')} value={formatDate(mainData.letter_date)} />
                  <InfoItem label={type === 'Outgoing' ? t('correspondence.recipient') : t('correspondence.sender')} value={mainData.sender_entity || mainData.recipient_entity} />
                  {type !== 'Outgoing' && <InfoItem label={t('correspondence.entityType')} value={t('correspondence.' + mainData.sender_entity_type?.toLowerCase().replace(/\s+/g, '_')) || mainData.sender_entity_type} />}
                  <InfoItem label={t('correspondence.classification')} value={t('correspondence.' + mainData.classification?.toLowerCase().replace(/\s+/g, '_')) || mainData.classification} />
                  {type !== 'Outgoing' && <InfoItem label={t('correspondence.priority')} value={t('correspondence.' + mainData.priority?.toLowerCase().replace(/\s+/g, '_')) || mainData.priority} />}
                  <InfoItem label={t('correspondence.method')} value={t('correspondence.' + (mainData.method || mainData.sending_method)?.toLowerCase().replace(/\s+/g, '_')) || mainData.method || mainData.sending_method} />
                  <InfoItem label={t('correspondence.currentStatus')} value={t('correspondence.' + mainData.status?.toLowerCase().replace(/\s+/g, '_')) || mainData.status || t('correspondence.pending')} isStatus />
                  <div className="md:col-span-2">
                    <InfoItem label={t('correspondence.notes')} value={mainData.notes || t('correspondence.noNotes')} />
                  </div>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-4">
                  {data.history.length === 0 ? (
                    <p className="text-center text-[var(--color-text-muted)] py-8">{t('correspondence.noStatusHistory')}</p>
                  ) : (
                    <div className="relative border-s-2 border-[var(--color-border-soft)] ms-3 space-y-8 py-2">
                      {(Array.isArray(data.history) ? data.history : []).map((h: any, idx: number) => (
                        <div key={idx} className="relative ps-8">
                          <div className="absolute -start-[9px] top-0 w-4 h-4 rounded-full bg-[var(--color-primary)] border-2 border-white"></div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-[var(--color-text-main)]">{t('correspondence.' + h.status.toLowerCase().replace(/\s+/g, '_')) || h.status}</span>
                            <span className="text-xs text-[var(--color-text-muted)]">{formatDateTime(h.changed_at)}</span>
                            <p className="text-sm text-[var(--color-text-main)] mt-1 opacity-80">{h.notes}</p>
                            <span className="text-xs text-[var(--color-primary)] mt-1 flex items-center gap-1">
                              <User size={12} />
                              {h.changed_by_name}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'referrals' && (
                <div className="space-y-4">
                  {data.referrals.length === 0 ? (
                    <p className="text-center text-[var(--color-text-muted)] py-8">{t('correspondence.noReferrals')}</p>
                  ) : (
                    <div className="space-y-4">
                      {(Array.isArray(data.referrals) ? data.referrals : []).map((r: any, idx: number) => (
                        <div key={idx} className="p-4 bg-[var(--color-bg-main)] rounded-xl border border-[var(--color-border-soft)] flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Building size={16} className="text-[var(--color-text-muted)]" />
                              <span className="font-semibold text-[var(--color-text-main)]">{language === 'ar' ? r.to_dept_name_ar : r.to_dept_name_en}</span>
                            </div>
                            {r.to_user_name && (
                              <div className="flex items-center gap-2 mb-2">
                                <User size={14} className="text-[var(--color-text-muted)]" />
                                <span className="text-sm text-[var(--color-text-main)] opacity-80">{r.to_user_name}</span>
                              </div>
                            )}
                            <p className="text-sm text-[var(--color-text-main)] opacity-80 italic">"{r.instructions}"</p>
                          </div>
                          <div className="text-end">
                            <span className="text-xs text-[var(--color-text-muted)] block">{formatDate(r.referral_date)}</span>
                            <span className="text-xs text-[var(--color-primary)] font-medium">{t('correspondence.by')}{r.from_user_name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'attachments' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-[var(--color-text-main)]">{t('correspondence.attachedFiles')}</h3>
                    <button 
                      onClick={() => setShowUploadModal(true)}
                      className="text-[var(--color-primary)] text-sm font-medium flex items-center gap-1 hover:underline"
                    >
                      <Plus size={16} />
                      {t('correspondence.addAttachment')}
                    </button>
                  </div>
                  {data.attachments.length === 0 ? (
                    <p className="text-center text-[var(--color-text-muted)] py-8">{t('correspondence.noAttachments')}</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(Array.isArray(data.attachments) ? data.attachments : []).map((a: any, idx: number) => (
                        <div key={idx} className="p-4 bg-[var(--color-bg-main)] rounded-xl border border-[var(--color-border-soft)] flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-[var(--color-card)] rounded-lg border border-[var(--color-border-soft)]">
                              <FileText size={20} className="text-[var(--color-primary)]" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-[var(--color-text-main)] truncate max-w-[150px]">{a.file_name}</p>
                              <p className="text-xs text-[var(--color-text-muted)]">{a.file_type} • {formatDate(a.uploaded_at)}</p>
                            </div>
                          </div>
                          <button className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors">
                            <Download size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Tracking & Summary */}
        <div className="space-y-6">
          {type !== 'Outgoing' && (
            <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border-soft)] shadow-sm p-6">
              <h3 className="font-bold text-[var(--color-text-main)] mb-4 flex items-center gap-2">
                <Clock size={18} className="text-[var(--color-primary)]" />
                {t('correspondence.followUpTracking')}
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[var(--color-text-muted)]">{t('correspondence.followUpRequired')}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${mainData.follow_up_required ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' : 'bg-[var(--color-bg-main)] text-[var(--color-text-muted)]'}`}>
                    {mainData.follow_up_required ? t('correspondence.yes') : t('correspondence.no')}
                  </span>
                </div>
                {mainData.follow_up_required && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--color-text-muted)]">{t('correspondence.followUpDate')}</span>
                    <span className="text-sm font-medium text-[var(--color-text-main)]">{formatDate(mainData.follow_up_date)}</span>
                  </div>
                )}
                <div className="border-t border-[var(--color-border-soft)] pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--color-text-muted)]">{t('correspondence.responseRequired')}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${mainData.response_required ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'bg-[var(--color-bg-main)] text-[var(--color-text-muted)]'}`}>
                      {mainData.response_required ? t('correspondence.yes') : t('correspondence.no')}
                    </span>
                  </div>
                  {mainData.response_required && (
                    <div className="mt-2 flex justify-between items-center">
                       <span className="text-sm text-[var(--color-text-muted)]">{t('correspondence.dueDate')}</span>
                       <span className="text-sm font-medium text-[var(--color-danger)]">{formatDate(mainData.response_due_date)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {type !== 'Outgoing' && (
            <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border-soft)] shadow-sm p-6">
              <h3 className="font-bold text-[var(--color-text-main)] mb-4 flex items-center gap-2">
                <User size={18} className="text-[var(--color-primary)]" />
                {t('correspondence.responsibility')}
              </h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
                    <Building size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-text-muted)]">{t('correspondence.responsibleDept')}</p>
                    <p className="text-sm font-bold text-[var(--color-text-main)]">{language === 'ar' ? mainData.assigned_dept_name_ar : mainData.assigned_dept_name_en || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center text-[var(--color-success)]">
                    <User size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-text-muted)]">{t('correspondence.assignedUser')}</p>
                    <p className="text-sm font-bold text-[var(--color-text-main)]">{mainData.assigned_user_name || '-'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showStatusModal && (
          <StatusUpdateModal 
            language={language} 
            id={id} 
            type={type}
            currentStatus={mainData.status}
            onClose={() => setShowStatusModal(false)}
            onSuccess={() => {
              setShowStatusModal(false);
              fetchDetails();
            }}
          />
        )}
        {showReferModal && (
          <ReferralModal 
            language={language} 
            id={id} 
            onClose={() => setShowReferModal(false)}
            onSuccess={() => {
              setShowReferModal(false);
              fetchDetails();
            }}
          />
        )}
        {showArchiveModal && (
          <ArchiveModal 
            language={language} 
            id={id} 
            type={type}
            onClose={() => setShowArchiveModal(false)}
            onSuccess={() => {
              setShowArchiveModal(false);
              fetchDetails();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// Helper Components
const DetailTab = ({ active, onClick, label, icon }: any) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-6 py-4.5 text-sm transition-all whitespace-nowrap ${
      active 
        ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)] font-bold bg-[var(--color-primary)]/5' 
        : 'border-b-2 border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-bg-soft)] font-bold'
    }`}
  >
    {icon}
    {label}
  </button>
);

const InfoItem = ({ label, value, isStatus }: any) => (
  <div>
    <p className="text-xs text-[var(--color-text-muted)] mb-1 font-medium">{label}</p>
    {isStatus ? (
      <span className="px-2 py-1 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded-full text-xs font-bold">
        {value}
      </span>
    ) : (
      <p className="text-sm font-bold text-[var(--color-text-main)]">{value}</p>
    )}
  </div>
);

// Modal Components
const ArchiveModal = ({ language, id, type, onClose, onSuccess }: any) => {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await api.put(`/correspondence/archive/${type}/${id}`);
      onSuccess();
    } catch (error) {
      logger.error("Failed to archive", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border-soft)] shadow-xl overflow-hidden w-full max-w-md">
        <div className="p-6 border-b border-[var(--color-border-soft)] flex justify-between items-center bg-[var(--color-bg-main)]">
          <h2 className="text-lg font-bold text-[var(--color-text-main)]">{t('correspondence.confirmArchive')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-[var(--color-border-soft)] rounded-full text-[var(--color-text-main)]"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-[var(--color-text-main)]">
            {t('correspondence.confirmArchiveMessage')}
          </p>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">{t('common.cancel')}</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1 disabled:opacity-50">{submitting ? '...' : t('correspondence.archive')}</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const StatusUpdateModal = ({ language, id, type, currentStatus, onClose, onSuccess }: any) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState(currentStatus);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const statuses = ['Received', 'Registered', 'Under Review', 'Referred', 'Action Taken', 'Closed', 'Cancelled'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await api.put(`/correspondence/status/${type}/${id}`, { new_status: status, notes });
      onSuccess();
    } catch (error) {
      logger.error("Failed to update status", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border-soft)] shadow-xl overflow-hidden w-full max-w-md">
        <div className="p-6 border-b border-[var(--color-border-soft)] flex justify-between items-center bg-[var(--color-bg-main)]">
          <h2 className="text-lg font-bold text-[var(--color-text-main)]">{t('correspondence.updateCorrespondenceStatus')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-[var(--color-border-soft)] rounded-full text-[var(--color-text-main)]"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--color-text-main)]">{t('correspondence.newStatus')}</label>
            <select 
              className="input-field"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {statuses.map(s => <option key={s} value={s}>{t('correspondence.' + s.toLowerCase().replace(/\s+/g, '_')) || s}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--color-text-main)]">{t('correspondence.updateNotes')}</label>
            <textarea 
              rows={3}
              className="input-field"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('correspondence.updateNotesPlaceholder')}
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">{t('common.cancel')}</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1 disabled:opacity-50">{submitting ? '...' : t('common.update')}</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const ReferralModal = ({ language, id, onClose, onSuccess }: any) => {
  const { t } = useTranslation();
  const [deptId, setDeptId] = useState('');
  const [userId, setUserId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [departments, setDepartments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchMeta = async () => {
      const [d, u] = await Promise.all([api.get('/org-entities'), api.get('/users')]);
      setDepartments(d.data);
      setUsers(u.data);
    };
    fetchMeta();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await api.post('/correspondence/refer', { incoming_id: id, to_dept_id: deptId, to_user_id: userId, instructions });
      onSuccess();
    } catch (error) {
      logger.error("Failed to refer", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border-soft)] shadow-xl overflow-hidden w-full max-w-md">
        <div className="p-6 border-b border-[var(--color-border-soft)] flex justify-between items-center bg-[var(--color-bg-main)]">
          <h2 className="text-lg font-bold text-[var(--color-text-main)]">{t('correspondence.referCorrespondence')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-[var(--color-border-soft)] rounded-full text-[var(--color-text-main)]"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--color-text-main)]">{t('correspondence.targetDeptRequired')}</label>
            <select required className="input-field" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              <option value="">{t('correspondence.selectDept')}</option>
              {(Array.isArray(departments) ? departments : []).map(d => <option key={d.id} value={d.id}>{language === 'ar' ? d.name_ar : d.name_en}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--color-text-main)]">{t('correspondence.userOptional')}</label>
            <select className="input-field" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">{t('correspondence.selectUser')}</option>
              {(Array.isArray(users) ? users : []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--color-text-main)]">{t('correspondence.instructions')}</label>
            <textarea rows={3} className="input-field" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">{t('common.cancel')}</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1 disabled:opacity-50">{submitting ? '...' : t('correspondence.refer')}</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default CorrespondenceDetails;
