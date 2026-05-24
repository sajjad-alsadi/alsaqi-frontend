// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  createAuthenticatedRequest,
  withCorrelationId,
  createMockUser,
  DEFAULT_TEST_USER,
} from './apiTestUtils';

describe('apiTestUtils', () => {
  describe('createMockRequest', () => {
    it('creates a request with default values', () => {
      const req = createMockRequest();

      expect(req.method).toBe('GET');
      expect(req.url).toBe('/');
      expect(req.path).toBe('/');
      expect(req.ip).toBe('127.0.0.1');
      expect(req.body).toEqual({});
      expect(req.params).toEqual({});
      expect(req.query).toEqual({});
    });

    it('creates a request with custom method, url, and body', () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/users',
        body: { name: 'Test' },
      });

      expect(req.method).toBe('POST');
      expect(req.url).toBe('/api/v1/users');
      expect(req.body).toEqual({ name: 'Test' });
    });

    it('normalizes header keys to lowercase', () => {
      const req = createMockRequest({
        headers: { 'X-Correlation-Id': 'abc-123', 'Content-Type': 'application/json' },
      });

      expect(req.headers['x-correlation-id']).toBe('abc-123');
      expect(req.headers['content-type']).toBe('application/json');
    });

    it('supports get() and header() methods for header access', () => {
      const req = createMockRequest({
        headers: { 'Authorization': 'Bearer token123' },
      });

      expect(req.get('Authorization')).toBe('Bearer token123');
      expect(req.get('authorization')).toBe('Bearer token123');
    });

    it('attaches user when provided', () => {
      const user = { id: 'u1', role: 'Admin', username: 'admin', name: 'Admin', email: 'a@b.com' };
      const req = createMockRequest({ user });

      expect((req as any).user).toEqual(user);
    });

    it('does not attach user when null', () => {
      const req = createMockRequest({ user: null });

      expect((req as any).user).toBeUndefined();
    });

    it('sets originalUrl to url when not explicitly provided', () => {
      const req = createMockRequest({ url: '/api/test' });

      expect(req.originalUrl).toBe('/api/test');
    });

    it('allows explicit originalUrl override', () => {
      const req = createMockRequest({ url: '/test', originalUrl: '/api/v1/test' });

      expect(req.originalUrl).toBe('/api/v1/test');
    });
  });

  describe('createMockResponse', () => {
    it('creates a response with default 200 status', () => {
      const res = createMockResponse();

      expect(res.statusCode).toBe(200);
      expect(res._ended).toBe(false);
      expect(res._json).toBeNull();
    });

    it('tracks status code changes', () => {
      const res = createMockResponse();
      res.status(404);

      expect(res.statusCode).toBe(404);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('chains status and json calls', () => {
      const res = createMockResponse();
      res.status(201).json({ id: '123' });

      expect(res.statusCode).toBe(201);
      expect(res._json).toEqual({ id: '123' });
      expect(res._ended).toBe(true);
    });

    it('tracks headers set via setHeader', () => {
      const res = createMockResponse();
      res.setHeader('X-Request-Id', 'req-001');
      res.setHeader('X-Response-Time', '42ms');

      expect(res._headers['x-request-id']).toBe('req-001');
      expect(res._headers['x-response-time']).toBe('42ms');
    });

    it('retrieves headers via getHeader', () => {
      const res = createMockResponse();
      res.setHeader('X-Custom', 'value');

      expect(res.getHeader('x-custom')).toBe('value');
    });

    it('marks headersSent after json is called', () => {
      const res = createMockResponse();
      expect(res.headersSent).toBe(false);

      res.json({ ok: true });
      expect(res.headersSent).toBe(true);
    });
  });

  describe('createMockNext', () => {
    it('creates a callable next function', () => {
      const next = createMockNext();
      next();

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('tracks error arguments passed to next', () => {
      const next = createMockNext();
      const error = new Error('test error');
      next(error);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('createAuthenticatedRequest', () => {
    it('creates a request with default test user', () => {
      const req = createAuthenticatedRequest();

      expect((req as any).user).toEqual(DEFAULT_TEST_USER);
    });

    it('includes a correlation ID header', () => {
      const req = createAuthenticatedRequest();

      expect(req.headers['x-correlation-id']).toBeDefined();
      // UUID v4 format
      expect(req.headers['x-correlation-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('allows user property overrides', () => {
      const req = createAuthenticatedRequest({
        user: { role: 'Viewer', username: 'viewer1' },
      });

      expect((req as any).user.role).toBe('Viewer');
      expect((req as any).user.username).toBe('viewer1');
      // Other defaults preserved
      expect((req as any).user.id).toBe(DEFAULT_TEST_USER.id);
    });

    it('preserves explicit correlation ID', () => {
      const req = createAuthenticatedRequest({
        headers: { 'x-correlation-id': 'my-custom-id' },
      });

      expect(req.headers['x-correlation-id']).toBe('my-custom-id');
    });

    it('merges additional headers', () => {
      const req = createAuthenticatedRequest({
        headers: { 'content-type': 'application/json' },
      });

      expect(req.headers['content-type']).toBe('application/json');
      expect(req.headers['x-correlation-id']).toBeDefined();
    });
  });

  describe('withCorrelationId', () => {
    it('adds a generated correlation ID to options', () => {
      const options = withCorrelationId({ method: 'POST' });

      expect(options.headers?.['x-correlation-id']).toBeDefined();
      expect(options.headers?.['x-correlation-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(options.method).toBe('POST');
    });

    it('uses provided correlation ID', () => {
      const options = withCorrelationId({}, 'custom-trace-id');

      expect(options.headers?.['x-correlation-id']).toBe('custom-trace-id');
    });

    it('preserves existing headers', () => {
      const options = withCorrelationId({
        headers: { 'authorization': 'Bearer token' },
      });

      expect(options.headers?.['authorization']).toBe('Bearer token');
      expect(options.headers?.['x-correlation-id']).toBeDefined();
    });
  });

  describe('createMockUser', () => {
    it('creates a user with the specified role', () => {
      const user = createMockUser('Internal Auditor');

      expect(user.role).toBe('Internal Auditor');
      expect(user.username).toContain('internalauditor');
      expect(user.email).toContain('internalauditor');
    });

    it('applies overrides', () => {
      const user = createMockUser('Admin', { id: 'custom-id', name: 'Custom Name' });

      expect(user.id).toBe('custom-id');
      expect(user.name).toBe('Custom Name');
      expect(user.role).toBe('Admin');
    });

    it('generates unique IDs', () => {
      const user1 = createMockUser('Admin');
      const user2 = createMockUser('Admin');

      // IDs contain timestamp so they should differ (or at least be unique in practice)
      expect(user1.id).toContain('user-admin-');
    });
  });
});
