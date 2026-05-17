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

      const middleware = middlewares.checkPermission('Audit', 'read');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow access when user has role-based permission', async () => {
      db.prepare.mockReturnValue({
        get: vi.fn().mockResolvedValue({ '?column?': 1 }), // permission found
        all: vi.fn().mockResolvedValue([]),
        run: vi.fn(),
      });

      const req = createMockReq({ id: 'user-1', role: UserRole.INTERNAL_AUDITOR });
      const res = createMockRes();
      const next = vi.fn();

      const middleware = middlewares.checkPermission('Audit', 'read');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny access when user lacks permission', async () => {
      db.prepare.mockReturnValue({
        get: vi.fn().mockResolvedValue(null), // no permission found
        all: vi.fn().mockResolvedValue([]),
        run: vi.fn(),
      });

      const req = createMockReq({ id: 'user-1', role: UserRole.VIEWER });
      const res = createMockRes();
      const next = vi.fn();

      const middleware = middlewares.checkPermission('Audit', 'write');
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Forbidden') })
      );
    });

    it('should include module and action in the error message', async () => {
      db.prepare.mockReturnValue({
        get: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue([]),
        run: vi.fn(),
      });

      const req = createMockReq({ id: 'user-1', role: UserRole.VIEWER });
      const res = createMockRes();
      const next = vi.fn();

      const middleware = middlewares.checkPermission('Finding', 'delete');
      await middleware(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('delete'),
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Finding'),
        })
      );
    });

    it('should cache permission results for subsequent calls', async () => {
      const mockGet = vi.fn().mockResolvedValue({ '?column?': 1 });
      db.prepare.mockReturnValue({
        get: mockGet,
        all: vi.fn().mockResolvedValue([]),
        run: vi.fn(),
      });

      const req = createMockReq({ id: 'user-1', role: UserRole.INTERNAL_AUDITOR });
      const res = createMockRes();
      const next = vi.fn();

      const middleware = middlewares.checkPermission('Audit', 'read');

      // First call - should hit DB
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const next2 = vi.fn();
      await middleware(req, createMockRes(), next2);
      expect(next2).toHaveBeenCalledTimes(1);

      // DB should only be called once (cached on second call)
      expect(mockGet).toHaveBeenCalledTimes(1);
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
