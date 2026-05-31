// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

/**
 * Property Tests for checkPermission Middleware
 *
 * Property 7: Permission Enforcement Correctness
 * - Non-Admin user allowed iff PermissionService returns true, denied with structured 403 otherwise
 * - Admin users ALWAYS get next() called regardless of PermissionService result
 * - Missing req.user ALWAYS results in 401
 * - PermissionService errors ALWAYS result in 500 (never expose internals)
 *
 * **Validates: Requirements 3.3, 3.4, 13.1**
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock PermissionService
const hasPermissionMock = vi.fn();
vi.mock('../../services/PermissionService', () => ({
  PermissionService: {
    hasPermission: (...args: any[]) => hasPermissionMock(...args),
  },
}));

// Mock ModuleRegistry
const getModuleMock = vi.fn();
vi.mock('../../../permissions/registry', () => ({
  ModuleRegistry: {
    getModule: (...args: any[]) => getModuleMock(...args),
  },
}));

// Mock PermissionAction type import
vi.mock('../../../permissions/types', () => ({
  // Just re-export the type - not needed at runtime but keeps imports happy
}));

import { createAuthMiddlewares } from '../auth';
import { UserRole } from '../../../constants';

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates a valid UUID for user IDs */
const userIdArb = fc.uuid();

/** Generates a valid module name (PascalCase, from a set of registered modules) */
const moduleNameArb = fc.constantFrom(
  'Dashboard',
  'AuditCharter',
  'AuditPlans',
  'AuditFindings',
  'Policies',
  'RiskRegister',
  'Analytics',
  'Compliance',
  'Correspondence',
  'Fraud',
  'Integrity',
  'Recommendations',
  'Regulatory',
  'UserManagement',
  'Settings'
);

/** Generates a valid permission action */
const actionArb = fc.constantFrom('View', 'Create', 'Edit', 'Delete', 'Approve');

/** Generates a non-Admin role */
const nonAdminRoleArb = fc.constantFrom(
  UserRole.INTERNAL_AUDITOR,
  UserRole.COMPLIANCE_OFFICER,
  UserRole.RISK_OFFICER,
  UserRole.MANAGER,
  UserRole.VIEWER
);

// ─── Helper Functions ────────────────────────────────────────────────────────

/** Creates a mock Express request object */
function createMockReq(user?: { id: string; role: string; username?: string }) {
  return { user } as any;
}

/** Creates a mock Express response object that captures status and json calls */
function createMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

/** Creates a mock next function */
function createMockNext() {
  return vi.fn();
}

/**
 * Gets the checkPermission middleware from the factory.
 * We pass dummy db/JWT values since checkPermission doesn't use them directly.
 */
