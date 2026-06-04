import React, { useState } from 'react';
import { ShieldAlert, Lock, AlertCircle, EyeOff, Clock, XCircle, CheckCircle, X, Plus, Save, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import Modal from '../../../components/Modal';
import { AccessRequest, AccessStatus } from '../types';

interface AccessGateProps {
  isManager: boolean;
  accessStatus: AccessStatus;
  myRequest: AccessRequest | null;
  requests: AccessRequest[];
  isRequestModalOpen: boolean;
  setIsRequestModalOpen: (open: boolean) => void;
  requestReason: string;
  setRequestReason: (reason: string) => void;
  requestError: string | null;
  submitAccessRequest: (e: React.FormEvent) => Promise<boolean>;
  approveRequest: (id: string, duration: string) => Promise<boolean>;
  rejectRequest: (id: string, reason: string) => Promise<boolean>;
  policyContent: string;
  setPolicyContent: (content: string) => void;
  savePolicy: (content: string) => Promise<boolean>;
  fetchPolicy: () => Promise<void>;
}

export const AccessGate: React.FC<AccessGateProps> = ({
  isManager,
  accessStatus,
  myRequest,
  requests,
  isRequestModalOpen,
  setIsRequestModalOpen,
  requestReason,
  setRequestReason,
  requestError,
  submitAccessRequest,
  approveRequest,
  rejectRequest,
  policyContent,
  setPolicyContent,
  savePolicy,
  fetchPolicy
}) => {
  const { t, i18n } = useTranslation();
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [isEditingPolicy, setIsEditingPolicy] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedApprovalDuration, setSelectedApprovalDuration] = useState('1');
  const [requestToApprove, setRequestToApprove] = useState<AccessRequest | null>(null);

  const handleApproveClick = (req: AccessRequest) => {
    setRequestToApprove(req);
    setSelectedApprovalDuration('1');
    setIsApproveModalOpen(true);
  };

  const handleRejectClick = (reqId: string) => {
    setSelectedRequestId(reqId);
    setRejectionReason('');
    setIsRejectModalOpen(true);
  };

  const handlePolicySave = async () => {
    const success = await savePolicy(policyContent);
    if (success) setIsEditingPolicy(false);
  };

  const hasAccess = isManager || accessStatus === 'Approved';

  if (!hasAccess) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-10"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-[var(--color-danger)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-danger)]/20">
              <ShieldAlert size={32} />
            </div>
            <div>
              <h2 className="text-2xl sm:text-4xl font-bold text-[var(--color-text-main)] tracking-tight">{t('integrity.fraud')}</h2>
              <p className="text-sm text-[var(--color-danger)] font-semibold uppercase tracking-[0.2em] mt-2 flex items-center gap-2">
                <Lock size={14} />
                {t('integrity.confidentialAccess')}
              </p>
            </div>
          </div>
        </div>

        <div className="glass-card p-20 border-rose-100 bg-rose-50/10 relative overflow-hidden group">
          <div className="absolute top-0 end-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity">
            <EyeOff size={200} className="text-rose-900" />
          </div>
          
          <div className="relative z-10 text-center max-w-2xl mx-auto">
            <div className="w-24 h-24 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-10 text-rose-600 shadow-xl">
              <AlertCircle size={48} />
            </div>
            <h3 className="text-3xl font-bold text-[var(--color-text-main)] mb-6 tracking-tight">{t('integrity.accessRestricted')}</h3>
            <p className="text-[var(--color-text-muted)] font-medium leading-relaxed mb-10">
              {t('integrity.accessRestrictedDesc')}
            </p>
            
            {accessStatus === 'Pending' ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8 max-w-md mx-auto">
                <div className="flex items-center gap-3 text-amber-600 font-bold mb-2 justify-center">
                  <Clock size={20} />
                  <span>{t('integrity.accessRequestPending')}</span>
                </div>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {t('integrity.requestSentToManager')}
                </p>
              </div>
            ) : accessStatus === 'Rejected' ? (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 mb-8 max-w-md mx-auto">
                <div className="flex items-center gap-3 text-rose-600 font-bold mb-2 justify-center">
                  <XCircle size={20} />
                  <span>{t('integrity.accessDenied')}</span>
                </div>
                <p className="text-sm text-[var(--color-text-muted)] mb-4">
                  {t('integrity.reason')}: {myRequest?.rejection_reason}
                </p>
                <button 
                  onClick={() => setIsRequestModalOpen(true)}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 underline"
                >
                  {t('integrity.submitNewRequest')}
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <button 
                  onClick={() => setIsRequestModalOpen(true)}
                  className="px-10 py-4 bg-rose-600 text-white font-bold rounded-xl shadow-2xl shadow-rose-200 hover:bg-rose-700 transition-all uppercase tracking-widest text-xs"
                >
                  {t('integrity.requestAccess')}
                </button>
                <button 
                  onClick={() => setIsPolicyOpen(true)}
                  className="px-10 py-4 bg-[var(--color-card)] text-[var(--color-text-muted)] font-bold rounded-xl border border-[var(--color-border-soft)] hover:bg-[var(--color-bg-soft)] transition-all uppercase tracking-widest text-xs"
                >
                  {t('integrity.viewPolicy')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Request Access Modal */}
        <Modal
          isOpen={isRequestModalOpen}
          onClose={() => setIsRequestModalOpen(false)}
          title={t('integrity.requestAccessTitle')}
        >
          <form onSubmit={(e) => { e.preventDefault(); submitAccessRequest(e); }} className="space-y-6">
            <div className="bg-[var(--color-primary-light)] p-4 rounded-lg flex items-start gap-3">
              <AlertCircle className="text-[var(--color-primary)] shrink-0 mt-0.5" size={20} />
              <p className="text-sm text-[var(--color-primary)]">
                {t('integrity.accessMonitoredDesc')}
              </p>
            </div>
            {requestError && <div className="text-rose-500 text-sm font-bold">{requestError}</div>}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('integrity.reasonForAccess')}</label>
              <textarea 
                required
                rows={4}
                className="input-field"
                placeholder={t('integrity.explainAccessReason')}
                value={requestReason}
                onChange={e => setRequestReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-4 pt-4 border-t border-[var(--color-border-soft)]">
              <button 
                type="button"
                onClick={() => setIsRequestModalOpen(false)}
                className="btn-secondary"
              >
                {t('common.cancel')}
              </button>
              <button 
                type="submit"
                className="btn-primary bg-rose-600 hover:bg-rose-700"
              >
                {t('common.confirm')}
              </button>
            </div>
          </form>
        </Modal>

        <PolicyModal 
          isOpen={isPolicyOpen}
          onClose={() => setIsPolicyOpen(false)}
          isEditing={isEditingPolicy}
          setIsEditing={setIsEditingPolicy}
          content={policyContent}
          setContent={setPolicyContent}
          onSave={handlePolicySave}
          onCancelEdit={() => { setIsEditingPolicy(false); fetchPolicy(); }}
          isManager={isManager}
        />
      </motion.div>
    );
  }

  return (
    <>
      {/* Access Requests Section for Managers */}
      {isManager && requests.filter(r => r.status === 'Pending').length > 0 && (
        <div className="bg-[var(--color-card)] rounded-2xl shadow-sm border border-[var(--color-border-soft)] p-6 mb-8">
          <h3 className="text-lg font-bold text-[var(--color-text-main)] mb-4 flex items-center gap-2">
            <ShieldAlert className="text-amber-500" size={20} />
            {t('integrity.pendingAccessRequests')}
          </h3>
          <div className="space-y-4">
            {requests.filter(r => r.status === 'Pending').map(req => (
              <div key={req.id} className="flex items-start justify-between p-4 bg-[var(--color-bg-soft)] rounded-xl border border-[var(--color-border-soft)]">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-[var(--color-text-main)]">{req.user_name}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">({req.user_id})</span>
                  </div>
                  <p className="text-sm text-[var(--color-text-muted)] italic">"{req.reason}"</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleRejectClick(req.id.toString())}
                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors text-sm font-bold flex items-center gap-1"
                  >
                    <XCircle size={16} />
                    {t('common.reject')}
                  </button>
                  <button 
                    onClick={() => handleApproveClick(req)}
                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors text-sm font-bold flex items-center gap-1"
                  >
                    <CheckCircle size={16} />
                    {t('common.approve')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reject Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title={t('integrity.rejectAccessRequest')}
      >
        <div className="space-y-4">
          <textarea 
            className="input-field"
            placeholder={t('integrity.rejectionReason')}
            value={rejectionReason}
            onChange={e => setRejectionReason(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setIsRejectModalOpen(false)}>{t('common.cancel')}</button>
            <button 
              className="btn-primary bg-rose-600" 
              onClick={async () => {
                if (selectedRequestId) {
                  await rejectRequest(selectedRequestId, rejectionReason);
                  setIsRejectModalOpen(false);
                }
              }}
            >
              {t('integrity.confirmReject')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Approve Modal */}
      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => setIsApproveModalOpen(false)}
        title={t('integrity.approveAccessRequest')}
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-muted)]">{t('integrity.grantAccessFor')}:</p>
          <select 
            className="input-field"
            value={selectedApprovalDuration}
            onChange={e => setSelectedApprovalDuration(e.target.value)}
          >
            <option value="1">1 {t('integrity.day')}</option>
            <option value="3">3 {t('integrity.days')}</option>
            <option value="7">7 {t('integrity.days')}</option>
            <option value="30">30 {t('integrity.days')}</option>
          </select>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setIsApproveModalOpen(false)}>{t('common.cancel')}</button>
            <button 
              className="btn-primary bg-emerald-600"
              onClick={async () => {
                if (requestToApprove) {
                  await approveRequest(requestToApprove.id.toString(), selectedApprovalDuration);
                  setIsApproveModalOpen(false);
                }
              }}
            >
              {t('integrity.confirmApprove')}
            </button>
          </div>
        </div>
      </Modal>

      <PolicyModal 
        isOpen={isPolicyOpen}
        onClose={() => setIsPolicyOpen(false)}
        isEditing={isEditingPolicy}
        setIsEditing={setIsEditingPolicy}
        content={policyContent}
        setContent={setPolicyContent}
        onSave={handlePolicySave}
        onCancelEdit={() => { setIsEditingPolicy(false); fetchPolicy(); }}
        isManager={isManager}
      />
    </>
  );
};

interface PolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  content: string;
  setContent: (content: string) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  isManager: boolean;
}

