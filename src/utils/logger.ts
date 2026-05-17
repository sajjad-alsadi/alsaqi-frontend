/**
 * Centralized frontend logger.
 * Wraps console methods to provide a single point of control for:
 * - Suppressing logs in production
 * - Future integration with error reporting services (Sentry, etc.)
 * - Consistent formatting
 */

const isDev = import.meta.env?.DEV ?? process.env.NODE_ENV !== 'production';

export const logger = {
  error(message: string, ...args: unknown[]) {
    if (isDev) {
      console.error(`[ERROR] ${message}`, ...args);
    }
    // In production, errors are already reported to /api/system-errors via the API interceptor.
    // This logger suppresses noisy console output in production builds.
  },

  warn(message: string, ...args: unknown[]) {
    if (isDev) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  },

  info(message: string, ...args: unknown[]) {
    if (isDev) {
      console.info(`[INFO] ${message}`, ...args);
    }
  },
};

export default logger;
