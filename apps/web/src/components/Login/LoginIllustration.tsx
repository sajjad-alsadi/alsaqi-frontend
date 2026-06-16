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
      
      {/* Teal brand overlay — no gradient, no gimmicks */}
      <div className="absolute inset-0 bg-[var(--color-primary-800)] opacity-80"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>

      {/* Content Container */}
      <div className="relative z-10 w-full h-full flex flex-col justify-center px-16 xl:px-24">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-xl"
        >
          {/* Security indicator — simple, no blur, no border decoration */}
          <div className="inline-flex items-center gap-2 mb-8">
            <ShieldCheck size={16} className="text-[var(--color-primary-300)]" />
            <span className="text-sm font-semibold text-white/80">{t('auth.secureAccess')}</span>
          </div>

          {/* Headline */}
          <h2 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-5" style={{ textWrap: 'balance' }}>
            {t('auth.precisionTitle')}
          </h2>
          <p className="text-base text-white/70 leading-relaxed max-w-sm">
            {t('auth.precisionDesc')}
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginIllustration;
