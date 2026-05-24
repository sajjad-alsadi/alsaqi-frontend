// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { createSecureFileMiddleware } from '../middleware/secureFile';
import {
  createMockRequest,
  createMockResponse,
} from './helpers/apiTestUtils';

/**
 * Property Test: File Access Authorization Enforcement (Property 8)
 *
 * Feature: api-audit-improvements
 * Property 8: File Access Authorization Enforcement
 *
 * **Validates: Requirements 12.1, 12.2, 12.3**
 *
 * For any file path and any user, access SHALL be denied with 401 if the user is
 * not authenticated, and denied with 403 if the user lacks the required module
 * permission, regardless of the specific file or user combination.
 */

// Mock the db module
vi.mock('../db/index', () => {
  const runMock = vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 });
  const getMock = vi.fn().mockResolvedValue(null);
  return {
    default: {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('INSERT INTO file_access_logs')) {
          return { run: runMock };
        }
        return { get: getMock };
      }),
      _runMock: runMock,
      _getMock: getMock,
    },
  };
});

// Mock the logger module
vi.mock('../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    default: {
      ...(actual as any),
      existsSync: vi.fn().mockReturnValue(true),
      statSync: vi.fn().mockReturnValue({ isFile: () => true }),
    },
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({ isFile: () => true }),
  };
});

import db from '../db/index';

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates a valid file path (no traversal, within uploads) */
const filePathArb = fc
  .tuple(
    fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/),
    fc.constantFrom('.pdf', '.docx', '.xlsx', '.png', '.jpg', '.txt')
  )
  .map(([name, ext]) => `/${name}${ext}`);

/** Generates a valid IP address */
const ipAddressArb = fc
  .tuple(
    fc.integer({ min: 1, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 1, max: 254 })
  )
  .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

/** Generates a user ID */
const userIdArb = fc.uuid();

/** Generates a non-Admin role (roles that require permission checks) */
const nonAdminRoleArb = fc.constantFrom(
  'Internal Auditor',
  'Viewer',
  'Editor',
  'Compliance Officer',
  'Department Manager'
);

/** Generates a user object */
const userArb = fc.record({
  id: userIdArb,
  role: nonAdminRoleArb,
  username: fc.stringMatching(/^[a-z]{3,12}$/),
  name: fc.stringMatching(/^[A-Z][a-z]{2,10} [A-Z][a-z]{2,10}$/),
  email: fc.stringMatching(/^[a-z]{3,8}@test\.com$/),
});

// ─── Helper Functions ────────────────────────────────────────────────────────

const UPLOAD_DIR = '/test/uploads';

/**
 * Creates a mock authenticate middleware that fails (sends 401).
 */
function createFailingAuthenticate() {
  return (req: any, res: any, next: any) => {
    res.status(401).json({ error: 'Unauthorized' });
  };
}

/**
 * Creates a mock authenticate middleware that succeeds (sets user and calls next).
 */
function createSucceedingAuthenticate(user: any) {
  return (req: any, res: any, next: any) => {
    req.user = user;
    next();
  };
}

/**
 * Sets up db mock for permission denied scenario.
 */
function setupPermissionDenied() {
  (db as any)._getMock.mockResolvedValue(null);
}

/**
 * Sets up db mock for permission granted scenario.
 */
function setupPermissionGranted() {
  (db as any)._getMock.mockResolvedValue({ '1': 1 });
}

/**
 * Creates a fresh mock response with sendFile support.
 */
