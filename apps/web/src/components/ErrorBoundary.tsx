import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { withTranslation, WithTranslation } from 'react-i18next';
import logger from '../utils/logger';
import { errorReporter } from '../utils/errorReporter';

interface Props extends WithTranslation {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global Error Boundary — Ultimate Fallback
 *
 * Wraps the entire application at the top level. Catches any error that
 * escapes ModuleErrorBoundary (e.g., if ModuleErrorBoundary itself throws).
 * Displays a full-page fallback with a red/error theme, a clear error
 * indication, and a page-reload action.
 *
 * On error:
 *  - Logs via structured logger
 *  - Reports to /api/system-errors via errorReporter
 *  - Displays a full-screen centered fallback with reload button
 *
 * Requirements: 1.6
 */
class ErrorBoundaryBase extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const componentStack = errorInfo.componentStack || '';

    // Log via structured logger
    logger.error('Uncaught error:', { error, errorInfo });

    // Report to error reporting service
    errorReporter.report({
      module: 'global',
      message: error.message,
      componentStack,
      severity: 'critical',
      type: 'boundary',
      stack: error.stack,
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    const { t } = this.props;

    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center p-6 bg-red-50 dark:bg-red-950 text-center"
          role="alert"
          aria-live="assertive"
        >
          <div className="w-20 h-20 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-red-900 dark:text-red-100 mb-3">
            {t('globalError.title')}
          </h1>
          <p className="text-red-700 dark:text-red-300 mb-8 max-w-md text-base">
            {t('globalError.description')}
          </p>
          <button
            onClick={this.handleReload}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-red-600 px-6 py-3 text-base font-medium text-white shadow-lg shadow-red-600/20 transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            type="button"
          >
            <RefreshCw className="w-5 h-5" />
            {t('reloadPage')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export const ErrorBoundary: React.ComponentType<Omit<Props, keyof WithTranslation>> = withTranslation()(ErrorBoundaryBase);
