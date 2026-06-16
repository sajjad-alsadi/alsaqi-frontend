import React from 'react';

interface LoginFooterProps {
  t: any;
  onContactClick: () => void;
}

const LoginFooter: React.FC<LoginFooterProps> = ({ t, onContactClick }) => {
  return (
    <div className="mt-8 text-center">
      <div className="w-16 h-px bg-[var(--color-border-soft)] mx-auto mb-4"></div>
      
      <p className="text-xs text-[var(--color-text-muted)] font-medium">
        {t('auth.copyrightTextNew')}
      </p>
    </div>
  );
};

export default LoginFooter;
