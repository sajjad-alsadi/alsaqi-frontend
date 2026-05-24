import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSecureFileMiddleware } from './secureFile';
import {
  createMockRequest,
  createMockResponse,
} from '../__tests__/helpers/apiTestUtils';
import path from 'path';
import fs from 'fs';

// Mock the db module
vi.mock('../db/index', () => ({
  default: {
    prepare: vi.fn(() => ({
      run: vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 }),
      get: vi.fn().mockResolvedValue(null),
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

describe('secureFile middleware', () => {
  const uploadDir = '/test/uploads';
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  /**
   * Creates a mock authenticate middleware that either succeeds or fails.
   */
  function createMockAuthenticate(shouldSucceed: boolean, user?: any) {
    return (req: any, res: any, next: any) => {
      if (shouldSucceed && user) {
        req.user = user;
        next();
      } else if (!shouldSucceed) {
        res.status(401).json({ error: 'Unauthorized' });
      } else {
        next();
      }
    };
  }

  describe('authentication enforcement', () => {
    it('should return 401 when authentication fails', async () => {
      const authenticate = createMockAuthenticate(false);
      const middleware = createSecureFileMiddleware(authenticate, uploadDir);

      const req = createMockRequest({
        method: 'GET',
        path: '/document.pdf',
        url: '/document.pdf',
        ip: '192.168.1.1',
      });

      const res = createMockResponse();
      (res as any).sendFile = vi.fn();

      middleware(req, res as any, vi.fn());

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res._json).toEqual({ error: 'Unauthorized' });
    });

    it('should return 401 when user is not set after authenticate', async () => {
      // authenticate calls next() but doesn't set req.user
      const authenticate = (req: any, res: any, next: any) => {
        next();
      };
      const middleware = createSecureFileMiddleware(authenticate, uploadDir);

      const req = createMockRequest({
        method: 'GET',
        path: '/document.pdf',
        url: '/document.pdf',
        ip: '192.168.1.1',
      });

      const res = createMockResponse();
      (res as any).sendFile = vi.fn();

      middleware(req, res as any, vi.fn());

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res._json).toEqual({ error: 'Unauthorized' });
    });

    it('should log denied access for unauthenticated requests', async () => {
      // Use an authenticate that sends 401 directly (like the real one does)
      const authenticate = (req: any, res: any, next: any) => {
        res.status(401).json({ error: 'Unauthorized' });
      };
      const middleware = createSecureFileMiddleware(authenticate, uploadDir);

      const req = createMockRequest({
        method: 'GET',
        path: '/secret.pdf',
        url: '/secret.pdf',
        ip: '10.0.0.1',
      });

      const res = createMockResponse();
      (res as any).sendFile = vi.fn();

      middleware(req, res as any, vi.fn());

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO file_access_logs')
      );
    });
  });

  describe('permission enforcement', () => {
    it('should return 403 when user lacks module permission', async () => {
      const user = { id: 'user-1', role: 'Viewer', username: 'viewer1', name: 'Viewer', email: 'v@test.com' };
      const authenticate = createMockAuthenticate(true, user);

      // Mock permission check to return null (no permission)
      (db.prepare as any).mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO file_access_logs')) {
          return { run: vi.fn().mockResolvedValue({ changes: 1 }) };
        }
        // Permission check returns null (no permission)
        return { get: vi.fn().mockResolvedValue(null) };
      });

      const middleware = createSecureFileMiddleware(authenticate, uploadDir);

      const req = createMockRequest({
        method: 'GET',
        path: '/audit-report.pdf',
        url: '/audit-report.pdf',
        ip: '192.168.1.5',
      });

      const res = createMockResponse();
      (res as any).sendFile = vi.fn();

      middleware(req, res as any, vi.fn());

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._json).toEqual({ error: 'Forbidden' });
    });

    it('should allow Admin users without checking permissions', async () => {
      const user = { id: 'admin-1', role: 'Admin', username: 'admin', name: 'Admin', email: 'a@test.com' };
      const authenticate = createMockAuthenticate(true, user);

      (db.prepare as any).mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO file_access_logs')) {
          return { run: vi.fn().mockResolvedValue({ changes: 1 }) };
        }
        return { get: vi.fn().mockResolvedValue({ '1': 1 }) };
      });

      const middleware = createSecureFileMiddleware(authenticate, uploadDir);

      const req = createMockRequest({
        method: 'GET',
        path: '/report.pdf',
        url: '/report.pdf',
        ip: '192.168.1.1',
      });

      const res = createMockResponse();
      (res as any).sendFile = vi.fn();

      middleware(req, res as any, vi.fn());

      await new Promise((resolve) => setTimeout(resolve, 20));

      // Should not return 403
      expect(res.status).not.toHaveBeenCalledWith(403);
      // Should attempt to serve the file
      expect((res as any).sendFile).toHaveBeenCalled();
    });

    it('should allow users with valid module permission', async () => {
      const user = { id: 'auditor-1', role: 'Internal Auditor', username: 'auditor', name: 'Auditor', email: 'aud@test.com' };
      const authenticate = createMockAuthenticate(true, user);

      (db.prepare as any).mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO file_access_logs')) {
          return { run: vi.fn().mockResolvedValue({ changes: 1 }) };
        }
        // Permission check returns a result (has permission)
        return { get: vi.fn().mockResolvedValue({ '1': 1 }) };
      });

      const middleware = createSecureFileMiddleware(authenticate, uploadDir);

      const req = createMockRequest({
        method: 'GET',
        path: '/evidence.pdf',
        url: '/evidence.pdf',
        ip: '192.168.1.10',
      });

      const res = createMockResponse();
      (res as any).sendFile = vi.fn();

      middleware(req, res as any, vi.fn());

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(res.status).not.toHaveBeenCalledWith(403);
      expect((res as any).sendFile).toHaveBeenCalled();
    });
  });

  describe('access logging', () => {
    it('should log granted access for authorized users', async () => {
      const user = { id: 'admin-1', role: 'Admin', username: 'admin', name: 'Admin', email: 'a@test.com' };
      const authenticate = createMockAuthenticate(true, user);

      const runMock = vi.fn().mockResolvedValue({ changes: 1 });
      (db.prepare as any).mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO file_access_logs')) {
          return { run: runMock };
        }
        return { get: vi.fn().mockResolvedValue({ '1': 1 }) };
      });

      const middleware = createSecureFileMiddleware(authenticate, uploadDir);

      const req = createMockRequest({
        method: 'GET',
        path: '/report.pdf',
        url: '/report.pdf',
        ip: '10.0.0.5',
      });

      const res = createMockResponse();
      (res as any).sendFile = vi.fn();

      middleware(req, res as any, vi.fn());

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(runMock).toHaveBeenCalledWith(
        'admin-1',
        '/report.pdf',
        'view',
        'granted',
        '10.0.0.5'
      );
    });

    it('should log denied access for unauthorized users', async () => {
      const user = { id: 'user-2', role: 'Viewer', username: 'viewer', name: 'Viewer', email: 'v@test.com' };
      const authenticate = createMockAuthenticate(true, user);

      const runMock = vi.fn().mockResolvedValue({ changes: 1 });
      (db.prepare as any).mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO file_access_logs')) {
          return { run: runMock };
        }
        return { get: vi.fn().mockResolvedValue(null) };
      });

      const middleware = createSecureFileMiddleware(authenticate, uploadDir);

      const req = createMockRequest({
        method: 'GET',
        path: '/secret.pdf',
        url: '/secret.pdf',
        ip: '10.0.0.10',
      });

      const res = createMockResponse();
      (res as any).sendFile = vi.fn();

      middleware(req, res as any, vi.fn());

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(runMock).toHaveBeenCalledWith(
        'user-2',
        '/secret.pdf',
        'view',
        'denied',
        '10.0.0.10'
      );
    });

    it('should not log access when auditAccess is disabled', async () => {
      const user = { id: 'admin-1', role: 'Admin', username: 'admin', name: 'Admin', email: 'a@test.com' };
      const authenticate = createMockAuthenticate(true, user);

      (db.prepare as any).mockImplementation(() => ({
        run: vi.fn().mockResolvedValue({ changes: 1 }),
        get: vi.fn().mockResolvedValue({ '1': 1 }),
      }));

      const middleware = createSecureFileMiddleware(authenticate, uploadDir, { auditAccess: false });

      const req = createMockRequest({
        method: 'GET',
        path: '/report.pdf',
        url: '/report.pdf',
        ip: '10.0.0.5',
      });

      const res = createMockResponse();
      (res as any).sendFile = vi.fn();

      middleware(req, res as any, vi.fn());

      await new Promise((resolve) => setTimeout(resolve, 20));

      // Should not have called INSERT INTO file_access_logs
      const insertCalls = (db.prepare as any).mock.calls.filter(
        (call: any[]) => call[0]?.includes('INSERT INTO file_access_logs')
      );
      expect(insertCalls.length).toBe(0);
    });
  });

  describe('file serving', () => {
    it('should prevent path traversal attacks', async () => {
      const user = { id: 'admin-1', role: 'Admin', username: 'admin', name: 'Admin', email: 'a@test.com' };
      const authenticate = createMockAuthenticate(true, user);

      (db.prepare as any).mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO file_access_logs')) {
          return { run: vi.fn().mockResolvedValue({ changes: 1 }) };
        }
        return { get: vi.fn().mockResolvedValue({ '1': 1 }) };
      });

      // Use a real absolute path for the upload directory so path traversal detection works
      const realUploadDir = path.resolve('/app/data/uploads');
      const middleware = createSecureFileMiddleware(authenticate, realUploadDir);

      // This path, when normalized and joined, should escape the upload directory
      // On Windows, path.normalize('/../../../etc/passwd') -> '\etc\passwd'
      // path.join('/app/data/uploads', '\etc\passwd') -> '\app\data\uploads\etc\passwd'
      // which resolves within the upload dir on Windows.
      // Use a path that actually escapes on all platforms:
      const req = createMockRequest({
        method: 'GET',
        path: '/../../etc/passwd',
        url: '/../../etc/passwd',
        ip: '192.168.1.1',
      });

      const res = createMockResponse();
      (res as any).sendFile = vi.fn();

      // Mock fs to simulate the file exists (so we can test the path check, not the file check)
      (fs.existsSync as any).mockReturnValue(true);
      (fs.statSync as any).mockReturnValue({ isFile: () => true });

      middleware(req, res as any, vi.fn());

      await new Promise((resolve) => setTimeout(resolve, 20));

      // On Windows, path normalization may resolve traversal differently.
      // The key behavior is that either:
      // 1. The path is blocked (403) because it escapes the upload dir, OR
      // 2. The path is normalized to stay within the upload dir (safe behavior)
      // Either way, sendFile should not be called with a path outside the upload dir
      if (res.statusCode === 403) {
        expect(res._json).toEqual({ error: 'Forbidden' });
        expect((res as any).sendFile).not.toHaveBeenCalled();
      } else {
        // On Windows, the path gets normalized to stay within the upload dir
        // which is also safe behavior - the traversal is neutralized
        expect((res as any).sendFile).toHaveBeenCalled();
        const calledPath = (res as any).sendFile.mock.calls[0][0];
        expect(calledPath.startsWith(path.resolve(realUploadDir))).toBe(true);
      }
    });

    it('should return 404 when file does not exist', async () => {
      const user = { id: 'admin-1', role: 'Admin', username: 'admin', name: 'Admin', email: 'a@test.com' };
      const authenticate = createMockAuthenticate(true, user);

      (db.prepare as any).mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO file_access_logs')) {
          return { run: vi.fn().mockResolvedValue({ changes: 1 }) };
        }
        return { get: vi.fn().mockResolvedValue({ '1': 1 }) };
      });

      // Mock fs.existsSync to return false for this test
      const fsMod = await import('fs');
      (fsMod.default.existsSync as any).mockReturnValue(false);

      const middleware = createSecureFileMiddleware(authenticate, uploadDir);

      const req = createMockRequest({
        method: 'GET',
        path: '/nonexistent.pdf',
        url: '/nonexistent.pdf',
        ip: '192.168.1.1',
      });

      const res = createMockResponse();
      (res as any).sendFile = vi.fn();

      middleware(req, res as any, vi.fn());

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(res.statusCode).toBe(404);
      expect(res._json).toEqual({ error: 'File not found' });
    });
  });

  describe('options configuration', () => {
    it('should skip auth when requireAuth is false', async () => {
      const authenticate = vi.fn();

      (fs.existsSync as any).mockReturnValue(true);
      (fs.statSync as any).mockReturnValue({ isFile: () => true });

      const middleware = createSecureFileMiddleware(authenticate, uploadDir, { requireAuth: false });

      const req = createMockRequest({
        method: 'GET',
        path: '/public-file.pdf',
        url: '/public-file.pdf',
        ip: '192.168.1.1',
      });

      const res = createMockResponse();
      (res as any).sendFile = vi.fn();

      middleware(req, res as any, vi.fn());

      await new Promise((resolve) => setTimeout(resolve, 20));

      // authenticate should not be called
      expect(authenticate).not.toHaveBeenCalled();
      // File should be served
      expect((res as any).sendFile).toHaveBeenCalled();
    });
  });
});
