/**
 * Unit tests for the API client infrastructure.
 * Tests CSRF token attachment, correlation ID, 401 refresh, retry logic,
 * version mismatch detection, and Zod response validation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { z } from 'zod';
import { createApiClient, type ApiClientConfig, type ApiClientError } from './client';

// We need to mock axios.create to return our own instance so we can intercept
// Since createApiClient creates its own instance, we'll test behavior through it.

describe('createApiClient', () => {
  let mockAdapter: MockAdapter;
  let onUnauthorized: ReturnType<typeof vi.fn>;
  let onError: ReturnType<typeof vi.fn>;
  let config: ApiClientConfig;

  beforeEach(() => {
    onUnauthorized = vi.fn();
    onError = vi.fn();
    config = {
      baseUrl: 'http://localhost:3000/api',
      timeout: 5000,
      onUnauthorized,
      onError,
    };

    // Reset DOM state
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'csrf-token=test-csrf-token-123',
    });

    // Remove version mismatch overlay if exists
    const overlay = document.getElementById('api-version-mismatch-overlay');
    if (overlay) overlay.remove();
  });

  afterEach(() => {
    if (mockAdapter) {
      mockAdapter.restore();
    }
    vi.restoreAllMocks();
  });

  describe('CSRF Token Attachment', () => {
    it('should attach csrf-token from cookie as x-csrf-token header', async () => {
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);

      mockAdapter.onGet('/test').reply((reqConfig) => {
        expect(reqConfig.headers?.['x-csrf-token']).toBe('test-csrf-token-123');
        return [200, { success: true, data: 'ok', meta: { requestId: '123', timestamp: new Date().toISOString(), version: '1.0.0' } }];
      });

      await client.get('/test', z.string());
    });

    it('should not attach csrf token if cookie is absent', async () => {
      Object.defineProperty(document, 'cookie', { writable: true, value: '' });
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);

      mockAdapter.onGet('/test').reply((reqConfig) => {
        expect(reqConfig.headers?.['x-csrf-token']).toBeUndefined();
        return [200, { success: true, data: 'ok', meta: { requestId: '123', timestamp: new Date().toISOString(), version: '1.0.0' } }];
      });

      await client.get('/test', z.string());
    });
  });

  describe('Correlation ID Generation', () => {
    it('should attach a unique x-correlation-id header on each request', async () => {
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);
      const correlationIds: string[] = [];

      mockAdapter.onGet('/test').reply((reqConfig) => {
        correlationIds.push(reqConfig.headers?.['x-correlation-id'] as string);
        return [200, { success: true, data: 'ok', meta: { requestId: '123', timestamp: new Date().toISOString(), version: '1.0.0' } }];
      });

      await client.get('/test', z.string());
      await client.get('/test', z.string());

      expect(correlationIds).toHaveLength(2);
      expect(correlationIds[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
      expect(correlationIds[0]).not.toBe(correlationIds[1]);
    });
  });

  describe('Response Unwrapping', () => {
    it('should unwrap the standard ApiResponse envelope before Zod validation', async () => {
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);

      const envelope = {
        success: true,
        data: { id: 1, name: 'Test' },
        meta: {
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      };

      mockAdapter.onGet('/items/1').reply(200, envelope);

      const schema = z.object({ id: z.number(), name: z.string() });
      const result = await client.get('/items/1', schema);

      expect(result).toEqual({ id: 1, name: 'Test' });
    });
  });

  describe('Zod Response Validation', () => {
    it('should throw ZodError when response data does not match schema', async () => {
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);

      mockAdapter.onGet('/items/1').reply(200, {
        success: true,
        data: { id: 'not-a-number', name: 123 },
        meta: {
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      });

      const schema = z.object({ id: z.number(), name: z.string() });

      await expect(client.get('/items/1', schema)).rejects.toThrow();
    });

    it('should validate and return data when schema matches', async () => {
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);

      mockAdapter.onGet('/users').reply(200, {
        success: true,
        data: [{ id: 1, email: 'a@b.com' }],
        meta: {
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      });

      const schema = z.array(z.object({ id: z.number(), email: z.string() }));
      const result = await client.get('/users', schema);

      expect(result).toEqual([{ id: 1, email: 'a@b.com' }]);
    });
  });

  describe('401 Token Refresh', () => {
    it('should attempt token refresh on 401 and retry the original request', async () => {
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);
      let callCount = 0;

      // First call returns 401
      mockAdapter.onGet('/protected').reply(() => {
        callCount++;
        if (callCount === 1) {
          return [401, { message: 'Unauthorized' }];
        }
        return [200, {
          success: true,
          data: { access: 'granted' },
          meta: { requestId: '123', timestamp: '2024-01-01T00:00:00Z', version: '1.0.0' },
        }];
      });

      // Mock the refresh endpoint on the base axios (not the instance)
      vi.spyOn(axios, 'post').mockResolvedValueOnce({ data: { success: true } });

      const schema = z.object({ access: z.string() });
      const result = await client.get('/protected', schema);

      expect(result).toEqual({ access: 'granted' });
      expect(callCount).toBe(2);
    });

    it('should call onUnauthorized when token refresh fails', async () => {
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);

      mockAdapter.onGet('/protected').reply(401, { message: 'Unauthorized' });

      // Refresh also fails
      vi.spyOn(axios, 'post').mockRejectedValueOnce(new Error('Refresh failed'));

      const schema = z.object({ access: z.string() });

      await expect(client.get('/protected', schema)).rejects.toThrow();
      expect(onUnauthorized).toHaveBeenCalledOnce();
    });

    it('should not attempt refresh on auth/refresh endpoint itself', async () => {
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);

      mockAdapter.onPost('/auth/refresh').reply(401, { message: 'Token expired' });

      const schema = z.object({ token: z.string() });
      const axiosPostSpy = vi.spyOn(axios, 'post');

      await expect(client.post('/auth/refresh', schema, {})).rejects.toThrow();
      // Should NOT have tried to refresh (that would be a loop)
      expect(axiosPostSpy).not.toHaveBeenCalled();
    });
  });

  describe('Exponential Backoff Retry', () => {
    it('should retry up to 3 times on network errors with exponential backoff', async () => {
      vi.useFakeTimers();
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);

      let callCount = 0;
      mockAdapter.onGet('/flaky').reply(() => {
        callCount++;
        if (callCount < 3) {
          return [500, { message: 'Server Error' }];
        }
        return [200, {
          success: true,
          data: 'recovered',
          meta: { requestId: '123', timestamp: '2024-01-01T00:00:00Z', version: '1.0.0' },
        }];
      });

      const promise = client.get('/flaky', z.string());

      // Advance through the backoff delays
      await vi.advanceTimersByTimeAsync(1000); // 1s delay after 1st failure
      await vi.advanceTimersByTimeAsync(2000); // 2s delay after 2nd failure

      const result = await promise;
      expect(result).toBe('recovered');
      expect(callCount).toBe(3);

      vi.useRealTimers();
    });

    it('should call onError after all retry attempts are exhausted', async () => {
      vi.useFakeTimers();
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);

      mockAdapter.onGet('/down').reply(503, { message: 'Service Unavailable' });

      const schema = z.string();
      const promise = client.get('/down', schema).catch(() => {
        // Expected to reject - swallow the error to avoid unhandled rejection
      });

      // Advance through all backoff delays
      await vi.advanceTimersByTimeAsync(1000); // after 1st failure
      await vi.advanceTimersByTimeAsync(2000); // after 2nd failure
      await vi.advanceTimersByTimeAsync(4000); // after 3rd failure (won't retry but ensure settled)

      await promise;

      expect(onError).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'server_error',
          attempts: 3,
        })
      );

      vi.useRealTimers();
    });

    it('should not retry on 4xx errors (except 401 handled separately)', async () => {
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);
      let callCount = 0;

      mockAdapter.onPost('/items').reply(() => {
        callCount++;
        return [400, { message: 'Bad Request' }];
      });

      const schema = z.any();
      await expect(client.post('/items', schema, {})).rejects.toThrow();
      // Should only have been called once (no retry for 400)
      expect(callCount).toBe(1);
    });

    it('should retry on network errors (simulated as 500)', async () => {
      vi.useFakeTimers();
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);

      let networkCallCount = 0;
      mockAdapter.onGet('/network-fail').reply(() => {
        networkCallCount++;
        if (networkCallCount < 3) {
          // Return 500 to simulate a retriable server error
          return [500, { message: 'Internal Server Error' }];
        }
        return [200, {
          success: true,
          data: 'ok',
          meta: { requestId: '123', timestamp: '2024-01-01T00:00:00Z', version: '1.0.0' },
        }];
      });

      const promise = client.get('/network-fail', z.string());
      await vi.advanceTimersByTimeAsync(1000); // after 1st failure
      await vi.advanceTimersByTimeAsync(2000); // after 2nd failure

      const result = await promise;
      expect(result).toBe('ok');
      expect(networkCallCount).toBe(3);

      vi.useRealTimers();
    });
  });

  describe('X-API-Version Mismatch Detection', () => {
    it('should show non-dismissible notification when version mismatch detected', async () => {
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);

      mockAdapter.onGet('/test').reply(200, {
        success: true,
        data: 'ok',
        meta: { requestId: '123', timestamp: '2024-01-01T00:00:00Z', version: '1.0.0' },
      }, {
        'x-api-version': '2.0.0', // Major version mismatch
      });

      await client.get('/test', z.string());

      const overlay = document.getElementById('api-version-mismatch-overlay');
      expect(overlay).not.toBeNull();
    });

    it('should not show notification when versions match (same major.minor)', async () => {
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);

      mockAdapter.onGet('/test').reply(200, {
        success: true,
        data: 'ok',
        meta: { requestId: '123', timestamp: '2024-01-01T00:00:00Z', version: '1.0.0' },
      }, {
        'x-api-version': '1.0.5', // Only patch differs
      });

      await client.get('/test', z.string());

      const overlay = document.getElementById('api-version-mismatch-overlay');
      expect(overlay).toBeNull();
    });
  });

  describe('HTTP Methods', () => {
    it('should support POST with data and Zod validation', async () => {
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);

      mockAdapter.onPost('/items').reply(201, {
        success: true,
        data: { id: 42, name: 'New Item' },
        meta: { requestId: '123', timestamp: '2024-01-01T00:00:00Z', version: '1.0.0' },
      });

      const schema = z.object({ id: z.number(), name: z.string() });
      const result = await client.post('/items', schema, { name: 'New Item' });

      expect(result).toEqual({ id: 42, name: 'New Item' });
    });

    it('should support PUT with data and Zod validation', async () => {
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);

      mockAdapter.onPut('/items/1').reply(200, {
        success: true,
        data: { id: 1, name: 'Updated' },
        meta: { requestId: '123', timestamp: '2024-01-01T00:00:00Z', version: '1.0.0' },
      });

      const schema = z.object({ id: z.number(), name: z.string() });
      const result = await client.put('/items/1', schema, { name: 'Updated' });

      expect(result).toEqual({ id: 1, name: 'Updated' });
    });

    it('should support DELETE with Zod validation', async () => {
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);

      mockAdapter.onDelete('/items/1').reply(200, {
        success: true,
        data: { deleted: true },
        meta: { requestId: '123', timestamp: '2024-01-01T00:00:00Z', version: '1.0.0' },
      });

      const schema = z.object({ deleted: z.boolean() });
      const result = await client.delete('/items/1', schema);

      expect(result).toEqual({ deleted: true });
    });

    it('should support PATCH with data and Zod validation', async () => {
      const client = createApiClient(config);
      mockAdapter = new MockAdapter(client.http);

      mockAdapter.onPatch('/items/1').reply(200, {
        success: true,
        data: { id: 1, status: 'active' },
        meta: { requestId: '123', timestamp: '2024-01-01T00:00:00Z', version: '1.0.0' },
      });

      const schema = z.object({ id: z.number(), status: z.string() });
      const result = await client.patch('/items/1', schema, { status: 'active' });

      expect(result).toEqual({ id: 1, status: 'active' });
    });
  });

  describe('Default Configuration', () => {
    it('should use default timeout of 30000ms when not specified', () => {
      const client = createApiClient({ baseUrl: 'http://localhost:3000/api' });
      expect(client.http.defaults.timeout).toBe(30000);
    });

    it('should use configured timeout', () => {
      const client = createApiClient({
        baseUrl: 'http://localhost:3000/api',
        timeout: 10000,
      });
      expect(client.http.defaults.timeout).toBe(10000);
    });
  });
});
