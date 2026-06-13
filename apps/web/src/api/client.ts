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
import { unwrapEnvelope, readEnvelopeMeta, type EnvelopeMeta } from './utils/envelope';

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

/**
 * Config flag that opts a mutation into idempotency-safe retries. When `true`,
 * the client attaches a stable `Idempotency-Key` (reused across attempts) so the
 * mutation becomes retry-eligible. Mutations without a key are attempted once.
 */
export type MutationRequestConfig = AxiosRequestConfig & { idempotent?: boolean };

export interface ApiClient {
  /** The underlying Axios instance (for module sub-clients to use) */
  readonly http: AxiosInstance;
  /** Make a typed GET request with Zod validation */
  get<T>(url: string, schema: z.ZodType<T>, config?: AxiosRequestConfig): Promise<T>;
  /**
   * Make a typed GET request with Zod validation that ALSO surfaces the server
   * `Response_Envelope` meta block (e.g. `meta.pagination`). The response
   * interceptor discards `meta` from `response.data` after unwrapping; this
   * method returns it alongside the validated payload so callers can drive
   * pagination from server totals rather than the page array length.
   */
  getWithMeta<T>(
    url: string,
    schema: z.ZodType<T>,
    config?: AxiosRequestConfig
  ): Promise<{ data: T; meta: EnvelopeMeta | undefined }>;
  /** Make a typed POST request with Zod validation */
  post<T>(url: string, schema: z.ZodType<T>, data?: unknown, config?: MutationRequestConfig): Promise<T>;
  /** Make a typed PUT request with Zod validation */
  put<T>(url: string, schema: z.ZodType<T>, data?: unknown, config?: MutationRequestConfig): Promise<T>;
  /** Make a typed PATCH request with Zod validation */
  patch<T>(url: string, schema: z.ZodType<T>, data?: unknown, config?: MutationRequestConfig): Promise<T>;
  /** Make a typed DELETE request with Zod validation */
  delete<T>(url: string, schema: z.ZodType<T>, config?: MutationRequestConfig): Promise<T>;
}

/**
 * Fields stored on a request config so a retried request reuses the same stable
 * identifiers across every attempt. Stored under `__`-prefixed keys so they are
 * carried through Axios's config merge but never collide with real options.
 */
export interface CorrelationFields {
  /** x-correlation-id, generated once and stable across all attempts. */
  __correlationId?: string;
  /** Idempotency-Key for mutations, stable across all attempts when present. */
  __idempotencyKey?: string;
  /** 0-based count of retries already performed; bounded by MAX_RETRY_ATTEMPTS. */
  __retryCount?: number;
  /**
   * Marks a request that has already been retried once after a 401 token
   * refresh, so the response interceptor never enters an infinite refresh loop.
   */
  __isRetryAfterRefresh?: boolean;
}

/** An in-flight (internal) request config carrying stable correlation identifiers. */
export interface CorrelatedRequestConfig extends InternalAxiosRequestConfig, CorrelationFields {}

/**
 * An Axios response augmented with the captured envelope `meta` block. The
 * success interceptor stashes `meta` here before unwrapping `response.data`, so
 * `getWithMeta` can return server pagination totals to callers.
 */
type MetaCarryingResponse = AxiosResponse & { meta?: EnvelopeMeta | undefined };

/** A caller-supplied request config augmented with correlation identifiers. */
type CorrelatedClientConfig = AxiosRequestConfig & CorrelationFields;

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 30_000;
/**
 * Maximum number of attempts (initial try + retries) for a retriable request.
 * Shared with the raw-axios retry interceptor in `httpClient.ts` so both retry
 * paths stay bounded by the same limit.
 */
export const MAX_RETRY_ATTEMPTS = 3;
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
 * Generate a stable Idempotency-Key for a mutation. Uses the same UUID v4
 * generator as correlation IDs; the value is generated once per logical request
 * and reused on every retry attempt so the server can deduplicate retries.
 */
function generateIdempotencyKey(): string {
  return generateCorrelationId();
}

/** HTTP methods that mutate server state and therefore require an idempotency key to be retried. */
const MUTATION_METHODS = new Set(['post', 'put', 'patch', 'delete']);

/**
 * Determine whether a request may be retried.
 *
 * GET/HEAD (and any non-mutation method) are always retry-eligible because they
 * are inherently idempotent. Mutations (POST/PUT/PATCH/DELETE) are only eligible
 * when they carry a stable `Idempotency-Key`, so a retried mutation can be safely
 * deduplicated by the server and never creates duplicate records (Req 1.1, 1.2).
 */
