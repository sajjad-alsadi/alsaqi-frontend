import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { withTranslation, WithTranslation } from 'react-i18next';
import { errorReporter } from '@/utils/errorReporter';
import logger from '@/utils/logger';

interface ModuleErrorBoundaryOwnProps {
  moduleName: string;
  children: ReactNode;
}

type ModuleErrorBoundaryProps = ModuleErrorBoundaryOwnProps & WithTranslation;

interface ModuleErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Module-level Error Boundary
 *
 * Catches render errors within a single feature module and displays
 * a localized fallback UI with a retry button. Other modules remain
 * unaffected — navigation continues to work normally.
 *
 * On error:
 *  - Logs via structured logger
 *  - Reports to /api/system-errors via errorReporter
 *  - Displays a contained fallback with module name, error message, and retry action
 *
 * Requirements: 1.1, 1.2, 1.4, 1.5
 */
class ModuleErrorBoundaryBase extends Component<ModuleErrorBoundaryProps, ModuleErrorBoundaryState> {
  public state: ModuleErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ModuleErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { moduleName } = this.props;
    const componentStack = errorInfo.componentStack || '';

    // Log via structured logger
    logger.error(`Module "${moduleName}" crashed: ${error.message}`, {
      module: moduleName,
      componentStack,
    });

    // Report to error reporting service
    errorReporter.report({
      module: moduleName,
      message: error.message,
      componentStack,
      severity: 'high',
      type: 'boundary',
      stack: error.stack,
    });
  }

  private handleRetry = (): void => {
    // Reset error state to re-mount children without affecting sibling routes
    this.setState({ hasError: false, error: null });
  };

  public render(): ReactNode {
    const { t, children, moduleName } = this.props;

    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center min-h-[300px] p-6 mx-auto max-w-lg"
          role="alert"
          aria-live="assertive"
        >
          <div className="w-full rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
            </div>

            <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('moduleError.title', { moduleName })}
            </h2>

            <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
              {t('moduleError.description')}
            </p>

            <button
              onClick={this.handleRetry}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              type="button"
            >
              <RefreshCw className="h-4 w-4" />
              {t('moduleError.retry')}
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}

export const ModuleErrorBoundary = withTranslation()(ModuleErrorBoundaryBase) as React.ComponentType<ModuleErrorBoundaryOwnProps>;
export default ModuleErrorBoundary;
