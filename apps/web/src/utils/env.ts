/**
 * Environment variable accessor.
 * Centralizes access to import.meta.env for easier testing.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env = (import.meta as any).env as Record<string, string> | undefined;

export function getEnvVar(key: string): string | undefined {
  return env?.[key] || undefined;
}

export function getAppVersion(): string {
  return getEnvVar('VITE_APP_VERSION') || 'unknown';
}

export function getErrorReportUrl(): string {
  return getEnvVar('VITE_ERROR_REPORT_URL') || '/api/system-errors';
}