function isRetryEligible(config: CorrelatedClientConfig): boolean {
  const method = (config.method ?? 'get').toLowerCase();
  if (!MUTATION_METHODS.has(method)) return true;
  return typeof config.__idempotencyKey === 'string';
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
 *
 * Exported so the raw-axios retry interceptor in `httpClient.ts` (and its
 * property tests) can reuse the exact same classification logic: an error is
 * retriable if and only if it is an Axios network error (no response received)
 * or carries a status in the 500–599 range. All other errors (including 4xx
 * such as 401, which is handled by the refresh flow) are not retriable.
 */
export function isRetriableError(error: unknown): boolean {
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
 * DOM event name broadcast immediately before any version-mismatch reload.
 *
 * Form components driven by `useFormAutosave` listen for this event and flush a
 * `draft_*` snapshot of their current (possibly still-debounced) data to
 * localStorage synchronously, so unsaved work survives the reload (Req 25.2).
 */
export const PERSIST_DRAFTS_EVENT = 'app:persist-drafts';

/**
 * Ask any listening form to persist its unsaved data as a `draft_*` snapshot
 * before the page reloads. `useFormAutosave` debounces its writes, so a snapshot
 * may not yet exist in localStorage when the user chooses to reload; dispatching
 * this event lets each autosave-backed form flush synchronously first (Req 25.2).
 */
function persistDraftsBeforeReload(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PERSIST_DRAFTS_EVENT));
}

/**
 * Remove the version-mismatch overlay from the DOM and reset the shown flag so a
 * subsequent mismatch can surface the overlay again. Backs the "later" option,
 * which lets the user keep working instead of being forced to reload (Req 25.1).
 */
function dismissVersionMismatchOverlay(): void {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('api-version-mismatch-overlay');
  existing?.remove();
  versionMismatchShown = false;
}

/**
 * Display a notification when API version mismatch is detected.
 * This uses a DOM-based approach to avoid dependency on specific UI libraries.
 *
 * The overlay offers two non-destructive choices: reload now (which first
 * broadcasts {@link PERSIST_DRAFTS_EVENT} so unsaved form data is snapshotted to
 * a `draft_*` key before navigation), or "later" — which dismisses the overlay
 * and lets the user keep working (Req 25.1, 25.2).
 *
 * Exported (named) so the security behavior of the buttons — built with
 * `document.createElement` + `addEventListener` rather than `innerHTML` with an
 * inline `onclick` — can be unit tested directly without an HTTP round-trip.
 */
