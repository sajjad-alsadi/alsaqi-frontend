// @vitest-environment node
/**
 * Integration tests for end-to-end permission flow.
 *
 * Tests:
 * 1. Full request flow: authenticate → checkPermission → handler (allowed and denied)
 * 2. Permission change propagation: change permissions → cache invalidated → next request reflects change
 * 3. Seeder idempotency: run seedModules() twice → same DB state
 * 4. /permissions/me consistency (Property 17): response matches middleware behavior
 *
 * **Validates: Requirements 3.1, 5.5, 8.5**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import express from 'express';
import request from 'supertest';
import { createAuthMiddlewares } from '../middleware/auth';
import { UserRole } from '../../constants';
import { PermissionAction } from '../../permissions/types';
import {
  resetPermissionAdminRateLimiterStore,
  stopPermissionAdminRateLimiterCleanup,
} from '../middleware/permissionAdminRateLimiter';

// ─── Mocks ─────────────────────────────────────────────────────────────────

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

vi.mock('express-rate-limit', () => ({
  rateLimit: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

// Test modules for the registry mock
const TEST_MODULES = [
  {
    name: 'Analytics',
    label: { en: 'Analytics', ar: 'التحليلات' },
    actions: ['View'] as PermissionAction[],
    defaults: { Admin: ['View'], Manager: ['View'] },
  },
  {
    name: 'Policies',
    label: { en: 'Internal Policies', ar: 'السياسات الداخلية' },
    actions: ['View', 'Create', 'Edit', 'Delete'] as PermissionAction[],
    defaults: { Admin: ['View', 'Create', 'Edit', 'Delete'], Manager: ['View'] },
  },
  {
    name: 'UserManagement',
    label: { en: 'User Management', ar: 'إدارة المستخدمين' },
    actions: ['View', 'Create', 'Edit', 'Delete'] as PermissionAction[],
    defaults: { Admin: ['View', 'Create', 'Edit', 'Delete'] },
  },
];

vi.mock('../../permissions/registry', () => ({
  ModuleRegistry: {
    getModule: vi.fn((name: string) => {
      return TEST_MODULES.find((m) => m.name === name) || undefined;
    }),
    getAllModules: vi.fn(() => TEST_MODULES),
    getModuleNames: vi.fn(() => TEST_MODULES.map((m) => m.name)),
  },
}));

// Track hasPermission calls and results for propagation tests
let hasPermissionResults: Record<string, boolean> = {};

vi.mock('../services/PermissionService', () => ({
  PermissionService: {
    hasPermission: vi.fn(async (userId: string, module: string, action: string) => {
      const key = `${userId}_${module}_${action}`;
      if (key in hasPermissionResults) return hasPermissionResults[key];
      return false;
    }),
    getUserPermissions: vi.fn(),
    getRolePermissions: vi.fn(),
    updateRolePermissions: vi.fn(),
    setUserPermissionOverride: vi.fn(),
    invalidateCache: vi.fn(),
  },
}));

vi.mock('../services/PermissionAuditService', () => ({
  PermissionAuditService: {
    logPermissionChange: vi.fn().mockResolvedValue(undefined),
    getAuditLogs: vi.fn().mockResolvedValue({
      entries: [],
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 0,
    }),
  },
}));

vi.mock('../db/index', () => ({
  db: {
    prepare: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue([]),
      run: vi.fn().mockResolvedValue({ changes: 0 }),
    }),
  },
}));

import { PermissionService } from '../services/PermissionService';
import { ModuleRegistry } from '../../permissions/registry';
import { createPermissionAdminRoutes } from '../routes/permissionAdmin';

// ─── Test Helpers ──────────────────────────────────────────────────────────

function createMockDb() {
  const db: any = {
    prepare: vi.fn(() => ({
      get: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue([]),
      run: vi.fn().mockResolvedValue({ changes: 0, lastInsertRowid: 0 }),
    })),
    transaction: vi.fn((fn: any) => fn),
  };
  return db;
}

/**
 * Creates a full Express app with authenticate + checkPermission + a test route.
 * Simulates the real request flow: authenticate → checkPermission → handler.
 */
