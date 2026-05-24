import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../__tests__/helpers/apiTestUtils';
import { createResponseWrapper, responseWrapperMiddleware } from './responseWrapper';

describe('responseWrapper middleware', () => {
  let mockNext: ReturnType<typeof createMockNext>;

  beforeEach(() => {
    mockNext = createMockNext();
  });

  /**
   * Helper: creates a mock response with a real json override mechanism.
   * The response wrapper overrides res.json, so we need a response object
   * that supports being overridden and tracks the final output.
   */
  function createWrappableResponse(statusCode = 200) {
    const res: any = {
      statusCode,
      _headers: {} as Record<string, string>,
      _jsonOutput: null as any,
      headersSent: false,
    };

    // The original json function that the wrapper will call
    res.json = vi.fn(function (this: any, data: any) {
      this._jsonOutput = data;
      this.headersSent = true;
      return this;
    });

    // Bind json so the wrapper can capture it
    res.json = res.json.bind(res);

    res.setHeader = vi.fn((name: string, value: string) => {
      res._headers[name.toLowerCase()] = value;
      return res;
    });

    res.getHeader = vi.fn((name: string) => {
      return res._headers[name.toLowerCase()];
    });

    res.status = vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    });

    return res;
  }

  describe('success responses (200-399)', () => {
    it('wraps a 200 response with success: true and data', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      // Simulate route handler calling res.json
      res.json({ name: 'test' });

      expect(res._jsonOutput).toMatchObject({
        success: true,
        data: { name: 'test' },
        meta: {
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          version: '1.0',
        },
      });
      expect(res._jsonOutput.meta.timestamp).toBeDefined();
    });

    it('wraps a 201 response with success: true', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(201);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({ id: '123', created: true });

      expect(res._jsonOutput.success).toBe(true);
      expect(res._jsonOutput.data).toEqual({ id: '123', created: true });
    });

    it('wraps a 204-like response with null data when body is null', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json(null);

      expect(res._jsonOutput.success).toBe(true);
      expect(res._jsonOutput.data).toBeNull();
    });

    it('wraps a 301 redirect-like response with success: true', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(301);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({ redirectTo: '/new-location' });

      expect(res._jsonOutput.success).toBe(true);
    });
  });

  describe('error responses (400+)', () => {
    it('wraps a 400 response with success: false and error', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(400);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({ code: 'VALIDATION_ERROR', message: 'Invalid input' });

      expect(res._jsonOutput).toMatchObject({
        success: false,
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input' },
        meta: {
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          version: '1.0',
        },
      });
    });

    it('wraps a 404 response with success: false', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(404);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({ code: 'NOT_FOUND', message: 'Resource not found' });

      expect(res._jsonOutput.success).toBe(false);
      expect(res._jsonOutput.data).toBeNull();
      expect(res._jsonOutput.error).toEqual({ code: 'NOT_FOUND', message: 'Resource not found' });
    });

    it('wraps a 500 response with success: false', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(500);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({ code: 'INTERNAL_ERROR', message: 'Something went wrong' });

      expect(res._jsonOutput.success).toBe(false);
      expect(res._jsonOutput.data).toBeNull();
    });
  });

  describe('meta object', () => {
    it('includes requestId from req.correlationId', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = 'abc12345-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({ data: 'test' });

      expect(res._jsonOutput.meta.requestId).toBe('abc12345-e29b-41d4-a716-446655440000');
    });

    it('includes ISO 8601 timestamp', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({ data: 'test' });

      const timestamp = res._jsonOutput.meta.timestamp;
      // Verify ISO 8601 format
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });

    it('includes version from options', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper({ version: '2.0' });

      middleware(req, res, mockNext);
      res.json({ data: 'test' });

      expect(res._jsonOutput.meta.version).toBe('2.0');
    });

    it('defaults version to 1.0', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({ data: 'test' });

      expect(res._jsonOutput.meta.version).toBe('1.0');
    });

    it('uses "unknown" as requestId when correlationId is not set', () => {
      const req = createMockRequest({ headers: {} });
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({ data: 'test' });

      expect(res._jsonOutput.meta.requestId).toBe('unknown');
    });
  });

  describe('pagination handling', () => {
    it('moves pagination from body to meta.pagination', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({
        data: [{ id: 1 }, { id: 2 }],
        pagination: {
          page: 1,
          pageSize: 20,
          total: 50,
          totalPages: 3,
          hasNext: true,
          hasPrev: false,
        },
      });

      expect(res._jsonOutput.meta.pagination).toEqual({
        page: 1,
        pageSize: 20,
        total: 50,
        totalPages: 3,
        hasNext: true,
        hasPrev: false,
      });
      // pagination should not be in data
      expect(res._jsonOutput.data.pagination).toBeUndefined();
      // data field should contain the rest of the body
      expect(res._jsonOutput.data).toEqual({ data: [{ id: 1 }, { id: 2 }] });
    });

    it('does not add pagination to meta when body has no pagination', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({ items: [1, 2, 3] });

      expect(res._jsonOutput.meta.pagination).toBeUndefined();
    });
  });

  describe('response headers', () => {
    it('sets X-Request-Id header with the correlation ID', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({ data: 'test' });

      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Request-Id',
        '550e8400-e29b-41d4-a716-446655440000'
      );
    });

    it('sets X-Response-Time header with duration in ms', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({ data: 'test' });

      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Response-Time',
        expect.stringMatching(/^\d+ms$/)
      );
    });
  });

  describe('already-wrapped responses (pass-through)', () => {
    it('passes through response that has both success and meta fields', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      const alreadyWrapped = {
        success: true,
        data: { name: 'test' },
        meta: {
          requestId: 'existing-id',
          timestamp: '2024-01-01T00:00:00.000Z',
          version: '1.0',
        },
      };

      middleware(req, res, mockNext);
      res.json(alreadyWrapped);

      // Should pass through without double-wrapping
      expect(res._jsonOutput).toEqual(alreadyWrapped);
    });

    it('passes through error response that is already wrapped', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(400);
      const middleware = createResponseWrapper();

      const alreadyWrapped = {
        success: false,
        data: null,
        error: { code: 'ERR', message: 'fail', traceId: 'trace-1' },
        meta: {
          requestId: 'existing-id',
          timestamp: '2024-01-01T00:00:00.000Z',
          version: '1.0',
        },
      };

      middleware(req, res, mockNext);
      res.json(alreadyWrapped);

      expect(res._jsonOutput).toEqual(alreadyWrapped);
    });

    it('does NOT pass through if only success is present without meta', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({ success: true, message: 'done' });

      // Should be wrapped since there's no meta
      expect(res._jsonOutput.data).toEqual({ success: true, message: 'done' });
      expect(res._jsonOutput.meta.requestId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('does NOT pass through if only meta is present without success', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({ meta: { info: 'something' }, value: 42 });

      // Should be wrapped since there's no boolean success field
      expect(res._jsonOutput.success).toBe(true);
      expect(res._jsonOutput.data).toEqual({ meta: { info: 'something' }, value: 42 });
    });
  });

  describe('excludePaths option', () => {
    it('skips wrapping for excluded paths', () => {
      const req = createMockRequest({ path: '/api/health' });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper({ excludePaths: ['/api/health'] });

      middleware(req, res, mockNext);
      // res.json should not be overridden for excluded paths
      res.json({ status: 'ok' });

      // The original json is called directly (no wrapping)
      expect(res._jsonOutput).toEqual({ status: 'ok' });
    });

    it('wraps responses for non-excluded paths', () => {
      const req = createMockRequest({ path: '/api/users' });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper({ excludePaths: ['/api/health'] });

      middleware(req, res, mockNext);
      res.json({ users: [] });

      expect(res._jsonOutput.success).toBe(true);
      expect(res._jsonOutput.data).toEqual({ users: [] });
    });
  });

  describe('edge cases', () => {
    it('handles undefined body gracefully', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json(undefined);

      expect(res._jsonOutput.success).toBe(true);
      expect(res._jsonOutput.data).toBeNull();
    });

    it('handles empty object body', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({});

      expect(res._jsonOutput.success).toBe(true);
      expect(res._jsonOutput.data).toEqual({});
    });

    it('handles array body', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json([1, 2, 3]);

      expect(res._jsonOutput.success).toBe(true);
      expect(res._jsonOutput.data).toEqual([1, 2, 3]);
    });

    it('handles string body', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json('hello');

      expect(res._jsonOutput.success).toBe(true);
      expect(res._jsonOutput.data).toBe('hello');
    });

    it('handles numeric body', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json(42);

      expect(res._jsonOutput.success).toBe(true);
      expect(res._jsonOutput.data).toBe(42);
    });

    it('calls next() to continue the middleware chain', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('handles status code 399 as success', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(399);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({ data: 'boundary' });

      expect(res._jsonOutput.success).toBe(true);
    });

    it('handles status code 400 as error', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(400);
      const middleware = createResponseWrapper();

      middleware(req, res, mockNext);
      res.json({ message: 'Bad request' });

      expect(res._jsonOutput.success).toBe(false);
    });
  });

  describe('default export (responseWrapperMiddleware)', () => {
    it('is a function with default options', () => {
      expect(typeof responseWrapperMiddleware).toBe('function');
    });

    it('wraps responses with default version 1.0', () => {
      const req = createMockRequest({ headers: {} });
      (req as any).correlationId = '550e8400-e29b-41d4-a716-446655440000';
      const res = createWrappableResponse(200);

      responseWrapperMiddleware(req, res, mockNext);
      res.json({ test: true });

      expect(res._jsonOutput.meta.version).toBe('1.0');
    });
  });
});