export function showVersionMismatchNotification(): void {
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
  const heading = document.createElement('h2');
  heading.style.cssText = 'margin: 0 0 12px; font-size: 18px; font-weight: 600;';
  heading.textContent = 'تحديث متوفر';

  const message = document.createElement('p');
  message.style.cssText = 'margin: 0 0 20px; color: #555; font-size: 14px;';
  message.textContent = 'يوجد إصدار جديد من التطبيق. يرجى تحديث الصفحة للحصول على آخر التحديثات.';

  const reloadButton = document.createElement('button');
  reloadButton.style.cssText = `
    background: #2563eb;
    color: white;
    border: none;
    padding: 10px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
  `;
  reloadButton.textContent = 'تحديث الصفحة';
  reloadButton.addEventListener('click', () => {
    // Persist any unsaved form data as a draft_* snapshot BEFORE navigating away,
    // so an update notice never discards work in progress (Req 25.2).
    persistDraftsBeforeReload();
    window.location.reload();
  });

  // "Later" option: dismiss the overlay and keep working instead of reloading
  // (Req 25.1). Resets the shown flag so a future mismatch can surface again.
  const laterButton = document.createElement('button');
  laterButton.style.cssText = `
    background: transparent;
    color: #555;
    border: none;
    padding: 10px 24px;
    margin-right: 8px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
  `;
  laterButton.textContent = 'لاحقًا';
  laterButton.addEventListener('click', () => {
    // Snapshot unsaved work even when dismissing, in case the user reloads later
    // by other means before saving (Req 25.2).
    persistDraftsBeforeReload();
    dismissVersionMismatchOverlay();
  });

  const actions = document.createElement('div');
  actions.style.cssText = 'display: flex; justify-content: center; gap: 0;';
  actions.appendChild(laterButton);
  actions.appendChild(reloadButton);

  dialog.appendChild(heading);
  dialog.appendChild(message);
  dialog.appendChild(actions);

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
    const cfg = requestConfig as CorrelatedRequestConfig;

    // Attach CSRF token
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      cfg.headers['x-csrf-token'] = csrfToken;
    }

    // Attach a stable correlation ID. Reuse the value stored on the config (set
    // by requestWithRetry before the first attempt) so every retry of the same
    // logical request carries the same x-correlation-id. Direct callers that
    // bypass requestWithRetry get a fresh ID generated here.
    if (!cfg.__correlationId) {
      cfg.__correlationId = generateCorrelationId();
    }
    cfg.headers['x-correlation-id'] = cfg.__correlationId;

    // For mutations opted into idempotent retry, attach the stable
    // Idempotency-Key. The same value is reused on every attempt so the server
    // can deduplicate retried mutations (Req 1.3, 1.5).
    if (cfg.__idempotencyKey) {
      cfg.headers['Idempotency-Key'] = cfg.__idempotencyKey;
    }

    return requestConfig;
  });

  // ─── Response Interceptor ─────────────────────────────────────────────────

  http.interceptors.response.use(
    (response: AxiosResponse) => {
      // Check X-API-Version header for mismatch
      checkVersionMismatch(response);

      // Capture the envelope meta (e.g. meta.pagination) BEFORE unwrapping, since
      // unwrapEnvelope replaces response.data with the inner data and discards meta.
      (response as MetaCarryingResponse).meta = readEnvelopeMeta(response.data);

      // Unwrap the response envelope: { success: true, data: T, meta: ... } → T
      response.data = unwrapEnvelope(response.data);

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
        !(originalRequest as CorrelatedRequestConfig).__isRetryAfterRefresh
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
          (originalRequest as CorrelatedRequestConfig).__isRetryAfterRefresh = true;
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
    config: CorrelatedClientConfig,
    requestFn: (config: CorrelatedClientConfig) => Promise<AxiosResponse<T>>
  ): Promise<AxiosResponse<T>> {
    let lastError: unknown;

    // Generate the correlation ID once, on the persistent config object, so the
    // request interceptor reuses it on every attempt (Req 1.4). The config is
    // the same object passed to Axios on each retry, so the value is stable.
    if (!config.__correlationId) {
      config.__correlationId = generateCorrelationId();
    }

    // A mutation is only retried when it carries an idempotency key; GET/HEAD are
    // always eligible. Evaluated once: eligibility does not change across attempts.
    const eligible = isRetryEligible(config);

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      config.__retryCount = attempt - 1;
      try {
        return await requestFn(config);
      } catch (error) {
        lastError = error;

        // Retry only when the request is retry-eligible AND the error is retriable
        // (network error or 5xx). A non-eligible mutation is attempted exactly once.
        if (!eligible || !isRetriableError(error)) {
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

  // ─── Config Preparation ───────────────────────────────────────────────────

  /**
   * Build a correlated config for a request, tagging it with the HTTP method so
   * retry eligibility can be evaluated. For idempotent mutations, generate a
   * stable Idempotency-Key (stored on the config and reused across attempts).
   */
  function prepareConfig(
    method: string,
    reqConfig?: MutationRequestConfig
  ): CorrelatedClientConfig {
    const { idempotent, ...rest } = reqConfig ?? {};
    const cfg: CorrelatedClientConfig = { ...rest, method };
    if (idempotent && MUTATION_METHODS.has(method)) {
      cfg.__idempotencyKey = generateIdempotencyKey();
    }
    return cfg;
  }

  // ─── Typed Request Methods ────────────────────────────────────────────────

  const client: ApiClient = {
    http,

    async get<T>(url: string, schema: z.ZodType<T>, reqConfig?: AxiosRequestConfig): Promise<T> {
      const cfg = prepareConfig('get', reqConfig);
      const response = await requestWithRetry(cfg, (c) => http.get(url, c));
      return validateResponse(response.data, schema);
    },

    async getWithMeta<T>(
      url: string,
      schema: z.ZodType<T>,
      reqConfig?: AxiosRequestConfig
    ): Promise<{ data: T; meta: EnvelopeMeta | undefined }> {
      const cfg = prepareConfig('get', reqConfig);
      const response = await requestWithRetry(cfg, (c) => http.get(url, c));
      const data = validateResponse(response.data, schema);
      const meta = (response as MetaCarryingResponse).meta;
      return { data, meta };
    },

    async post<T>(
      url: string,
      schema: z.ZodType<T>,
      data?: unknown,
      reqConfig?: MutationRequestConfig
    ): Promise<T> {
      const cfg = prepareConfig('post', reqConfig);
      const response = await requestWithRetry(cfg, (c) => http.post(url, data, c));
      return validateResponse(response.data, schema);
    },

    async put<T>(
      url: string,
      schema: z.ZodType<T>,
      data?: unknown,
      reqConfig?: MutationRequestConfig
    ): Promise<T> {
      const cfg = prepareConfig('put', reqConfig);
      const response = await requestWithRetry(cfg, (c) => http.put(url, data, c));
      return validateResponse(response.data, schema);
    },

    async patch<T>(
      url: string,
      schema: z.ZodType<T>,
      data?: unknown,
      reqConfig?: MutationRequestConfig
    ): Promise<T> {
      const cfg = prepareConfig('patch', reqConfig);
      const response = await requestWithRetry(cfg, (c) => http.patch(url, data, c));
      return validateResponse(response.data, schema);
    },

    async delete<T>(url: string, schema: z.ZodType<T>, reqConfig?: MutationRequestConfig): Promise<T> {
      const cfg = prepareConfig('delete', reqConfig);
      const response = await requestWithRetry(cfg, (c) => http.delete(url, c));
      return validateResponse(response.data, schema);
    },
  };

  return client;
}
