import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import Modal from '../Modal';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  username: string;
  setUsername: (username: string) => void;
  error: string;
  loading: boolean;
  resetStatus: 'None' | 'Pending' | 'Approved' | 'Rejected';
  checkResetStatus: (user: string) => void;
}

const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  username,
  setUsername,
  error,
  loading,
  resetStatus,
  checkResetStatus,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('forgotPassword')}
      size="md"
    >
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
          <p className="text-sm text-blue-700 leading-relaxed font-medium">
            {t('forgotPasswordInstructions')}
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-3 border border-red-100 shadow-sm">
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-sm font-bold">{error}</p>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">
            {t('username')}
          </label>
          <div className="relative">
            <input
              type="text"
              required
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium placeholder:text-slate-400"
              placeholder={t('enterUsername')}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                checkResetStatus(e.target.value);
              }}
              dir="ltr"
            />
          </div>
        </div>

        {resetStatus === 'Pending' && (
          <div className="p-4 bg-yellow-50 text-yellow-800 rounded-xl flex items-center gap-3 border border-yellow-100 shadow-sm">
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-sm font-bold">{t('resetPending')}</p>
          </div>
        )}

        {resetStatus === 'Rejected' && (
          <div className="p-4 bg-red-50 text-red-800 rounded-xl flex items-center gap-3 border border-red-100 shadow-sm">
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-sm font-bold">{t('resetRejected')}</p>
          </div>
        )}

        {resetStatus === 'Approved' && (
          <div className="p-4 bg-green-50 text-green-800 rounded-xl flex items-center gap-3 border border-green-100 shadow-sm">
            <ShieldCheck size={20} className="shrink-0" />
            <p className="text-sm font-bold">{t('resetApproved')}</p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={loading || resetStatus === 'Pending'}
            className="px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              t('submit')
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ForgotPasswordModal;
