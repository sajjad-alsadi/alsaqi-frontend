import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import api from '../services/api';
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
  const { login, language, setLanguage } = useAppContext();
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [resetStatus, setResetStatus] = useState<ResetStatus>(ResetStatus.NONE);

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
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const result = await loginUser(username, password, rememberMe);
      
      if (result && result.user) {
        login(result.user, result.token || 'authenticated'); 
      }
    } catch (err: any) {
      setError(err.message || t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (newPassword.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }

    setLoading(true);
    try {
      // First login with temp password to get token
      const loginRes = await api.post('/auth/login', { usernameOrEmail: username, password });
      const loginData = loginRes.data;
      
      const res = await api.post('/auth/change-password', 
        { newPassword },
        { headers: { 'Authorization': `Bearer ${loginData.token}` } }
      );

      const data = res.data;

      setSuccess(t('auth.passwordChanged'));
      setShowChangeModal(false);
      // Use the new token returned by the server which has the updated session version
      login({ ...loginData.user, requires_password_change: false }, data.token);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error changing password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-[#F8F9FA] flex transition-colors duration-300"
      dir={language === Language.AR ? 'rtl' : 'ltr'}
    >
      {/* Left Side - Login Form (in LTR) / Right Side (in RTL) */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-12 bg-white border-e border-slate-100 shadow-[20px_0_50px_-15px_rgba(0,0,0,0.05)] rtl:shadow-[-20px_0_50px_-15px_rgba(0,0,0,0.05)]">
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
        onClose={() => setShowChangeModal(false)}
        onSubmit={handleChangeSubmit}
        newPassword={newPassword}
        setNewPassword={setNewPassword}
        confirmPassword={confirmPassword}
        setConfirmPassword={setConfirmPassword}
        error={error}
        loading={loading}
      />
    </div>
  );
};

export default Login;
