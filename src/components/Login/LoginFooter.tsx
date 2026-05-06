import React from 'react';

interface LoginFooterProps {
  t: any;
  onContactClick: () => void;
}

const LoginFooter: React.FC<LoginFooterProps> = ({ t, onContactClick }) => {
  return (
    <div className="mt-8 text-center">
      <div className="w-16 h-px bg-slate-200 mx-auto mb-4"></div>
      
      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
        {t('auth.copyrightTextNew')}
      </p>
    </div>
  );
};

export default LoginFooter;
