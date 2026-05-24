import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createIdempotencyMiddleware,
  IdempotencyService,
  clearInFlightKeys,
  isKeyInFlight,
} from './idempotency';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  createAuthenticatedRequest,
} from '../__tests__/helpers/apiTestUtils';

// Mock the db module
vi.mock('../db/index', () => ({
  default: {
    prepare: vi.fn(() => ({
      get: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 }),
    })),
  },
}));

import db from '../db/index';

describe('idempotency middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearInFlightKeys();
  });

  afterEach(() => {
    clearInFlightKeys();
  });

  describe('method filtering', () => {
    it('should skip non-POST/PUT methods (GET)', async () => {
      const middleware = createIdempotencyMiddleware();
      const req = createAuthenticatedRequest({
        method: 'GET',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': 'test-key-123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should skip DELETE method', async () => {
      const middleware = createIdempotencyMiddleware();
      const req = createAuthenticatedRequest({
        method: 'DELETE',
        path: '/api/v1/items/1',
        headers: { 'x-idempotency-key': 'test-key-123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should apply to POST requests', async () => {
      const middleware = createIdempotencyMiddleware();
      const req = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': 'valid-key' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
    });

    it('should apply to PUT requests', async () => {
      const middleware = createIdempotencyMiddleware();
      const req = createAuthenticatedRequest({
        method: 'PUT',
        path: '/api/v1/items/1',
        headers: { 'x-idempotency-key': 'valid-key' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('header validation', () => {
    it('should skip when no idempotency key header is provided', async () => {
      const middleware = createIdempotencyMiddleware();
      const req = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
      });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 for empty idempotency key', async () => {
      const middleware = createIdempotencyMiddleware();
      const req = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': '' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_IDEMPOTENCY_KEY',
          message: expect.stringContaining('1 and 256 characters'),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 for key exceeding 256 characters', async () => {
      const middleware = createIdempotencyMiddleware();
      const longKey = 'a'.repeat(257);
      const req = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': longKey },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_IDEMPOTENCY_KEY',
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should accept key with exactly 1 character', async () => {
      const middleware = createIdempotencyMiddleware();
      const req = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': 'x' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(400);
    });

    it('should accept key with exactly 256 characters', async () => {
      const middleware = createIdempotencyMiddleware();
      const key256 = 'a'.repeat(256);
      const req = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': key256 },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(400);
    });
  });

  describe('stored response retrieval', () => {
    it('should return stored response for matching key + user without re-executing', async () => {
      const storedResponse = { id: 'item-1', title: 'Test Item' };
      (db.prepare as any).mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({
          response_status: 201,
          response_body: JSON.stringify(storedResponse),
        }),
      });

      const middleware = createIdempotencyMiddleware();
      const req = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': 'existing-key' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(storedResponse);
      expect(next).not.toHaveBeenCalled();
    });

    it('should proceed with execution when no stored response exists', async () => {
      (db.prepare as any).mockReturnValueOnce({
        get: vi.fn().mockResolvedValue(undefined),
      });

      const middleware = createIdempotencyMiddleware();
      const req = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': 'new-key' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('in-flight duplicate detection', () => {
    it('should return 409 Conflict for in-flight duplicate keys', async () => {
      // Simulate a key already in-flight by first calling middleware without resolving
      (db.prepare as any).mockReturnValue({
        get: vi.fn().mockResolvedValue(undefined),
        run: vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 }),
      });

      const middleware = createIdempotencyMiddleware();
      const userId = 'user-test-001';

      // First request - starts processing
      const req1 = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': 'inflight-key' },
        user: { id: userId },
      });
      const res1 = createMockResponse();
      (res1 as any).on = vi.fn();
      const next1 = createMockNext();

      await middleware(req1, res1 as any, next1);
      expect(next1).toHaveBeenCalled();

      // Second request with same key - should get 409
      const req2 = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': 'inflight-key' },
        user: { id: userId },
      });
      const res2 = createMockResponse();
      const next2 = createMockNext();

      // Reset mock for second call to return no stored response
      (db.prepare as any).mockReturnValueOnce({
        get: vi.fn().mockResolvedValue(undefined),
      });

      await middleware(req2, res2 as any, next2);

      expect(res2.status).toHaveBeenCalledWith(409);
      expect(res2.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'IDEMPOTENCY_CONFLICT',
        })
      );
      expect(next2).not.toHaveBeenCalled();
    });
  });

  describe('response storage', () => {
    it('should store response on first execution when res.json is called', async () => {
      (db.prepare as any).mockReturnValue({
        get: vi.fn().mockResolvedValue(undefined),
        run: vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 }),
      });

      const middleware = createIdempotencyMiddleware();
      const req = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': 'store-key' },
      });
      const res = createMockResponse();
      (res as any).on = vi.fn();
      const next = createMockNext();

      await middleware(req, res as any, next);

      // Simulate the handler calling res.json
      res.statusCode = 201;
      res.json({ id: 'new-item', title: 'Created' });

      // Wait for async store
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify db.prepare was called with INSERT
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO idempotency_keys')
      );
    });

    it('should remove key from in-flight after response is stored', async () => {
      (db.prepare as any).mockReturnValue({
        get: vi.fn().mockResolvedValue(undefined),
        run: vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 }),
      });

      const middleware = createIdempotencyMiddleware();
      const req = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': 'cleanup-key' },
        user: { id: 'user-cleanup' },
      });
      const res = createMockResponse();
      (res as any).on = vi.fn();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(isKeyInFlight('user-cleanup', 'cleanup-key')).toBe(true);

      // Simulate handler response
      res.statusCode = 200;
      res.json({ success: true });

      // Wait for async cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(isKeyInFlight('user-cleanup', 'cleanup-key')).toBe(false);
    });
  });

  describe('user scoping', () => {
    it('should skip idempotency for unauthenticated requests', async () => {
      const middleware = createIdempotencyMiddleware();
      const req = createMockRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': 'anon-key' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it('should scope keys per user (different users can use same key)', async () => {
      (db.prepare as any).mockReturnValue({
        get: vi.fn().mockResolvedValue(undefined),
        run: vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 }),
      });

      const middleware = createIdempotencyMiddleware();

      // User A with key
      const reqA = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': 'shared-key' },
        user: { id: 'user-A' },
      });
      const resA = createMockResponse();
      (resA as any).on = vi.fn();
      const nextA = createMockNext();

      await middleware(reqA, resA as any, nextA);
      expect(nextA).toHaveBeenCalled();

      // User B with same key - should NOT get 409
      const reqB = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': 'shared-key' },
        user: { id: 'user-B' },
      });
      const resB = createMockResponse();
      (resB as any).on = vi.fn();
      const nextB = createMockNext();

      await middleware(reqB, resB as any, nextB);
      expect(nextB).toHaveBeenCalled();
      expect(resB.status).not.toHaveBeenCalledWith(409);
    });
  });

  describe('configurable options', () => {
    it('should use custom TTL', async () => {
      (db.prepare as any).mockReturnValue({
        get: vi.fn().mockResolvedValue(undefined),
        run: vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 }),
      });

      const middleware = createIdempotencyMiddleware({ ttl: 3600 }); // 1 hour
      const req = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': 'ttl-key' },
      });
      const res = createMockResponse();
      (res as any).on = vi.fn();
      const next = createMockNext();

      await middleware(req, res as any, next);

      // Simulate handler response
      res.statusCode = 200;
      res.json({ data: 'test' });

      // Wait for async store
      await new Promise((resolve) => setTimeout(resolve, 50));

      // The TTL value (3600) should be passed to the store query
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO idempotency_keys')
      );
    });

    it('should support custom header name', async () => {
      (db.prepare as any).mockReturnValue({
        get: vi.fn().mockResolvedValue(undefined),
        run: vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 }),
      });

      const middleware = createIdempotencyMiddleware({
        headerName: 'X-Custom-Idempotency',
      });
      const req = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-custom-idempotency': 'custom-key' },
      });
      const res = createMockResponse();
      (res as any).on = vi.fn();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
    });

    it('should support custom methods list', async () => {
      const middleware = createIdempotencyMiddleware({
        methods: ['POST', 'PATCH'],
      });

      // PUT should be skipped with custom methods
      const req = createAuthenticatedRequest({
        method: 'PUT',
        path: '/api/v1/items/1',
        headers: { 'x-idempotency-key': 'put-key' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(db.prepare).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should call next with error if DB check fails', async () => {
      const dbError = new Error('DB connection lost');
      (db.prepare as any).mockReturnValueOnce({
        get: vi.fn().mockRejectedValue(dbError),
      });

      const middleware = createIdempotencyMiddleware();
      const req = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': 'error-key' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });

    it('should clean up in-flight key on error', async () => {
      const dbError = new Error('DB connection lost');
      (db.prepare as any).mockReturnValueOnce({
        get: vi.fn().mockRejectedValue(dbError),
      });

      const middleware = createIdempotencyMiddleware();
      const req = createAuthenticatedRequest({
        method: 'POST',
        path: '/api/v1/items',
        headers: { 'x-idempotency-key': 'error-cleanup-key' },
        user: { id: 'user-err' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(isKeyInFlight('user-err', 'error-cleanup-key')).toBe(false);
    });
  });
});

describe('IdempotencyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('check', () => {
    it('should return null when no record exists', async () => {
      (db.prepare as any).mockReturnValueOnce({
        get: vi.fn().mockResolvedValue(undefined),
      });

      const result = await IdempotencyService.check('key', 'user-1', 'POST', '/api/items');
      expect(result).toBeNull();
    });

    it('should return stored record when found', async () => {
      const record = { response_status: 201, response_body: '{"id":"1"}' };
      (db.prepare as any).mockReturnValueOnce({
        get: vi.fn().mockResolvedValue(record),
      });

      const result = await IdempotencyService.check('key', 'user-1', 'POST', '/api/items');
      expect(result).toEqual(record);
    });
  });

  describe('store', () => {
    it('should insert a new idempotency record', async () => {
      (db.prepare as any).mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 }),
      });

      await IdempotencyService.store('key', 'user-1', 'POST', '/api/items', 201, '{"id":"1"}', 86400);

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO idempotency_keys')
      );
    });
  });

  describe('cleanup', () => {
    it('should delete expired records', async () => {
      (db.prepare as any).mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 5 }),
      });

      await IdempotencyService.cleanup();

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM idempotency_keys WHERE expires_at')
      );
    });
  });
});
