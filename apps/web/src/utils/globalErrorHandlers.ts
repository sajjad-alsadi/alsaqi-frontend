import { errorReporter } from './errorReporter';

export function registerGlobalErrorHandlers(): void {
  window.onerror = (message, source, lineno, colno, error) => {
    errorReporter.report({
      message: String(message),
      stack: error?.stack || `${source}:${lineno}:${colno}`,
      type: 'uncaught',
    });
  };

  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    errorReporter.report({
      message: error?.message || String(error),
      stack: error?.stack,
      type: 'unhandled-rejection',
    });
  });
}
