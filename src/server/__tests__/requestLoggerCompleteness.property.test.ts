// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { createRequestLogger } from '../middleware/requestLogger';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from './helpers/apiTestUtils';

/**
 * Property Test: Request Logger Completeness (Property 14)
 *
 * Feature: api-audit-improvements
 * Property 14: Request Logger Completeness
 *
 * **Validates: Requirements 11.1, 10.4**
 *
 * For any request to a non-excluded path, the Request_Logger SHALL produce a log
 * entry containing all required fields (method, path, status code, duration, user ID,
 * IP, user agent), and the request ID in the log entry SHALL match the response's
 * X-Request-Id header.
 */

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

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Valid HTTP methods */
const httpMethodArb = fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

/** Generates a valid UUID v4 for correlation IDs */
const uuidArb = fc.uuid();

/** Generates a non-excluded path (not /api/health or /uploads/*) */
const nonExcludedPathArb = fc
  .tuple(
    fc.constantFrom('/api/v1/', '/api/', '/'),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/)
  )
  .map(([prefix, segment]) => `${prefix}${segment}`)
  .filter(
    (path) =>
      path !== '/api/health' &&
      !path.startsWith('/uploads/') &&
      !path.startsWith('/uploads')
  );

/** Generates a valid IP address */
const ipAddressArb = fc
  .tuple(
    fc.integer({ min: 1, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 1, max: 254 })
  )
  .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

/** Generates a user agent string */
const userAgentArb = fc
  .tuple(
    fc.constantFrom('Mozilla', 'Chrome', 'Safari', 'Firefox', 'Edge', 'TestAgent'),
    fc.stringMatching(/^[0-9]{1,2}\.[0-9]{1,2}$/)
  )
  .map(([browser, version]) => `${browser}/${version}`);

/** Generates an optional user ID (null for unauthenticated) */
const userIdArb = fc.option(fc.uuid(), { nil: null });

/** Generates a valid HTTP status code */
const statusCodeArb = fc.integer({ min: 200, max: 599 });

/**
 * Composite arbitrary for a complete request scenario:
 * method, path, correlationId, userId, ip, userAgent, statusCode
 */
