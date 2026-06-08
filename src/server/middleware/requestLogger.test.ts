import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequestLogger } from './requestLogger';
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
      run: vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 }),
    })),
  },
}));

// Mock the logger module
vi.mock('../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  requestContext: {
    run: vi.fn((store, fn) => fn()),
    getStore: vi.fn(),
  },
}));

import db from '../db/index';
import logger from '../utils/logger';

describe('requestLogger middleware', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('should call next() immediately for non-excluded paths', () => {
    const middleware = createRequestLogger();
    const req = createMockRequest({
      method: 'GET',
      path: '/api/v1/users',
      url: '/api/v1/users',
    });
    (req as any).correlationId = 'test-uuid-1234';

    const res = createMockResponse();
    (res as any).on = vi.fn();
    const next = createMockNext();

    middleware(req, res as any, next);

    expect(next).toHaveBeenCalled();
    expect((res as any).on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('should exclude /api/health path from logging', () => {
    const middleware = createRequestLogger();
    const req = createMockRequest({
      method: 'GET',
      path: '/api/health',
      url: '/api/health',
    });

    const res = createMockResponse();
    const next = createMockNext();

    middleware(req, res as any, next);

    // Should call next without attaching finish listener
    expect(next).toHaveBeenCalled();

    // Simulate response finish - logger should NOT be called
    res.statusCode = 200;
    // No 'on' method was called since path is excluded
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('should exclude /uploads/* paths from logging', () => {
    const middleware = createRequestLogger();
    const req = createMockRequest({
      method: 'GET',
      path: '/uploads/documents/file.pdf',
      url: '/uploads/documents/file.pdf',
    });

    const res = createMockResponse();
    const next = createMockNext();

    middleware(req, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('should log request details on response finish', async () => {
    const middleware = createRequestLogger();
    const req = createMockRequest({
      method: 'POST',
      path: '/api/v1/audit-tasks',
      url: '/api/v1/audit-tasks',
      headers: { 'user-agent': 'TestAgent/1.0' },
      ip: '192.168.1.1',
    });
    (req as any).correlationId = 'corr-id-123';
    (req as any).user = { id: 'user-001' };

    // Create a response with event emitter capability
    const listeners: Record<string, Function[]> = {};
    const res = createMockResponse();
    (res as any).on = vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    });
    res.statusCode = 201;

    const next = createMockNext();

    middleware(req, res as any, next);

    expect(next).toHaveBeenCalled();

    // Simulate response finish
    if (listeners['finish']) {
      for (const handler of listeners['finish']) {
        handler();
      }
    }

    // Wait for async persist
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Verify requestContext.run was called with the HTTP metadata
    const { requestContext } = await import('../utils/logger');
    expect(requestContext.run).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'corr-id-123',
        method: 'POST',
        path: '/api/v1/audit-tasks',
        statusCode: 201,
      }),
      expect.any(Function)
    );

    // Verify logger.info was called with the formatted message
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringMatching(/^POST \/api\/v1\/audit-tasks 201 \d+ms$/)
    );

    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO request_logs')
    );
  });

  it('should emit warning for slow requests exceeding threshold', async () => {
    const middleware = createRequestLogger({ slowThreshold: 100 });
    const req = createMockRequest({
      method: 'GET',
      path: '/api/v1/reports',
      url: '/api/v1/reports',
    });
    (req as any).correlationId = 'slow-req-id';

    const listeners: Record<string, Function[]> = {};
    const res = createMockResponse();
    (res as any).on = vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    });
    res.statusCode = 200;

    const next = createMockNext();

    middleware(req, res as any, next);

    // Simulate a delay then finish
    await new Promise((resolve) => setTimeout(resolve, 150));

    if (listeners['finish']) {
      for (const handler of listeners['finish']) {
        handler();
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Slow request detected')
    );
  });

  it('should not emit warning for requests within threshold', async () => {
    const middleware = createRequestLogger({ slowThreshold: 5000 });
    const req = createMockRequest({
      method: 'GET',
      path: '/api/v1/users',
      url: '/api/v1/users',
    });
    (req as any).correlationId = 'fast-req-id';

    const listeners: Record<string, Function[]> = {};
    const res = createMockResponse();
    (res as any).on = vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    });
    res.statusCode = 200;

    const next = createMockNext();

    middleware(req, res as any, next);

    if (listeners['finish']) {
      for (const handler of listeners['finish']) {
        handler();
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should handle null user ID for unauthenticated requests', async () => {
    const middleware = createRequestLogger();
    const req = createMockRequest({
      method: 'GET',
      path: '/api/v1/public',
      url: '/api/v1/public',
    });
    (req as any).correlationId = 'anon-req-id';

    const listeners: Record<string, Function[]> = {};
    const res = createMockResponse();
    (res as any).on = vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    });
    res.statusCode = 200;

    const next = createMockNext();

    middleware(req, res as any, next);

    if (listeners['finish']) {
      for (const handler of listeners['finish']) {
        handler();
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Verify requestContext.run was called with null userId
    const { requestContext } = await import('../utils/logger');
    expect(requestContext.run).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'anon-req-id',
        userId: null,
      }),
      expect.any(Function)
    );
  });

  it('should write to stderr on DB persist failure without affecting response', async () => {
    // Make db.prepare throw
    (db.prepare as any).mockReturnValueOnce({
      run: vi.fn().mockRejectedValue(new Error('DB connection lost')),
    });

    const middleware = createRequestLogger();
    const req = createMockRequest({
      method: 'GET',
      path: '/api/v1/data',
      url: '/api/v1/data',
    });
    (req as any).correlationId = 'fail-persist-id';

    const listeners: Record<string, Function[]> = {};
    const res = createMockResponse();
    (res as any).on = vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    });
    res.statusCode = 200;

    const next = createMockNext();

    middleware(req, res as any, next);

    if (listeners['finish']) {
      for (const handler of listeners['finish']) {
        handler();
      }
    }

    // Wait for async persist to fail
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to persist log entry')
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('DB connection lost')
    );
  });

  it('should include correlation request ID in log entry', async () => {
    const middleware = createRequestLogger();
    const req = createMockRequest({
      method: 'GET',
      path: '/api/v1/items',
      url: '/api/v1/items',
    });
    (req as any).correlationId = 'specific-correlation-id-456';

    const listeners: Record<string, Function[]> = {};
    const res = createMockResponse();
    (res as any).on = vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    });
    res.statusCode = 200;

    const next = createMockNext();

    middleware(req, res as any, next);

    if (listeners['finish']) {
      for (const handler of listeners['finish']) {
        handler();
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Verify requestContext.run was called with the correlation ID
    const { requestContext } = await import('../utils/logger');
    expect(requestContext.run).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'specific-correlation-id-456',
      }),
      expect.any(Function)
    );
  });

  it('should support custom exclude paths', () => {
    const middleware = createRequestLogger({
      excludePaths: ['/custom/health', '/static/*'],
    });

    const req = createMockRequest({
      method: 'GET',
      path: '/static/images/logo.png',
      url: '/static/images/logo.png',
    });

    const res = createMockResponse();
    const next = createMockNext();

    middleware(req, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('should use originalUrl for path in log entry when available', async () => {
    const middleware = createRequestLogger();
    const req = createMockRequest({
      method: 'GET',
      path: '/v1/items',
      url: '/api/v1/items?page=1',
      originalUrl: '/api/v1/items?page=1',
    });
    (req as any).correlationId = 'orig-url-test';

    const listeners: Record<string, Function[]> = {};
    const res = createMockResponse();
    (res as any).on = vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    });
    res.statusCode = 200;

    const next = createMockNext();

    middleware(req, res as any, next);

    if (listeners['finish']) {
      for (const handler of listeners['finish']) {
        handler();
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Verify requestContext.run was called with the originalUrl as path
    const { requestContext } = await import('../utils/logger');
    expect(requestContext.run).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/v1/items?page=1',
      }),
      expect.any(Function)
    );

    // Verify formatted log message includes the originalUrl
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/items?page=1')
    );
  });
});
