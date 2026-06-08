import React from 'react';
import { Languages } from 'lucide-react';
import { Language } from '../../constants';
import Logo from '../Logo';

interface LoginHeaderProps {
  language: string;
  setLanguage: (lang: Language) => void;
  t: any;
}

const LoginHeader: React.FC<LoginHeaderProps> = ({ language, setLanguage, t }) => {
  return (
    <>
      <div className="flex justify-end mb-8">
        <button 
          onClick={() => setLanguage(language === 'en' ? Language.AR : Language.EN)}
          className="p-2.5 bg-[var(--color-bg-soft)] text-[var(--color-text-muted)] rounded-xl hover:bg-[var(--color-bg-main)] transition-all border border-[var(--color-border-soft)]"
          title={t('common.language')}
        >
          <Languages size={20} />
        </button>
      </div>

      <div className="mb-10 text-start">
        <div className="flex justify-start mb-6">
          <div className="rounded-full overflow-hidden bg-[var(--color-card)]">
            <Logo size={72} className="block" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-[var(--color-text-main)] tracking-tight leading-tight">
          {t('auth.portalTitle')}
        </h1>
        <p className="text-[var(--color-text-muted)] mt-2 text-base">
          {t('auth.welcome')}
        </p>
      </div>
    </>
  );
};

export default LoginHeader;
