// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePermissions } from '../usePermissions';
import { UserRole } from '../../constants';
import { MODULES, PERMISSIONS, DEFAULT_PERMISSIONS, Module, Permission } from '../../permissions';
import { UserPermissionSet } from '../../permissions/types';

// Mock the UserContext
const mockUser = { user: null as any };
vi.mock('../../context/UserContext', () => ({
  useUser: () => mockUser,
}));

// Mock the AppContext (logout for re-auth flow)
const mockLogout = vi.fn();
vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({ logout: mockLogout }),
}));

// Mock the API service
const mockApiGet = vi.fn();
vi.mock('../../services/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
  },
}));

// Helper: build a mock UserPermissionSet from the static matrix for a given role
function buildPermissionSet(userId: string, role: string): UserPermissionSet {
  const rolePerms = DEFAULT_PERMISSIONS[role as keyof typeof DEFAULT_PERMISSIONS];
  const permissions: Record<string, string[]> = {};
  if (rolePerms) {
    for (const [mod, actions] of Object.entries(rolePerms)) {
      permissions[mod] = [...actions];
    }
  }
  return {
    userId,
    role,
    roleId: 'role-1',
    isCustomRole: false,
    permissions: permissions as Record<string, import('../../permissions/types').PermissionAction[]>,
    overrides: [],
  };
}

