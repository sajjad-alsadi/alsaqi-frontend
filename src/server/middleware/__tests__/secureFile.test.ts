// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserRole } from '../../../constants';

/**
 * Unit tests for file-level permission scoping in secureFile middleware.
 *
 * These tests validate that file access is scoped to the owning module:
 * - The middleware reads the `module` field from the file record (Req 10.1)
 * - Checks the user's View permission for that specific module (Req 10.2)
 * - Denies access if the file has no module field or it's empty (Req 10.3)
 * - Denies access if the module is not registered in ModuleRegistry (Req 10.4)
 * - Denies access if the module has fileScope=false (Req 10.6)
 * - Admin users bypass all permission checks (Req 3.2)
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 10.1, 10.2, 10.3, 10.4
 */

// Mock ModuleRegistry
const mockGetModule = vi.fn();
vi.mock('../../../permissions/registry', () => ({
  ModuleRegistry: {
    getModule: (...args: any[]) => mockGetModule(...args),
  },
}));

// Mock PermissionService
const mockHasPermission = vi.fn();
vi.mock('../../services/PermissionService', () => ({
  PermissionService: {
    hasPermission: (...args: any[]) => mockHasPermission(...args),
  },
}));

// Mock db
const mockDbGet = vi.fn();
const mockDbRun = vi.fn();
vi.mock('../../db/index', () => ({
  default: {
    prepare: vi.fn(() => ({
      get: mockDbGet,
      run: mockDbRun,
    })),
  },
  db: {
    prepare: vi.fn(() => ({
      get: mockDbGet,
      run: mockDbRun,
    })),
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

/**
 * Helper to create a mock file record as returned from the database.
 */
function createFileRecord(overrides: Partial<{
  id: string;
  original_name: string;
  module: string | null;
  mime_type: string;
}> = {}) {
  return {
    id: 'file-001',
    original_name: 'report.pdf',
    module: 'AuditPlans',
    mime_type: 'application/pdf',
    ...overrides,
  };
}

/**
 * Helper to create a mock request for file access.
 */
function createMockReq(user: any, filePath: string = '/file-001.pdf') {
  return {
    user,
    params: { id: 'file-001' },
    path: filePath,
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    originalUrl: `/api/v1/files${filePath}`,
    query: {},
  };
}

/**
 * Helper to create a mock response.
 */
function createMockRes() {
  const res: any = {
    statusCode: 200,
    _json: null,
    _headers: {},
  };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res._json = data;
    return res;
  });
  res.setHeader = vi.fn((name: string, value: string) => {
    res._headers[name] = value;
    return res;
  });
  res.sendFile = vi.fn();
  res.send = vi.fn();
  return res;
}

describe('secureFile - file-level permission scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbRun.mockResolvedValue({ changes: 1 });
  });

  describe('module-based file access (Req 10.1, 10.2)', () => {
    it('should grant access when file has valid module and user has View permission', async () => {
      const user = { id: 'user-1', role: UserRole.INTERNAL_AUDITOR };
      const fileRecord = createFileRecord({ module: 'AuditPlans' });

      // Mock: file lookup returns a record with module field
      mockDbGet.mockResolvedValue(fileRecord);

      // Mock: module is registered with fileScope=true
      mockGetModule.mockReturnValue({
        name: 'AuditPlans',
        label: { en: 'Audit Plans', ar: 'خطط التدقيق' },
        actions: ['View', 'Create', 'Edit', 'Delete'],
        defaults: {},
        fileScope: true,
      });

      // Mock: user has View permission on AuditPlans
      mockHasPermission.mockResolvedValue(true);

      const req = createMockReq(user);
      const res = createMockRes();
      const next = vi.fn();

      // Import the module-scoped file permission check function
      // Since the actual implementation may not exist yet (task 4.3),
      // we test the expected behavior contract
      const { checkFilePermission } = await import('../secureFileScoping');

      await checkFilePermission(req as any, res as any, next);

      expect(mockHasPermission).toHaveBeenCalledWith('user-1', 'AuditPlans', 'View');
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(403);
    });

    it('should deny access (403) when user lacks View permission on file module', async () => {
      const user = { id: 'user-2', role: UserRole.VIEWER };
      const fileRecord = createFileRecord({ module: 'RiskRegister' });

      mockDbGet.mockResolvedValue(fileRecord);

      mockGetModule.mockReturnValue({
        name: 'RiskRegister',
        label: { en: 'Risk Register', ar: 'سجل المخاطر' },
        actions: ['View', 'Create', 'Edit', 'Delete'],
        defaults: {},
        fileScope: true,
      });

      // User does NOT have View permission
      mockHasPermission.mockResolvedValue(false);

      const req = createMockReq(user);
      const res = createMockRes();
      const next = vi.fn();

      const { checkFilePermission } = await import('../secureFileScoping');

      await checkFilePermission(req as any, res as any, next);

      expect(mockHasPermission).toHaveBeenCalledWith('user-2', 'RiskRegister', 'View');
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._json).toEqual(
        expect.objectContaining({
          code: 'PERMISSION_DENIED',
        })
      );
    });
  });

  describe('missing or empty module field (Req 10.3)', () => {
    it('should deny access when file record has no module field', async () => {
      const user = { id: 'user-1', role: UserRole.INTERNAL_AUDITOR };
      const fileRecord = createFileRecord({ module: null });

      mockDbGet.mockResolvedValue(fileRecord);

      const req = createMockReq(user);
      const res = createMockRes();
      const next = vi.fn();

      const { checkFilePermission } = await import('../secureFileScoping');

      await checkFilePermission(req as any, res as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._json).toEqual(
        expect.objectContaining({
          code: 'PERMISSION_DENIED',
        })
      );
      // Should NOT call PermissionService since module is missing
      expect(mockHasPermission).not.toHaveBeenCalled();
    });

    it('should deny access when file record has empty module field', async () => {
      const user = { id: 'user-1', role: UserRole.INTERNAL_AUDITOR };
      const fileRecord = createFileRecord({ module: '' });

      mockDbGet.mockResolvedValue(fileRecord);

      const req = createMockReq(user);
      const res = createMockRes();
      const next = vi.fn();

      const { checkFilePermission } = await import('../secureFileScoping');

      await checkFilePermission(req as any, res as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._json).toEqual(
        expect.objectContaining({
          code: 'PERMISSION_DENIED',
        })
      );
      expect(mockHasPermission).not.toHaveBeenCalled();
    });
  });

  describe('unregistered module (Req 10.4)', () => {
    it('should deny access when file module is not registered in ModuleRegistry', async () => {
      const user = { id: 'user-1', role: UserRole.INTERNAL_AUDITOR };
      const fileRecord = createFileRecord({ module: 'UnknownModule' });

      mockDbGet.mockResolvedValue(fileRecord);

      // Module not found in registry
      mockGetModule.mockReturnValue(undefined);

      const req = createMockReq(user);
      const res = createMockRes();
      const next = vi.fn();

      const { checkFilePermission } = await import('../secureFileScoping');

      await checkFilePermission(req as any, res as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._json).toEqual(
        expect.objectContaining({
          code: 'PERMISSION_DENIED',
        })
      );
      expect(mockHasPermission).not.toHaveBeenCalled();
    });
  });

  describe('fileScope=false denial (Req 10.6)', () => {
    it('should deny access when file module has fileScope set to false', async () => {
      const user = { id: 'user-1', role: UserRole.INTERNAL_AUDITOR };
      const fileRecord = createFileRecord({ module: 'Dashboard' });

      mockDbGet.mockResolvedValue(fileRecord);

      // Module is registered but fileScope is false
      mockGetModule.mockReturnValue({
        name: 'Dashboard',
        label: { en: 'Dashboard', ar: 'لوحة المعلومات' },
        actions: ['View'],
        defaults: {},
        fileScope: false,
      });

      const req = createMockReq(user);
      const res = createMockRes();
      const next = vi.fn();

      const { checkFilePermission } = await import('../secureFileScoping');

      await checkFilePermission(req as any, res as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._json).toEqual(
        expect.objectContaining({
          code: 'PERMISSION_DENIED',
        })
      );
      expect(mockHasPermission).not.toHaveBeenCalled();
    });
  });

  describe('Admin bypass (Req 3.2)', () => {
    it('should grant Admin access regardless of file module or permissions', async () => {
      const user = { id: 'admin-1', role: UserRole.ADMIN };
      const fileRecord = createFileRecord({ module: 'AuditPlans' });

      mockDbGet.mockResolvedValue(fileRecord);

      const req = createMockReq(user);
      const res = createMockRes();
      const next = vi.fn();

      const { checkFilePermission } = await import('../secureFileScoping');

      await checkFilePermission(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(403);
      // Admin should NOT trigger PermissionService check
      expect(mockHasPermission).not.toHaveBeenCalled();
    });

    it('should grant Admin access even when file has no module field', async () => {
      const user = { id: 'admin-1', role: UserRole.ADMIN };
      const fileRecord = createFileRecord({ module: null });

      mockDbGet.mockResolvedValue(fileRecord);

      const req = createMockReq(user);
      const res = createMockRes();
      const next = vi.fn();

      const { checkFilePermission } = await import('../secureFileScoping');

      await checkFilePermission(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(403);
    });

    it('should grant Admin access even when file module is unregistered', async () => {
      const user = { id: 'admin-1', role: UserRole.ADMIN };
      const fileRecord = createFileRecord({ module: 'NonExistent' });

      mockDbGet.mockResolvedValue(fileRecord);
      mockGetModule.mockReturnValue(undefined);

      const req = createMockReq(user);
      const res = createMockRes();
      const next = vi.fn();

      const { checkFilePermission } = await import('../secureFileScoping');

      await checkFilePermission(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(403);
    });
  });
});
