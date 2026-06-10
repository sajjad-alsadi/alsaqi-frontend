/**
 * Raw HTTP Client Export (Backward Compatibility)
 *
 * Exports the underlying Axios instance from the API client for components
 * that still use direct `api.get()`, `api.post()` patterns.
 *
 * New code should prefer the typed API client (import { api } from '@/api')
 * or React Query hooks (import { useFindings } from '@/api/hooks/useFindings').
 *
 * @example
 * // Legacy pattern (still supported):
 * import api from '../api/httpClient';
 * const res = await api.get('/endpoint');
 *
 * // Preferred pattern:
 * import { api } from '../api';
 * const findings = await api.findings.list();
 */
import { createApiClient } from './client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env = (import.meta as any).env as Record<string, string> | undefined;

const client = createApiClient({
  baseUrl: env?.['VITE_API_URL'] || '/api',
  timeout: 30000,
  onUnauthorized: () => {
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  },
  onError: (error) => {
    console.error('[API Error]', error.type, error.url, error.reason);
  },
});

/**
 * The raw Axios instance with all interceptors configured.
 * Drop-in replacement for the old services/api.ts default export.
 */
const api = client.http;

export default api;