describe('usePermissions', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    mockUser.user = null;
    mockLogout.mockClear();
    mockApiGet.mockReset();
    store = {};

    // Override the global localStorage mock from setup.ts to actually store values
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(
      (key: string) => store[key] ?? null
    );
    (localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(
      (key: string, value: string) => { store[key] = value; }
    );
    (localStorage.removeItem as ReturnType<typeof vi.fn>).mockImplementation(
      (key: string) => { delete store[key]; }
    );
    (localStorage.clear as ReturnType<typeof vi.fn>).mockImplementation(
      () => { store = {}; }
    );
    Object.defineProperty(localStorage, 'length', {
      get: () => Object.keys(store).length,
      configurable: true,
    });
    (localStorage.key as ReturnType<typeof vi.fn>).mockImplementation(
      (index: number) => Object.keys(store)[index] ?? null
    );
  });

  describe('API fetch on mount', () => {
    it('should fetch from /v1/permissions/me on mount when no cache exists', async () => {
      const permSet = buildPermissionSet('1', UserRole.INTERNAL_AUDITOR);
      mockApiGet.mockResolvedValue({ data: permSet });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockApiGet).toHaveBeenCalledWith('/v1/permissions/me', expect.objectContaining({
        timeout: 10000,
      }));
    });

    it('should expose isLoading=true during initial fetch', () => {
      mockApiGet.mockReturnValue(new Promise(() => {})); // never resolves
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      const { result } = renderHook(() => usePermissions());

      expect(result.current.isLoading).toBe(true);
    });

    it('should set isLoading=false once fetch resolves', async () => {
      const permSet = buildPermissionSet('1', UserRole.INTERNAL_AUDITOR);
      mockApiGet.mockResolvedValue({ data: permSet });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('localStorage cache with 5-minute TTL', () => {
    it('should use cached permissions without API call when cache is valid', async () => {
      const permSet = buildPermissionSet('1', UserRole.INTERNAL_AUDITOR);
      const cacheEntry = {
        data: permSet,
        timestamp: Date.now(),
        userId: '1',
      };
      localStorage.setItem('user_permissions_1', JSON.stringify(cacheEntry));
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should NOT have called the API
      expect(mockApiGet).not.toHaveBeenCalled();
      expect(result.current.hasPermission('AuditPlans', 'View')).toBe(true);
    });

    it('should fetch from API when cache is expired (> 5 min)', async () => {
      const permSet = buildPermissionSet('1', UserRole.INTERNAL_AUDITOR);
      const cacheEntry = {
        data: permSet,
        timestamp: Date.now() - 6 * 60 * 1000, // 6 minutes ago
        userId: '1',
      };
      localStorage.setItem('user_permissions_1', JSON.stringify(cacheEntry));
      mockApiGet.mockResolvedValue({ data: permSet });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockApiGet).toHaveBeenCalled();
    });

    it('should store permissions in localStorage on successful API fetch', async () => {
      const permSet = buildPermissionSet('1', UserRole.INTERNAL_AUDITOR);
      mockApiGet.mockResolvedValue({ data: permSet });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      renderHook(() => usePermissions());

      await waitFor(() => {
        const stored = localStorage.getItem('user_permissions_1');
        expect(stored).not.toBeNull();
      });

      const stored = JSON.parse(localStorage.getItem('user_permissions_1')!);
      expect(stored.data.userId).toBe('1');
      expect(stored.userId).toBe('1');
      expect(stored.timestamp).toBeGreaterThan(0);
    });

    it('should discard cached permissions if user ID does not match', async () => {
      // Cache for user 2
      const permSet2 = buildPermissionSet('2', UserRole.VIEWER);
      const cacheEntry = {
        data: permSet2,
        timestamp: Date.now(),
        userId: '2',
      };
      localStorage.setItem('user_permissions_2', JSON.stringify(cacheEntry));

      // Current user is user 1
      const permSet1 = buildPermissionSet('1', UserRole.INTERNAL_AUDITOR);
      mockApiGet.mockResolvedValue({ data: permSet1 });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      renderHook(() => usePermissions());

      await waitFor(() => {
        // Old user's cache should be removed
        expect(localStorage.getItem('user_permissions_2')).toBeNull();
      });
    });
  });

  describe('fallback to DEFAULT_PERMISSIONS on network error or 5xx', () => {
    it('should fall back to static matrix on network error', async () => {
      mockApiGet.mockRejectedValue({ code: 'ERR_NETWORK', message: 'Network Error' });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should use static matrix fallback
      expect(result.current.hasPermission('AuditPlans', 'View')).toBe(true);
      expect(result.current.hasPermission('AuditPlans', 'Delete')).toBe(false);
    });

    it('should fall back to static matrix on 500 error', async () => {
      mockApiGet.mockRejectedValue({ response: { status: 500 } });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasPermission('AuditPlans', 'View')).toBe(true);
    });

    it('should fall back to static matrix on timeout (ECONNABORTED)', async () => {
      mockApiGet.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout' });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasPermission('AuditPlans', 'View')).toBe(true);
    });
  });

  describe('re-authentication on 401/403', () => {
    it('should trigger logout on 401 response (NOT fall back to static)', async () => {
      mockApiGet.mockRejectedValue({ response: { status: 401 } });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      renderHook(() => usePermissions());

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });

    it('should trigger logout on 403 response (NOT fall back to static)', async () => {
      mockApiGet.mockRejectedValue({ response: { status: 403 } });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      renderHook(() => usePermissions());

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });
  });

  describe('Admin bypass - always returns true', () => {
    it('should return true for all modules and all permissions when user is Admin', async () => {
      // Admin doesn't need API data to return true
      mockApiGet.mockReturnValue(new Promise(() => {})); // never resolves
      mockUser.user = { id: '1', role: UserRole.ADMIN, name: 'Admin' };

      const { result } = renderHook(() => usePermissions());

      const allModules = Object.values(MODULES) as Module[];
      const allPermissions = Object.values(PERMISSIONS) as Permission[];

      for (const mod of allModules) {
        for (const perm of allPermissions) {
          expect(result.current.hasPermission(mod, perm)).toBe(true);
        }
      }
    });

    it('should return true for all convenience methods when user is Admin', async () => {
      mockApiGet.mockReturnValue(new Promise(() => {}));
      mockUser.user = { id: '1', role: UserRole.ADMIN, name: 'Admin' };

      const { result } = renderHook(() => usePermissions());

      expect(result.current.canView('AuditPlans')).toBe(true);
      expect(result.current.canCreate('AuditPlans')).toBe(true);
      expect(result.current.canEdit('AuditPlans')).toBe(true);
      expect(result.current.canDelete('AuditPlans')).toBe(true);
      expect(result.current.canApprove('AuditPlans')).toBe(true);
    });
  });

  describe('refetch() method', () => {
    it('should force a fresh API call ignoring cache', async () => {
      const permSet = buildPermissionSet('1', UserRole.INTERNAL_AUDITOR);
      // Set valid cache
      const cacheEntry = {
        data: permSet,
        timestamp: Date.now(),
        userId: '1',
      };
      localStorage.setItem('user_permissions_1', JSON.stringify(cacheEntry));
      mockApiGet.mockResolvedValue({ data: permSet });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Initial load used cache, no API call
      expect(mockApiGet).not.toHaveBeenCalled();

      // Now force refetch
      await act(async () => {
        await result.current.refetch();
      });

      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });
  });

  describe('hasPermission with fetched data', () => {
    it('should return true for permissions the role has from API', async () => {
      const permSet = buildPermissionSet('1', UserRole.INTERNAL_AUDITOR);
      mockApiGet.mockResolvedValue({ data: permSet });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasPermission('AuditPlans', 'View')).toBe(true);
      expect(result.current.hasPermission('AuditProgramLibrary', 'Create')).toBe(true);
      expect(result.current.hasPermission('AuditProgramLibrary', 'Edit')).toBe(true);
    });

    it('should return false for permissions the role does not have', async () => {
      const permSet = buildPermissionSet('1', UserRole.INTERNAL_AUDITOR);
      mockApiGet.mockResolvedValue({ data: permSet });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasPermission('AuditPlans', 'Delete')).toBe(false);
      expect(result.current.hasPermission('AuditPlans', 'Approve')).toBe(false);
    });

    it('should return false for all permissions when user is null', () => {
      mockUser.user = null;

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasPermission('AuditPlans', 'View')).toBe(false);
      expect(result.current.canView('AuditPlans')).toBe(false);
    });

    it('should expose isCustomRole from API response', async () => {
      const permSet = buildPermissionSet('1', UserRole.INTERNAL_AUDITOR);
      permSet.isCustomRole = true;
      mockApiGet.mockResolvedValue({ data: permSet });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isCustomRole).toBe(true);
    });
  });

  describe('convenience methods', () => {
    it('canView should check View permission', async () => {
      const permSet = buildPermissionSet('1', UserRole.INTERNAL_AUDITOR);
      mockApiGet.mockResolvedValue({ data: permSet });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Auditor' };

      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canView('AuditPlans')).toBe(true);
      expect(result.current.canView('UserManagement')).toBe(false);
    });

    it('canCreate should check Create permission', async () => {
      const permSet = buildPermissionSet('1', UserRole.INTERNAL_AUDITOR);
      mockApiGet.mockResolvedValue({ data: permSet });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Auditor' };

      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canCreate('AuditProgramLibrary')).toBe(true);
      expect(result.current.canCreate('ComplianceMatrix')).toBe(false);
    });

    it('canEdit should check Edit permission', async () => {
      const permSet = buildPermissionSet('1', UserRole.INTERNAL_AUDITOR);
      mockApiGet.mockResolvedValue({ data: permSet });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Auditor' };

      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canEdit('AuditFindings')).toBe(true);
      expect(result.current.canEdit('ComplianceMatrix')).toBe(false);
    });

    it('canDelete should check Delete permission', async () => {
      const permSet = buildPermissionSet('1', UserRole.INTERNAL_AUDITOR);
      mockApiGet.mockResolvedValue({ data: permSet });
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Auditor' };

      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canDelete('AuditPlans')).toBe(false);
      expect(result.current.canDelete('AuditFindings')).toBe(false);
    });

    it('canApprove should check Approve permission', async () => {
      const permSet = buildPermissionSet('4', UserRole.MANAGER);
      mockApiGet.mockResolvedValue({ data: permSet });
      mockUser.user = { id: '4', role: UserRole.MANAGER, name: 'Manager' };

      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canApprove('AuditPlans')).toBe(true);
      expect(result.current.canApprove('Correspondence')).toBe(false);
    });
  });
});
