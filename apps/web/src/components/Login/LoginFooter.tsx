import React from 'react';

interface LoginFooterProps {
  t: any;
  onContactClick: () => void;
}

const LoginFooter: React.FC<LoginFooterProps> = ({ t, onContactClick }) => {
  return (
    <div className="mt-10 text-center space-y-2">
      <button
        type="button"
        onClick={onContactClick}
        className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
      >
        {t('auth.needHelp')}
      </button>
      <p className="text-xs text-[var(--color-text-muted)]">
        {t('auth.copyrightTextNew')}
      </p>
    </div>
  );
};

export default LoginFooter;
