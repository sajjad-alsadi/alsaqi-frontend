import axios from 'axios';
import toast from 'react-hot-toast';
import i18n from '../i18n';
import { translateError } from './errorService';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 30000, // 30 second timeout for all requests
});

api.interceptors.request.use((config) => {
  // Attach CSRF token from cookie to request header
  const csrfToken = document.cookie
    .split('; ')
    .find(row => row.startsWith('csrf-token='))
    ?.split('=')[1];
  if (csrfToken) {
    config.headers['x-csrf-token'] = csrfToken;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: { resolve: (value?: unknown) => void; reject: (reason?: unknown) => void }[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response, message } = error;
    const originalRequest = config;
    
    // Don't log 401 on GET /profile or GET /auth/me as it's expected during initial session check
    const isSessionCheck = (response?.status === 401 || response?.status === 403) && config?.method === 'get' && (config?.url?.includes('/profile') || config?.url?.includes('/auth/me'));
    const isRefreshRequest = config?.url?.includes('/auth/refresh');
    const isLoginRequest = config?.url?.includes('/auth/login');
    const isAuthRequest = config?.url?.includes('/auth/');
    
    if (!isSessionCheck && response?.status === 401 && !isRefreshRequest && !isLoginRequest) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => {
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      isRefreshing = true;

      try {
        await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (!isSessionCheck) {
      const errorData = response?.data?.error;
      const errorMessage = typeof errorData === 'object' ? errorData.message : (errorData || response?.data?.message || message);
      const translatedMsg = translateError(errorMessage, i18n.language as 'ar' | 'en');
      
      if (response?.status === 503) {
        toast.error(i18n.t('serverStarting'));
      } else if (message === 'Network Error') {
        toast.error(i18n.t('networkError'));
      } else if (response?.status === 413) {
        toast.error(i18n.t('fileTooLarge'));
      } else if (response?.status === 429) {
        toast.error(translatedMsg || i18n.t('auth.tooManyAttempts'));
      } else if (response?.status === 400) {
        toast.error(translatedMsg || i18n.t('invalidRequest'));
      } else if (response?.status === 403) {
        const errorCode = typeof errorData === 'object' ? errorData.code : response?.data?.code;
        if (errorCode === 'PASSWORD_CHANGE_REQUIRED') {
          // Don't show toast for auth requests (handled by the calling component)
          if (!isAuthRequest && window.location.pathname !== '/login' && window.location.pathname !== '/') {
            toast.error(translatedMsg || i18n.t('passwordChangeRequired'));
            window.location.href = '/login';
          }
        } else if (!isAuthRequest) {
          toast.error(translatedMsg || i18n.t('accessDenied'));
        }
      } else if (response?.status === 404) {
        toast.error(i18n.t('resourceNotFound'));
      } else if (response?.status >= 500) {
        toast.error(translatedMsg || i18n.t('internalServerError'));
      }

      // Log error to backend if it's not a 401 or 503 (batched to prevent flooding)
      if (response?.status !== 401 && response?.status !== 503 && config?.url !== '/system-errors' && message !== 'Network Error') {
      try {
        // Use requestIdleCallback or setTimeout to avoid blocking the UI
        const logPayload = {
          message: `Frontend API Error: ${errorMessage}`,
          stack: `URL: ${config?.url} | Status: ${response?.status}`,
          module: 'Frontend-API',
          severity: 'error',
          user_agent: navigator.userAgent,
          url: window.location.href,
          request_data: {
            method: config?.method,
            url: config?.url,
          }
        };
        
        // Debounce error logging to prevent flooding
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => {
            axios.post('/api/system-errors', logPayload, { withCredentials: true }).catch(() => {});
          });
        } else {
          setTimeout(() => {
            axios.post('/api/system-errors', logPayload, { withCredentials: true }).catch(() => {});
          }, 100);
        }
      } catch (logErr) {
        // Silently fail if logging fails to avoid infinite loops
      }
    }
  }

    return Promise.reject(error);
  }
);

export default api;
