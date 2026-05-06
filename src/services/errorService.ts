import i18next from 'i18next';

/**
 * Translates error messages from the backend to the current language
 */
export const translateError = (error: any, language: 'en' | 'ar'): string => {
  const t = (key: string) => i18next.t(key, { lng: language });
  
  if (!error) return t('errorOccurred');
  
  const message = typeof error === 'string' ? error : (error.message || error.error || '');
  
  // Map common backend error strings to translation keys
  const errorMap: Record<string, string> = {
    'Unauthorized': t('unauthorized'),
    'Forbidden': t('forbidden'),
    'Not Found': t('notFound'),
    'Internal Server Error': t('serverError'),
    'Network Error': t('networkError'),
    'Invalid credentials': t('failedLogin'),
    'Account locked': t('accountLocked'),
    'Session expired': t('sessionExpired'),
    'Invalid data': t('invalidData'),
  };

  // Check if the message matches any known error
  for (const [key, value] of Object.entries(errorMap)) {
    if (message.includes(key)) return value;
  }

  // Fallback to the original message if it's already translated or just return generic error
  return message || t('errorOccurred');
};
