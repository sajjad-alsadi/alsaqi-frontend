/**
 * API Client Infrastructure
 *
 * Creates a fully-typed API client with:
 * - CSRF token auto-attachment from cookies
 * - Correlation ID (UUID v4) generation per request
 * - 401 interception with single token refresh retry
 * - Exponential backoff retry (1s, 2s, 4s) for network failures and 5xx errors
 * - X-API-Version mismatch detection with non-dismissible notification
 * - Zod response validation on all API responses
 */
import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { z } from 'zod';
import { API_VERSION, type ApiError } from '@alsaqi/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiClientConfig {
  baseUrl: string;
  timeout?: number;
  onUnauthorized?: () => void;
  onError?: (error: ApiClientError) => void;
}

export interface ApiClientError {
  type: 'timeout' | 'connection' | 'server_error' | 'validation' | 'unknown';
  url: string;
  attempts: number;
  reason: string;
  status?: number | undefined;
}

export interface ApiClient {
  /** The underlying Axios instance (for module sub-clients to use) */
  readonly http: AxiosInstance;
  /** Make a typed GET request with Zod validation */
  get<T>(url: string, schema: z.ZodType<T>, config?: AxiosRequestConfig): Promise<T>;
  /** Make a typed POST request with Zod validation */
  post<T>(url: string, schema: z.ZodType<T>, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  /** Make a typed PUT request with Zod validation */
  put<T>(url: string, schema: z.ZodType<T>, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  /** Make a typed PATCH request with Zod validation */
  patch<T>(url: string, schema: z.ZodType<T>, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  /** Make a typed DELETE request with Zod validation */
  delete<T>(url: string, schema: z.ZodType<T>, config?: AxiosRequestConfig): Promise<T>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 30_000;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MULTIPLIER = 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a UUID v4 string for correlation IDs.
 * Uses crypto.randomUUID when available, falls back to manual generation.
 */
function generateCorrelationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Read CSRF token from the 'csrf-token' cookie.
 */
function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrf-token='));
  return match?.split('=')[1];
}

/**
 * Compare major.minor versions, ignoring patch.
 * Returns true if they match.
 */
function isMajorMinorMatch(clientVersion: string, serverVersion: string): boolean {
  const [cMajor, cMinor] = clientVersion.split('.').map(Number);
  const [sMajor, sMinor] = serverVersion.split('.').map(Number);
  return cMajor === sMajor && cMinor === sMinor;
}

/**
 * Check if an error is a network error or 5xx server error (retriable).
 */
function isRetriableError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;

  // Network errors (no response received)
  if (!error.response) return true;

  // 5xx server errors
  const status = error.response.status;
  return status >= 500 && status < 600;
}

/**
 * Check if a request is a token refresh request.
 */
function isRefreshRequest(config: InternalAxiosRequestConfig | undefined): boolean {
  return config?.url?.includes('/auth/refresh') ?? false;
}

/**
 * Calculate exponential backoff delay: base * multiplier^(attempt-1)
 * Attempt 1: 1000ms, Attempt 2: 2000ms, Attempt 3: 4000ms
 */
function getRetryDelay(attempt: number): number {
  return RETRY_BASE_DELAY_MS * Math.pow(RETRY_MULTIPLIER, attempt - 1);
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Version Mismatch Notification ────────────────────────────────────────────

let versionMismatchShown = false;

/**
 * Display a non-dismissible notification when API version mismatch is detected.
 * This uses a DOM-based approach to avoid dependency on specific UI libraries.
 */
function showVersionMismatchNotification(): void {
  if (versionMismatchShown) return;
  versionMismatchShown = true;

  if (typeof document === 'undefined') return;

  const overlay = document.createElement('div');
  overlay.id = 'api-version-mismatch-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
  `;

  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: white;
    border-radius: 8px;
    padding: 24px 32px;
    max-width: 400px;
    text-align: center;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
  `;
  dialog.innerHTML = `
    <h2 style="margin: 0 0 12px; font-size: 18px; font-weight: 600;">تحديث متوفر</h2>
    <p style="margin: 0 0 20px; color: #555; font-size: 14px;">
      يوجد إصدار جديد من التطبيق. يرجى تحديث الصفحة للحصول على آخر التحديثات.
    </p>
    <button onclick="window.location.reload()" style="
      background: #2563eb;
      color: white;
      border: none;
      padding: 10px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    ">تحديث الصفحة</button>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}

// ─── Token Refresh State ──────────────────────────────────────────────────────

let isRefreshing = false;
let refreshSubscribers: Array<{
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}> = [];

function subscribeToTokenRefresh(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    refreshSubscribers.push({ resolve, reject });
  });
}

function onRefreshComplete(error: unknown): void {
  refreshSubscribers.forEach((subscriber) => {
    if (error) {
      subscriber.reject(error);
    } else {
      subscriber.resolve(undefined);
    }
  });
  refreshSubscribers = [];
}

// ─── Main Factory ─────────────────────────────────────────────────────────────

/**
 * Create a fully-typed API client with all interceptors configured.
 *
 * @param config - API client configuration
 * @returns Typed API client with module sub-client support
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  const { baseUrl, timeout = DEFAULT_TIMEOUT, onUnauthorized, onError } = config;

  // Create Axios instance
  const http = axios.create({
    baseURL: baseUrl,
    timeout,
    withCredentials: true,
  });

  // ─── Request Interceptor ──────────────────────────────────────────────────

  http.interceptors.request.use((requestConfig) => {
    // Attach CSRF token
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      requestConfig.headers['x-csrf-token'] = csrfToken;
    }

    // Attach correlation ID
    requestConfig.headers['x-correlation-id'] = generateCorrelationId();

    return requestConfig;
  });

  // ─── Response Interceptor ─────────────────────────────────────────────────

  http.interceptors.response.use(
    (response: AxiosResponse) => {
      // Check X-API-Version header for mismatch
      checkVersionMismatch(response);

      // Unwrap the response envelope: { success: true, data: T, meta: ... } → T
      if (
        response.data &&
        typeof response.data === 'object' &&
        'success' in response.data &&
        response.data.success === true &&
        'data' in response.data
      ) {
        response.data = response.data.data;
      }

      return response;
    },
    async (error) => {
      if (!axios.isAxiosError(error)) {
        return Promise.reject(error);
      }

      const originalRequest = error.config;

      // Check version mismatch on error responses too
      if (error.response) {
        checkVersionMismatch(error.response);
      }

      // ─── 401 Handling with Token Refresh ────────────────────────────────

      if (
        error.response?.status === 401 &&
        originalRequest &&
        !isRefreshRequest(originalRequest) &&
        !(originalRequest as any).__isRetryAfterRefresh
      ) {
        if (isRefreshing) {
          // Wait for the in-progress refresh to complete, then retry
          try {
            await subscribeToTokenRefresh();
            return http(originalRequest);
          } catch {
            return Promise.reject(error);
          }
        }

        isRefreshing = true;

        try {
          await axios.post(`${baseUrl}/auth/refresh`, {}, { withCredentials: true });
          onRefreshComplete(null);

          // Retry the original request exactly once
          (originalRequest as any).__isRetryAfterRefresh = true;
          return http(originalRequest);
        } catch (refreshError) {
          onRefreshComplete(refreshError);
          onUnauthorized?.();
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      return Promise.reject(error);
    }
  );

  // ─── Version Mismatch Check ─────────────────────────────────────────────

  function checkVersionMismatch(response: AxiosResponse): void {
    const serverVersion = response.headers['x-api-version'];
    if (serverVersion && !isMajorMinorMatch(API_VERSION, serverVersion)) {
      showVersionMismatchNotification();
    }
  }

  // ─── Retry Logic with Exponential Backoff ─────────────────────────────────

  async function requestWithRetry<T>(
    requestFn: () => Promise<AxiosResponse<T>>
  ): Promise<AxiosResponse<T>> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;

        // Only retry on network errors or 5xx
        if (!isRetriableError(error)) {
          throw error;
        }

        // Don't retry if this is the last attempt
        if (attempt === MAX_RETRY_ATTEMPTS) {
          break;
        }

        // Wait with exponential backoff before retrying
        await sleep(getRetryDelay(attempt));
      }
    }

    // All attempts failed — invoke onError callback
    if (axios.isAxiosError(lastError)) {
      const errorType: ApiClientError['type'] = !lastError.response
        ? lastError.code === 'ECONNABORTED'
          ? 'timeout'
          : 'connection'
        : 'server_error';

      onError?.({
        type: errorType,
        url: lastError.config?.url ?? 'unknown',
        attempts: MAX_RETRY_ATTEMPTS,
        reason: lastError.message,
        status: lastError.response?.status,
      });
    }

    throw lastError;
  }

  // ─── Zod Response Validation ──────────────────────────────────────────────

  function validateResponse<T>(data: unknown, schema: z.ZodType<T>): T {
    return schema.parse(data);
  }

  // ─── Typed Request Methods ────────────────────────────────────────────────

  const client: ApiClient = {
    http,

    async get<T>(url: string, schema: z.ZodType<T>, reqConfig?: AxiosRequestConfig): Promise<T> {
      const response = await requestWithRetry(() => http.get(url, reqConfig));
      return validateResponse(response.data, schema);
    },

    async post<T>(
      url: string,
      schema: z.ZodType<T>,
      data?: unknown,
      reqConfig?: AxiosRequestConfig
    ): Promise<T> {
      const response = await requestWithRetry(() => http.post(url, data, reqConfig));
      return validateResponse(response.data, schema);
    },

    async put<T>(
      url: string,
      schema: z.ZodType<T>,
      data?: unknown,
      reqConfig?: AxiosRequestConfig
    ): Promise<T> {
      const response = await requestWithRetry(() => http.put(url, data, reqConfig));
      return validateResponse(response.data, schema);
    },

    async patch<T>(
      url: string,
      schema: z.ZodType<T>,
      data?: unknown,
      reqConfig?: AxiosRequestConfig
    ): Promise<T> {
      const response = await requestWithRetry(() => http.patch(url, data, reqConfig));
      return validateResponse(response.data, schema);
    },

    async delete<T>(url: string, schema: z.ZodType<T>, reqConfig?: AxiosRequestConfig): Promise<T> {
      const response = await requestWithRetry(() => http.delete(url, reqConfig));
      return validateResponse(response.data, schema);
    },
  };

  return client;
}
