import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, AlertCircle, Eye, EyeOff, Check, X as XIcon } from 'lucide-react';
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
  forced?: boolean;
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
  forced = false,
}) => {
  const { t } = useTranslation();
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const newPasswordRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        newPasswordRef.current?.focus();
      }, 200);
    }
  }, [isOpen]);

  // Password strength checks
  const checks = {
    minLength: newPassword.length >= 8,
    uppercase: /[A-Z]/.test(newPassword),
    lowercase: /[a-z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
    symbol: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword),
  };
  const passedChecks = Object.values(checks).filter(Boolean).length;
  const strengthPercent = (passedChecks / 5) * 100;
  const strengthColor = strengthPercent <= 40 ? 'bg-red-500' : strengthPercent <= 60 ? 'bg-amber-500' : strengthPercent <= 80 ? 'bg-blue-500' : 'bg-emerald-500';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('changePassword')}
      size="md"
    >
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <div className="p-4 bg-yellow-50 text-yellow-800 rounded-xl flex items-start gap-3 border border-yellow-100 shadow-sm">
          <ShieldCheck size={20} className="shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold leading-relaxed">{t('passwordChangeRequired')}</p>
            <p className="text-xs mt-1 opacity-80">{t('auth.doNotReuseTempPassword')}</p>
          </div>
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
          <div className="relative" dir="ltr">
            <input
              ref={newPasswordRef}
              type={showNewPassword ? 'text' : 'password'}
              autoComplete="new-password"
              className="w-full bg-[var(--color-bg-soft)] border border-[var(--color-border-soft)] text-[var(--color-text-main)] rounded-xl px-4 pe-12 py-3.5 outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all font-medium text-start"
              placeholder={t('auth.enterNewPassword')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors p-1"
            >
              {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Password strength meter */}
          {newPassword.length > 0 && (
            <div className="space-y-2 mt-2">
              <div className="h-1.5 bg-[var(--color-bg-soft)] rounded-full overflow-hidden">
                <div className={`h-full ${strengthColor} transition-all duration-300 rounded-full`} style={{ width: `${strengthPercent}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { key: 'minLength', label: t('auth.rule8Chars') },
                  { key: 'uppercase', label: t('auth.ruleUppercase') },
                  { key: 'lowercase', label: t('auth.ruleLowercase') },
                  { key: 'number', label: t('auth.ruleNumber') },
                  { key: 'symbol', label: t('auth.ruleSymbol') },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-1.5">
                    {checks[key as keyof typeof checks] ? (
                      <Check size={12} className="text-emerald-500 shrink-0" />
                    ) : (
                      <XIcon size={12} className="text-[var(--color-text-muted)]/50 shrink-0" />
                    )}
                    <span className={`text-[10px] ${checks[key as keyof typeof checks] ? 'text-emerald-600 font-bold' : 'text-[var(--color-text-muted)]'}`}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">
            {t('confirmPassword')}
          </label>
          <div className="relative" dir="ltr">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              className="w-full bg-[var(--color-bg-soft)] border border-[var(--color-border-soft)] text-[var(--color-text-main)] rounded-xl px-4 pe-12 py-3.5 outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all font-medium text-start"
              placeholder={t('auth.confirmNewPassword')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors p-1"
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="text-[10px] text-red-500 font-bold mt-1">{t('auth.passwordMismatch')}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-border-soft)]">
          {!forced && (
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-bg-soft)] rounded-xl transition-all"
            >
              {t('common.cancel')}
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !newPassword || !confirmPassword || newPassword.length < 8 || newPassword !== confirmPassword}
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