const requestScenarioArb = fc.record({
  method: httpMethodArb,
  path: nonExcludedPathArb,
  correlationId: uuidArb,
  userId: userIdArb,
  ip: ipAddressArb,
  userAgent: userAgentArb,
  statusCode: statusCodeArb,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 14: Request Logger Completeness', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe('log entry contains all required fields for any non-excluded request', () => {
    it('every log entry contains method, path, statusCode, duration, userId, ip, and userAgent', { timeout: 15000 }, () => {
      fc.assert(
        fc.property(requestScenarioArb, (scenario) => {
          vi.clearAllMocks();

          const middleware = createRequestLogger();
          const req = createMockRequest({
            method: scenario.method,
            path: scenario.path,
            url: scenario.path,
            headers: { 'user-agent': scenario.userAgent },
            ip: scenario.ip,
          });
          (req as any).correlationId = scenario.correlationId;
          if (scenario.userId) {
            (req as any).user = { id: scenario.userId };
          }

          // Set up response with event emitter
          const listeners: Record<string, Function[]> = {};
          const res = createMockResponse();
          (res as any).on = vi.fn((event: string, handler: Function) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler);
          });
          res.statusCode = scenario.statusCode;

          const next = createMockNext();

          middleware(req, res as any, next);

          // Simulate response finish
          if (listeners['finish']) {
            for (const handler of listeners['finish']) {
              handler();
            }
          }

          // Verify logger.info was called with all required fields
          expect(logger.info).toHaveBeenCalledTimes(1);
          const logCall = (logger.info as any).mock.calls[0];
          const logData = logCall[1];

          // All required fields must be present
          expect(logData).toHaveProperty('requestId');
          expect(logData).toHaveProperty('method');
          expect(logData).toHaveProperty('path');
          expect(logData).toHaveProperty('statusCode');
          expect(logData).toHaveProperty('duration');
          expect(logData).toHaveProperty('userId');
          expect(logData).toHaveProperty('ip');
          expect(logData).toHaveProperty('userAgent');

          // Verify field values match the request
          expect(logData.method).toBe(scenario.method);
          expect(logData.path).toBe(scenario.path);
          expect(logData.statusCode).toBe(scenario.statusCode);
          expect(typeof logData.duration).toBe('number');
          expect(logData.duration).toBeGreaterThanOrEqual(0);
          expect(logData.userId).toBe(scenario.userId);
          expect(logData.ip).toBe(scenario.ip);
          expect(logData.userAgent).toBe(scenario.userAgent);
        }),
        { numRuns: 300 }
      );
    });

    it('request ID in log entry matches the correlation ID (X-Request-Id)', { timeout: 15000 }, () => {
      fc.assert(
        fc.property(requestScenarioArb, (scenario) => {
          vi.clearAllMocks();

          const middleware = createRequestLogger();
          const req = createMockRequest({
            method: scenario.method,
            path: scenario.path,
            url: scenario.path,
            headers: { 'user-agent': scenario.userAgent },
            ip: scenario.ip,
          });
          (req as any).correlationId = scenario.correlationId;
          if (scenario.userId) {
            (req as any).user = { id: scenario.userId };
          }

          // Set up response with event emitter
          const listeners: Record<string, Function[]> = {};
          const res = createMockResponse();
          (res as any).on = vi.fn((event: string, handler: Function) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler);
          });
          res.statusCode = scenario.statusCode;

          // Simulate the correlation ID middleware setting the X-Request-Id header
          res.setHeader('x-request-id', scenario.correlationId);

          const next = createMockNext();

          middleware(req, res as any, next);

          // Simulate response finish
          if (listeners['finish']) {
            for (const handler of listeners['finish']) {
              handler();
            }
          }

          // Verify the requestId in the log matches the X-Request-Id header
          expect(logger.info).toHaveBeenCalledTimes(1);
          const logCall = (logger.info as any).mock.calls[0];
          const logData = logCall[1];

          // The requestId in the log must match the correlation ID
          expect(logData.requestId).toBe(scenario.correlationId);

          // The X-Request-Id response header must also match
          const xRequestIdHeader = res._headers['x-request-id'];
          expect(logData.requestId).toBe(xRequestIdHeader);
        }),
        { numRuns: 300 }
      );
    });

    it('DB persist entry contains all required fields matching the log', { timeout: 15000 }, () => {
      fc.assert(
        fc.property(requestScenarioArb, (scenario) => {
          vi.clearAllMocks();

          const middleware = createRequestLogger();
          const req = createMockRequest({
            method: scenario.method,
            path: scenario.path,
            url: scenario.path,
            headers: { 'user-agent': scenario.userAgent },
            ip: scenario.ip,
          });
          (req as any).correlationId = scenario.correlationId;
          if (scenario.userId) {
            (req as any).user = { id: scenario.userId };
          }

          // Set up response with event emitter
          const listeners: Record<string, Function[]> = {};
          const res = createMockResponse();
          (res as any).on = vi.fn((event: string, handler: Function) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler);
          });
          res.statusCode = scenario.statusCode;

          const next = createMockNext();

          middleware(req, res as any, next);

          // Simulate response finish
          if (listeners['finish']) {
            for (const handler of listeners['finish']) {
              handler();
            }
          }

          // Verify db.prepare was called with INSERT INTO request_logs
          expect(db.prepare).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO request_logs')
          );

          // Verify the run call contains all required field values
          const prepareCall = (db.prepare as any).mock.results[0].value;
          const runCall = prepareCall.run.mock.calls[0];

          // Arguments order: requestId, userId, method, path, statusCode, durationMs, ipAddress, userAgent, errorMessage
          expect(runCall[0]).toBe(scenario.correlationId); // requestId
          expect(runCall[1]).toBe(scenario.userId);        // userId
          expect(runCall[2]).toBe(scenario.method);        // method
          expect(runCall[3]).toBe(scenario.path);          // path
          expect(runCall[4]).toBe(scenario.statusCode);    // statusCode
          expect(typeof runCall[5]).toBe('number');         // durationMs
          expect(runCall[5]).toBeGreaterThanOrEqual(0);
          expect(runCall[6]).toBe(scenario.ip);            // ipAddress
          expect(runCall[7]).toBe(scenario.userAgent);     // userAgent
        }),
        { numRuns: 300 }
      );
    });

    it('excluded paths do not produce log entries', () => {
      const excludedPathArb = fc.constantFrom(
        '/api/health',
        '/uploads/file.pdf',
        '/uploads/documents/report.docx',
        '/uploads/images/photo.png'
      );

      fc.assert(
        fc.property(excludedPathArb, httpMethodArb, (path, method) => {
          vi.clearAllMocks();

          const middleware = createRequestLogger();
          const req = createMockRequest({
            method,
            path,
            url: path,
          });
          (req as any).correlationId = 'test-id';

          const res = createMockResponse();
          const next = createMockNext();

          middleware(req, res as any, next);

          // next() should be called (request continues)
          expect(next).toHaveBeenCalled();

          // But no logger call should happen (no finish listener attached)
          expect(logger.info).not.toHaveBeenCalled();
          expect(db.prepare).not.toHaveBeenCalled();
        }),
        { numRuns: 100 }
      );
    });
  });
});
