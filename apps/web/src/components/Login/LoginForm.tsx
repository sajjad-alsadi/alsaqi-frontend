import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User as UserIcon, Lock, Eye, EyeOff, AlertCircle, ShieldCheck, Loader2, Info } from 'lucide-react';

interface LoginFormProps {
  onSubmit: (e: React.FormEvent) => void;
  username: string;
  setUsername: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  showPassword: boolean;
  setShowPassword: (val: boolean) => void;
  rememberMe: boolean;
  setRememberMe: (val: boolean) => void;
  error: string;
  success: string;
  loading: boolean;
  onForgotPassword: () => void;
  t: any;
}

const LoginForm: React.FC<LoginFormProps> = ({
  onSubmit,
  username,
  setUsername,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  rememberMe,
  setRememberMe,
  error,
  success,
  loading,
  onForgotPassword,
  t
}) => {
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {success && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="p-4 bg-[var(--color-success-light)] border border-[var(--color-success)]/20 rounded-xl flex items-center gap-3 text-[var(--color-success)] text-sm overflow-hidden"
          role="status"
          aria-live="polite"
        >
          <ShieldCheck size={18} className="shrink-0" />
          <span>{success}</span>
        </motion.div>
      )}

      <div className="space-y-2">
        <label htmlFor="login-username" className="input-label">
          {t('auth.usernameOrEmail')}
        </label>
        <div className="relative group">
          <UserIcon className="absolute start-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] group-focus-within:text-[var(--color-primary)] transition-colors" size={18} />
          <input
            id="login-username"
            type="text"
            required
            autoComplete="username"
            maxLength={255}
            className={`w-full ps-12 pe-4 py-3.5 bg-[var(--color-card)] border ${error ? 'border-[var(--color-danger)] focus:ring-[var(--color-danger)]/20 focus:border-[var(--color-danger)]' : 'border-[var(--color-border-soft)] focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]'} rounded-xl focus:ring-2 outline-none transition-all font-medium text-[var(--color-text-main)]`}
            placeholder={t('auth.usernameOrEmail')}
            value={username}
            aria-invalid={!!error}
            aria-describedby={error ? 'login-error' : undefined}
            onChange={(e) => {
              setUsername(e.target.value);
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="login-password" className="input-label">
          {t('common.password')}
        </label>
        <div className="relative group">
          <Lock className="absolute start-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] group-focus-within:text-[var(--color-primary)] transition-colors" size={18} />
          <input
            id="login-password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            maxLength={128}
            className={`w-full ps-12 pe-12 py-3.5 bg-[var(--color-card)] border ${error ? 'border-[var(--color-danger)] focus:ring-[var(--color-danger)]/20 focus:border-[var(--color-danger)]' : 'border-[var(--color-border-soft)] focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]'} rounded-xl focus:ring-2 outline-none transition-all font-medium text-[var(--color-text-main)]`}
            placeholder="••••••••"
            value={password}
            aria-invalid={!!error}
            aria-describedby={error ? 'login-error' : undefined}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button 
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute end-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] transition-colors"
            aria-label={showPassword ? t('auth.hidePassword') || 'Hide password' : t('auth.showPassword') || 'Show password'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {/* Auth error sits here — adjacent to the last-touched field */}
        <AnimatePresence>
          {error && (
            <motion.div
              id="login-error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-2.5 pt-1 text-[var(--color-danger)] text-sm overflow-hidden"
              role="alert"
              aria-live="assertive"
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <label className="flex items-center gap-2 cursor-pointer group">
          <input 
            type="checkbox" 
            className="w-4 h-4 rounded border-[var(--color-border-soft)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          <span className="text-sm text-[var(--color-text-muted)] group-hover:text-[var(--color-text-main)] transition-colors">{t('auth.rememberMe')}</span>
        </label>

        <button
          type="button"
          onClick={onForgotPassword}
          className="text-sm font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] transition-colors"
        >
          {t('auth.forgotPassword')}
        </button>
      </div>

      {/* 2FA hint — reduces surprise when the modal appears post-submit */}
      <div className="flex items-start gap-2 text-xs text-[var(--color-text-muted)]">
        <Info size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
        <span>{t('auth.twoFactorHint', 'Your organization may require two-step verification after sign-in.')}</span>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 mt-2 bg-[var(--color-primary)] text-white rounded-xl font-bold hover:bg-[var(--color-primary-hover)] transition-all disabled:opacity-50 active:scale-[0.98] text-sm inline-flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            <span className="sr-only">{t('common.loading', 'Loading…')}</span>
          </>
        ) : t('auth.login')}
      </button>
    </form>
  );
};

export default LoginForm;
