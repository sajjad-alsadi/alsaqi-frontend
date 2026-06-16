import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';

/**
 * Abstract geometric pattern rendered as CSS — zero network requests,
 * instant paint, and uniquely brand-teal rather than stock-photo-generic.
 */
const LoginIllustration: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-[var(--color-primary-900)]">
      {/* Abstract geometric pattern — CSS-only, zero network cost */}
      <div className="absolute inset-0 opacity-[0.07]">
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 800 800"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          {/* Grid of intersecting lines — evokes audit precision */}
          <path d="M0 200h800M0 400h800M0 600h800M200 0v800M400 0v800M600 0v800" stroke="currentColor" strokeWidth="1" className="text-white" />
          {/* Diagonal accent — breaks the grid, adds dynamism */}
          <path d="M0 800L800 0" stroke="currentColor" strokeWidth="0.5" className="text-white" />
          <path d="M200 800L800 200" stroke="currentColor" strokeWidth="0.5" className="text-white" />
          {/* Circles at intersections — nodes of activity */}
          <circle cx="400" cy="400" r="120" stroke="currentColor" strokeWidth="0.5" className="text-white" />
          <circle cx="400" cy="400" r="200" stroke="currentColor" strokeWidth="0.5" className="text-white" />
          <circle cx="200" cy="200" r="40" stroke="currentColor" strokeWidth="0.5" className="text-white" />
          <circle cx="600" cy="600" r="40" stroke="currentColor" strokeWidth="0.5" className="text-white" />
        </svg>
      </div>

      {/* Subtle radial gradient for depth — no image, no stacking overlays */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,_var(--color-primary-700)_0%,_transparent_70%)] opacity-40"></div>

      {/* Content Container */}
      <div className="relative z-10 w-full h-full flex flex-col justify-center px-16 xl:px-24">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-xl"
        >
          {/* Security indicator */}
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