const PolicyModal: React.FC<PolicyModalProps> = ({
  isOpen,
  onClose,
  isEditing,
  setIsEditing,
  content,
  setContent,
  onSave,
  onCancelEdit,
  isManager
}) => {
  const { t, i18n } = useTranslation();
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-[var(--color-card)] rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border-soft)]">
              <div className="flex items-center gap-4">
                <h3 className="text-xl font-bold text-[var(--color-text-main)]">{t('integrity.fraudPolicyGuidelines')}</h3>
                {isManager && !isEditing && (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="p-2 hover:bg-[var(--color-bg-main)] rounded-lg text-[var(--color-text-muted)] transition-colors flex items-center gap-2 text-sm font-bold"
                  >
                    <Plus size={16} />
                    {t('common.edit')}
                  </button>
                )}
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-[var(--color-bg-main)] rounded-full transition-colors"
              >
                <X size={24} className="text-[var(--color-text-muted)]" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto custom-scrollbar" dir={i18n.dir()}>
              {isEditing ? (
                <textarea
                  className="w-full h-[50vh] p-4 border border-[var(--color-border-soft)] rounded-xl font-sans text-[var(--color-text-main)] leading-relaxed text-start focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-[var(--color-text-main)] leading-relaxed text-start">
                  {content}
                </pre>
              )}
            </div>
            
            <div className="p-6 border-t border-[var(--color-border-soft)] bg-[var(--color-bg-soft)] flex justify-end gap-4">
              {isEditing ? (
                <>
                  <button 
                    onClick={onCancelEdit}
                    className="px-6 py-2 bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border-soft)] rounded-lg hover:bg-[var(--color-bg-soft)] transition-colors font-medium"
                  >
                    {t('common.cancel')}
                  </button>
                  <button 
                    onClick={onSave}
                    className="px-6 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors font-medium flex items-center gap-2"
                  >
                    <Save size={18} />
                    {t('common.save')}
                  </button>
                </>
              ) : (
                <button 
                  onClick={onClose}
                  className="px-6 py-2 bg-[var(--color-text-main)] text-[var(--color-bg-main)] rounded-lg hover:opacity-90 transition-colors font-medium"
                >
                  {t('common.cancel')}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