function getCheckPermission() {
  const { checkPermission } = createAuthMiddlewares(
    {} as any, // db - not used by checkPermission
    'dummy-secret',
    'dummy-public-key'
  );
  return checkPermission;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 7: Permission Enforcement Correctness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: module is registered with all actions
    getModuleMock.mockImplementation((name: string) => ({
      name,
      actions: ['View', 'Create', 'Edit', 'Delete', 'Approve'],
      label: { en: name, ar: name },
      defaults: {},
    }));
    // Ensure NODE_ENV is not production so module validation throws (we handle registered modules)
    process.env.NODE_ENV = 'test';
  });

  describe('Non-Admin user: allowed iff PermissionService returns true', () => {
    it('when PermissionService.hasPermission returns true, middleware calls next()', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          moduleNameArb,
          actionArb,
          nonAdminRoleArb,
          async (userId, module, action, role) => {
            vi.clearAllMocks();
            getModuleMock.mockReturnValue({
              name: module,
              actions: ['View', 'Create', 'Edit', 'Delete', 'Approve'],
              label: { en: module, ar: module },
              defaults: {},
            });

            // PermissionService grants permission
            hasPermissionMock.mockResolvedValue(true);

            const checkPermission = getCheckPermission();
            const middleware = checkPermission(module, action as any);

            const req = createMockReq({ id: userId, role });
            const res = createMockRes();
            const next = createMockNext();

            await middleware(req, res, next);

            // Should call next() - user is allowed
            expect(next).toHaveBeenCalledTimes(1);
            expect(res.status).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    }, 30000);

    it('when PermissionService.hasPermission returns false, middleware returns 403 with structured error', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          moduleNameArb,
          actionArb,
          nonAdminRoleArb,
          async (userId, module, action, role) => {
            vi.clearAllMocks();
            getModuleMock.mockReturnValue({
              name: module,
              actions: ['View', 'Create', 'Edit', 'Delete', 'Approve'],
              label: { en: module, ar: module },
              defaults: {},
            });

            // PermissionService denies permission
            hasPermissionMock.mockResolvedValue(false);

            const checkPermission = getCheckPermission();
            const middleware = checkPermission(module, action as any);

            const req = createMockReq({ id: userId, role });
            const res = createMockRes();
            const next = createMockNext();

            await middleware(req, res, next);

            // Should NOT call next()
            expect(next).not.toHaveBeenCalled();

            // Should return 403 with structured error
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledTimes(1);

            const body = res.json.mock.calls[0][0];
            expect(body.code).toBe('PERMISSION_DENIED');
            expect(body.module).toBe(module);
            expect(body.action).toBe(action);
            expect(body.error).toBeDefined();
            // Error message should contain both module and action
            expect(body.error).toContain(module);
            expect(body.error).toContain(action);
          }
        ),
        { numRuns: 100 }
      );
    }, 30000);
  });

  describe('Admin users ALWAYS get next() called regardless of PermissionService result', () => {
    it('Admin user always passes regardless of what PermissionService would return', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          moduleNameArb,
          actionArb,
          fc.boolean(), // what PermissionService would return (irrelevant for Admin)
          async (userId, module, action, _permServiceResult) => {
            vi.clearAllMocks();
            getModuleMock.mockReturnValue({
              name: module,
              actions: ['View', 'Create', 'Edit', 'Delete', 'Approve'],
              label: { en: module, ar: module },
              defaults: {},
            });

            // PermissionService should NOT be called for Admin
            hasPermissionMock.mockResolvedValue(false); // Even if it would deny

            const checkPermission = getCheckPermission();
            const middleware = checkPermission(module, action as any);

            const req = createMockReq({ id: userId, role: UserRole.ADMIN });
            const res = createMockRes();
            const next = createMockNext();

            await middleware(req, res, next);

            // Admin always passes
            expect(next).toHaveBeenCalledTimes(1);
            expect(res.status).not.toHaveBeenCalled();

            // PermissionService should NOT be queried for Admin
            expect(hasPermissionMock).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    }, 30000);
  });

  describe('Missing req.user ALWAYS results in 401', () => {
    it('when req.user is undefined, middleware returns 401 for any module/action', async () => {
      await fc.assert(
        fc.asyncProperty(
          moduleNameArb,
          actionArb,
          async (module, action) => {
            vi.clearAllMocks();
            getModuleMock.mockReturnValue({
              name: module,
              actions: ['View', 'Create', 'Edit', 'Delete', 'Approve'],
              label: { en: module, ar: module },
              defaults: {},
            });

            const checkPermission = getCheckPermission();
            const middleware = checkPermission(module, action as any);

            const req = createMockReq(undefined); // No user
            const res = createMockRes();
            const next = createMockNext();

            await middleware(req, res, next);

            // Should NOT call next()
            expect(next).not.toHaveBeenCalled();

            // Should return 401
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledTimes(1);

            const body = res.json.mock.calls[0][0];
            expect(body.error).toBeDefined();

            // PermissionService should NOT be called
            expect(hasPermissionMock).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 50 }
      );
    }, 30000);
  });

  describe('PermissionService errors ALWAYS result in 500 (never expose internals)', () => {
    it('when PermissionService throws, middleware returns 500 without internal details', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          moduleNameArb,
          actionArb,
          nonAdminRoleArb,
          fc.string({ minLength: 3, maxLength: 100 }).map(s => `SECRET_${s.replace(/\s/g, 'X')}`), // arbitrary error message that won't appear in generic response
          async (userId, module, action, role, errorMessage) => {
            vi.clearAllMocks();
            getModuleMock.mockReturnValue({
              name: module,
              actions: ['View', 'Create', 'Edit', 'Delete', 'Approve'],
              label: { en: module, ar: module },
              defaults: {},
            });

            // PermissionService throws an error
            hasPermissionMock.mockRejectedValue(new Error(errorMessage));

            // Suppress console.error during test
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const checkPermission = getCheckPermission();
            const middleware = checkPermission(module, action as any);

            const req = createMockReq({ id: userId, role });
            const res = createMockRes();
            const next = createMockNext();

            await middleware(req, res, next);

            // Should NOT call next()
            expect(next).not.toHaveBeenCalled();

            // Should return 500
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledTimes(1);

            const body = res.json.mock.calls[0][0];
            expect(body.error).toBeDefined();

            // MUST NOT expose internal error details
            expect(body.error).not.toContain(errorMessage);
            // Should not contain stack traces or internal info
            expect(JSON.stringify(body)).not.toContain(errorMessage);

            consoleErrorSpy.mockRestore();
          }
        ),
        { numRuns: 50 }
      );
    }, 30000);
  });
});
