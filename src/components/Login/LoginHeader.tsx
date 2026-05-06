import React from 'react';
import { Languages } from 'lucide-react';
import Logo from '../Logo';

interface LoginHeaderProps {
  language: string;
  setLanguage: (lang: string) => void;
  t: any;
}

const LoginHeader: React.FC<LoginHeaderProps> = ({ language, setLanguage, t }) => {
  return (
    <>
      <div className="flex justify-end mb-8">
        <button 
          onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
          className="p-2.5 bg-slate-50 text-slate-500 rounded-xl hover:bg-slate-100 transition-all border border-slate-100"
          title={t('common.language')}
        >
          <Languages size={20} />
        </button>
      </div>

      <div className="mb-10 text-start">
        <div className="flex justify-start mb-6">
          <div className="rounded-full overflow-hidden bg-white">
            <Logo size={72} className="block" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight leading-tight">
          {t('auth.portalTitle')}
        </h1>
        <p className="text-slate-500 mt-2 text-base">
          {t('auth.welcome')}
        </p>
      </div>
    </>
  );
};

export default LoginHeader;
