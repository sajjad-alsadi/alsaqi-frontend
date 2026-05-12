import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, AlertCircle, Eye, EyeOff } from 'lucide-react';
import Modal from '../Modal';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  newPassword: string;
  setNewPassword: (password: string) => void;
  confirmPassword: string;
  setConfirmPassword: (password: string) => void;
  error: string;
  loading: boolean;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  error,
  loading,
}) => {
  const { t } = useTranslation();
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('changePassword')}
      size="md"
    >
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="p-4 bg-yellow-50 text-yellow-800 rounded-xl flex items-start gap-3 border border-yellow-100 shadow-sm">
          <ShieldCheck size={20} className="shrink-0 mt-0.5" />
          <p className="text-sm font-bold leading-relaxed">{t('passwordChangeRequired')}</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-3 border border-red-100 shadow-sm">
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-sm font-bold">{error}</p>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">
            {t('newPassword')}
          </label>
          <div className="relative">
            <input
              type={showNewPassword ? 'text' : 'password'}
              required
              minLength={8}
              className="w-full bg-[var(--color-bg-soft)] border border-[var(--color-border-soft)] text-[var(--color-text-main)] rounded-xl px-4 py-3.5 outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all font-medium placeholder:text-[var(--color-text-muted)]"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute end-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
            >
              {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)] font-medium mt-1">
            {t('passwordRequirements')}
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">
            {t('confirmPassword')}
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              required
              minLength={8}
              className="w-full bg-[var(--color-bg-soft)] border border-[var(--color-border-soft)] text-[var(--color-text-main)] rounded-xl px-4 py-3.5 outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all font-medium placeholder:text-[var(--color-text-muted)]"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute end-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-border-soft)]">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-bg-soft)] rounded-xl transition-all"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={loading || !newPassword || !confirmPassword}
            className="px-6 py-2.5 bg-[var(--color-primary)] text-white text-sm font-bold rounded-xl hover:bg-[var(--color-primary)]/90 transition-all shadow-lg shadow-[var(--color-primary)]/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              t('changePassword')
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ChangePasswordModal;
