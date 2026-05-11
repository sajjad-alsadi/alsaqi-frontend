import React from 'react';
import { motion } from 'motion/react';
import { User as UserIcon, Lock, Eye, EyeOff, AlertCircle, ShieldCheck } from 'lucide-react';

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
  resetStatus: string;
  onForgotPassword: () => void;
  onContactClick: () => void;
  checkResetStatus: (user: string) => void;
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
  resetStatus,
  onForgotPassword,
  onContactClick,
  checkResetStatus,
  t
}) => {
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {error && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 text-rose-600 text-sm overflow-hidden"
        >
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </motion.div>
      )}
      {success && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3 text-emerald-600 text-sm overflow-hidden"
        >
          <ShieldCheck size={18} className="shrink-0" />
          <span>{success}</span>
        </motion.div>
      )}

      <div className="space-y-2">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-widest">
          {t('auth.usernameOrEmail')}
        </label>
        <div className="relative group">
          <UserIcon className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
          <input
            type="text"
            className={`w-full ps-12 pe-4 py-3.5 bg-white border ${error ? 'border-rose-500' : 'border-slate-200'} rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-medium text-slate-900`}
            placeholder={t('auth.usernameOrEmail')}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (e.target.value.length > 2) checkResetStatus(e.target.value);
            }}
          />
        </div>
      </div>

      {resetStatus === 'Approved' && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-600 text-xs font-bold">
          {t('auth.resetApprovedMsg')}
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-widest">
          {t('common.password')}
        </label>
        <div className="relative group">
          <Lock className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
          <input
            type={showPassword ? "text" : "password"}
            required
            className="w-full ps-12 pe-12 py-3.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-medium text-slate-900"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button 
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute end-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer group">
          <input 
            type="checkbox" 
            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          <span className="text-sm font-medium text-slate-600 group-hover:text-slate-800 transition-colors">{t('auth.rememberMe')}</span>
        </label>

        <button 
          type="button"
          onClick={onContactClick}
          className="text-sm font-bold text-primary hover:text-primary/80 transition-colors"
        >
          {t('auth.needHelp')}
        </button>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 mt-2 bg-primary text-white rounded-lg font-bold hover:bg-primary/90 transition-all disabled:opacity-50 active:scale-[0.98] uppercase tracking-widest text-sm"
      >
        {loading ? '...' : t('auth.login')}
      </button>
    </form>
  );
};

export default LoginForm;
