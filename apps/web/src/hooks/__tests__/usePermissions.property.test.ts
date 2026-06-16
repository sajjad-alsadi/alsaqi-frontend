// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook as baseRenderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import fc from 'fast-check';
import { usePermissions } from '../usePermissions';
import { PermissionsProvider } from '../../context/PermissionsContext';
import { UserRole } from '../../constants';
import { DEFAULT_PERMISSIONS, MODULES, Module } from '../../permissions';
import { PermissionAction, UserPermissionSet } from '../../permissions/types';

/**
 * Property-Based Tests for usePermissions Hook
 *
 * **Validates: Requirements 6.2, 6.5, 6.7**
 *
 * Property 11: Frontend Fallback Correctness
 * Property 12: Frontend Helper Method Equivalence
 * Property 13: Frontend Cache Validity
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUser = { user: null as any };
vi.mock('../../context/UserContext', () => ({
  useUser: () => mockUser,
}));

const mockLogout = vi.fn();
vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({ logout: mockLogout }),
}));

const mockApiGet = vi.fn();
vi.mock('../../api/httpClient', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
  },
}));

/**
 * After the single-source-of-truth refactor (Req 11), `usePermissions` reads from
 * {@link PermissionsProvider}. This wrapper supplies a fresh, isolated QueryClient +
 * PermissionsProvider per mount so each property iteration resolves from the
 * provider's single shared fetch.
 */
const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
      })
  );
  return React.createElement(
    QueryClientProvider,
    { client },
    React.createElement(PermissionsProvider, null, children)
  );
};

const renderHook: typeof baseRenderHook = ((cb: any, opts?: any) =>
  baseRenderHook(cb, { wrapper: Wrapper, ...opts })) as typeof baseRenderHook;

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** All non-Admin roles (Admin bypasses permission checks) */
const NON_ADMIN_ROLES = [
  UserRole.INTERNAL_AUDITOR,
  UserRole.COMPLIANCE_OFFICER,
  UserRole.RISK_OFFICER,
  UserRole.MANAGER,
  UserRole.VIEWER,
] as const;

const ALL_ROLES = [
  UserRole.ADMIN,
  UserRole.INTERNAL_AUDITOR,
  UserRole.COMPLIANCE_OFFICER,
  UserRole.RISK_OFFICER,
  UserRole.MANAGER,
  UserRole.VIEWER,
] as const;

const ALL_MODULES = Object.values(MODULES) as Module[];

const ALL_ACTIONS: PermissionAction[] = ['View', 'Create', 'Edit', 'Delete', 'Approve'];

/** Arbitrary for non-Admin roles */
const nonAdminRoleArb = fc.constantFrom(...NON_ADMIN_ROLES);

/** Arbitrary for all roles */
const allRoleArb = fc.constantFrom(...ALL_ROLES);

/** Arbitrary for module names */
const moduleArb = fc.constantFrom(...ALL_MODULES);

/** Arbitrary for permission actions */
const actionArb = fc.constantFrom(...ALL_ACTIONS);

/** Arbitrary for user IDs (numeric strings) */
const userIdArb = fc.integer({ min: 1, max: 99999 }).map(String);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPermissionSet(userId: string, role: string): UserPermissionSet {
  const rolePerms = DEFAULT_PERMISSIONS[role as keyof typeof DEFAULT_PERMISSIONS];
  const permissions: Record<string, PermissionAction[]> = {};
  if (rolePerms) {
    for (const [mod, actions] of Object.entries(rolePerms)) {
      permissions[mod] = [...actions] as PermissionAction[];
    }
  }
  return {
    userId,
    role,
    roleId: 'role-1',
    isCustomRole: false,
    permissions,
    overrides: [],
  };
}

// ─── Test Setup ──────────────────────────────────────────────────────────────

let store: Record<string, string> = {};

