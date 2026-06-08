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
 * Property Test: HTTP request logs contain request metadata (Property 2)
 *
 * Feature: production-readiness-review
 * Property 2: HTTP request logs contain request metadata
 *
 * **Validates: Requirements 2.5**
 *
 * For any HTTP request processed by the API server (with any method, path, or
 * status code), the corresponding log entry SHALL include `method` (string),
 * `path` (string), `statusCode` (number), and `responseTimeMs` (number ≥ 0)
 * fields with correct types.
 */

// Mock the db module
vi.mock('../db/index', () => ({
  default: {
    prepare: vi.fn(() => ({
      run: vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 }),
    })),
  },
}));

// Mock the logger module — capture requestContext.run calls to inspect metadata
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

import { requestContext } from '../utils/logger';

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** All standard HTTP methods */
const httpMethodArb = fc.constantFrom(
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'
);

/** Generates valid URL paths that are not excluded by default config */
const pathArb = fc
  .tuple(
    fc.constantFrom('/api/', '/api/v1/', '/api/v2/', '/dashboard/', '/auth/', '/'),
    fc.stringMatching(/^[a-z][a-z0-9/-]{0,30}$/)
  )
  .map(([prefix, segment]) => `${prefix}${segment}`)
  .filter(
    (path) =>
      path !== '/api/health' &&
      !path.startsWith('/uploads/') &&
      !path.startsWith('/uploads')
  );

/** Valid HTTP status codes spanning all categories */
const statusCodeArb = fc.integer({ min: 100, max: 599 });

/** Generates a UUID-like correlation ID */
const correlationIdArb = fc.uuid();

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 2: HTTP request logs contain request metadata', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('for any HTTP request, log entry includes method (string), path (string), statusCode (number), responseTimeMs (number ≥ 0)', { timeout: 30000 }, () => {
    fc.assert(
      fc.property(
        httpMethodArb,
        pathArb,
        statusCodeArb,
        correlationIdArb,
        (method, path, statusCode, correlationId) => {
          vi.clearAllMocks();

          const middleware = createRequestLogger();

          const req = createMockRequest({
            method,
            path,
            url: path,
            headers: { 'user-agent': 'TestAgent/1.0' },
            ip: '192.168.1.1',
          });
          (req as any).correlationId = correlationId;

          // Set up response with event emitter to capture 'finish' handler
          const listeners: Record<string, Function[]> = {};
          const res = createMockResponse();
          (res as any).on = vi.fn((event: string, handler: Function) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler);
          });
          res.statusCode = statusCode;

          const next = createMockNext();

          // Execute middleware
          middleware(req, res as any, next);

          // Simulate response finish event
          if (listeners['finish']) {
            for (const handler of listeners['finish']) {
              handler();
            }
          }

          // Verify requestContext.run was called with the metadata store
          expect(requestContext.run).toHaveBeenCalledTimes(1);
          const contextStore = (requestContext.run as any).mock.calls[0][0];

          // Property assertions: correct types for each field
          // method must be a string
          expect(typeof contextStore.method).toBe('string');
          expect(contextStore.method).toBe(method);

          // path must be a string
          expect(typeof contextStore.path).toBe('string');
          expect(contextStore.path).toBe(path);

          // statusCode must be a number
          expect(typeof contextStore.statusCode).toBe('number');
          expect(contextStore.statusCode).toBe(statusCode);

          // responseTimeMs must be a non-negative number
          expect(typeof contextStore.responseTimeMs).toBe('number');
          expect(contextStore.responseTimeMs).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 150 }
    );
  });
});
