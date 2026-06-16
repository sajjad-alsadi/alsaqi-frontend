import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { usePreferences } from '../context/PreferencesContext';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { Language } from '../constants';
import { api } from '../api';
import { authFetch } from '../api/authFetch';
import { mapAuthError, type AuthErrorCode, type LoginResponse } from '../api/modules/auth';

import ChangePasswordModal from './auth/ChangePasswordModal';
import ContactAdminModal from './auth/ContactAdminModal';
import ForgotPasswordModal from './auth/ForgotPasswordModal';
import LoginIllustration from './Login/LoginIllustration';
import LoginHeader from './Login/LoginHeader';
import LoginForm from './Login/LoginForm';
import LoginFooter from './Login/LoginFooter';

const Login: React.FC = () => {
  const { login } = useAppContext();
  const { language, setLanguage } = usePreferences();
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [changeError, setChangeError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<NonNullable<LoginResponse['user']> | null>(null);
  const [show2FA, setShow2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFATempToken, setTwoFATempToken] = useState<string | null>(null);
  const [twoFAError, setTwoFAError] = useState('');
  // Forced 2FA enrollment (requires2FASetup) state
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [setupStep, setSetupStep] = useState<1 | 2>(1);
  const [setupQr, setSetupQr] = useState<string | null>(null);
  const [setupBackupCodes, setSetupBackupCodes] = useState<string[]>([]);
  const [setupCode, setSetupCode] = useState('');
  const [setupError, setSetupError] = useState('');
  const twoFACodeRef = React.useRef<HTMLInputElement>(null);
  const setupCodeRef = React.useRef<HTMLInputElement>(null);

  // Move focus to the 2FA code field when the verification step appears.
  // Done programmatically (instead of the `autoFocus` attribute) so focus is
  // only stolen in response to an explicit user action, keeping the flow
  // accessible (jsx-a11y/no-autofocus).
  React.useEffect(() => {
    if (show2FA) {
      twoFACodeRef.current?.focus();
    }
  }, [show2FA]);

  // Focus the setup code input when the user navigates to step 2.
  // Small delay allows AnimatePresence animation to start rendering the input.
  React.useEffect(() => {
    if (setupStep === 2 && setupCodeRef.current) {
      setTimeout(() => setupCodeRef.current?.focus(), 100);
    }
  }, [setupStep]);

  React.useEffect(() => {
    try {
      const isIdleLogout = sessionStorage.getItem('idle_logout');
      if (isIdleLogout === 'true') {
        setError(t('auth.sessionExpiredIdle'));
        sessionStorage.removeItem('idle_logout');
      }
    } catch (e) {}
  }, [t]);

  /**
   * Map a stable {@link AuthErrorCode} to a localized, user-facing message.
   *
   * Error handling keys off the code returned by `mapAuthError` (derived from
   * HTTP status + server `error.code`) rather than the server's message text,
   * so wording changes on the backend never break the UI (Req 4.4, 4.5).
   */
  const authErrorMessage = (code: AuthErrorCode): string => {
    switch (code) {
      case 'invalid_credentials':
        return t('auth.invalidCredentials');
      case 'account_locked':
        return t('auth.accountLocked');
      case 'rate_limited':
        return t('auth.tooManyAttempts');
      case 'network_error':
        return t('networkError', 'Network error');
      case 'server_error':
        return t('auth.serverError', t('serverError', 'Server error'));
      case 'response_schema_mismatch':
        return t('auth.responseSchemaMismatch');
      default:
        return t('auth.loginFailed');
    }
  };

  /**
   * Map a change-password failure to a localized message.
   *
   * Prefers the stable server `error.code` (message-independent), so backend
   * wording changes never break this UI. Falls back to legacy message-text
   * matching only for older backends that don't emit a code. Returns whether the
   * change-password modal should auto-close (e.g. when the session token expired
   * and the user must log in again).
   */
  const changePasswordErrorMessage = (
    code: string | undefined,
    message: string
  ): { text: string; closeModal: boolean } => {
    switch (code) {
      case 'PASSWORD_SAME_AS_CURRENT':
      case 'SAME_PASSWORD':
        return { text: t('auth.cannotUseSamePassword'), closeModal: false };
      case 'PASSWORD_REUSED':
      case 'PASSWORD_USED_PREVIOUSLY':
        return { text: t('auth.passwordUsedBefore'), closeModal: false };
      case 'PASSWORD_CHANGE_REQUIRED':
        return { text: t('auth.passwordChangeRequiredError'), closeModal: false };
      case 'INVALID_TOKEN':
      case 'TOKEN_EXPIRED':
      case 'UNAUTHORIZED':
        return { text: t('auth.sessionExpired'), closeModal: true };
      case 'WEAK_PASSWORD':
      case 'VALIDATION_ERROR':
        return { text: message || t('auth.errorChangingPassword'), closeModal: false };
    }

    // Legacy fallback: match server message text for backends without a code.
    if (message.includes('same as the current password')) {
      return { text: t('auth.cannotUseSamePassword'), closeModal: false };
    }
    if (message.includes('used previously')) {
      return { text: t('auth.passwordUsedBefore'), closeModal: false };
    }
    if (message.includes('Password change required')) {
      return { text: t('auth.passwordChangeRequiredError'), closeModal: false };
    }
    if (message.includes('Invalid token') || message.includes('jwt expired')) {
      return { text: t('auth.sessionExpired'), closeModal: true };
    }
    if (message.includes('must be at least') || message.includes('must contain')) {
      return { text: message, closeModal: false };
    }
    if (message && message !== 'Failed to change password') {
      return { text: message, closeModal: false };
    }
    return { text: t('auth.errorChangingPassword'), closeModal: false };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Don't process login if change password modal is open
    if (showChangeModal) return;
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Route login through the consolidated Auth_Module (targets /v1/auth/login)
      // instead of a raw fetch, so all callers share one validated auth flow (Req 4.1–4.3).
      const result = await api.auth.login({ usernameOrEmail: username, password, rememberMe });

      // Handle 2FA required response
      if (result && result.requires2FA) {
        // Defensively reset the enrollment flow so its state can't leak here.
        setShow2FASetup(false);
        setSetupCode('');
        setTwoFATempToken(result.tempToken ?? null);
        setShow2FA(true);
        setTwoFAError('');
        setTwoFACode('');
        setLoading(false);
        return;
      }

      // Handle forced 2FA enrollment response: fetch the TOTP secret/QR, then show setup modal
      if (result && result.requires2FASetup) {
        // Defensively reset the verification flow so its state can't leak here.
        setShow2FA(false);
        setTwoFACode('');
        const tempToken = result.tempToken ?? null;
        setTwoFATempToken(tempToken);
        setSetupError('');
        setSetupCode('');
        try {
          const res = await authFetch('/api/v1/auth/2fa/setup-pending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tempToken }),
          });
          const data = await res.json();
          if (!res.ok) {
            const errMsg = typeof data.error === 'string'
              ? data.error
              : data.error?.message || data.message || t('auth.loginFailed');
            throw new Error(errMsg);
          }
          setSetupQr(data.qrCodeDataUrl ?? null);
          setSetupBackupCodes(Array.isArray(data.backupCodes) ? data.backupCodes : []);
          setSetupStep(1);
          setShow2FASetup(true);
        } catch (err: any) {
          setError(err.message || t('auth.loginFailed'));
        } finally {
          setLoading(false);
        }
        return;
      }

      if (result && result.user) {
        // Check if user needs to change password before granting access
        if (result.user.requires_password_change) {
          setError('');
          setChangeError('');
          setPendingToken(result.token ?? result.accessToken ?? null);
          setPendingUser(result.user);
          setShowChangeModal(true);
          setLoading(false);
          return;
        }
        login(result.user, result.token || result.accessToken || 'authenticated');
      }
    } catch (err: unknown) {
      // Classify the error to a stable code, then localize it. Never branch on
      // server message text (Req 4.4, 4.5).
      setError(authErrorMessage(mapAuthError(err).code));
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFATempToken || !twoFACode) return;
    setTwoFAError('');
    setLoading(true);

    try {
      const fetchRes = await authFetch('/api/v1/auth/2fa/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken: twoFATempToken, token: twoFACode }),
      });
      const result = await fetchRes.json();
      if (!fetchRes.ok) {
        const errMsg = typeof result.error === 'string'
          ? result.error
          : result.error?.message || result.message || t('auth.loginFailed');
        throw new Error(errMsg);
      }
      if (result && result.user) {
        login(result.user, result.token || 'authenticated');
      }
    } catch (err: any) {
      const message = err?.message || t('auth.loginFailed');
      setTwoFAError(typeof message === 'object' ? message.message ?? t('auth.loginFailed') : message);
    } finally {
      setLoading(false);
    }
  };

  const handle2FASetupComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFATempToken || setupCode.length !== 6) return;
    setSetupError('');
    setLoading(true);

    try {
      const res = await authFetch('/api/v1/auth/2fa/setup-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken: twoFATempToken, token: setupCode }),
      });
      const result = await res.json();
      if (!res.ok) {
        const errMsg = typeof result.error === 'string'
          ? result.error
          : result.error?.message || result.message || t('auth.loginFailed');
        throw new Error(errMsg);
      }
      if (result && result.user) {
        // A newly enrolled user may still be required to change their password.
        if (result.user.requires_password_change) {
          setPendingToken(result.token ?? null);
          setPendingUser(result.user);
          setShow2FASetup(false);
          setShowChangeModal(true);
          setLoading(false);
          return;
        }
        setShow2FASetup(false);
        login(result.user, result.token || 'authenticated');
      }
    } catch (err: any) {
      const message = err?.message || t('auth.loginFailed');
      setSetupError(typeof message === 'object' ? message.message ?? t('auth.loginFailed') : message);
    } finally {
      setLoading(false);
    }
  };

  // Advance from QR display to code entry
  const handleSetupNext = () => {
    setSetupStep(2);
  };

  // Return from code entry to QR display
  const handleSetupBack = () => {
    setSetupStep(1);
    setSetupCode('');   // Clear the code input
    setSetupError('');  // Clear any verification error
  };

  // Cancel the entire enrollment flow
  const handleSetupCancel = () => {
    setShow2FASetup(false);
    setSetupStep(1);
    setSetupCode('');
    setTwoFATempToken(null);
    setSetupError('');
    setSetupQr(null);
    setSetupBackupCodes([]);
  };

  const handleChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (newPassword !== confirmPassword) {
      setChangeError(t('auth.passwordMismatch'));
      return;
    }
    if (newPassword.length < 8) {
      setChangeError(t('auth.passwordTooShort'));
      return;
    }
    if (!pendingToken) {
      setChangeError(t('auth.sessionExpired'));
      setShowChangeModal(false);
      return;
    }

    setLoading(true);
    setChangeError('');
    try {
      // Use the token from the initial login (no need to login again). authFetch
      // adds the CSRF header + credentials the raw fetch was missing; the bearer
      // token from the initial login is still passed explicitly for this flow.
      const changeRes = await authFetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${pendingToken}`
        },
        body: JSON.stringify({ newPassword })
      });
      const changeData = await changeRes.json().catch(() => ({}));

      if (!changeRes.ok) {
        // Classify using the stable server error.code first, then message text.
        const serverError = (changeData as { error?: unknown }).error;
        const code =
          typeof serverError === 'object' && serverError !== null
            ? (serverError as { code?: string }).code
            : undefined;
        const message =
          typeof serverError === 'object' && serverError !== null
            ? (serverError as { message?: string }).message ?? ''
            : typeof serverError === 'string'
              ? serverError
              : '';

        const { text, closeModal } = changePasswordErrorMessage(code, message);
        setChangeError(text);
        if (closeModal) {
          // Session token expired — close modal so the user can log in again.
          setTimeout(() => setShowChangeModal(false), 2000);
        }
        return;
      }

      setSuccess(t('auth.passwordChanged'));
      setShowChangeModal(false);
      // Session is cookie-based; fall back to the 'authenticated' sentinel when
      // the endpoint doesn't echo a token so the session is still established.
      login(
        { ...(pendingUser ?? {}), requires_password_change: false } as NonNullable<LoginResponse['user']>,
        (changeData as { token?: string }).token || 'authenticated'
      );
    } catch {
      // Network or unexpected failure (the structured non-ok path is handled
      // above). Never branch on server message text here.
      setChangeError(t('auth.errorChangingPassword'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-[var(--color-bg-main)] flex"
      dir={language === Language.AR ? 'rtl' : 'ltr'}
    >
      {/* Form panel */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-12 bg-[var(--color-card)] border-e border-[var(--color-border-soft)]">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="max-w-md w-full"
        >
          <LoginHeader 
            language={language} 
            setLanguage={setLanguage} 
            t={t} 
          />

          <LoginForm 
            onSubmit={handleSubmit}
            username={username}
            setUsername={setUsername}
            password={password}
            setPassword={setPassword}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            rememberMe={rememberMe}
            setRememberMe={setRememberMe}
            error={error}
            success={success}
            loading={loading}
            onForgotPassword={() => setShowForgotPasswordModal(true)}
            t={t}
          />

          <LoginFooter t={t} onContactClick={() => setShowContactModal(true)} />
        </motion.div>
      </div>

      <LoginIllustration />

      {/* 2FA Enrollment Modal (forced setup) */}
      {show2FASetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--color-card)] rounded-2xl p-8 w-full max-w-sm mx-4 shadow-2xl border border-[var(--color-border-soft)]"
            dir={language === Language.AR ? 'rtl' : 'ltr'}
          >
            {/* Step progress indicator — dynamic based on setupStep */}
            {(() => {
              const progressStep = setupStep === 1 ? 2 : 3;
              const progressTotal = 3;
              return (
                <div
                  className="flex items-center gap-1.5 mb-5"
                  role="status"
                  aria-label={t('auth.twoFAStep', { current: progressStep, total: progressTotal })}
                >
                  {/* Step 1: credentials (always complete) */}
                  <div className="h-1.5 w-8 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />
                  {/* Step 2: scan QR / setup (always complete or current) */}
                  <div className="h-1.5 w-8 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />
                  {/* Step 3: verify code (filled when setupStep=2, unfilled when setupStep=1) */}
                  <div
                    className={`h-1.5 w-8 rounded-full ${setupStep === 2 ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border-strong)]'}`}
                    aria-hidden="true"
                  />
                  <span className="text-[11px] font-medium text-[var(--color-text-muted)] ms-1">
                    {t('auth.twoFAStep', { current: progressStep, total: progressTotal })}
                  </span>
                </div>
              );
            })()}

            <h3 className="text-lg font-bold text-[var(--color-text-main)] mb-2">
              {t('auth.twoFactorSetupTitle', 'Set up Two-Factor Authentication')}
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              {t('auth.twoFactorSetupDescription', 'Scan the QR code with your authenticator app, then enter the 6-digit code to confirm')}
            </p>

            <AnimatePresence mode="wait">
              {setupStep === 1 ? (
                <motion.div
                  key="qr-step"
                  initial={{ opacity: 0, x: -20 * (language === Language.AR ? -1 : 1) }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 * (language === Language.AR ? -1 : 1) }}
                  transition={{ duration: 0.2 }}
                >
                  {setupQr && (
                    <img
                      src={setupQr}
                      alt={t('auth.twoFactorSetupTitle', 'Set up Two-Factor Authentication')}
                      className="mx-auto mb-4 w-44 h-44 bg-white p-2 rounded-lg"
                    />
                  )}

                  {setupBackupCodes.length > 0 && (
                    <div className="mb-4 p-3 bg-[var(--color-bg-main)] rounded-lg text-xs font-mono grid grid-cols-2 gap-1 text-[var(--color-text-main)]">
                      {setupBackupCodes.map((c) => (
                        <span key={c}>{c}</span>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSetupNext}
                    className="w-full py-3.5 mt-4 bg-[var(--color-primary)] text-white rounded-xl font-bold hover:bg-[var(--color-primary-hover)] transition-all disabled:opacity-50 text-sm inline-flex items-center justify-center gap-2"
                  >
                    {t('common.next', 'Next')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSetupCancel}
                    className="w-full py-3 mt-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] font-medium transition-colors text-sm"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="code-step"
                  initial={{ opacity: 0, x: 20 * (language === Language.AR ? -1 : 1) }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 * (language === Language.AR ? -1 : 1) }}
                  transition={{ duration: 0.2 }}
                >
                  {setupError && (
                    <div className="p-3 mb-4 bg-[var(--color-danger-light)] border border-[var(--color-danger)]/20 rounded-xl text-[var(--color-danger)] text-sm" role="alert">
                      {setupError}
                    </div>
                  )}

                  <form onSubmit={handle2FASetupComplete}>
                    <input
                      ref={setupCodeRef}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      aria-label={t('auth.twoFactorSetupTitle', 'Set up Two-Factor Authentication')}
                      className="w-full px-4 py-3.5 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all font-mono text-center text-2xl tracking-[0.5em] text-[var(--color-text-main)]"
                      placeholder="000000"
                      value={setupCode}
                      onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                    <button
                      type="submit"
                      disabled={loading || setupCode.length !== 6}
                      className="w-full py-3.5 mt-4 bg-[var(--color-primary)] text-white rounded-xl font-bold hover:bg-[var(--color-primary-hover)] transition-all disabled:opacity-50 text-sm inline-flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                          <span className="sr-only">{t('common.loading', 'Loading…')}</span>
                        </>
                      ) : t('auth.verify', 'Verify')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSetupBack}
                      className="w-full py-3 mt-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] font-medium transition-colors text-sm"
                    >
                      {t('common.back', 'Back')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSetupCancel}
                      className="w-full py-3 mt-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] font-medium transition-colors text-sm"
                    >
                      {t('common.cancel', 'Cancel')}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}

      {/* 2FA Verification Modal */}
      {show2FA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--color-card)] rounded-2xl p-8 w-full max-w-sm mx-4 shadow-2xl border border-[var(--color-border-soft)]"
            dir={language === Language.AR ? 'rtl' : 'ltr'}
          >
            {/* Step progress — step 2 of 2 */}
            <div
              className="flex items-center gap-1.5 mb-5"
              role="status"
              aria-label={t('auth.twoFAStep', { current: 2, total: 2 })}
            >
              {/* Step 1: credentials (complete) */}
              <div className="h-1.5 w-8 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />
              {/* Step 2: verify code (active) */}
              <div className="h-1.5 w-8 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />
              <span className="text-[11px] font-medium text-[var(--color-text-muted)] ms-1">
                {t('auth.twoFAStep', { current: 2, total: 2 })}
              </span>
            </div>

            <h3 className="text-lg font-bold text-[var(--color-text-main)] mb-2">
              {t('auth.twoFactorTitle', 'Two-Factor Authentication')}
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">
              {t('auth.twoFactorDescription', 'Enter the 6-digit code from your authenticator app')}
            </p>
            
            {twoFAError && (
              <div className="p-3 mb-4 bg-[var(--color-danger-light)] border border-[var(--color-danger)]/20 rounded-xl text-[var(--color-danger)] text-sm" role="alert">
                {twoFAError}
              </div>
            )}

            <form onSubmit={handle2FASubmit}>
              <input
                ref={twoFACodeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                aria-label={t('auth.twoFactorTitle', 'Two-Factor Authentication')}
                className="w-full px-4 py-3.5 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all font-mono text-center text-2xl tracking-[0.5em] text-[var(--color-text-main)]"
                placeholder="000000"
                value={twoFACode}
                onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <button
                type="submit"
                disabled={loading || twoFACode.length !== 6}
                className="w-full py-3.5 mt-4 bg-[var(--color-primary)] text-white rounded-xl font-bold hover:bg-[var(--color-primary-hover)] transition-all disabled:opacity-50 text-sm inline-flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    <span className="sr-only">{t('common.loading', 'Loading…')}</span>
                  </>
                ) : t('auth.verify', 'Verify')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShow2FA(false);
                  setTwoFACode('');
                  setTwoFATempToken(null);
                  setTwoFAError('');
                }}
                className="w-full py-3 mt-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] font-medium transition-colors text-sm"
              >
                {t('common.cancel', 'Cancel')}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      <ForgotPasswordModal
        isOpen={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
      />

      <ContactAdminModal 
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
        t={t}
        dir={language === Language.AR ? 'rtl' : 'ltr'}
      />

      <ChangePasswordModal
        isOpen={showChangeModal}
        onClose={() => {
          setShowChangeModal(false);
          setNewPassword('');
          setConfirmPassword('');
          setChangeError('');
        }}
        onSubmit={handleChangeSubmit}
        newPassword={newPassword}
        setNewPassword={setNewPassword}
        confirmPassword={confirmPassword}
        setConfirmPassword={setConfirmPassword}
        error={changeError}
        loading={loading}
        forced={true}
      />
    </div>
  );
};

export default Login;
