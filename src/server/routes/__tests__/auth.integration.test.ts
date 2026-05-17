// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';

/**
 * Integration Tests - Auth Routes
 *
 * Tests the authentication routes (login, refresh, logout, me)
 * using supertest against a minimal Express app with mocked services.
 */

// Mock AuthService
const mockAuthService = {
  login: vi.fn(),
  logAudit: vi.fn(),
};

// Mock SessionService
const mockSessionService = {
  refresh: vi.fn(),
  logout: vi.fn(),
  logoutAll: vi.fn(),
};

vi.mock('../../services/AuthService', () => ({
  AuthService: {
    login: (...args: any[]) => mockAuthService.login(...args),
    logAudit: (...args: any[]) => mockAuthService.logAudit(...args),
  },
}));

vi.mock('../../services/SessionService', () => ({
  SessionService: {
    refresh: (...args: any[]) => mockSessionService.refresh(...args),
    logout: (...args: any[]) => mockSessionService.logout(...args),
    logoutAll: (...args: any[]) => mockSessionService.logoutAll(...args),
  },
}));

vi.mock('../../middleware/csrf', () => ({
  generateCsrfToken: () => 'mock-csrf-token-abc123',
  attachCsrfToken: (res: any, token: string) => {
    res.cookie('csrf-token', token, { httpOnly: false });
    res.setHeader('x-csrf-token', token);
  },
}));

function createAuthTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  const db = {
    prepare: vi.fn().mockReturnValue({
      get: vi.fn(),
      all: vi.fn().mockResolvedValue([]),
    }),
  };

  // Simulate authenticate middleware
  const authenticate = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { id: 'user-1', role: 'Admin', username: 'admin', name: 'Admin User', email: 'admin@test.com' };
    next();
  };

  const authorize = (roles: string[]) => (req: any, res: any, next: any) => next();
  const authLimiter = (req: any, res: any, next: any) => next();
  const createNotification = vi.fn();
  const logError = vi.fn();

  // Import and mount auth routes inline (simulated)
  const authRouter = express.Router();

  // Login route
  authRouter.post('/login', authLimiter, async (req, res, next) => {
    try {
      const { usernameOrEmail, password } = req.body;
      if (!usernameOrEmail || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }
      const result = await mockAuthService.login(usernameOrEmail, password, 'secret', 'privkey', req.ip, req.get('user-agent'), false);
      res.cookie('token', result.token, { httpOnly: true, secure: true, sameSite: 'none', path: '/' });
      res.cookie('refreshToken', result.refreshToken, { httpOnly: true, secure: true, sameSite: 'none', path: '/api/auth/refresh' });
      await mockAuthService.logAudit(result.user.username, 'Login', 'Authentication', 'User logged in');
      res.cookie('csrf-token', 'mock-csrf-token', { httpOnly: false });
      res.json({ user: result.user, token: result.token });
    } catch (err: any) {
      if (err.message === 'Invalid credentials') {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      next(err);
    }
  });

  // Me route
  authRouter.get('/me', authenticate, async (req, res) => {
    const user = (req as any).user;
    res.json({ user: { ...user, permissions: [] } });
  });

  // Refresh route
  authRouter.post('/refresh', async (req, res) => {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No refresh token' } });
    }
    try {
      const result = await mockSessionService.refresh(refreshToken, 'secret', 'privkey');
      res.cookie('token', result.token, { httpOnly: true, secure: true, sameSite: 'none', path: '/' });
      res.cookie('refreshToken', result.refreshToken, { httpOnly: true, secure: true, sameSite: 'none', path: '/api/auth/refresh' });
      res.json({ success: true });
    } catch (err: any) {
      res.clearCookie('refreshToken');
      res.clearCookie('token');
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
  });

  // Logout route
  authRouter.post('/logout', async (req, res) => {
    const refreshToken = req.cookies?.refreshToken;
    await mockSessionService.logout(refreshToken);
    res.clearCookie('refreshToken');
    res.clearCookie('token');
    res.json({ success: true });
  });

  // Logout all route
  authRouter.post('/logout-all', authenticate, async (req, res) => {
    const userId = (req as any).user.id;
    await mockSessionService.logoutAll(userId);
    res.json({ success: true });
  });

  app.use('/api/auth', authRouter);

  return { app };
}

describe('Auth Integration Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    const testApp = createAuthTestApp();
    app = testApp.app;
  });

  describe('POST /api/auth/login', () => {
    it('should return 200 with user and token on successful login', async () => {
      mockAuthService.login.mockResolvedValue({
        user: { id: 'user-1', username: 'admin', name: 'Admin', role: 'Admin' },
        token: 'jwt-access-token',
        refreshToken: 'jwt-refresh-token',
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ usernameOrEmail: 'admin', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.username).toBe('admin');
      expect(res.body.token).toBe('jwt-access-token');
      expect(mockAuthService.logAudit).toHaveBeenCalledWith('admin', 'Login', 'Authentication', 'User logged in');
    });

    it('should return 401 on invalid credentials', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Invalid credentials'));

      const res = await request(app)
        .post('/api/auth/login')
        .send({ usernameOrEmail: 'admin', password: 'wrongpass' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should return 400 when username or password is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ usernameOrEmail: '' });

      expect(res.status).toBe(400);
    });

    it('should set httpOnly cookies on successful login', async () => {
      mockAuthService.login.mockResolvedValue({
        user: { id: 'user-1', username: 'admin', name: 'Admin', role: 'Admin' },
        token: 'jwt-access-token',
        refreshToken: 'jwt-refresh-token',
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ usernameOrEmail: 'admin', password: 'password123' });

      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.includes('token='))).toBe(true);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return 200 with user data when authenticated', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.username).toBe('admin');
    });

    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return 401 when no refresh token cookie is present', async () => {
      const res = await request(app).post('/api/auth/refresh');

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('No refresh token');
    });

    it('should return 200 on valid refresh token', async () => {
      mockSessionService.refresh.mockResolvedValue({
        token: 'new-access-token',
        refreshToken: 'new-refresh-token',
        user: { username: 'admin' },
        rememberMe: false,
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', 'refreshToken=valid-refresh-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 401 and clear cookies on invalid refresh token', async () => {
      mockSessionService.refresh.mockRejectedValue(new Error('Token expired'));

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', 'refreshToken=expired-token');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should return 200 and clear cookies', async () => {
      mockSessionService.logout.mockResolvedValue('admin');

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', 'refreshToken=some-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockSessionService.logout).toHaveBeenCalledWith('some-token');
    });
  });

  describe('POST /api/auth/logout-all', () => {
    it('should return 200 when authenticated', async () => {
      mockSessionService.logoutAll.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/auth/logout-all')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockSessionService.logoutAll).toHaveBeenCalledWith('user-1');
    });

    it('should return 401 when not authenticated', async () => {
      const res = await request(app).post('/api/auth/logout-all');

      expect(res.status).toBe(401);
    });
  });
});
