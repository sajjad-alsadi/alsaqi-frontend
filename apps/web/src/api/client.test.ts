/**
 * Unit tests for the API client infrastructure.
 * Tests CSRF token attachment, correlation ID, 401 refresh, retry logic,
 * version mismatch detection, and Zod response validation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { z } from 'zod';
import {
  createApiClient,
  showVersionMismatchNotification,
  PERSIST_DRAFTS_EVENT,
  type ApiClientConfig,
  type ApiClientError,
} from './client';

// We need to mock axios.create to return our own instance so we can intercept
// Since createApiClient creates its own instance, we'll test behavior through it.

describe('createApiClient', () => {
  let mockAdapter: MockAdapter;
  let onUnauthorized: (() => void) | undefined;
  let onError: ((error: ApiClientError) => void) | undefined;
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

// ─────────────────────────────────────────────────────────────────────────────
// Additional coverage for critical-path branches (Task 7.2)
// ─────────────────────────────────────────────────────────────────────────────

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function successEnvelope(data: unknown, meta?: Record<string, unknown>) {
  return {
    success: true,
    data,
    meta: {
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: '2024-01-01T00:00:00Z',
      version: '1.0.0',
      ...meta,
    },
  };
}

describe('createApiClient — getWithMeta', () => {
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    Object.defineProperty(document, 'cookie', { writable: true, value: '' });
  });

  afterEach(() => {
    mockAdapter?.restore();
    vi.restoreAllMocks();
  });

  it('returns both the validated data and the envelope meta (pagination)', async () => {
    const client = createApiClient({ baseUrl: 'http://localhost:3000/api' });
    mockAdapter = new MockAdapter(client.http);

    mockAdapter.onGet('/items').reply(
      200,
      successEnvelope([{ id: 1 }, { id: 2 }], {
        pagination: { total: 57, totalPages: 6 },
      })
    );

    const schema = z.array(z.object({ id: z.number() }));
    const { data, meta } = await client.getWithMeta('/items', schema);

    expect(data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(meta?.pagination?.total).toBe(57);
    expect(meta?.pagination?.totalPages).toBe(6);
  });
});

describe('createApiClient — idempotent mutation retries', () => {
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    Object.defineProperty(document, 'cookie', { writable: true, value: '' });
  });

  afterEach(() => {
    mockAdapter?.restore();
    vi.restoreAllMocks();
  });

  it('attaches a UUID v4 Idempotency-Key header to an idempotent mutation', async () => {
    const client = createApiClient({ baseUrl: 'http://localhost:3000/api' });
    mockAdapter = new MockAdapter(client.http);

    let capturedKey: string | undefined;
    mockAdapter.onPost('/items').reply((reqConfig) => {
      capturedKey = reqConfig.headers?.['Idempotency-Key'] as string;
      return [200, successEnvelope({ id: 1 })];
    });

    await client.post('/items', z.object({ id: z.number() }), { name: 'x' }, { idempotent: true });

    expect(capturedKey).toMatch(UUID_V4);
  });

  it('does NOT attach an Idempotency-Key when the mutation is not opted in', async () => {
    const client = createApiClient({ baseUrl: 'http://localhost:3000/api' });
    mockAdapter = new MockAdapter(client.http);

    let capturedKey: string | undefined = 'sentinel';
    mockAdapter.onPost('/items').reply((reqConfig) => {
      capturedKey = reqConfig.headers?.['Idempotency-Key'] as string | undefined;
      return [200, successEnvelope({ id: 1 })];
    });

    await client.post('/items', z.object({ id: z.number() }), { name: 'x' });

    expect(capturedKey).toBeUndefined();
  });

  it('reuses the same Idempotency-Key across retries of an idempotent mutation', async () => {
    vi.useFakeTimers();
    const client = createApiClient({ baseUrl: 'http://localhost:3000/api' });
    mockAdapter = new MockAdapter(client.http);

    const keys: Array<string | undefined> = [];
    let callCount = 0;
    mockAdapter.onPut('/items/1').reply((reqConfig) => {
      keys.push(reqConfig.headers?.['Idempotency-Key'] as string | undefined);
      callCount++;
      if (callCount < 2) return [500, { message: 'Server Error' }];
      return [200, successEnvelope({ id: 1 })];
    });

    const promise = client.put('/items/1', z.object({ id: z.number() }), { v: 1 }, { idempotent: true });
    await vi.advanceTimersByTimeAsync(1000); // first backoff delay

    const result = await promise;
    expect(result).toEqual({ id: 1 });
    expect(callCount).toBe(2);
    expect(keys[0]).toBeDefined();
    expect(keys[0]).toBe(keys[1]); // stable across attempts

    vi.useRealTimers();
  });
});

describe('createApiClient — onError classification', () => {
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    Object.defineProperty(document, 'cookie', { writable: true, value: '' });
  });

  afterEach(() => {
    mockAdapter?.restore();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reports a timeout error type when the request aborts (ECONNABORTED)', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const client = createApiClient({ baseUrl: 'http://localhost:3000/api', onError });
    mockAdapter = new MockAdapter(client.http);

    mockAdapter.onGet('/slow').timeout();

    const promise = client.get('/slow', z.string()).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await promise;

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'timeout', attempts: 3 })
    );
  });

  it('reports a connection error type on a network error with no response', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const client = createApiClient({ baseUrl: 'http://localhost:3000/api', onError });
    mockAdapter = new MockAdapter(client.http);

    mockAdapter.onGet('/offline').networkError();

    const promise = client.get('/offline', z.string()).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await promise;

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'connection', attempts: 3 })
    );
  });
});

describe('createApiClient — correlation id generation', () => {
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    Object.defineProperty(document, 'cookie', { writable: true, value: '' });
  });

  afterEach(() => {
    mockAdapter?.restore();
    vi.restoreAllMocks();
  });

  it('falls back to manual UUID generation when crypto.randomUUID is unavailable', async () => {
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: undefined,
    });

    try {
      const client = createApiClient({ baseUrl: 'http://localhost:3000/api' });
      mockAdapter = new MockAdapter(client.http);

      let correlationId: string | undefined;
      mockAdapter.onGet('/x').reply((reqConfig) => {
        correlationId = reqConfig.headers?.['x-correlation-id'] as string;
        return [200, successEnvelope('ok')];
      });

      await client.get('/x', z.string());
      expect(correlationId).toMatch(UUID_V4);
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        configurable: true,
        value: original,
      });
    }
  });

  it('generates a correlation id for a direct http call that bypasses requestWithRetry', async () => {
    const client = createApiClient({ baseUrl: 'http://localhost:3000/api' });
    mockAdapter = new MockAdapter(client.http);

    let correlationId: string | undefined;
    mockAdapter.onGet('/direct').reply((reqConfig) => {
      correlationId = reqConfig.headers?.['x-correlation-id'] as string;
      return [200, successEnvelope('ok')];
    });

    await client.http.get('/direct');
    expect(correlationId).toMatch(UUID_V4);
  });
});

describe('createApiClient — concurrent 401 shared refresh', () => {
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    Object.defineProperty(document, 'cookie', { writable: true, value: '' });
  });

  afterEach(() => {
    mockAdapter?.restore();
    vi.restoreAllMocks();
  });

  it('shares a single /auth/refresh across two concurrent 401 responses', async () => {
    const client = createApiClient({ baseUrl: 'http://localhost:3000/api' });
    mockAdapter = new MockAdapter(client.http);

    mockAdapter.onGet('/a').replyOnce(401, { message: 'Unauthorized' });
    mockAdapter.onGet('/a').reply(200, successEnvelope({ which: 'a' }));
    mockAdapter.onGet('/b').replyOnce(401, { message: 'Unauthorized' });
    mockAdapter.onGet('/b').reply(200, successEnvelope({ which: 'b' }));

    // Hold the refresh open so both 401s land while a refresh is in flight.
    let resolveRefresh!: () => void;
    const refreshGate = new Promise<{ data: unknown }>((resolve) => {
      resolveRefresh = () => resolve({ data: { success: true } });
    });
    const postSpy = vi.spyOn(axios, 'post').mockReturnValue(refreshGate as never);

    const schema = z.object({ which: z.string() });
    const pA = client.get('/a', schema);
    const pB = client.get('/b', schema);

    // Let both requests reach the 401 interceptor before unblocking the refresh.
    await new Promise((r) => setTimeout(r, 20));
    resolveRefresh();

    const [a, b] = await Promise.all([pA, pB]);
    expect(a).toEqual({ which: 'a' });
    expect(b).toEqual({ which: 'b' });
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects a waiting request when the shared /auth/refresh fails', async () => {
    const onUnauthorized = vi.fn();
    const client = createApiClient({ baseUrl: 'http://localhost:3000/api', onUnauthorized });
    mockAdapter = new MockAdapter(client.http);

    mockAdapter.onGet('/a').reply(401, { message: 'Unauthorized' });
    mockAdapter.onGet('/b').reply(401, { message: 'Unauthorized' });

    let rejectRefresh!: (reason: unknown) => void;
    const refreshGate = new Promise<{ data: unknown }>((_resolve, reject) => {
      rejectRefresh = (reason) => reject(reason);
    });
    vi.spyOn(axios, 'post').mockReturnValue(refreshGate as never);

    const schema = z.object({ which: z.string() });
    const pA = client.get('/a', schema).then(
      () => 'resolved',
      () => 'rejected'
    );
    const pB = client.get('/b', schema).then(
      () => 'resolved',
      () => 'rejected'
    );

    await new Promise((r) => setTimeout(r, 20));
    rejectRefresh(new Error('refresh failed'));

    const [a, b] = await Promise.all([pA, pB]);
    expect(a).toBe('rejected');
    expect(b).toBe('rejected');
    expect(onUnauthorized).toHaveBeenCalled();
  });
});

describe('showVersionMismatchNotification — overlay interactions', () => {
  let reloadSpy: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    // Fresh module state per test so `versionMismatchShown` starts false.
    vi.resetModules();
    const existing = document.getElementById('api-version-mismatch-overlay');
    existing?.remove();

    originalLocation = window.location;
    reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
    const existing = document.getElementById('api-version-mismatch-overlay');
    existing?.remove();
    vi.restoreAllMocks();
  });

  it('renders the overlay once and ignores repeat calls while shown', async () => {
    const mod = await import('./client');
    mod.showVersionMismatchNotification();
    mod.showVersionMismatchNotification(); // guarded — should be a no-op

    const overlays = document.querySelectorAll('#api-version-mismatch-overlay');
    expect(overlays).toHaveLength(1);
  });

  it('reload button persists drafts then reloads the page', async () => {
    const mod = await import('./client');
    const persistListener = vi.fn();
    window.addEventListener(mod.PERSIST_DRAFTS_EVENT, persistListener);

    mod.showVersionMismatchNotification();

    const overlay = document.getElementById('api-version-mismatch-overlay');
    const reloadButton = Array.from(overlay!.querySelectorAll('button')).find(
      (b) => b.textContent === 'تحديث الصفحة'
    );
    reloadButton?.click();

    expect(persistListener).toHaveBeenCalledTimes(1);
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    window.removeEventListener(mod.PERSIST_DRAFTS_EVENT, persistListener);
  });

  it('later button persists drafts, dismisses the overlay, and re-arms the notice', async () => {
    const mod = await import('./client');
    const persistListener = vi.fn();
    window.addEventListener(mod.PERSIST_DRAFTS_EVENT, persistListener);

    mod.showVersionMismatchNotification();

    const overlay = document.getElementById('api-version-mismatch-overlay');
    const laterButton = Array.from(overlay!.querySelectorAll('button')).find(
      (b) => b.textContent === 'لاحقًا'
    );
    laterButton?.click();

    expect(persistListener).toHaveBeenCalledTimes(1);
    expect(document.getElementById('api-version-mismatch-overlay')).toBeNull();

    // After dismissal the notice can surface again (flag reset).
    mod.showVersionMismatchNotification();
    expect(document.getElementById('api-version-mismatch-overlay')).not.toBeNull();

    window.removeEventListener(mod.PERSIST_DRAFTS_EVENT, persistListener);
  });
});

// Reference the statically imported symbols so they are exercised/validated too.
describe('client module exports', () => {
  it('exposes the persist-drafts event name and notification helper', () => {
    expect(PERSIST_DRAFTS_EVENT).toBe('app:persist-drafts');
    expect(typeof showVersionMismatchNotification).toBe('function');
  });
});
