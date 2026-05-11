import axios from 'axios';
import toast from 'react-hot-toast';
import i18n from '../i18n';
import { translateError } from './errorService';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  return config;
});

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
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
    const isSessionCheck = response?.status === 401 && config?.method === 'get' && (config?.url?.includes('/profile') || config?.url?.includes('/auth/me'));
    const isRefreshRequest = config?.url?.includes('/auth/refresh');
    const isLoginRequest = config?.url?.includes('/auth/login');
    
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
      
      if (response?.status === 503) {
        toast.error(i18n.t('serverStarting'));
      } else if (message === 'Network Error') {
        toast.error(i18n.t('networkError'));
      } else if (response?.status === 413) {
        toast.error(i18n.t('fileTooLarge'));
      } else if (response?.status === 400) {
        toast.error(translateError(errorMessage, i18n.language as 'ar' | 'en') || i18n.t('invalidRequest'));
      } else if (response?.status === 403) {
        toast.error(i18n.t('accessDenied'));
      } else if (response?.status === 404) {
        toast.error(i18n.t('resourceNotFound'));
      } else if (response?.status >= 500) {
        toast.error(i18n.t('internalServerError'));
      }

      // Log error to backend if it's not a 401 or 503
      if (response?.status !== 401 && response?.status !== 503 && config?.url !== '/system-errors' && message !== 'Network Error') {
      try {
        await axios.post('/api/system-errors', {
          message: `Frontend API Error: ${errorMessage}`,
          stack: `URL: ${config?.url} | Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`,
          module: 'Frontend-API',
          severity: 'error',
          user_agent: navigator.userAgent,
          url: window.location.href,
          request_data: {
            method: config?.method,
            url: config?.url,
            params: config?.params,
            data: config?.data
          }
        }, {
          withCredentials: true
        });
      } catch (logErr) {
        // Silently fail if logging fails to avoid infinite loops
      }
    }
  }

    return Promise.reject(error);
  }
);

export default api;
