import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';

const LoginIllustration: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-slate-900">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1920&q=80")' }}
      ></div>
      
      {/* Primary Color Overlay */}
      <div className="absolute inset-0 bg-primary/85 mix-blend-multiply"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-primary/50 to-slate-900/80"></div>

      {/* Content Container */}
      <div className="relative z-10 w-full h-full flex flex-col justify-center px-16 xl:px-24">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-xl"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full border border-white/20 mb-8">
            <ShieldCheck size={16} className="text-teal-300" />
            <span className="text-xs font-bold text-white uppercase tracking-widest">{t('auth.secureAccess')}</span>
          </div>

          {/* Titles */}
          <h2 className="text-5xl xl:text-6xl font-bold text-white leading-tight mb-6">
            {t('auth.precisionTitle')}
          </h2>
          <p className="text-lg text-slate-200 leading-relaxed max-w-md">
            {t('auth.precisionDesc')}
          </p>
        </motion.div>

        {/* Stats Cards */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="absolute bottom-16 start-16 xl:start-24 flex gap-6"
        >
          <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 min-w-[200px] shadow-2xl border border-white/20">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t('auth.systemUptime')}</div>
            <div className="text-3xl font-bold text-slate-800">99.98%</div>
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 min-w-[200px] shadow-2xl border border-white/20">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t('auth.auditsToday')}</div>
            <div className="text-3xl font-bold text-slate-800">1,240+</div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginIllustration;
