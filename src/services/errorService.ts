import i18next from 'i18next';

/**
 * Translates error messages from the backend to the current language
 */
export const translateError = (error: string | { message?: string; error?: string } | null | undefined, language: 'en' | 'ar'): string => {
  const t = (key: string, options?: Record<string, unknown>) => i18next.t(key, { lng: language, ...options });
  
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
    'Account suspended': t('auth.accountSuspended'),
    'Account suspended, disabled or archived': t('auth.accountSuspended'),
    'Session expired': t('sessionExpired'),
    'Session invalidated': t('sessionExpired'),
    'Invalid data': t('invalidData'),
    'Invalid option': t('validationErrors.invalidOption'),
    'expected string': t('validationErrors.expectedString'),
    'Required': t('validationErrors.required'),
    'too_small': t('validationErrors.tooShort'),
    'too_big': t('validationErrors.tooLong'),
    'TOO_MANY_ATTEMPTS': t('auth.tooManyAttempts'),
    'Too many requests': t('auth.tooManyAttempts'),
    'Invalid token': t('sessionExpired'),
    'User not found': t('failedLogin'),
    'Password change required': t('passwordChangeRequired'),
    'New password cannot be the same as the current password': t('auth.cannotUseSamePassword'),
    'Password has been used previously. Please choose a different one.': t('auth.passwordUsedBefore'),
    'Password must be at least': t('auth.ruleMinLength'),
    'Password must contain at least one uppercase letter': t('auth.ruleUppercaseRequired'),
    'Password must contain at least one lowercase letter': t('auth.ruleLowercaseRequired'),
    'Password must contain at least one number': t('auth.ruleNumberRequired'),
    'Password must contain at least one special character': t('auth.ruleSymbolRequired'),
    'Forbidden: Insufficient permissions': t('forbidden'),
    'An unexpected error occurred': t('errorOccurred'),
    'Missing required fields': t('validationErrors.required'),
    'Not implemented': t('featureUnderDevelopment'),
  };

  // Check if the message matches any known error
  for (const [key, value] of Object.entries(errorMap)) {
    if (message.includes(key)) return value;
  }

  // Handle Zod validation patterns
  if (message.includes('Invalid option: expected one of')) {
    return t('validationErrors.invalidOption');
  }
  if (message.includes('Invalid input: expected')) {
    return t('validationErrors.invalidInput');
  }

  // Fallback to the original message if it's already translated or just return generic error
  return message || t('errorOccurred');
};
