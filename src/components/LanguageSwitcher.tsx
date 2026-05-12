import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation();

  const toggleLanguage = () => {
    const newLng = i18n.language === 'ar' ? 'en' : 'ar';
    i18n.changeLanguage(newLng);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--color-bg-main)] transition-colors text-[var(--color-text-muted)]"
      title={t('common.language')}
    >
      <Globe className="w-5 h-5" />
      <span className="text-sm font-medium">
        {i18n.language === 'ar' ? t('common.english') : t('common.arabic')}
      </span>
    </button>
  );
};

export default LanguageSwitcher;
