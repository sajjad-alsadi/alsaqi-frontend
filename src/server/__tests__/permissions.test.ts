// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { createAuthMiddlewares } from '../middleware/auth';
import { UserRole, ADMIN_ROLES, COMPLIANCE_ROLES, STAFF_ROLES } from '../../constants';

// Mock jsonwebtoken at module level so the middleware uses the mock
vi.mock('jsonwebtoken', () => {
  const JsonWebTokenError = class extends Error {
    name = 'JsonWebTokenError';
    constructor(msg: string) { super(msg); }
  };
  const TokenExpiredError = class extends Error {
    name = 'TokenExpiredError';
    constructor(msg: string) { super(msg); }
  };
  return {
    default: {
      verify: vi.fn(),
      sign: vi.fn(),
      JsonWebTokenError,
      TokenExpiredError,
    },
    verify: vi.fn(),
    sign: vi.fn(),
    JsonWebTokenError,
    TokenExpiredError,
  };
});

// Mock express-rate-limit
vi.mock('express-rate-limit', () => ({
  rateLimit: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

// Mock ModuleRegistry to return module definitions for test modules
vi.mock('../../permissions/registry', () => ({
  ModuleRegistry: {
    getModule: vi.fn((name: string) => {
      // Return a mock module definition for any module name used in tests
      return {
        name,
        label: { en: name, ar: name },
        actions: ['View', 'Create', 'Edit', 'Delete', 'Approve'],
        defaults: {},
      };
    }),
  },
}));

// Mock PermissionService
vi.mock('../services/PermissionService', () => ({
  PermissionService: {
    hasPermission: vi.fn(),
  },
}));

import { PermissionService } from '../services/PermissionService';
import { ModuleRegistry } from '../../permissions/registry';

describe('Permission Middleware', () => {
  let db: any;
  let middlewares: ReturnType<typeof createAuthMiddlewares>;
  const JWT_SECRET = 'test-secret';
  const JWT_PUBLIC_KEY = 'test-public-key';

  beforeEach(() => {
    vi.clearAllMocks();

    db = {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue([]),
        run: vi.fn().mockResolvedValue({ lastInsertRowid: 0, changes: 0 }),
      }),
    };

    middlewares = createAuthMiddlewares(db, JWT_SECRET, JWT_PUBLIC_KEY);
    // Clear the internal cache before each test
    middlewares.cache.clear();
  });

  function createMockReq(user: any, overrides: any = {}) {
    return {
      user,
      cookies: {},
      headers: {},
      originalUrl: '/api/test',
      ...overrides,
    };
  }

  function createMockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.cookie = vi.fn().mockReturnValue(res);
    return res;
  }

  describe('checkPermission', () => {
    it('should allow Admin users to bypass permission checks', async () => {
      const req = createMockReq({ id: 'admin-1', role: UserRole.ADMIN });
      const res = createMockRes();
      const next = vi.fn();

      const middleware = middlewares.checkPermission('Audit', 'View');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      // Admin bypass should NOT call PermissionService
      expect(PermissionService.hasPermission).not.toHaveBeenCalled();
    });

    it('should allow access when user has role-based permission', async () => {
      vi.mocked(PermissionService.hasPermission).mockResolvedValue(true);

      const req = createMockReq({ id: 'user-1', role: UserRole.INTERNAL_AUDITOR });
      const res = createMockRes();
      const next = vi.fn();

      const middleware = middlewares.checkPermission('Audit', 'View');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(PermissionService.hasPermission).toHaveBeenCalledWith('user-1', 'Audit', 'View');
    });

    it('should deny access when user lacks permission', async () => {
      vi.mocked(PermissionService.hasPermission).mockResolvedValue(false);

      const req = createMockReq({ id: 'user-1', role: UserRole.VIEWER });
      const res = createMockRes();
      const next = vi.fn();

      const middleware = middlewares.checkPermission('Audit', 'Edit');
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Forbidden'),
          code: 'PERMISSION_DENIED',
          module: 'Audit',
          action: 'Edit',
        })
      );
    });

    it('should include module and action in the error message', async () => {
      vi.mocked(PermissionService.hasPermission).mockResolvedValue(false);

      const req = createMockReq({ id: 'user-1', role: UserRole.VIEWER });
      const res = createMockRes();
      const next = vi.fn();

      const middleware = middlewares.checkPermission('Finding', 'Delete');
      await middleware(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Delete'),
          module: 'Finding',
          action: 'Delete',
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Finding'),
        })
      );
    });

    it('should return 401 when req.user is not populated', async () => {
      const req = createMockReq(undefined);
      const res = createMockRes();
      const next = vi.fn();

      const middleware = middlewares.checkPermission('Audit', 'View');
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Authentication required') })
      );
    });

    it('should return 500 when PermissionService throws an error', async () => {
      vi.mocked(PermissionService.hasPermission).mockRejectedValue(new Error('DB connection failed'));

      const req = createMockReq({ id: 'user-1', role: UserRole.VIEWER });
      const res = createMockRes();
      const next = vi.fn();

      const middleware = middlewares.checkPermission('Audit', 'View');
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Internal authorization error') })
      );
      // Should NOT expose internal error details
      expect(res.json).toHaveBeenCalledWith(
        expect.not.objectContaining({ error: expect.stringContaining('DB connection') })
      );
    });

    describe('unregistered module handling', () => {
      it('should throw at startup in dev mode when module is not registered', () => {
        // Make getModule return undefined for an unregistered module
        vi.mocked(ModuleRegistry.getModule).mockReturnValueOnce(undefined);

        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';

        try {
          expect(() => {
            middlewares.checkPermission('NonExistentModule', 'View');
          }).toThrow(/NonExistentModule.*not registered/);
        } finally {
          process.env.NODE_ENV = originalEnv;
        }
      });

      it('should return 500 in production mode when module is not registered', async () => {
        vi.mocked(ModuleRegistry.getModule).mockReturnValueOnce(undefined);

        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        try {
          const middleware = middlewares.checkPermission('NonExistentModule', 'View');
          const req = createMockReq({ id: 'user-1', role: UserRole.VIEWER });
          const res = createMockRes();
          const next = vi.fn();

          await middleware(req, res, next);

          expect(next).not.toHaveBeenCalled();
          expect(res.status).toHaveBeenCalledWith(500);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.stringContaining('Internal authorization configuration error') })
          );
        } finally {
          process.env.NODE_ENV = originalEnv;
        }
      });
    });
  });

  describe('authorize', () => {
    it('should allow access when user role is in allowed roles', () => {
      const req = createMockReq({ id: 'user-1', role: UserRole.ADMIN });
      const res = createMockRes();
      const next = vi.fn();

      const middleware = middlewares.authorize([UserRole.ADMIN, UserRole.MANAGER]);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny access when user role is not in allowed roles', () => {
      const req = createMockReq({ id: 'user-1', role: UserRole.VIEWER });
      const res = createMockRes();
      const next = vi.fn();

      const middleware = middlewares.authorize([UserRole.ADMIN, UserRole.MANAGER]);
      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Forbidden: Insufficient permissions' })
      );
    });

    it('should work with ADMIN_ROLES constant', () => {
      const adminReq = createMockReq({ id: 'admin-1', role: UserRole.ADMIN });
      const managerReq = createMockReq({ id: 'mgr-1', role: UserRole.MANAGER });
      const viewerReq = createMockReq({ id: 'viewer-1', role: UserRole.VIEWER });

      const res1 = createMockRes();
      const res2 = createMockRes();
      const res3 = createMockRes();
      const next1 = vi.fn();
      const next2 = vi.fn();
      const next3 = vi.fn();

      const middleware = middlewares.authorize(ADMIN_ROLES);

      middleware(adminReq, res1, next1);
      middleware(managerReq, res2, next2);
      middleware(viewerReq, res3, next3);

      expect(next1).toHaveBeenCalled();
      expect(next2).toHaveBeenCalled();
      expect(next3).not.toHaveBeenCalled();
    });

    it('should work with COMPLIANCE_ROLES constant', () => {
      const complianceReq = createMockReq({ id: 'co-1', role: UserRole.COMPLIANCE_OFFICER });
      const auditorReq = createMockReq({ id: 'aud-1', role: UserRole.INTERNAL_AUDITOR });

      const res1 = createMockRes();
      const res2 = createMockRes();
      const next1 = vi.fn();
      const next2 = vi.fn();

      const middleware = middlewares.authorize(COMPLIANCE_ROLES);

      middleware(complianceReq, res1, next1);
      middleware(auditorReq, res2, next2);

      expect(next1).toHaveBeenCalled();
      expect(next2).not.toHaveBeenCalled();
    });

    it('should work with STAFF_ROLES constant', () => {
      const auditorReq = createMockReq({ id: 'aud-1', role: UserRole.INTERNAL_AUDITOR });
      const riskReq = createMockReq({ id: 'risk-1', role: UserRole.RISK_OFFICER });

      const res1 = createMockRes();
      const res2 = createMockRes();
      const next1 = vi.fn();
      const next2 = vi.fn();

      const middleware = middlewares.authorize(STAFF_ROLES);

      middleware(auditorReq, res1, next1);
      middleware(riskReq, res2, next2);

      expect(next1).toHaveBeenCalled();
      expect(next2).not.toHaveBeenCalled(); // Risk Officer is not in STAFF_ROLES
    });
  });

  describe('authenticate', () => {
    it('should return 401 when no token is provided', async () => {
      const req = { cookies: {}, headers: {}, originalUrl: '/api/test' };
      const res = createMockRes();
      const next = vi.fn();

      await middlewares.authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when token is invalid', async () => {
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new (jwt as any).JsonWebTokenError('invalid token');
      });

      const req = { cookies: { token: 'invalid-token' }, headers: {}, originalUrl: '/api/test' };
      const res = createMockRes();
      const next = vi.fn();

      await middlewares.authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('should return 403 when user account is suspended', async () => {
      vi.mocked(jwt.verify).mockReturnValue({ id: 'user-1', session_version: 1 } as any);

      db.prepare.mockReturnValue({
        get: vi.fn().mockResolvedValue({
          id: 'user-1',
          role: 'Admin',
          status: 'Suspended',
          username: 'testuser',
          name: 'Test',
          email: 'test@test.com',
          session_version: 1,
          requires_password_change: false,
        }),
        all: vi.fn(),
        run: vi.fn(),
      });

      const req = { cookies: { token: 'valid-token' }, headers: {}, originalUrl: '/api/test' };
      const res = createMockRes();
      const next = vi.fn();

      // Need a fresh middleware instance with the updated db mock
      middlewares = createAuthMiddlewares(db, JWT_SECRET, JWT_PUBLIC_KEY);
      middlewares.cache.clear();

      await middlewares.authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when session version does not match', async () => {
      vi.mocked(jwt.verify).mockReturnValue({ id: 'user-1', session_version: 1 } as any);

      db.prepare.mockReturnValue({
        get: vi.fn().mockResolvedValue({
          id: 'user-1',
          role: 'Admin',
          status: 'Active',
          username: 'testuser',
          name: 'Test',
          email: 'test@test.com',
          session_version: 2, // Different from token's session_version
          requires_password_change: false,
        }),
        all: vi.fn(),
        run: vi.fn(),
      });

      const req = { cookies: { token: 'valid-token' }, headers: {}, originalUrl: '/api/test' };
      const res = createMockRes();
      const next = vi.fn();

      middlewares = createAuthMiddlewares(db, JWT_SECRET, JWT_PUBLIC_KEY);
      middlewares.cache.clear();

      await middlewares.authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Session invalidated' });
    });

    it('should extract token from Authorization header when cookie is absent', async () => {
      vi.mocked(jwt.verify).mockReturnValue({ id: 'user-1', session_version: 1 } as any);

      db.prepare.mockReturnValue({
        get: vi.fn().mockResolvedValue({
          id: 'user-1',
          role: 'Admin',
          status: 'Active',
          username: 'testuser',
          name: 'Test',
          email: 'test@test.com',
          session_version: 1,
          requires_password_change: false,
        }),
        all: vi.fn(),
        run: vi.fn(),
      });

      const req = {
        cookies: {},
        headers: { authorization: 'Bearer my-bearer-token' },
        originalUrl: '/api/test',
      };
      const res = createMockRes();
      const next = vi.fn();

      middlewares = createAuthMiddlewares(db, JWT_SECRET, JWT_PUBLIC_KEY);
      middlewares.cache.clear();

      await middlewares.authenticate(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith('my-bearer-token', JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
      expect(next).toHaveBeenCalled();
    });
  });
});
