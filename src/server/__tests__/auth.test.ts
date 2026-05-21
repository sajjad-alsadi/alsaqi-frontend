// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to create mock references that can be used in vi.mock factories
const { mockPrepare, mockTransaction } = vi.hoisted(() => ({
  mockPrepare: vi.fn(),
  mockTransaction: vi.fn(),
}));

// Mock dependencies before importing AuthService
vi.mock('bcryptjs', () => ({
  default: {
    compareSync: vi.fn(),
    hashSync: vi.fn(() => '$2a$10$hashedpassword'),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'mock-jwt-token'),
    verify: vi.fn(),
  },
}));

vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn(() => ({
      toString: vi.fn(() => 'mock-session-token-hex'),
    })),
    createHash: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(() => 'mock-hash'),
    })),
  },
}));

// Mock the database module using the hoisted references
vi.mock('../db/index', () => ({
  db: {
    prepare: mockPrepare,
    transaction: mockTransaction,
  },
}));

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/AuthService';

describe('AuthService', () => {
  const JWT_SECRET = 'test-secret';
  const JWT_PRIVATE_KEY = 'test-private-key';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default transaction mock: execute the function immediately
    mockTransaction.mockImplementation((fn: Function) => {
      return async (...args: any[]) => fn(...args);
    });
  });

  describe('login', () => {
    const validUser = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      password: '$2a$10$hashedpassword',
      role: 'Admin',
      name: 'Test User',
      status: 'Active',
      failed_attempts: 0,
      locked_until: null,
      session_version: 1,
      requires_password_change: false,
      password_last_changed: new Date().toISOString(),
    };

    it('should return user, token, and refreshToken on successful login', async () => {
      const mockGet = vi.fn()
        .mockResolvedValueOnce(validUser) // user lookup
        .mockResolvedValueOnce({ password_expiry_days: 90 }) // settings lookup
        .mockResolvedValueOnce(null); // audit trail last hash
      const mockAll = vi.fn()
        .mockResolvedValueOnce([]) // admins for notification
        .mockResolvedValueOnce([]); // permissions
      const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 0, changes: 1 });

      mockPrepare.mockReturnValue({
        get: mockGet,
        all: mockAll,
        run: mockRun,
      });

      (bcrypt.compareSync as any).mockReturnValue(true);
      (jwt.sign as any).mockReturnValue('mock-jwt-token');

      const result = await AuthService.login('testuser', 'password123', JWT_SECRET, JWT_PRIVATE_KEY);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.username).toBe('testuser');
      expect(result.user.id).toBe('user-123');
    });

    it('should throw AuthError when user is not found', async () => {
      const mockGet = vi.fn().mockResolvedValue(null);
      mockPrepare.mockReturnValue({ get: mockGet, all: vi.fn(), run: vi.fn() });

      await expect(
        AuthService.login('nonexistent', 'password', JWT_SECRET, JWT_PRIVATE_KEY)
      ).rejects.toThrow('Invalid credentials');
    });

    it('should throw ForbiddenError when account is suspended', async () => {
      const suspendedUser = { ...validUser, status: 'Suspended' };
      const mockGet = vi.fn().mockResolvedValue(suspendedUser);
      mockPrepare.mockReturnValue({ get: mockGet, all: vi.fn(), run: vi.fn() });

      await expect(
        AuthService.login('testuser', 'password', JWT_SECRET, JWT_PRIVATE_KEY)
      ).rejects.toThrow('Account suspended');
    });

    it('should throw ForbiddenError when account is locked', async () => {
      const lockedUser = {
        ...validUser,
        locked_until: new Date(Date.now() + 60000).toISOString(), // locked for 1 more minute
      };
      const mockGet = vi.fn().mockResolvedValue(lockedUser);
      mockPrepare.mockReturnValue({ get: mockGet, all: vi.fn(), run: vi.fn() });

      await expect(
        AuthService.login('testuser', 'password', JWT_SECRET, JWT_PRIVATE_KEY)
      ).rejects.toThrow('Account locked');
    });

    it('should throw AuthError and increment failed_attempts on wrong password', async () => {
      const mockGet = vi.fn().mockResolvedValue(validUser);
      const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 0, changes: 1 });
      const mockAll = vi.fn().mockResolvedValue([]);
      mockPrepare.mockReturnValue({ get: mockGet, all: mockAll, run: mockRun });

      (bcrypt.compareSync as any).mockReturnValue(false);

      await expect(
        AuthService.login('testuser', 'wrongpassword', JWT_SECRET, JWT_PRIVATE_KEY)
      ).rejects.toThrow('Invalid credentials');

      // Verify failed_attempts was incremented
      expect(mockRun).toHaveBeenCalled();
    });

    it('should lock account after 5 failed attempts', async () => {
      const userWith4Failures = { ...validUser, failed_attempts: 4 };
      const mockGet = vi.fn().mockResolvedValue(userWith4Failures);
      const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 0, changes: 1 });
      const mockAll = vi.fn().mockResolvedValue([{ id: 'admin-1' }]);
      mockPrepare.mockReturnValue({ get: mockGet, all: mockAll, run: mockRun });

      (bcrypt.compareSync as any).mockReturnValue(false);

      await expect(
        AuthService.login('testuser', 'wrongpassword', JWT_SECRET, JWT_PRIVATE_KEY)
      ).rejects.toThrow('Invalid credentials');

      // Should have called run multiple times: increment + lock + notification
      expect(mockRun.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should generate RS256 JWT tokens on successful login', async () => {
      const mockGet = vi.fn()
        .mockResolvedValueOnce(validUser)
        .mockResolvedValueOnce({ password_expiry_days: 90 })
        .mockResolvedValueOnce(null);
      const mockAll = vi.fn().mockResolvedValue([]);
      const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 0, changes: 1 });
      mockPrepare.mockReturnValue({ get: mockGet, all: mockAll, run: mockRun });

      (bcrypt.compareSync as any).mockReturnValue(true);
      (jwt.sign as any).mockReturnValue('signed-token');

      await AuthService.login('testuser', 'password123', JWT_SECRET, JWT_PRIVATE_KEY);

      // jwt.sign should be called with RS256 algorithm
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-123', username: 'testuser' }),
        JWT_PRIVATE_KEY,
        expect.objectContaining({ algorithm: 'RS256' })
      );
    });

    it('should set requires_password_change when password is expired', async () => {
      const userWithOldPassword = {
        ...validUser,
        requires_password_change: false,
        password_last_changed: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days ago
      };
      const mockGet = vi.fn()
        .mockResolvedValueOnce(userWithOldPassword)
        .mockResolvedValueOnce({ password_expiry_days: 90 })
        .mockResolvedValueOnce(null);
      const mockAll = vi.fn().mockResolvedValue([]);
      const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 0, changes: 1 });
      mockPrepare.mockReturnValue({ get: mockGet, all: mockAll, run: mockRun });

      (bcrypt.compareSync as any).mockReturnValue(true);
      (jwt.sign as any).mockReturnValue('mock-token');

      const result = await AuthService.login('testuser', 'password123', JWT_SECRET, JWT_PRIVATE_KEY);

      expect(result.user.requires_password_change).toBe(true);
    });

    it('should support login by email (case-insensitive)', async () => {
      const mockGet = vi.fn()
        .mockResolvedValueOnce(validUser)
        .mockResolvedValueOnce({ password_expiry_days: 90 })
        .mockResolvedValueOnce(null);
      const mockAll = vi.fn().mockResolvedValue([]);
      const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 0, changes: 1 });
      mockPrepare.mockReturnValue({ get: mockGet, all: mockAll, run: mockRun });

      (bcrypt.compareSync as any).mockReturnValue(true);
      (jwt.sign as any).mockReturnValue('mock-token');

      const result = await AuthService.login('Test@Example.com', 'password123', JWT_SECRET, JWT_PRIVATE_KEY);

      expect(result.user.username).toBe('testuser');
    });

    it('should store refresh token in database on successful login', async () => {
      const mockGet = vi.fn()
        .mockResolvedValueOnce(validUser)
        .mockResolvedValueOnce({ password_expiry_days: 90 })
        .mockResolvedValueOnce(null);
      const mockAll = vi.fn().mockResolvedValue([]);
      const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 0, changes: 1 });
      mockPrepare.mockReturnValue({ get: mockGet, all: mockAll, run: mockRun });

      (bcrypt.compareSync as any).mockReturnValue(true);
      (jwt.sign as any).mockReturnValue('mock-refresh-token');

      await AuthService.login('testuser', 'password123', JWT_SECRET, JWT_PRIVATE_KEY);

      // Verify that refresh token was inserted into refresh_tokens table
      const insertCalls = mockPrepare.mock.calls.filter(
        (call: any[]) => call[0]?.includes('INSERT INTO refresh_tokens')
      );
      expect(insertCalls.length).toBeGreaterThan(0);
    });

    it('should return user permissions on successful login', async () => {
      const mockGet = vi.fn()
        .mockResolvedValueOnce(validUser)
        .mockResolvedValueOnce({ password_expiry_days: 90 })
        .mockResolvedValueOnce(null);
      const mockAll = vi.fn().mockResolvedValue([
        { module: 'Audit', action: 'read' },
        { module: 'Finding', action: 'write' },
      ]);
      const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 0, changes: 1 });
      mockPrepare.mockReturnValue({ get: mockGet, all: mockAll, run: mockRun });

      (bcrypt.compareSync as any).mockReturnValue(true);
      (jwt.sign as any).mockReturnValue('mock-token');

      const result = await AuthService.login('testuser', 'password123', JWT_SECRET, JWT_PRIVATE_KEY);

      expect(result.user.permissions).toEqual([
        { module: 'Audit', action: 'read' },
        { module: 'Finding', action: 'write' },
      ]);
    });

    it('should use 30-day expiry for refresh token when rememberMe is true', async () => {
      const mockGet = vi.fn()
        .mockResolvedValueOnce(validUser)
        .mockResolvedValueOnce({ password_expiry_days: 90 })
        .mockResolvedValueOnce(null);
      const mockAll = vi.fn().mockResolvedValue([]);
      const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 0, changes: 1 });
      mockPrepare.mockReturnValue({ get: mockGet, all: mockAll, run: mockRun });

      (bcrypt.compareSync as any).mockReturnValue(true);
      (jwt.sign as any).mockReturnValue('mock-token');

      await AuthService.login('testuser', 'password123', JWT_SECRET, JWT_PRIVATE_KEY, undefined, undefined, true);

      // jwt.sign is called twice: once for access token, once for refresh token
      const refreshSignCall = (jwt.sign as any).mock.calls.find(
        (call: any[]) => call[2]?.expiresIn === '30d'
      );
      expect(refreshSignCall).toBeDefined();
      expect(refreshSignCall[2]).toMatchObject({ algorithm: 'RS256', expiresIn: '30d' });
    });

    it('should use 8-hour expiry for refresh token when rememberMe is false', async () => {
      const mockGet = vi.fn()
        .mockResolvedValueOnce(validUser)
        .mockResolvedValueOnce({ password_expiry_days: 90 })
        .mockResolvedValueOnce(null);
      const mockAll = vi.fn().mockResolvedValue([]);
      const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 0, changes: 1 });
      mockPrepare.mockReturnValue({ get: mockGet, all: mockAll, run: mockRun });

      (bcrypt.compareSync as any).mockReturnValue(true);
      (jwt.sign as any).mockReturnValue('mock-token');

      await AuthService.login('testuser', 'password123', JWT_SECRET, JWT_PRIVATE_KEY, undefined, undefined, false);

      // jwt.sign is called twice: once for access token (15m), once for refresh token (8h)
      const refreshSignCall = (jwt.sign as any).mock.calls.find(
        (call: any[]) => call[2]?.expiresIn === '8h'
      );
      expect(refreshSignCall).toBeDefined();
      expect(refreshSignCall[2]).toMatchObject({ algorithm: 'RS256', expiresIn: '8h' });
    });

    it('should log login history on successful login', async () => {
      const mockGet = vi.fn()
        .mockResolvedValueOnce(validUser)
        .mockResolvedValueOnce({ password_expiry_days: 90 })
        .mockResolvedValueOnce(null);
      const mockAll = vi.fn().mockResolvedValue([]);
      const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 0, changes: 1 });
      mockPrepare.mockReturnValue({ get: mockGet, all: mockAll, run: mockRun });

      (bcrypt.compareSync as any).mockReturnValue(true);
      (jwt.sign as any).mockReturnValue('mock-token');

      await AuthService.login('testuser', 'password123', JWT_SECRET, JWT_PRIVATE_KEY, '192.168.1.1', 'Mozilla/5.0');

      // Verify login_history insert was called
      const loginHistoryCalls = mockPrepare.mock.calls.filter(
        (call: any[]) => call[0]?.includes('INSERT INTO login_history')
      );
      expect(loginHistoryCalls.length).toBeGreaterThan(0);

      // Verify IP and user agent were passed
      const runCalls = mockRun.mock.calls;
      const loginHistoryRunCall = runCalls.find(
        (call: any[]) => call.includes('192.168.1.1') && call.includes('Mozilla/5.0')
      );
      expect(loginHistoryRunCall).toBeDefined();
    });

    it('should create a user session on successful login', async () => {
      const mockGet = vi.fn()
        .mockResolvedValueOnce(validUser)
        .mockResolvedValueOnce({ password_expiry_days: 90 })
        .mockResolvedValueOnce(null);
      const mockAll = vi.fn().mockResolvedValue([]);
      const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 0, changes: 1 });
      mockPrepare.mockReturnValue({ get: mockGet, all: mockAll, run: mockRun });

      (bcrypt.compareSync as any).mockReturnValue(true);
      (jwt.sign as any).mockReturnValue('mock-token');

      await AuthService.login('testuser', 'password123', JWT_SECRET, JWT_PRIVATE_KEY, '10.0.0.1', 'Chrome');

      // Verify user_sessions insert was called
      const sessionCalls = mockPrepare.mock.calls.filter(
        (call: any[]) => call[0]?.includes('INSERT INTO user_sessions')
      );
      expect(sessionCalls.length).toBeGreaterThan(0);
    });

    it('should log failed login attempt by incrementing failed_attempts', async () => {
      const mockGet = vi.fn().mockResolvedValue(validUser);
      const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 0, changes: 1 });
      const mockAll = vi.fn().mockResolvedValue([]);
      mockPrepare.mockReturnValue({ get: mockGet, all: mockAll, run: mockRun });

      (bcrypt.compareSync as any).mockReturnValue(false);

      await expect(
        AuthService.login('testuser', 'wrongpassword', JWT_SECRET, JWT_PRIVATE_KEY, '10.0.0.1')
      ).rejects.toThrow('Invalid credentials');

      // Verify failed_attempts was incremented
      const updateCalls = mockPrepare.mock.calls.filter(
        (call: any[]) => call[0]?.includes('UPDATE users SET failed_attempts = failed_attempts + 1')
      );
      expect(updateCalls.length).toBeGreaterThan(0);
    });

    it('should use configurable lock threshold from user_management_settings', async () => {
      // User has 2 failed attempts, threshold is set to 3 (so next failure should lock)
      const userWith2Failures = { ...validUser, failed_attempts: 2 };
      const mockGet = vi.fn()
        .mockResolvedValueOnce(userWith2Failures) // user lookup
        .mockResolvedValueOnce({ failed_login_threshold: 3 }); // settings lookup with threshold=3
      const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 0, changes: 1 });
      const mockAll = vi.fn().mockResolvedValue([{ id: 'admin-1' }]); // admins for notification
      mockPrepare.mockReturnValue({ get: mockGet, all: mockAll, run: mockRun });

      (bcrypt.compareSync as any).mockReturnValue(false);

      await expect(
        AuthService.login('testuser', 'wrongpassword', JWT_SECRET, JWT_PRIVATE_KEY)
      ).rejects.toThrow('Invalid credentials');

      // Should have locked the account (failed_attempts 2 + 1 = 3 >= threshold 3)
      const lockCalls = mockPrepare.mock.calls.filter(
        (call: any[]) => call[0]?.includes('UPDATE users SET locked_until')
      );
      expect(lockCalls.length).toBeGreaterThan(0);
    });
  });

  describe('logAudit', () => {
    it('should insert an audit trail record with hash chaining', async () => {
      const mockGet = vi.fn().mockResolvedValue({ hash: 'previous-hash-value' });
      const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 });
      mockPrepare.mockReturnValue({ get: mockGet, run: mockRun });

      await AuthService.logAudit('testuser', 'login', 'Auth', 'User logged in');

      // Verify audit trail insert was called
      const insertCalls = mockPrepare.mock.calls.filter(
        (call: any[]) => call[0]?.includes('INSERT INTO audit_trail')
      );
      expect(insertCalls.length).toBeGreaterThan(0);
    });

    it('should use "0" as previous hash when no prior records exist', async () => {
      const mockGet = vi.fn().mockResolvedValue(null);
      const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 });
      mockPrepare.mockReturnValue({ get: mockGet, run: mockRun });

      await AuthService.logAudit('testuser', 'login', 'Auth', 'First audit entry');

      expect(mockRun).toHaveBeenCalled();
    });
  });
});
