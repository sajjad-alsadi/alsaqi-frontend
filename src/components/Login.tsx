import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { usePreferences } from '../context/PreferencesContext';
import { loginUser } from '../services/authService';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { ResetStatus, Language } from '../constants';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Don't process login if change password modal is open
    if (showChangeModal) return;
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const result = await loginUser(username, password, rememberMe);
      
      if (result && result.user) {
        // Check if user needs to change password before granting access
        if (result.user.requires_password_change) {
          setError('');
          setChangeError('');
          setPendingToken(result.token);
          setPendingUser(result.user);
          setShowChangeModal(true);
          setLoading(false);
          return;
        }
        login(result.user, result.token || 'authenticated'); 
      }
    } catch (err: any) {
      const message = err.message || err.toString();
      if (message === 'Invalid credentials') {
        setError(t('auth.invalidCredentials'));
      } else if (message === 'Account suspended') {
        setError(t('auth.accountSuspended'));
      } else if (message === 'Account locked') {
        setError(t('auth.accountLocked'));
      } else {
        setError(message || t('auth.loginFailed'));
      }
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
      className="min-h-screen bg-[var(--color-bg-main)] flex transition-colors duration-300"
      dir={language === Language.AR ? 'rtl' : 'ltr'}
    >
      {/* Left Side - Login Form (in LTR) / Right Side (in RTL) */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-12 bg-[var(--color-card)] border-e border-[var(--color-border-soft)] shadow-[20px_0_50px_-15px_rgba(0,0,0,0.05)] rtl:shadow-[-20px_0_50px_-15px_rgba(0,0,0,0.05)]">
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
