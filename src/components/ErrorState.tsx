import React from 'react';
import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ErrorStateProps {
  /** Error message to display */
  message?: string;
  /** Callback to retry the failed operation */
  onRetry?: () => void;
  /** Whether this is a network error */
  isNetworkError?: boolean;
  /** Custom class for the container */
  className?: string;
}

/**
 * Reusable error state component with retry action.
 * Shows a clear error message with a recovery path.
 * 
 * @example
 * {error && <ErrorState message={error} onRetry={fetchData} />}
 */
const ErrorState: React.FC<ErrorStateProps> = ({ 
  message, 
  onRetry, 
  isNetworkError = false,
  className = '' 
}) => {
  const { t } = useTranslation();
  const Icon = isNetworkError ? WifiOff : AlertCircle;

  return (
    <div 
      className={`flex flex-col items-center justify-center py-16 text-center ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="w-16 h-16 rounded-2xl bg-[var(--color-danger)]/10 flex items-center justify-center text-[var(--color-danger)] mb-4">
        <Icon size={32} />
      </div>
      <h3 className="text-lg font-bold text-[var(--color-text-main)] mb-2">
        {isNetworkError 
          ? (t('common.networkError') || 'Connection Error') 
          : (t('common.errorOccurred') || 'Something went wrong')
        }
      </h3>
      <p className="text-sm text-[var(--color-text-muted)] max-w-sm mb-6">
        {message || (isNetworkError 
          ? (t('common.networkErrorDesc') || 'Please check your internet connection and try again.')
          : (t('common.errorDesc') || 'An unexpected error occurred. Please try again.')
        )}
      </p>
      {onRetry && (
        <button 
          onClick={onRetry}
          className="btn-secondary flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw size={16} />
          {t('common.retry') || 'Try Again'}
        </button>
      )}
    </div>
  );
};

export default ErrorState;
