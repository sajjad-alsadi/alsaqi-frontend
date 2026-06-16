import { usePreferences } from '../context/PreferencesContext';
import { useTranslation } from 'react-i18next';
import {
  formatDate as canonicalFormatDate,
  formatDateTime as canonicalFormatDateTime,
  formatNumber as canonicalFormatNumber,
  formatCurrency as canonicalFormatCurrency,
} from './formatting';

/**
 * Hook to provide localized formatting functions.
 *
 * The date/number/currency helpers now route through the canonical
 * Formatting_Module (`utils/formatting.ts`), which uses one canonical Arabic
 * locale (`ar-EG`) via `Intl`. This replaces the previous divergent `ar-IQ`
 * locale plus manual digit replacement that dropped grouping separators
 * (Req 17.2, 17.3, 17.4). The hook's public surface is unchanged.
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
    return canonicalFormatDate(date, { language });
  };

  /**
   * Formats a date and time string or object
   */
  const formatDateTime = (date: string | Date | number | undefined) => {
    if (!date) return '';
    return canonicalFormatDateTime(date, { language });
  };

  /**
   * Formats a number according to the current language. Routes through the
   * canonical module which, in Arabic, produces Eastern Arabic numerals with
   * grouping separators via `Intl.NumberFormat`.
   */
  const formatNumber = (num: number | string | undefined) => {
    if (num === undefined || num === null) return isArabic ? '٠' : '0';
    return canonicalFormatNumber(num, { language });
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
    return canonicalFormatCurrency(amount, { language, currency });
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