function createTestResponse() {
  const res: any = {
    statusCode: 200,
    _headers: {} as Record<string, string>,
    _json: null as any,
    _ended: false,
    headersSent: false,
    _statusCalled: null as number | null,
    _jsonCalled: null as any,
    _sendFileCalled: false,
  };

  res.status = (code: number) => {
    res.statusCode = code;
    res._statusCalled = code;
    return res;
  };

  res.json = (data: any) => {
    res._json = data;
    res._jsonCalled = data;
    res._ended = true;
    res.headersSent = true;
    return res;
  };

  res.send = (data: any) => {
    res._json = data;
    res._ended = true;
    res.headersSent = true;
    return res;
  };

  res.end = () => {
    res._ended = true;
    res.headersSent = true;
    return res;
  };

  res.setHeader = (name: string, value: string) => {
    res._headers[name.toLowerCase()] = value;
    return res;
  };

  res.getHeader = (name: string) => {
    return res._headers[name.toLowerCase()];
  };

  res.sendFile = (filePath: string) => {
    res._sendFileCalled = true;
    return res;
  };

  return res;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 8: File Access Authorization Enforcement', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe('unauthenticated requests always receive 401', () => {
    it('for any file path, unauthenticated requests get 401 Unauthorized', async () => {
      await fc.assert(
        fc.asyncProperty(filePathArb, ipAddressArb, async (filePath, ip) => {
          setupPermissionDenied();

          const authenticate = createFailingAuthenticate();
          const middleware = createSecureFileMiddleware(authenticate, UPLOAD_DIR);

          const req = createMockRequest({
            method: 'GET',
            path: filePath,
            url: filePath,
            ip,
          });

          const res = createTestResponse();

          middleware(req, res, vi.fn());
          await new Promise((resolve) => setTimeout(resolve, 30));

          // Must return 401
          expect(res._statusCalled).toBe(401);
          expect(res._jsonCalled).toEqual({ error: 'Unauthorized' });
          // File must NOT be served
          expect(res._sendFileCalled).toBe(false);
        }),
        { numRuns: 100 }
      );
    }, 30000);
  });

  describe('authenticated users without permission always receive 403', () => {
    it('for any file path and user without module permission, access is denied with 403', async () => {
      await fc.assert(
        fc.asyncProperty(filePathArb, ipAddressArb, userArb, async (filePath, ip, user) => {
          setupPermissionDenied();

          const authenticate = createSucceedingAuthenticate(user);
          const middleware = createSecureFileMiddleware(authenticate, UPLOAD_DIR);

          const req = createMockRequest({
            method: 'GET',
            path: filePath,
            url: filePath,
            ip,
          });

          const res = createTestResponse();

          middleware(req, res, vi.fn());
          await new Promise((resolve) => setTimeout(resolve, 30));

          // Must return 403
          expect(res._statusCalled).toBe(403);
          expect(res._jsonCalled).toEqual({ error: 'Forbidden' });
          // File must NOT be served
          expect(res._sendFileCalled).toBe(false);
        }),
        { numRuns: 100 }
      );
    }, 30000);
  });

  describe('authenticated users with permission are granted access', () => {
    it('for any file path and user with module permission, file is served (not 401 or 403)', async () => {
      await fc.assert(
        fc.asyncProperty(filePathArb, ipAddressArb, userArb, async (filePath, ip, user) => {
          setupPermissionGranted();

          const authenticate = createSucceedingAuthenticate(user);
          const middleware = createSecureFileMiddleware(authenticate, UPLOAD_DIR);

          const req = createMockRequest({
            method: 'GET',
            path: filePath,
            url: filePath,
            ip,
          });

          const res = createTestResponse();

          middleware(req, res, vi.fn());
          await new Promise((resolve) => setTimeout(resolve, 30));

          // Must NOT return 401 or 403
          expect(res._statusCalled).not.toBe(401);
          expect(res._statusCalled).not.toBe(403);
          // File must be served
          expect(res._sendFileCalled).toBe(true);
        }),
        { numRuns: 100 }
      );
    }, 30000);
  });

  describe('authorization enforcement is independent of file path', () => {
    it('the same user state produces the same authorization result regardless of file path', async () => {
      await fc.assert(
        fc.asyncProperty(
          userArb,
          filePathArb,
          filePathArb,
          ipAddressArb,
          async (user, filePath1, filePath2, ip) => {
            setupPermissionDenied();

            // Test with first file path - unauthenticated
            const authenticate1 = createFailingAuthenticate();
            const middleware1 = createSecureFileMiddleware(authenticate1, UPLOAD_DIR);

            const req1 = createMockRequest({ method: 'GET', path: filePath1, url: filePath1, ip });
            const res1 = createTestResponse();

            middleware1(req1, res1, vi.fn());
            await new Promise((resolve) => setTimeout(resolve, 30));

            // Test with second file path - unauthenticated
            const authenticate2 = createFailingAuthenticate();
            const middleware2 = createSecureFileMiddleware(authenticate2, UPLOAD_DIR);

            const req2 = createMockRequest({ method: 'GET', path: filePath2, url: filePath2, ip });
            const res2 = createTestResponse();

            middleware2(req2, res2, vi.fn());
            await new Promise((resolve) => setTimeout(resolve, 30));

            // Both should produce the same status code (401)
            expect(res1.statusCode).toBe(res2.statusCode);
          }
        ),
        { numRuns: 50 }
      );
    }, 30000);
  });
});