beforeEach(() => {
  mockUser.user = null;
  mockLogout.mockClear();
  mockApiGet.mockReset();
  store = {};

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

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 11: Frontend Fallback Correctness', () => {
  /**
   * Narrowing fallback (Requirement 7 / SECURITY-002, no privilege escalation).
   *
   * When the API is unavailable (network error, timeout, or 5xx) AND there is no
   * confirmed permission set cached, the hook SHALL compute the fallback as the
   * intersection of the READ-ONLY permission set with the role's static default
   * permissions (see `computeFallback`/`READ_ONLY_PERMISSION_SET` in
   * `src/permissions/fallback.ts`). The read-only set grants only `View`, so the
   * intersection grants at most `View`, and only on the modules the role's static
   * defaults already include — it can never widen access beyond those defaults.
   *
   * Therefore, for any non-Admin role with no confirmed cache:
   *   - hasPermission(module, 'View')   === true  ONLY where the role's static
   *     defaults (DEFAULT_PERMISSIONS) grant View on that module; otherwise false
   *     (e.g. a low-privilege role is denied View on UserManagement/SystemLogs).
   *   - hasPermission(module, writeAction) === false for Create/Edit/Delete/Approve
   *
   * This reflects the narrowed no-cache fallback (Req 7.1, 7.2, 7.3) that replaced
   * the prior "View granted on every module" behavior.
   *
   * **Validates: Requirement 7 (narrowing fallback as READ-ONLY ∩ static defaults, no privilege escalation)**
   */

  /**
   * Expected fallback grant: `View` only where the role's static defaults include
   * `View` on that module; every write action is denied.
   */
  const expectedFallback = (
    role: (typeof NON_ADMIN_ROLES)[number],
    module: Module,
    action: PermissionAction,
  ) => {
    if (action !== 'View') return false;
    const roleDefaults = DEFAULT_PERMISSIONS[role as keyof typeof DEFAULT_PERMISSIONS];
    return roleDefaults?.[module]?.includes('View') ?? false;
  };

  it('when API fails with network error and no confirmed cache, fallback is READ-ONLY ∩ static defaults (View only where statically granted, writes denied) for any non-Admin role', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonAdminRoleArb,
        moduleArb,
        actionArb,
        userIdArb,
        async (role, module, action, userId) => {
          // Reset state — no confirmed permission set is cached
          store = {};
          mockApiGet.mockReset();
          mockApiGet.mockRejectedValue({ code: 'ERR_NETWORK', message: 'Network Error' });
          mockUser.user = { id: userId, role, name: 'Test' };

          const { result } = renderHook(() => usePermissions());

          await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
          });

          // Narrowed fallback: View only where static defaults grant it; writes denied.
          expect(result.current.hasPermission(module, action)).toBe(
            expectedFallback(role, module, action),
          );
        }
      ),
      { numRuns: 50 }
    );
  });

  it('when API fails with 500 error and no confirmed cache, fallback is READ-ONLY ∩ static defaults (View only where statically granted, writes denied) for any non-Admin role', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonAdminRoleArb,
        moduleArb,
        actionArb,
        async (role, module, action) => {
          // No confirmed permission set is cached
          store = {};
          mockApiGet.mockReset();
          mockApiGet.mockRejectedValue({ response: { status: 500 } });
          mockUser.user = { id: '1', role, name: 'Test' };

          const { result } = renderHook(() => usePermissions());

          await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
          });

          // Narrowed fallback: View only where static defaults grant it; writes denied.
          expect(result.current.hasPermission(module, action)).toBe(
            expectedFallback(role, module, action),
          );
        }
      ),
      { numRuns: 50 }
    );
  });

  it('when API fails with timeout and no confirmed cache, fallback is READ-ONLY ∩ static defaults (View only where statically granted, writes denied) for any non-Admin role', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonAdminRoleArb,
        moduleArb,
        actionArb,
        async (role, module, action) => {
          // No confirmed permission set is cached
          store = {};
          mockApiGet.mockReset();
          mockApiGet.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout' });
          mockUser.user = { id: '1', role, name: 'Test' };

          const { result } = renderHook(() => usePermissions());

          await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
          });

          // Narrowed fallback: View only where static defaults grant it; writes denied.
          expect(result.current.hasPermission(module, action)).toBe(
            expectedFallback(role, module, action),
          );
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('Property 12: Frontend Helper Method Equivalence', () => {
  /**
   * For any module M, the convenience methods SHALL be equivalent to
   * calling hasPermission with the corresponding action:
   *   canView(M) === hasPermission(M, 'View')
   *   canCreate(M) === hasPermission(M, 'Create')
   *   canEdit(M) === hasPermission(M, 'Edit')
   *   canDelete(M) === hasPermission(M, 'Delete')
   *   canApprove(M) === hasPermission(M, 'Approve')
   *
   * **Validates: Requirements 6.7**
   */

  it('canView(M) equals hasPermission(M, "View") for any role and module', async () => {
    await fc.assert(
      fc.asyncProperty(
        allRoleArb,
        moduleArb,
        async (role, module) => {
          store = {};
          mockApiGet.mockReset();
          const permSet = buildPermissionSet('1', role);
          mockApiGet.mockResolvedValue({ data: permSet });
          mockUser.user = { id: '1', role, name: 'Test' };

          const { result } = renderHook(() => usePermissions());

          await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
          });

          expect(result.current.canView(module)).toBe(
            result.current.hasPermission(module, 'View')
          );
        }
      ),
      { numRuns: 50 }
    );
  });

  it('canCreate(M) equals hasPermission(M, "Create") for any role and module', async () => {
    await fc.assert(
      fc.asyncProperty(
        allRoleArb,
        moduleArb,
        async (role, module) => {
          store = {};
          mockApiGet.mockReset();
          const permSet = buildPermissionSet('1', role);
          mockApiGet.mockResolvedValue({ data: permSet });
          mockUser.user = { id: '1', role, name: 'Test' };

          const { result } = renderHook(() => usePermissions());

          await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
          });

          expect(result.current.canCreate(module)).toBe(
            result.current.hasPermission(module, 'Create')
          );
        }
      ),
      { numRuns: 50 }
    );
  });

  it('canEdit(M) equals hasPermission(M, "Edit") for any role and module', async () => {
    await fc.assert(
      fc.asyncProperty(
        allRoleArb,
        moduleArb,
        async (role, module) => {
          store = {};
          mockApiGet.mockReset();
          const permSet = buildPermissionSet('1', role);
          mockApiGet.mockResolvedValue({ data: permSet });
          mockUser.user = { id: '1', role, name: 'Test' };

          const { result } = renderHook(() => usePermissions());

          await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
          });

          expect(result.current.canEdit(module)).toBe(
            result.current.hasPermission(module, 'Edit')
          );
        }
      ),
      { numRuns: 50 }
    );
  });

  it('canDelete(M) equals hasPermission(M, "Delete") for any role and module', async () => {
    await fc.assert(
      fc.asyncProperty(
        allRoleArb,
        moduleArb,
        async (role, module) => {
          store = {};
          mockApiGet.mockReset();
          const permSet = buildPermissionSet('1', role);
          mockApiGet.mockResolvedValue({ data: permSet });
          mockUser.user = { id: '1', role, name: 'Test' };

          const { result } = renderHook(() => usePermissions());

          await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
          });

          expect(result.current.canDelete(module)).toBe(
            result.current.hasPermission(module, 'Delete')
          );
        }
      ),
      { numRuns: 50 }
    );
  });

  it('canApprove(M) equals hasPermission(M, "Approve") for any role and module', async () => {
    await fc.assert(
      fc.asyncProperty(
        allRoleArb,
        moduleArb,
        async (role, module) => {
          store = {};
          mockApiGet.mockReset();
          const permSet = buildPermissionSet('1', role);
          mockApiGet.mockResolvedValue({ data: permSet });
          mockUser.user = { id: '1', role, name: 'Test' };

          const { result } = renderHook(() => usePermissions());

          await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
          });

          expect(result.current.canApprove(module)).toBe(
            result.current.hasPermission(module, 'Approve')
          );
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('Property 13: Frontend Cache Validity', () => {
  /**
   * When a valid cache entry exists (timestamp < 5 minutes old),
   * the hook SHALL use cached permissions without making an API call.
   * When the cache is older than 5 minutes, the hook SHALL call the API.
   *
   * **Validates: Requirements 6.2**
   */

  it('cache less than 5 minutes old is used without API call for any role', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonAdminRoleArb,
        userIdArb,
        // Generate a timestamp comfortably within the 5-minute TTL. The upper
        // bound is kept ~10s below the 300_000ms boundary so that wall-clock time
        // elapsing between building the cache entry and the hook reading it (which
        // can be non-trivial under full-suite load) cannot push a "valid" entry
        // across the expiry boundary and cause a flaky API call.
        fc.integer({ min: 0, max: 290_000 }),
        async (role, userId, msAgo) => {
          store = {};
          mockApiGet.mockReset();

          const permSet = buildPermissionSet(userId, role);
          const cacheEntry = {
            data: permSet,
            timestamp: Date.now() - msAgo,
            userId,
          };
          store[`user_permissions_${userId}`] = JSON.stringify(cacheEntry);

          mockUser.user = { id: userId, role, name: 'Test' };

          const { result } = renderHook(() => usePermissions());

          await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
          });

          // API should NOT have been called since cache is valid
          expect(mockApiGet).not.toHaveBeenCalled();
          // Permissions should be available from cache
          expect(result.current.permissions).not.toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('cache older than 5 minutes triggers API call for any role', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonAdminRoleArb,
        userIdArb,
        // Generate a timestamp older than 5 minutes (300000 to 600000 ms ago)
        fc.integer({ min: 300_000, max: 600_000 }),
        async (role, userId, msAgo) => {
          store = {};
          mockApiGet.mockReset();

          const permSet = buildPermissionSet(userId, role);
          const cacheEntry = {
            data: permSet,
            timestamp: Date.now() - msAgo,
            userId,
          };
          store[`user_permissions_${userId}`] = JSON.stringify(cacheEntry);

          // API returns fresh data
          mockApiGet.mockResolvedValue({ data: permSet });
          mockUser.user = { id: userId, role, name: 'Test' };

          const { result } = renderHook(() => usePermissions());

          await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
          });

          // API SHOULD have been called since cache is expired
          expect(mockApiGet).toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });
});
