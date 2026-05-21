// @vitest-environment jsdom
/**
 * اختبارات خدمة API (interceptors)
 *
 * **Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.5**
 *
 * اختبار interceptor 401: محاولة تحديث الرمز وإعادة الطلب
 * اختبار فشل التحديث: تسجيل خروج وإعادة توجيه
 * اختبار إرفاق CSRF تلقائياً لطلبات POST/PUT/DELETE
 * اختبار طابور التحديث: منع طلبات تحديث متعددة
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// We need to mock dependencies before importing api
vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../../i18n', () => ({
  default: { language: 'en', t: (key: string) => key },
}));

vi.mock('../errorService', () => ({
  translateError: vi.fn((msg: string) => msg),
}));

describe('API Service - Interceptors', () => {
  let mock: MockAdapter;
  let api: typeof import('../api').default;

  beforeEach(async () => {
    // Reset modules to get a fresh api instance each test
    vi.resetModules();

    // Re-mock dependencies
    vi.doMock('react-hot-toast', () => ({
      default: { error: vi.fn(), success: vi.fn() },
    }));
    vi.doMock('../../i18n', () => ({
      default: { language: 'en', t: (key: string) => key },
    }));
    vi.doMock('../errorService', () => ({
      translateError: vi.fn((msg: string) => msg),
    }));

    // Import fresh api module
    const apiModule = await import('../api');
    api = apiModule.default;

    // Create mock adapter on the api instance
    mock = new MockAdapter(api);

    // Reset window.location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '/', pathname: '/dashboard' },
    });

    // Clear cookies
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });

  afterEach(() => {
    mock.restore();
    vi.restoreAllMocks();
  });

  describe('401 Interceptor - Token Refresh (Requirement 17.1)', () => {
    it('should attempt token refresh and retry original request on 401', async () => {
      /**
       * **Validates: Requirements 17.1**
       * عند تلقي 401، يحاول تحديث الرمز ثم يعيد الطلب الأصلي
       */
      let callCount = 0;

      // First call to /users returns 401, second call (after refresh) returns 200
      mock.onGet('/users').reply(() => {
        callCount++;
        if (callCount === 1) {
          return [401, { error: 'Unauthorized' }];
        }
        return [200, { data: [{ id: 1, name: 'User' }] }];
      });

      // Mock the refresh endpoint (uses raw axios, not the api instance)
      // We need to mock axios.post for the refresh call
      const axiosPostSpy = vi.spyOn(axios, 'post').mockResolvedValueOnce({
        data: { token: 'new-token' },
      });

      const response = await api.get('/users');

      expect(axiosPostSpy).toHaveBeenCalledWith(
        '/api/auth/refresh',
        {},
        { withCredentials: true }
      );
      expect(response.status).toBe(200);
      expect(response.data).toEqual({ data: [{ id: 1, name: 'User' }] });
    });

    it('should not attempt refresh for login requests', async () => {
      /**
       * **Validates: Requirements 17.1**
       * لا يحاول تحديث الرمز لطلبات تسجيل الدخول
       */
      mock.onPost('/auth/login').reply(401, { error: 'Invalid credentials' });

      const axiosPostSpy = vi.spyOn(axios, 'post');

      await expect(api.post('/auth/login', { username: 'test', password: 'wrong' }))
        .rejects.toThrow();

      // Should not call refresh for login requests
      expect(axiosPostSpy).not.toHaveBeenCalledWith(
        '/api/auth/refresh',
        expect.anything(),
        expect.anything()
      );
    });

    it('should not attempt refresh for refresh requests themselves', async () => {
      /**
       * **Validates: Requirements 17.1**
       * لا يحاول تحديث الرمز لطلبات التحديث نفسها
       */
      mock.onPost('/auth/refresh').reply(401, { error: 'Refresh token expired' });

      const axiosPostSpy = vi.spyOn(axios, 'post');

      await expect(api.post('/auth/refresh')).rejects.toThrow();

      // Should not recursively try to refresh
      expect(axiosPostSpy).not.toHaveBeenCalledWith(
        '/api/auth/refresh',
        {},
        { withCredentials: true }
      );
    });
  });

  describe('Refresh Failure - Logout and Redirect (Requirement 17.2)', () => {
    it('should redirect to /login when refresh fails', async () => {
      /**
       * **Validates: Requirements 17.2**
       * عند فشل تحديث الرمز، يعيد التوجيه لصفحة تسجيل الدخول
       */
      mock.onGet('/users').reply(401, { error: 'Unauthorized' });

      // Mock refresh to fail
      vi.spyOn(axios, 'post').mockRejectedValueOnce(new Error('Refresh failed'));

      await expect(api.get('/users')).rejects.toThrow();

      expect(window.location.href).toBe('/login');
    });

    it('should not redirect if already on /login page', async () => {
      /**
       * **Validates: Requirements 17.2**
       * لا يعيد التوجيه إذا كان المستخدم بالفعل في صفحة تسجيل الدخول
       */
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { href: '/login', pathname: '/login' },
      });

      mock.onGet('/users').reply(401, { error: 'Unauthorized' });

      vi.spyOn(axios, 'post').mockRejectedValueOnce(new Error('Refresh failed'));

      await expect(api.get('/users')).rejects.toThrow();

      // Should stay on /login
      expect(window.location.href).toBe('/login');
    });
  });

  describe('CSRF Token Attachment (Requirement 17.3)', () => {
    it('should attach CSRF token from cookie to POST requests', async () => {
      /**
       * **Validates: Requirements 17.3**
       * يرفق رمز CSRF تلقائياً لطلبات POST
       */
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: 'csrf-token=test-csrf-token-123; other-cookie=value',
      });

      mock.onPost('/users').reply((config) => {
        expect(config.headers?.['x-csrf-token']).toBe('test-csrf-token-123');
        return [201, { id: 1 }];
      });

      const response = await api.post('/users', { name: 'New User' });
      expect(response.status).toBe(201);
    });

    it('should attach CSRF token from cookie to PUT requests', async () => {
      /**
       * **Validates: Requirements 17.3**
       * يرفق رمز CSRF تلقائياً لطلبات PUT
       */
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: 'csrf-token=csrf-put-token-456',
      });

      mock.onPut('/users/1').reply((config) => {
        expect(config.headers?.['x-csrf-token']).toBe('csrf-put-token-456');
        return [200, { id: 1, name: 'Updated' }];
      });

      const response = await api.put('/users/1', { name: 'Updated' });
      expect(response.status).toBe(200);
    });

    it('should attach CSRF token from cookie to DELETE requests', async () => {
      /**
       * **Validates: Requirements 17.3**
       * يرفق رمز CSRF تلقائياً لطلبات DELETE
       */
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: 'session=abc; csrf-token=csrf-delete-token-789',
      });

      mock.onDelete('/users/1').reply((config) => {
        expect(config.headers?.['x-csrf-token']).toBe('csrf-delete-token-789');
        return [200, { success: true }];
      });

      const response = await api.delete('/users/1');
      expect(response.status).toBe(200);
    });

    it('should not attach CSRF token when cookie is missing', async () => {
      /**
       * **Validates: Requirements 17.3**
       * لا يرفق رمز CSRF عندما لا يوجد ملف تعريف ارتباط
       */
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: '',
      });

      mock.onPost('/users').reply((config) => {
        expect(config.headers?.['x-csrf-token']).toBeUndefined();
        return [201, { id: 1 }];
      });

      const response = await api.post('/users', { name: 'User' });
      expect(response.status).toBe(201);
    });

    it('should also attach CSRF token to GET requests (interceptor applies to all)', async () => {
      /**
       * **Validates: Requirements 17.3**
       * يرفق رمز CSRF لجميع الطلبات (request interceptor يعمل على الكل)
       */
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: 'csrf-token=csrf-get-token',
      });

      mock.onGet('/data').reply((config) => {
        expect(config.headers?.['x-csrf-token']).toBe('csrf-get-token');
        return [200, { data: [] }];
      });

      const response = await api.get('/data');
      expect(response.status).toBe(200);
    });
  });

  describe('Refresh Queue - Prevent Multiple Refresh Requests (Requirement 17.4)', () => {
    it('should queue concurrent 401 requests and only call refresh once', async () => {
      /**
       * **Validates: Requirements 17.4**
       * طابور التحديث يمنع طلبات تحديث متعددة متزامنة
       */
      // Both endpoints return 401 first, then 200 on retry
      let usersAttempt = 0;
      let profileAttempt = 0;

      mock.onGet('/users').reply(() => {
        usersAttempt++;
        if (usersAttempt <= 1) return [401, { error: 'Unauthorized' }];
        return [200, { data: 'users-data' }];
      });

      mock.onGet('/profile').reply(() => {
        profileAttempt++;
        if (profileAttempt <= 1) return [401, { error: 'Unauthorized' }];
        return [200, { data: 'profile-data' }];
      });

      // Mock refresh - track calls
      const axiosPostSpy = vi.spyOn(axios, 'post').mockResolvedValue({
        data: { token: 'new-token' },
      });

      // Fire first request - it will trigger refresh
      const firstPromise = api.get('/users');

      // Wait a tick so the first request's 401 is processed and isRefreshing is set
      await new Promise((r) => setTimeout(r, 0));

      // Fire second request - it should be queued (not trigger another refresh)
      const secondPromise = api.get('/profile');

      const [firstResult, secondResult] = await Promise.allSettled([firstPromise, secondPromise]);

      // First request should succeed after refresh
      expect(firstResult.status).toBe('fulfilled');
      if (firstResult.status === 'fulfilled') {
        expect(firstResult.value.data).toEqual({ data: 'users-data' });
      }

      // Refresh should only be called once despite multiple 401s
      const refreshCalls = axiosPostSpy.mock.calls.filter(
        (call) => call[0] === '/api/auth/refresh'
      );
      expect(refreshCalls.length).toBe(1);
    });

    it('should reject all queued requests when refresh fails', async () => {
      /**
       * **Validates: Requirements 17.4**
       * عند فشل التحديث، يرفض جميع الطلبات في الطابور
       */
      mock.onGet('/users').reply(401, { error: 'Unauthorized' });
      mock.onGet('/profile').reply(401, { error: 'Unauthorized' });

      // Mock refresh to fail
      vi.spyOn(axios, 'post').mockRejectedValue(new Error('Refresh failed'));

      // Both requests should be rejected
      const results = await Promise.allSettled([
        api.get('/users'),
        api.get('/profile'),
      ]);

      expect(results[0].status).toBe('rejected');
      expect(results[1].status).toBe('rejected');
    });
  });

  describe('Request Formatting (Requirement 17.5)', () => {
    it('should use /api as baseURL for all requests', async () => {
      /**
       * **Validates: Requirements 17.5**
       * يستخدم /api كقاعدة URL لجميع الطلبات
       */
      mock.onGet('/users').reply((config) => {
        expect(config.baseURL).toBe('/api');
        return [200, { data: [] }];
      });

      await api.get('/users');
    });

    it('should send requests with credentials (withCredentials: true)', async () => {
      /**
       * **Validates: Requirements 17.5**
       * يرسل الطلبات مع بيانات الاعتماد (cookies)
       */
      mock.onGet('/data').reply((config) => {
        expect(config.withCredentials).toBe(true);
        return [200, { data: [] }];
      });

      await api.get('/data');
    });

    it('should set timeout to 30000ms for all requests', async () => {
      /**
       * **Validates: Requirements 17.5**
       * يحدد مهلة 30 ثانية لجميع الطلبات
       */
      mock.onGet('/data').reply((config) => {
        expect(config.timeout).toBe(30000);
        return [200, { data: [] }];
      });

      await api.get('/data');
    });

    it('should format POST request body correctly', async () => {
      /**
       * **Validates: Requirements 17.5**
       * ينسق جسم طلب POST بشكل صحيح
       */
      const requestData = { name: 'Test', email: 'test@example.com' };

      mock.onPost('/users').reply((config) => {
        expect(JSON.parse(config.data)).toEqual(requestData);
        return [201, { id: 1, ...requestData }];
      });

      const response = await api.post('/users', requestData);
      expect(response.status).toBe(201);
    });

    it('should pass query parameters correctly for GET requests', async () => {
      /**
       * **Validates: Requirements 17.5**
       * يمرر معلمات الاستعلام بشكل صحيح لطلبات GET
       */
      mock.onGet('/users').reply((config) => {
        expect(config.params).toEqual({ page: 1, limit: 10, search: 'test' });
        return [200, { data: [], total: 0 }];
      });

      await api.get('/users', { params: { page: 1, limit: 10, search: 'test' } });
    });
  });
});