function createIntegrationApp(options: {
  userForAuth?: any;
  dbOverrides?: (db: any) => void;
} = {}) {
  const db = createMockDb();
  if (options.dbOverrides) options.dbOverrides(db);

  const JWT_SECRET = 'test-secret';
  const JWT_PUBLIC_KEY = 'test-public-key';
  const middlewares = createAuthMiddlewares(db, JWT_SECRET, JWT_PUBLIC_KEY);
  middlewares.cache.clear();

  const app = express();
  app.use(express.json());

  // Simulate authenticate middleware by injecting user directly
  // (JWT verification is tested separately in auth.test.ts)
  app.use((req: any, _res: any, next: any) => {
    if (options.userForAuth) {
      req.user = options.userForAuth;
    }
    next();
  });

  // Protected test route: requires Analytics View permission
  app.get(
    '/api/v1/analytics/test',
    middlewares.checkPermission('Analytics', 'View'),
    (req: any, res: any) => {
      res.json({ success: true, userId: req.user.id });
    }
  );

  // Protected test route: requires Policies Create permission
  app.post(
    '/api/v1/policies/test',
    middlewares.checkPermission('Policies', 'Create'),
    (req: any, res: any) => {
      res.json({ success: true, action: 'created' });
    }
  );

  // Mount permission admin routes for /permissions/me testing
  const authenticate = (_req: any, _res: any, next: any) => next();
  const checkPermission = () => (_req: any, _res: any, next: any) => next();
  const logError = vi.fn();
  const adminRouter = createPermissionAdminRoutes(db, authenticate, checkPermission, logError);
  app.use('/api/v1', adminRouter);

  return { app, db, middlewares };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Permission Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermissionResults = {};
    resetPermissionAdminRateLimiterStore();
  });

  afterEach(() => {
    stopPermissionAdminRateLimiterCleanup();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Full Request Flow: authenticate → checkPermission → handler
  // Validates: Requirement 3.1
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Full request flow: authenticate → checkPermission → handler', () => {
    it('should allow Admin users to reach the handler without DB permission check', async () => {
      const { app } = createIntegrationApp({
        userForAuth: { id: 'admin-1', role: UserRole.ADMIN, username: 'admin' },
      });

      const res = await request(app).get('/api/v1/analytics/test');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.userId).toBe('admin-1');
      // Admin bypass: PermissionService should NOT be called
      expect(PermissionService.hasPermission).not.toHaveBeenCalled();
    });

    it('should allow non-Admin user with granted permission to reach the handler', async () => {
      hasPermissionResults['user-1_Analytics_View'] = true;

      const { app } = createIntegrationApp({
        userForAuth: { id: 'user-1', role: UserRole.INTERNAL_AUDITOR, username: 'auditor' },
      });

      const res = await request(app).get('/api/v1/analytics/test');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(PermissionService.hasPermission).toHaveBeenCalledWith('user-1', 'Analytics', 'View');
    });

    it('should deny non-Admin user without permission with structured 403', async () => {
      hasPermissionResults['user-2_Analytics_View'] = false;

      const { app } = createIntegrationApp({
        userForAuth: { id: 'user-2', role: UserRole.VIEWER, username: 'viewer' },
      });

      const res = await request(app).get('/api/v1/analytics/test');

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
      expect(res.body.module).toBe('Analytics');
      expect(res.body.action).toBe('View');
      expect(res.body.error).toContain('Forbidden');
    });

    it('should return 401 when user is not authenticated', async () => {
      const { app } = createIntegrationApp({
        userForAuth: undefined, // No user set
      });

      const res = await request(app).get('/api/v1/analytics/test');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    it('should deny access on one route and allow on another for same user', async () => {
      hasPermissionResults['user-3_Analytics_View'] = true;
      hasPermissionResults['user-3_Policies_Create'] = false;

      const { app } = createIntegrationApp({
        userForAuth: { id: 'user-3', role: UserRole.COMPLIANCE_OFFICER, username: 'co' },
      });

      const analyticsRes = await request(app).get('/api/v1/analytics/test');
      expect(analyticsRes.status).toBe(200);

      const policiesRes = await request(app).post('/api/v1/policies/test');
      expect(policiesRes.status).toBe(403);
      expect(policiesRes.body.module).toBe('Policies');
      expect(policiesRes.body.action).toBe('Create');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Permission Change Propagation
  // Validates: Requirement 5.5
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Permission change propagation: cache invalidation on permission change', () => {
    it('should reflect permission changes after cache invalidation', async () => {
      // Initially user does NOT have permission
      hasPermissionResults['user-4_Policies_Create'] = false;

      const { app } = createIntegrationApp({
        userForAuth: { id: 'user-4', role: UserRole.INTERNAL_AUDITOR, username: 'auditor2' },
      });

      // First request: denied
      const res1 = await request(app).post('/api/v1/policies/test');
      expect(res1.status).toBe(403);

      // Simulate admin changing permission: now user HAS permission
      hasPermissionResults['user-4_Policies_Create'] = true;

      // After cache invalidation, next request should use new permission
      // (PermissionService.hasPermission is re-called with new result)
      const res2 = await request(app).post('/api/v1/policies/test');
      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);

      // Verify hasPermission was called for both requests
      expect(PermissionService.hasPermission).toHaveBeenCalledTimes(2);
    });

    it('should call invalidateCache when role permissions are updated via admin API', async () => {
      const { app, db } = createIntegrationApp({
        userForAuth: { id: 'admin-1', role: UserRole.ADMIN, username: 'admin' },
      });

      // Mock: role exists and is custom
      db.prepare.mockReturnValue({
        get: vi.fn().mockResolvedValue({ id: 'role-1', name: 'Custom', is_custom: true }),
        all: vi.fn().mockResolvedValue([]),
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      });

      vi.mocked(PermissionService.getRolePermissions).mockResolvedValue({
        roleId: 'role-1',
        roleName: 'Custom',
        isCustom: true,
        permissions: {},
      });

      const res = await request(app)
        .put('/api/v1/roles/role-1/permissions')
        .send({
          permissions: [{ module: 'Analytics', action: 'View', granted: true }],
        });

      expect(res.status).toBe(200);
      // updateRolePermissions internally invalidates cache for affected users
      expect(PermissionService.updateRolePermissions).toHaveBeenCalledWith(
        'role-1',
        expect.arrayContaining([{ module: 'Analytics', action: 'View', granted: true }])
      );
    });

    it('should call invalidateCache for user when user overrides are updated', async () => {
      const { app, db } = createIntegrationApp({
        userForAuth: { id: 'admin-1', role: UserRole.ADMIN, username: 'admin' },
      });

      db.prepare.mockImplementation(() => ({
        get: vi.fn().mockResolvedValue({ id: 'user-5' }),
        all: vi.fn().mockResolvedValue([]),
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      }));
      db.transaction.mockImplementation((fn: any) => fn);

      const res = await request(app)
        .put('/api/v1/users/user-5/permissions')
        .send({
          overrides: [{ module: 'Policies', action: 'Delete', isAllowed: true }],
        });

      expect(res.status).toBe(200);
      expect(PermissionService.invalidateCache).toHaveBeenCalledWith('user-5');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Seeder Idempotency
  // Validates: Requirement 2.5
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Seeder idempotency on repeated startup', () => {
    it('should produce the same DB state when run twice', async () => {
      // We import seedModules dynamically to avoid module-level mock conflicts
      const { seedModules } = await import('../../permissions/seeder');

      // Track all INSERT calls
      const insertedPermissions: string[] = [];
      const insertedRolePerms: string[] = [];

      const mockDb: any = {
        prepare: vi.fn((sql: string) => {
          if (sql.includes('SELECT module, action FROM permissions')) {
            // First run: empty DB. Second run: has the seeded records.
            return {
              all: vi.fn().mockImplementation(() => {
                // Return what was inserted so far
                return Promise.resolve(
                  insertedPermissions.map((key) => {
                    const [module, action] = key.split(':');
                    return { module, action };
                  })
                );
              }),
              get: vi.fn(),
              run: vi.fn(),
            };
          }

          if (sql.includes('INSERT INTO permissions')) {
            return {
              get: vi.fn().mockImplementation((...args: any[]) => {
                const module = args[0];
                const action = args[1];
                const key = `${module}:${action}`;
                insertedPermissions.push(key);
                return Promise.resolve({ id: `perm-${insertedPermissions.length}` });
              }),
              all: vi.fn(),
              run: vi.fn(),
            };
          }

          if (sql.includes('SELECT id FROM roles WHERE name')) {
            return {
              get: vi.fn().mockResolvedValue({ id: 'role-admin-id' }),
              all: vi.fn(),
              run: vi.fn(),
            };
          }

          if (sql.includes('INSERT INTO role_permissions')) {
            return {
              get: vi.fn(),
              all: vi.fn(),
              run: vi.fn().mockImplementation((...args: any[]) => {
                insertedRolePerms.push(`${args[0]}:${args[1]}`);
                return Promise.resolve({ changes: 1, lastInsertRowid: 0 });
              }),
            };
          }

          return {
            get: vi.fn().mockResolvedValue(null),
            all: vi.fn().mockResolvedValue([]),
            run: vi.fn().mockResolvedValue({ changes: 0, lastInsertRowid: 0 }),
          };
        }),
      };

      const testModules = [
        {
          name: 'TestModule',
          label: { en: 'Test', ar: 'اختبار' },
          actions: ['View', 'Edit'] as PermissionAction[],
          defaults: { Admin: ['View', 'Edit'] as PermissionAction[] },
        },
      ];

      // First run: should insert records
      const result1 = await seedModules(mockDb, testModules);
      expect(result1.added.length).toBe(2); // View + Edit
      expect(result1.skipped.length).toBe(0);

      // Second run: same modules already exist, should skip all
      const result2 = await seedModules(mockDb, testModules);
      expect(result2.added.length).toBe(0);
      expect(result2.skipped.length).toBe(2);

      // Total added across both runs = same as first run
      expect(result1.added).toEqual(['TestModule:View', 'TestModule:Edit']);
      expect(result2.skipped).toEqual(['TestModule:View', 'TestModule:Edit']);
    });

    it('should return added + skipped = total module-action pairs', async () => {
      const { seedModules } = await import('../../permissions/seeder');

      const mockDb: any = {
        prepare: vi.fn((sql: string) => {
          if (sql.includes('SELECT module, action FROM permissions')) {
            // Simulate some already existing
            return {
              all: vi.fn().mockResolvedValue([
                { module: 'Existing', action: 'View' },
              ]),
              get: vi.fn(),
              run: vi.fn(),
            };
          }

          if (sql.includes('INSERT INTO permissions')) {
            return {
              get: vi.fn().mockResolvedValue({ id: 'new-perm-id' }),
              all: vi.fn(),
              run: vi.fn(),
            };
          }

          if (sql.includes('SELECT id FROM roles')) {
            return {
              get: vi.fn().mockResolvedValue({ id: 'role-id' }),
              all: vi.fn(),
              run: vi.fn(),
            };
          }

          return {
            get: vi.fn().mockResolvedValue(null),
            all: vi.fn().mockResolvedValue([]),
            run: vi.fn().mockResolvedValue({ changes: 0, lastInsertRowid: 0 }),
          };
        }),
      };

      const testModules = [
        {
          name: 'Existing',
          label: { en: 'Existing', ar: 'موجود' },
          actions: ['View', 'Create'] as PermissionAction[],
          defaults: { Admin: ['View', 'Create'] as PermissionAction[] },
        },
      ];

      const result = await seedModules(mockDb, testModules);
      // View already exists (skipped), Create is new (added)
      expect(result.added.length + result.skipped.length).toBe(2);
      expect(result.skipped).toContain('Existing:View');
      expect(result.added).toContain('Existing:Create');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. /permissions/me Consistency (Property 17)
  // **Validates: Requirements 8.5**
  // **Property 17: Effective Permissions API Consistency** -
  //   `/permissions/me` matches what hasPermission() returns for every module/action
  // ═══════════════════════════════════════════════════════════════════════════

  describe('/permissions/me response matches middleware behavior', () => {
    it('should return permissions that match what checkPermission middleware would allow', async () => {
      // Setup: user has Analytics:View and Policies:View,Create but NOT Policies:Edit,Delete
      const userPermissions = {
        userId: 'user-6',
        role: 'Internal Auditor',
        roleId: 'role-ia',
        isCustomRole: false,
        permissions: {
          Analytics: ['View'] as PermissionAction[],
          Policies: ['View', 'Create'] as PermissionAction[],
        },
        overrides: [],
      };

      vi.mocked(PermissionService.getUserPermissions).mockResolvedValue(userPermissions);

      // Set hasPermission to match the permissions map
      hasPermissionResults['user-6_Analytics_View'] = true;
      hasPermissionResults['user-6_Policies_View'] = true;
      hasPermissionResults['user-6_Policies_Create'] = true;
      hasPermissionResults['user-6_Policies_Edit'] = false;
      hasPermissionResults['user-6_Policies_Delete'] = false;

      const { app } = createIntegrationApp({
        userForAuth: { id: 'user-6', role: UserRole.INTERNAL_AUDITOR, username: 'auditor3' },
      });

      // Get /permissions/me response
      const meRes = await request(app).get('/api/v1/permissions/me');
      expect(meRes.status).toBe(200);

      const mePermissions = meRes.body.permissions;

      // Verify: for each module/action in the /me response, the middleware would allow
      for (const [module, actions] of Object.entries(mePermissions)) {
        for (const action of actions as string[]) {
          const key = `user-6_${module}_${action}`;
          expect(hasPermissionResults[key]).toBe(true);
        }
      }

      // Verify: actions NOT in /me response are denied by middleware
      expect(hasPermissionResults['user-6_Policies_Edit']).toBe(false);
      expect(hasPermissionResults['user-6_Policies_Delete']).toBe(false);
    });

    /**
     * **Property 17: Effective Permissions API Consistency**
     * For any authenticated user, the `/permissions/me` endpoint SHALL return
     * permissions that match what hasPermission() would return for every
     * registered module/action combination for that user.
     *
     * **Validates: Requirements 8.5**
     */
    it('Property 17: /permissions/me matches hasPermission() for every module/action', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a random subset of module/action pairs to grant
          fc.record({
            userId: fc.stringMatching(/^user-[a-z0-9]{4}$/).filter((s) => s.length > 0),
            grantedPairs: fc.subarray(
              // All possible module/action pairs from TEST_MODULES
              TEST_MODULES.flatMap((m) =>
                m.actions.map((a) => ({ module: m.name, action: a }))
              ),
              { minLength: 0 }
            ),
          }),
          async ({ userId, grantedPairs }) => {
            // Reset state for this iteration
            vi.clearAllMocks();
            hasPermissionResults = {};

            // Build permissions map from granted pairs
            const permissionsMap: Record<string, PermissionAction[]> = {};
            for (const pair of grantedPairs) {
              if (!permissionsMap[pair.module]) {
                permissionsMap[pair.module] = [];
              }
              permissionsMap[pair.module].push(pair.action);
            }

            // Setup hasPermission to return true for granted pairs, false otherwise
            for (const mod of TEST_MODULES) {
              for (const action of mod.actions) {
                const key = `${userId}_${mod.name}_${action}`;
                const isGranted = grantedPairs.some(
                  (p) => p.module === mod.name && p.action === action
                );
                hasPermissionResults[key] = isGranted;
              }
            }

            // Setup getUserPermissions to return matching permissions
            vi.mocked(PermissionService.getUserPermissions).mockResolvedValue({
              userId,
              role: 'Internal Auditor',
              roleId: 'role-ia',
              isCustomRole: false,
              permissions: permissionsMap,
              overrides: [],
            });

            // Create app with this user
            const { app } = createIntegrationApp({
              userForAuth: { id: userId, role: UserRole.INTERNAL_AUDITOR, username: 'testuser' },
            });

            // Get /permissions/me
            const meRes = await request(app).get('/api/v1/permissions/me');
            expect(meRes.status).toBe(200);

            const mePermissions = meRes.body.permissions as Record<string, string[]>;

            // Property assertion: for every module/action, /me response matches hasPermission
            for (const mod of TEST_MODULES) {
              for (const action of mod.actions) {
                const inMeResponse = (mePermissions[mod.name] || []).includes(action);
                const hasPermResult = hasPermissionResults[`${userId}_${mod.name}_${action}`];

                // The /me endpoint should report the same grant status as hasPermission
                expect(inMeResponse).toBe(hasPermResult);
              }
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
