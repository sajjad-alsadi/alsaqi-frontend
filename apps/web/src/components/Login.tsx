import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { usePreferences } from '../context/PreferencesContext';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { ResetStatus, Language } from '../constants';
import { api } from '../api';
import { mapAuthError, type AuthErrorCode } from '../api/modules/auth';

import ChangePasswordModal from './auth/ChangePasswordModal';
import ContactAdminModal from './auth/ContactAdminModal';
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
  const [resetStatus, setResetStatus] = useState<ResetStatus>(ResetStatus.NONE);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [show2FA, setShow2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFATempToken, setTwoFATempToken] = useState<string | null>(null);
  const [twoFAError, setTwoFAError] = useState('');
  // Forced 2FA enrollment (requires2FASetup) state
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [setupQr, setSetupQr] = useState<string | null>(null);
  const [setupBackupCodes, setSetupBackupCodes] = useState<string[]>([]);
  const [setupCode, setSetupCode] = useState('');
  const [setupError, setSetupError] = useState('');
  const twoFACodeRef = React.useRef<HTMLInputElement>(null);

  // Move focus to the 2FA code field when the verification step appears.
  // Done programmatically (instead of the `autoFocus` attribute) so focus is
  // only stolen in response to an explicit user action, keeping the flow
  // accessible (jsx-a11y/no-autofocus).
  React.useEffect(() => {
    if (show2FA) {
      twoFACodeRef.current?.focus();
    }
  }, [show2FA]);

  React.useEffect(() => {
    try {
      const isIdleLogout = sessionStorage.getItem('idle_logout');
      if (isIdleLogout === 'true') {
        setError(t('auth.sessionExpiredIdle'));
        sessionStorage.removeItem('idle_logout');
      }
    } catch (e) {}
  }, [t]);

  const checkResetStatus = async (user: string) => {
    // Check reset status for the user
    return;
  };

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
        return t('serverError', 'Server error');
      default:
        return t('auth.loginFailed');
    }
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
        setTwoFATempToken(result.tempToken ?? null);
        setShow2FA(true);
        setTwoFAError('');
        setTwoFACode('');
        setLoading(false);
        return;
      }

      // Handle forced 2FA enrollment response: fetch the TOTP secret/QR, then show setup modal
      if (result && result.requires2FASetup) {
        const tempToken = result.tempToken ?? null;
        setTwoFATempToken(tempToken);
        setSetupError('');
        setSetupCode('');
        try {
          const res = await fetch('/api/auth/2fa/setup-pending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ tempToken }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error?.message || data.error || t('auth.loginFailed'));
          }
          setSetupQr(data.qrCodeDataUrl ?? null);
          setSetupBackupCodes(Array.isArray(data.backupCodes) ? data.backupCodes : []);
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
      const fetchRes = await fetch('/api/auth/2fa/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tempToken: twoFATempToken, token: twoFACode }),
      });
      const result = await fetchRes.json();
      if (!fetchRes.ok) {
        throw new Error(result.error?.message || result.error || t('auth.loginFailed'));
      }
      if (result && result.user) {
        login(result.user, result.token || 'authenticated');
      }
    } catch (err: any) {
      const message = err.message || t('auth.loginFailed');
      setTwoFAError(typeof message === 'object' ? message.message : message);
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
      const res = await fetch('/api/auth/2fa/setup-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tempToken: twoFATempToken, token: setupCode }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error?.message || result.error || t('auth.loginFailed'));
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
      const message = err.message || t('auth.loginFailed');
      setSetupError(typeof message === 'object' ? message.message : message);
    } finally {
      setLoading(false);
    }
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
      // Use the token from the initial login (no need to login again)
      const changeRes = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${pendingToken}`
        },
        body: JSON.stringify({ newPassword })
      });
      const changeData = await changeRes.json();

      if (!changeRes.ok) {
        const errorMsg = typeof changeData.error === 'object' ? changeData.error.message : (changeData.error || '');
        throw new Error(errorMsg || 'Failed to change password');
      }

      setSuccess(t('auth.passwordChanged'));
      setShowChangeModal(false);
      login({ ...(pendingUser || {}), requires_password_change: false }, changeData.token);
    } catch (err: any) {
      const errorMessage = err.message || '';
      
      if (errorMessage.includes('same as the current password')) {
        setChangeError(t('auth.cannotUseSamePassword'));
      } else if (errorMessage.includes('used previously')) {
        setChangeError(t('auth.passwordUsedBefore'));
      } else if (errorMessage.includes('Password change required')) {
        setChangeError(t('auth.passwordChangeRequiredError'));
      } else if (errorMessage.includes('Invalid token') || errorMessage.includes('jwt expired')) {
        setChangeError(t('auth.sessionExpired'));
        // Token expired, close modal so user can login again
        setTimeout(() => setShowChangeModal(false), 2000);
      } else if (errorMessage.includes('must be at least') || errorMessage.includes('must contain')) {
        setChangeError(errorMessage);
      } else if (errorMessage && errorMessage !== 'Failed to change password') {
        setChangeError(errorMessage);
      } else {
        setChangeError(t('auth.errorChangingPassword'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-[var(--color-bg-main)] flex transition-colors duration-300 overflow-x-hidden"
      dir={language === Language.AR ? 'rtl' : 'ltr'}
    >
      {/* Left Side - Login Form (in LTR) / Right Side (in RTL) */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-12 bg-[var(--color-card)] border-e border-[var(--color-border-soft)] shadow-[inset_-20px_0_50px_-15px_rgba(0,0,0,0.05)] rtl:shadow-[inset_20px_0_50px_-15px_rgba(0,0,0,0.05)]">
        <motion.div 
          initial={{ opacity: 0, x: language === Language.AR ? 20 : -20 }}
          animate={{ opacity: 1, x: 0 }}
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
            resetStatus={resetStatus}
            onForgotPassword={() => {}}
            onContactClick={() => setShowContactModal(true)}
            checkResetStatus={checkResetStatus}
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
            <h3 className="text-lg font-bold text-[var(--color-text-main)] mb-2">
              {t('auth.twoFactorSetupTitle', 'Set up Two-Factor Authentication')}
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              {t('auth.twoFactorSetupDescription', 'Scan the QR code with your authenticator app, then enter the 6-digit code to confirm')}
            </p>

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

            {setupError && (
              <div className="p-3 mb-4 bg-[var(--color-danger-light)] border border-[var(--color-danger)]/20 rounded-xl text-[var(--color-danger)] text-sm" role="alert">
                {setupError}
              </div>
            )}

            <form onSubmit={handle2FASetupComplete}>
              <input
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
                className="w-full py-3.5 mt-4 bg-[var(--color-primary)] text-white rounded-xl font-bold hover:bg-[var(--color-primary-hover)] transition-all disabled:opacity-50 uppercase tracking-widest text-sm"
              >
                {loading ? '...' : t('auth.verify', 'Verify')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShow2FASetup(false);
                  setSetupCode('');
                  setTwoFATempToken(null);
                  setSetupError('');
                  setSetupQr(null);
                  setSetupBackupCodes([]);
                }}
                className="w-full py-3 mt-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] font-medium transition-colors text-sm"
              >
                {t('common.cancel', 'Cancel')}
              </button>
            </form>
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
                className="w-full py-3.5 mt-4 bg-[var(--color-primary)] text-white rounded-xl font-bold hover:bg-[var(--color-primary-hover)] transition-all disabled:opacity-50 uppercase tracking-widest text-sm"
              >
                {loading ? '...' : t('auth.verify', 'Verify')}
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
