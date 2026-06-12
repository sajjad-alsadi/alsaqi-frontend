import { usePreferences } from '../context/PreferencesContext';
import { useTranslation } from 'react-i18next';

/**
 * Canonical Arabic locale used for number formatting.
 * MUST stay in sync with `utils/format.ts` (`ARABIC_LOCALE`) so that
 * `formatNumber` output is identical between the two modules. `ar-EG` yields
 * Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩) with grouping separators.
 */
const ARABIC_LOCALE = 'ar-EG';

/**
 * Hook to provide localized formatting functions
 */
export const useFormat = () => {
  const { language: contextLanguage } = usePreferences();
  const { t, i18n } = useTranslation();
  
  const language = contextLanguage || i18n.language || 'ar';

  const isArabic = language.startsWith('ar');

  /**
   * Formats a date string or object according to the current language
   */
  const formatDate = (date: string | Date | number | undefined) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    
    const formatted = d.toLocaleDateString(isArabic ? 'ar-IQ' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    if (isArabic) {
      const id = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
      return formatted.replace(/[0-9]/g, (w) => id[+w] ?? w);
    }
    return formatted;
  };

  /**
   * Formats a date and time string or object
   */
  const formatDateTime = (date: string | Date | number | undefined) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    
    const formatted = d.toLocaleString(isArabic ? 'ar-IQ' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    if (isArabic) {
      const id = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
      return formatted.replace(/[0-9]/g, (w) => id[+w] ?? w);
    }
    return formatted;
  };

  /**
   * Formats a number according to the current language. In the Arabic locale
   * this delegates to `Intl.NumberFormat(ARABIC_LOCALE, { useGrouping: true })`,
   * producing Eastern Arabic numerals with grouping separators instead of the
   * previous manual digit replacement that dropped grouping.
   */
  const formatNumber = (num: number | string | undefined) => {
    if (num === undefined || num === null) return isArabic ? '٠' : '0';

    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(n)) return String(num);

    if (isArabic) {
      return new Intl.NumberFormat(ARABIC_LOCALE, { useGrouping: true }).format(n);
    }

    return n.toLocaleString('en-US');
  };

  /**
   * Translates a status or enum value
   */
  const translateStatus = (status: string | undefined) => {
    if (!status) return '';
    // Try to find a translation in common.status namespace
    const key = `common.status.${status.toLowerCase().replace(/\s+/g, '')}`;
    const translated = t(key);
    return translated === key ? status : translated;
  };

  /**
   * Formats currency according to the current language
   */
  const formatCurrency = (amount: number | string | undefined, currency = 'IQD') => {
    if (amount === undefined || amount === null) return '';
    const n = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(n)) return String(amount);

    const formatted = n.toLocaleString(isArabic ? 'ar-IQ' : 'en-US', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0
    });

    if (isArabic) {
      const id = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
      return formatted.replace(/[0-9]/g, (w) => id[+w] ?? w);
    }
    return formatted;
  };

  /**
   * Translates a name if it's a system name
   */
  const translateName = (name: string | undefined) => {
    if (!name) return '';
    if (name === 'System Administrator') {
      return t('common.systemAdministrator');
    }
    return name;
  };

  /**
   * Translates a module name
   */
  const translateModule = (module: string | undefined) => {
    if (!module) return '';
    const lower = module.toLowerCase().trim();
    
    // Try exact match first
    const key = `common.modules.${lower}`;
    if (i18n.exists(key)) return t(key);
    
    // Try with underscores replaced by spaces
    const withSpaces = `common.modules.${lower.replace(/_/g, ' ')}`;
    if (i18n.exists(withSpaces)) return t(withSpaces);
    
    // Try with spaces replaced by underscores
    const withUnderscores = `common.modules.${lower.replace(/ /g, '_')}`;
    if (i18n.exists(withUnderscores)) return t(withUnderscores);
    
    return module;
  };

  /**
   * Translates an audit trail action
   */
  const translateAction = (action: string | undefined): string => {
    if (!action) return t('common.noDescription');
    
    // Exact match trial (lowercase)
    const lowerAction = action.trim().toLowerCase();
    const exactKey = `common.${lowerAction}`;
    if (i18n.exists(exactKey)) return t(exactKey);

    // Handle "Created [TableName]"
    if (lowerAction.startsWith('created ')) {
      const table = lowerAction.replace('created ', '').trim();
      return `${t('common.created')} ${translateModule(table)}`;
    }

    // Handle "Updated [TableName]" (includes ID cases)
    if (lowerAction.startsWith('updated ')) {
      const parts = action.split(/ID:/i);
      const tablePart = (parts[0] ?? '').replace(/Updated/i, '').trim();
      const idPart = parts[1] ? ` (ID:${parts[1]})` : '';
      return `${t('common.updated')} ${translateModule(tablePart)}${idPart}`;
    }

    // Handle "Deleted [TableName]"
    if (lowerAction.startsWith('deleted ')) {
      const parts = action.split(/ID:/i);
      const tablePart = (parts[0] ?? '').replace(/Deleted/i, '').trim();
      const idPart = parts[1] ? ` (ID:${parts[1]})` : '';
      return `${t('common.deleted')} ${translateModule(tablePart)}${idPart}`;
    }

    return action;
  };

  return {
    formatDate,
    formatDateTime,
    formatNumber,
    translateStatus,
    formatCurrency,
    translateName,
    translateModule,
    translateAction
  };
};
