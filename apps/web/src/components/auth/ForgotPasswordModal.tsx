import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { KeyRound, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../../context/PreferencesContext';
import { Language } from '../../constants';
import api from '../../api/httpClient';
import Portal from '../Portal';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Phase = 'form' | 'success';

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const dir = language === Language.AR ? 'rtl' : 'ltr';

  const [phase, setPhase] = useState<Phase>('form');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state whenever the modal is opened
  useEffect(() => {
    if (isOpen) {
      setPhase('form');
      setValue('');
      setError('');
      setLoading(false);
      // Defer focus until the entrance animation begins
      const id = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  // Escape key: close unless loading
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, loading, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(t('auth.forgotPasswordModal.validationRequired'));
      return;
    }

    setError('');
    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { usernameOrEmail: trimmed });
      // Always show success — the server never leaks whether the account exists
      setPhase('success');
    } catch (err: unknown) {
      // Rate-limited (429) or server error (5xx)
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        setError(t('auth.tooManyAttempts'));
      } else {
        setError(t('auth.forgotPasswordModal.errorGeneral'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = () => {
    if (!loading) onClose();
  };

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            dir={dir}
            role="dialog"
            aria-modal="true"
            aria-label={t('auth.forgotPasswordModal.title')}
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={handleBackdropClick}
              aria-hidden="true"
            />

            {/* Modal shell */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
              className="relative w-full max-w-sm bg-[var(--color-card)] rounded-2xl shadow-2xl border border-[var(--color-border-soft)] overflow-hidden"
            >
              <AnimatePresence mode="wait">
                {phase === 'form' ? (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="p-8"
                  >
                    {/* Icon header */}
                    <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-[var(--color-primary-light)] mb-6 mx-auto">
                      <KeyRound size={22} className="text-[var(--color-primary)]" strokeWidth={2} />
                    </div>

                    <h2
                      className="text-xl font-bold text-[var(--color-text-main)] text-center mb-2 leading-tight"
                      style={{ textWrap: 'balance' } as React.CSSProperties}
                    >
                      {t('auth.forgotPasswordModal.title')}
                    </h2>
                    <p
                      className="text-sm text-[var(--color-text-muted)] text-center mb-6 leading-relaxed"
                      style={{ textWrap: 'pretty' } as React.CSSProperties}
                    >
                      {t('auth.forgotPasswordModal.description')}
                    </p>

                    <form onSubmit={handleSubmit} noValidate className="space-y-4">
                      {/* Error banner */}
                      <AnimatePresence>
                        {error && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-start gap-2.5 p-3.5 bg-[var(--color-danger-light)] border border-[var(--color-danger)]/20 rounded-xl text-[var(--color-danger)] text-sm overflow-hidden"
                            role="alert"
                            aria-live="assertive"
                          >
                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                            <span>{error}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Input */}
                      <div className="space-y-1.5">
                        <label
                          htmlFor="forgot-pw-input"
                          className="input-label"
                        >
                          {t('auth.forgotPasswordModal.label')}
                        </label>
                        <input
                          ref={inputRef}
                          id="forgot-pw-input"
                          type="text"
                          autoComplete="username"
                          className={`input-field ${error ? 'border-[var(--color-danger)] focus:ring-[var(--color-danger)]/20 focus:border-[var(--color-danger)]' : ''}`}
                          placeholder={t('auth.forgotPasswordModal.placeholder')}
                          value={value}
                          onChange={(e) => {
                            setValue(e.target.value);
                            if (error) setError('');
                          }}
                          disabled={loading}
                          aria-invalid={!!error}
                          aria-describedby={error ? 'forgot-pw-error' : undefined}
                        />
                      </div>

                      {/* Submit */}
                      <button
                        type="submit"
                        disabled={loading || !value.trim()}
                        className="btn-primary w-full py-3 disabled:opacity-50 mt-2"
                      >
                        {loading ? (
                          <>
                            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                            <span className="sr-only">{t('common.loading', 'Loading…')}</span>
                          </>
                        ) : (
                          t('auth.forgotPasswordModal.submit')
                        )}
                      </button>

                      {/* Cancel */}
                      <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="w-full py-2.5 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] transition-colors disabled:opacity-50"
                      >
                        {t('common.cancel')}
                      </button>
                    </form>
                  </motion.div>
                ) : (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                    className="p-8 text-center"
                  >
                    {/* Success icon */}
                    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-success-light)] mb-6 mx-auto">
                      <CheckCircle2
                        size={28}
                        className="text-[var(--color-success)]"
                        strokeWidth={2}
                      />
                    </div>

                    <h2
                      className="text-xl font-bold text-[var(--color-text-main)] mb-2 leading-tight"
                      style={{ textWrap: 'balance' } as React.CSSProperties}
                    >
                      {t('auth.forgotPasswordModal.successTitle')}
                    </h2>
                    <p
                      className="text-sm text-[var(--color-text-muted)] leading-relaxed mb-8"
                      style={{ textWrap: 'pretty' } as React.CSSProperties}
                    >
                      {t('auth.forgotPasswordModal.successDesc')}
                    </p>

                    <button
                      type="button"
                      onClick={onClose}
                      className="btn-primary w-full py-3"
                    >
                      {t('auth.forgotPasswordModal.backToSignIn')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
};

export default ForgotPasswordModal;
