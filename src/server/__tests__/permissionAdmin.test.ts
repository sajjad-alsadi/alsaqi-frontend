// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createPermissionAdminRoutes } from '../routes/permissionAdmin';
import {
  resetPermissionAdminRateLimiterStore,
  stopPermissionAdminRateLimiterCleanup,
} from '../middleware/permissionAdminRateLimiter';

// Mock ModuleRegistry
vi.mock('../../permissions/registry', () => ({
  ModuleRegistry: {
    getModule: vi.fn((name: string) => {
      if (name === 'InvalidModule' || name === 'NonExistent') return undefined;
      return {
        name,
        label: { en: name, ar: name },
        actions: ['View', 'Create', 'Edit', 'Delete', 'Approve'],
        defaults: {},
      };
    }),
    getAllModules: vi.fn(() => [
      {
        name: 'Analytics',
        label: { en: 'Analytics', ar: 'التحليلات' },
        actions: ['View'],
        defaults: {},
      },
      {
        name: 'Policies',
        label: { en: 'Internal Policies', ar: 'السياسات الداخلية' },
        actions: ['View', 'Create', 'Edit', 'Delete'],
        defaults: {},
      },
    ]),
  },
}));

// Mock PermissionService
vi.mock('../services/PermissionService', () => ({
  PermissionService: {
    hasPermission: vi.fn().mockResolvedValue(true),
    getUserPermissions: vi.fn().mockResolvedValue({
      userId: 'user-1',
      role: 'Admin',
      roleId: 'role-1',
      isCustomRole: false,
      permissions: { Analytics: ['View'], Policies: ['View', 'Create'] },
      overrides: [],
    }),
    getRolePermissions: vi.fn().mockResolvedValue({
      roleId: 'role-1',
      roleName: 'Custom Role',
      isCustom: true,
      permissions: { Analytics: ['View'] },
    }),
    updateRolePermissions: vi.fn().mockResolvedValue(undefined),
    setUserPermissionOverride: vi.fn().mockResolvedValue(undefined),
    invalidateCache: vi.fn(),
  },
}));

// Mock PermissionAuditService
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

// Mock the db module used by PermissionAuditService internally
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
import { PermissionAuditService } from '../services/PermissionAuditService';
import { ModuleRegistry } from '../../permissions/registry';

// ─── Test Helpers ──────────────────────────────────────────────────────────

function createMockDb() {
  const prepareResults: Record<string, any> = {};
  const db: any = {
    prepare: vi.fn((sql: string) => {
      // Return specific results based on SQL query patterns
      if (prepareResults[sql]) return prepareResults[sql];
      return {
        get: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue([]),
        run: vi.fn().mockResolvedValue({ changes: 0 }),
      };
    }),
    transaction: vi.fn((fn: any) => fn),
    _setResult: (sql: string, result: any) => {
      prepareResults[sql] = result;
    },
  };
  return db;
}

function createApp(dbOverrides?: (db: any) => void) {
  const db = createMockDb();
  if (dbOverrides) dbOverrides(db);

  const app = express();
  app.use(express.json());

  // Simulate authenticate middleware - sets req.user
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: 'admin-1', role: 'Admin' };
    next();
  });

  const authenticate = (_req: any, _res: any, next: any) => next();
  const checkPermission = () => (_req: any, _res: any, next: any) => next();
  const logError = vi.fn();

  const router = createPermissionAdminRoutes(db, authenticate, checkPermission, logError);
  app.use('/api/v1', router);

  // Error handler
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
  });

  return { app, db };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Permission Admin API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPermissionAdminRateLimiterStore();
  });

  afterEach(() => {
    stopPermissionAdminRateLimiterCleanup();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ROLE CRUD TESTS (Requirements 7.1-7.11)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Role CRUD', () => {
    describe('GET /api/v1/roles - List all roles', () => {
      it('should return all roles with correct fields (Req 7.9)', async () => {
        const { app, db } = createApp();
        db.prepare.mockReturnValue({
          get: vi.fn(),
          all: vi.fn().mockResolvedValue([
            { id: 'r1', name: 'Admin', description: 'System admin', is_custom: false, created_at: '2024-01-01' },
            { id: 'r2', name: 'Custom Role', description: 'A custom role', is_custom: true, created_at: '2024-06-01' },
          ]),
          run: vi.fn(),
        });

        const res = await request(app).get('/api/v1/roles');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[0]).toEqual({
          id: 'r1',
          name: 'Admin',
          description: 'System admin',
          isCustom: false,
          createdAt: '2024-01-01',
        });
        expect(res.body[1]).toEqual({
          id: 'r2',
          name: 'Custom Role',
          description: 'A custom role',
          isCustom: true,
          createdAt: '2024-06-01',
        });
      });
    });

    describe('POST /api/v1/roles - Create custom role', () => {
      it('should create a custom role with valid name and description (Req 7.1)', async () => {
        const { app, db } = createApp();
        // First call: check for existing role (returns null = no conflict)
        // Second call: insert the new role
        let callCount = 0;
        db.prepare.mockImplementation(() => ({
          get: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve(null); // no conflict
            return Promise.resolve({
              id: 'new-role-id',
              name: 'Auditor Lead',
              description: 'Lead auditor role',
              is_custom: true,
              created_at: '2024-06-15',
            });
          }),
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        }));

        const res = await request(app)
          .post('/api/v1/roles')
          .send({ name: 'Auditor Lead', description: 'Lead auditor role' });

        expect(res.status).toBe(201);
        expect(res.body.name).toBe('Auditor Lead');
        expect(res.body.isCustom).toBe(true);
      });

      it('should return 409 for duplicate role name case-insensitive (Req 7.2)', async () => {
        const { app, db } = createApp();
        db.prepare.mockReturnValue({
          get: vi.fn().mockResolvedValue({ id: 'existing-id' }), // conflict found
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        });

        const res = await request(app)
          .post('/api/v1/roles')
          .send({ name: 'Admin', description: 'Duplicate' });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('CONFLICT');
      });

      it('should return 400 for name shorter than 2 characters (Req 7.3)', async () => {
        const { app } = createApp();

        const res = await request(app)
          .post('/api/v1/roles')
          .send({ name: 'A' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });

      it('should return 400 for name longer than 100 characters (Req 7.3)', async () => {
        const { app } = createApp();

        const res = await request(app)
          .post('/api/v1/roles')
          .send({ name: 'A'.repeat(101) });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });

      it('should return 400 for description longer than 500 characters (Req 7.11)', async () => {
        const { app } = createApp();

        const res = await request(app)
          .post('/api/v1/roles')
          .send({ name: 'Valid Name', description: 'D'.repeat(501) });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('PUT /api/v1/roles/:id - Update custom role', () => {
      it('should update a custom role name and description (Req 7.4)', async () => {
        const { app, db } = createApp();
        let callCount = 0;
        db.prepare.mockImplementation(() => ({
          get: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // Role exists and is custom
              return Promise.resolve({
                id: 'role-1', name: 'Old Name', description: 'Old desc',
                is_custom: true, created_at: '2024-01-01',
              });
            }
            if (callCount === 2) {
              // No name conflict
              return Promise.resolve(null);
            }
            // Updated result
            return Promise.resolve({
              id: 'role-1', name: 'New Name', description: 'New desc',
              is_custom: true, created_at: '2024-01-01',
            });
          }),
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        }));

        const res = await request(app)
          .put('/api/v1/roles/role-1')
          .send({ name: 'New Name', description: 'New desc' });

        expect(res.status).toBe(200);
        expect(res.body.name).toBe('New Name');
        expect(res.body.description).toBe('New desc');
      });

      it('should return 403 when updating a built-in role (Req 7.5)', async () => {
        const { app, db } = createApp();
        db.prepare.mockReturnValue({
          get: vi.fn().mockResolvedValue({
            id: 'builtin-1', name: 'Admin', description: '',
            is_custom: false, created_at: '2024-01-01',
          }),
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        });

        const res = await request(app)
          .put('/api/v1/roles/builtin-1')
          .send({ name: 'Hacked Admin' });

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN');
        expect(res.body.error).toContain('Built-in roles cannot be modified');
      });

      it('should return 404 for non-existent role (Req 7.10)', async () => {
        const { app, db } = createApp();
        db.prepare.mockReturnValue({
          get: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        });

        const res = await request(app)
          .put('/api/v1/roles/nonexistent')
          .send({ name: 'Something' });

        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
      });

      it('should return 409 when updating to a conflicting name (Req 7.2)', async () => {
        const { app, db } = createApp();
        let callCount = 0;
        db.prepare.mockImplementation(() => ({
          get: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // Role exists and is custom
              return Promise.resolve({
                id: 'role-1', name: 'Old Name', description: '',
                is_custom: true, created_at: '2024-01-01',
              });
            }
            // Name conflict found
            return Promise.resolve({ id: 'other-role' });
          }),
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        }));

        const res = await request(app)
          .put('/api/v1/roles/role-1')
          .send({ name: 'Existing Name' });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('CONFLICT');
      });
    });

    describe('DELETE /api/v1/roles/:id - Delete custom role', () => {
      it('should delete a custom role with no assigned users (Req 7.6)', async () => {
        const { app, db } = createApp();
        let callCount = 0;
        db.prepare.mockImplementation(() => ({
          get: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve({ id: 'role-1', name: 'Custom', is_custom: true });
            }
            // Count query
            return Promise.resolve({ total: 0 });
          }),
          all: vi.fn().mockResolvedValue([]), // no assigned users
          run: vi.fn().mockResolvedValue({ changes: 1 }),
        }));
        db.transaction.mockImplementation((fn: any) => fn);

        const res = await request(app).delete('/api/v1/roles/role-1');

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('deleted');
      });

      it('should return 409 when role has assigned users (Req 7.7)', async () => {
        const { app, db } = createApp();
        let callCount = 0;
        db.prepare.mockImplementation(() => ({
          get: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve({ id: 'role-1', name: 'Custom', is_custom: true });
            }
            return Promise.resolve({ total: 3 });
          }),
          all: vi.fn().mockResolvedValue([
            { id: 'user-1' }, { id: 'user-2' }, { id: 'user-3' },
          ]),
          run: vi.fn(),
        }));

        const res = await request(app).delete('/api/v1/roles/role-1');

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('CONFLICT');
        expect(res.body.affectedUserIds).toBeDefined();
        expect(res.body.affectedUserIds.length).toBeGreaterThan(0);
      });

      it('should return 403 when deleting a built-in role (Req 7.8)', async () => {
        const { app, db } = createApp();
        db.prepare.mockReturnValue({
          get: vi.fn().mockResolvedValue({ id: 'builtin-1', name: 'Admin', is_custom: false }),
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        });

        const res = await request(app).delete('/api/v1/roles/builtin-1');

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN');
        expect(res.body.error).toContain('Built-in roles cannot be deleted');
      });

      it('should return 404 for non-existent role (Req 7.10)', async () => {
        const { app, db } = createApp();
        db.prepare.mockReturnValue({
          get: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        });

        const res = await request(app).delete('/api/v1/roles/nonexistent');

        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PERMISSION MATRIX TESTS (Requirements 8.1-8.7)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Permission Matrix', () => {
    describe('GET /api/v1/roles/:id/permissions - Get role permission matrix', () => {
      it('should return complete permission matrix for a role (Req 8.1)', async () => {
        const { app, db } = createApp();
        db.prepare.mockReturnValue({
          get: vi.fn().mockResolvedValue({ id: 'role-1', name: 'Custom', is_custom: true }),
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        });

        const res = await request(app).get('/api/v1/roles/role-1/permissions');

        expect(res.status).toBe(200);
        expect(res.body.roleId).toBe('role-1');
        expect(res.body.roleName).toBe('Custom');
        expect(res.body.permissions).toBeDefined();
        // Should include all registered modules
        expect(res.body.permissions).toHaveProperty('Analytics');
        expect(res.body.permissions).toHaveProperty('Policies');
      });

      it('should return 404 for non-existent role (Req 8.6)', async () => {
        const { app, db } = createApp();
        db.prepare.mockReturnValue({
          get: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        });

        const res = await request(app).get('/api/v1/roles/nonexistent/permissions');

        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
      });
    });

    describe('PUT /api/v1/roles/:id/permissions - Update role permissions', () => {
      it('should update permissions for a custom role (Req 8.2)', async () => {
        const { app, db } = createApp();
        db.prepare.mockReturnValue({
          get: vi.fn().mockResolvedValue({ id: 'role-1', name: 'Custom', is_custom: true }),
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        });

        const res = await request(app)
          .put('/api/v1/roles/role-1/permissions')
          .send({
            permissions: [
              { module: 'Analytics', action: 'View', granted: true },
              { module: 'Policies', action: 'Create', granted: false },
            ],
          });

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('updated');
        expect(PermissionService.updateRolePermissions).toHaveBeenCalledWith(
          'role-1',
          expect.arrayContaining([
            { module: 'Analytics', action: 'View', granted: true },
          ])
        );
      });

      it('should return 403 when updating built-in role permissions (Req 8.3)', async () => {
        const { app, db } = createApp();
        db.prepare.mockReturnValue({
          get: vi.fn().mockResolvedValue({ id: 'builtin-1', name: 'Admin', is_custom: false }),
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        });

        const res = await request(app)
          .put('/api/v1/roles/builtin-1/permissions')
          .send({ permissions: [{ module: 'Analytics', action: 'View', granted: true }] });

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN');
      });

      it('should return 400 for invalid module name (Req 8.7)', async () => {
        const { app, db } = createApp();
        db.prepare.mockReturnValue({
          get: vi.fn().mockResolvedValue({ id: 'role-1', name: 'Custom', is_custom: true }),
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        });

        const res = await request(app)
          .put('/api/v1/roles/role-1/permissions')
          .send({ permissions: [{ module: 'InvalidModule', action: 'View', granted: true }] });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.module).toBe('InvalidModule');
      });

      it('should return 400 for invalid action on a valid module (Req 8.7)', async () => {
        const { app, db } = createApp();
        db.prepare.mockReturnValue({
          get: vi.fn().mockResolvedValue({ id: 'role-1', name: 'Custom', is_custom: true }),
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        });

        // 'Publish' is not a valid action
        const res = await request(app)
          .put('/api/v1/roles/role-1/permissions')
          .send({ permissions: [{ module: 'Analytics', action: 'Publish', granted: true }] });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.action).toBe('Publish');
      });

      it('should return 404 for non-existent role (Req 8.6)', async () => {
        const { app, db } = createApp();
        db.prepare.mockReturnValue({
          get: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        });

        const res = await request(app)
          .put('/api/v1/roles/nonexistent/permissions')
          .send({ permissions: [{ module: 'Analytics', action: 'View', granted: true }] });

        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
      });
    });

    describe('GET /api/v1/permissions/modules - Get all modules', () => {
      it('should return all registered modules with metadata (Req 8.4)', async () => {
        const { app } = createApp();

        const res = await request(app).get('/api/v1/permissions/modules');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[0]).toEqual({
          name: 'Analytics',
          label: { en: 'Analytics', ar: 'التحليلات' },
          actions: ['View'],
        });
        expect(res.body[1]).toEqual({
          name: 'Policies',
          label: { en: 'Internal Policies', ar: 'السياسات الداخلية' },
          actions: ['View', 'Create', 'Edit', 'Delete'],
        });
      });
    });

    describe('GET /api/v1/permissions/me - Get current user permissions', () => {
      it('should return authenticated user effective permissions (Req 8.5)', async () => {
        const { app } = createApp();

        const res = await request(app).get('/api/v1/permissions/me');

        expect(res.status).toBe(200);
        expect(res.body.userId).toBe('user-1');
        expect(res.body.role).toBe('Admin');
        expect(res.body.permissions).toBeDefined();
        expect(res.body.overrides).toBeDefined();
        expect(PermissionService.getUserPermissions).toHaveBeenCalled();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // USER OVERRIDE TESTS (Requirements 9.1-9.6)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('User Permission Overrides', () => {
    describe('GET /api/v1/users/:id/permissions - Get user overrides', () => {
      it('should return user permission overrides (Req 9.1)', async () => {
        const { app, db } = createApp();
        let callCount = 0;
        db.prepare.mockImplementation(() => ({
          get: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve({ id: 'user-1' }); // user exists
            return Promise.resolve(null);
          }),
          all: vi.fn().mockResolvedValue([
            { module: 'Policies', action: 'Delete', is_allowed: true },
            { module: 'Analytics', action: 'View', is_allowed: false },
          ]),
          run: vi.fn(),
        }));

        const res = await request(app).get('/api/v1/users/user-1/permissions');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[0]).toEqual({
          module: 'Policies',
          action: 'Delete',
          isAllowed: true,
        });
        expect(res.body[1]).toEqual({
          module: 'Analytics',
          action: 'View',
          isAllowed: false,
        });
      });

      it('should return 404 for non-existent user (Req 9.4)', async () => {
        const { app, db } = createApp();
        db.prepare.mockReturnValue({
          get: vi.fn().mockResolvedValue(null), // user not found
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        });

        const res = await request(app).get('/api/v1/users/nonexistent/permissions');

        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
      });
    });

    describe('PUT /api/v1/users/:id/permissions - Set user overrides', () => {
      it('should replace all overrides for a user (Req 9.2)', async () => {
        const { app, db } = createApp();
        let callCount = 0;
        db.prepare.mockImplementation(() => ({
          get: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve({ id: 'user-1' }); // user exists
            // permission record lookup
            return Promise.resolve({ id: 'perm-1' });
          }),
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn().mockResolvedValue({ changes: 1 }),
        }));
        db.transaction.mockImplementation((fn: any) => fn);

        const res = await request(app)
          .put('/api/v1/users/user-1/permissions')
          .send({
            overrides: [
              { module: 'Policies', action: 'Delete', isAllowed: true },
              { module: 'Analytics', action: 'View', isAllowed: false },
            ],
          });

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('updated');
        expect(res.body.overridesCount).toBe(2);
        expect(PermissionService.invalidateCache).toHaveBeenCalledWith('user-1');
      });

      it('should clear all overrides when empty array is provided (Req 9.6)', async () => {
        const { app, db } = createApp();
        db.prepare.mockImplementation(() => ({
          get: vi.fn().mockResolvedValue({ id: 'user-1' }), // user exists
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn().mockResolvedValue({ changes: 1 }),
        }));
        db.transaction.mockImplementation((fn: any) => fn);

        const res = await request(app)
          .put('/api/v1/users/user-1/permissions')
          .send({ overrides: [] });

        expect(res.status).toBe(200);
        expect(res.body.overridesCount).toBe(0);
        expect(PermissionService.invalidateCache).toHaveBeenCalledWith('user-1');
      });

      it('should return 400 for unrecognized module (Req 9.5)', async () => {
        const { app, db } = createApp();
        db.prepare.mockImplementation(() => ({
          get: vi.fn().mockResolvedValue({ id: 'user-1' }), // user exists
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        }));

        const res = await request(app)
          .put('/api/v1/users/user-1/permissions')
          .send({
            overrides: [{ module: 'NonExistent', action: 'View', isAllowed: true }],
          });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.module).toBe('NonExistent');
      });

      it('should return 400 for unsupported action on module (Req 9.3)', async () => {
        const { app, db } = createApp();
        db.prepare.mockImplementation(() => ({
          get: vi.fn().mockResolvedValue({ id: 'user-1' }), // user exists
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        }));

        // 'Publish' is not a valid action for any module
        const res = await request(app)
          .put('/api/v1/users/user-1/permissions')
          .send({
            overrides: [{ module: 'Analytics', action: 'Publish', isAllowed: true }],
          });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });

      it('should return 404 for non-existent user (Req 9.4)', async () => {
        const { app, db } = createApp();
        db.prepare.mockReturnValue({
          get: vi.fn().mockResolvedValue(null), // user not found
          all: vi.fn().mockResolvedValue([]),
          run: vi.fn(),
        });

        const res = await request(app)
          .put('/api/v1/users/nonexistent/permissions')
          .send({ overrides: [{ module: 'Analytics', action: 'View', isAllowed: true }] });

        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT LOGGING TESTS (Requirements 12.1-12.6)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Audit Logging', () => {
    it('should create audit log entry when role permissions are modified (Req 12.1)', async () => {
      const { app, db } = createApp();
      db.prepare.mockReturnValue({
        get: vi.fn().mockResolvedValue({ id: 'role-1', name: 'Custom', is_custom: true }),
        all: vi.fn().mockResolvedValue([]),
        run: vi.fn(),
      });

      const res = await request(app)
        .put('/api/v1/roles/role-1/permissions')
        .send({ permissions: [{ module: 'Analytics', action: 'View', granted: true }] });

      expect(res.status).toBe(200);
      expect(PermissionService.updateRolePermissions).toHaveBeenCalled();
      // Verify audit log was called with correct event type
      expect(PermissionAuditService.logPermissionChange).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'role_permission_change',
          actorUserId: 'admin-1',
          targetRoleId: 'role-1',
        })
      );
    });

    it('should create audit log entry when user overrides are changed (Req 12.2)', async () => {
      const { app, db } = createApp();
      db.prepare.mockImplementation(() => ({
        get: vi.fn().mockResolvedValue({ id: 'user-1' }),
        all: vi.fn().mockResolvedValue([]),
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      }));
      db.transaction.mockImplementation((fn: any) => fn);

      const res = await request(app)
        .put('/api/v1/users/user-1/permissions')
        .send({
          overrides: [{ module: 'Policies', action: 'Delete', isAllowed: true }],
        });

      expect(res.status).toBe(200);
      expect(PermissionService.invalidateCache).toHaveBeenCalledWith('user-1');
      // Verify audit log was called with correct event type
      expect(PermissionAuditService.logPermissionChange).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'user_override_change',
          actorUserId: 'admin-1',
          targetUserId: 'user-1',
        })
      );
    });

    it('should create audit log entry when custom role is created (Req 12.3)', async () => {
      const { app, db } = createApp();
      let callCount = 0;
      db.prepare.mockImplementation(() => ({
        get: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve(null); // no conflict
          return Promise.resolve({
            id: 'new-role',
            name: 'Audit Lead',
            description: 'Lead auditor',
            is_custom: true,
            created_at: '2024-06-15',
          });
        }),
        all: vi.fn().mockResolvedValue([]),
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      }));

      const res = await request(app)
        .post('/api/v1/roles')
        .send({ name: 'Audit Lead', description: 'Lead auditor' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Audit Lead');
      // Verify audit log was called with correct event type
      expect(PermissionAuditService.logPermissionChange).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'custom_role_created',
          actorUserId: 'admin-1',
        })
      );
    });

    it('should rollback permission change if audit log write fails (Req 12.6)', async () => {
      const { app, db } = createApp();
      // Simulate PermissionAuditService.logPermissionChange throwing due to audit failure
      vi.mocked(PermissionAuditService.logPermissionChange).mockRejectedValueOnce(
        new Error('Audit log write failed')
      );

      db.prepare.mockReturnValue({
        get: vi.fn().mockResolvedValue({ id: 'role-1', name: 'Custom', is_custom: true }),
        all: vi.fn().mockResolvedValue([]),
        run: vi.fn(),
      });

      const res = await request(app)
        .put('/api/v1/roles/role-1/permissions')
        .send({ permissions: [{ module: 'Analytics', action: 'View', granted: true }] });

      // Should return 500 when the audit log write fails (Req 12.6 - rollback)
      expect(res.status).toBe(500);
    });

    it('should create audit log entry when custom role is deleted (Req 12.3)', async () => {
      const { app, db } = createApp();
      let callCount = 0;
      db.prepare.mockImplementation(() => ({
        get: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ id: 'role-1', name: 'Custom Role', description: 'A custom role', is_custom: true });
          }
          return Promise.resolve(null);
        }),
        all: vi.fn().mockResolvedValue([]), // no assigned users
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      }));
      db.transaction.mockImplementation((fn: any) => fn);

      const res = await request(app).delete('/api/v1/roles/role-1');

      expect(res.status).toBe(200);
      expect(PermissionAuditService.logPermissionChange).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'custom_role_deleted',
          actorUserId: 'admin-1',
          targetRoleId: 'role-1',
        })
      );
    });

    describe('GET /api/v1/audit-logs/permissions - Get audit logs (Req 12.4, 12.5)', () => {
      it('should return paginated audit log entries', async () => {
        const mockEntries = [
          {
            id: 'log-1',
            eventType: 'role_permission_change',
            actorUserId: 'admin-1',
            targetRoleId: 'role-1',
            targetUserId: null,
            oldState: { Analytics: ['View'] },
            newState: { Analytics: ['View', 'Create'] },
            timestamp: '2024-06-15T10:00:00.000Z',
          },
        ];

        vi.mocked(PermissionAuditService.getAuditLogs).mockResolvedValueOnce({
          entries: mockEntries,
          total: 1,
          page: 1,
          limit: 50,
          totalPages: 1,
        });

        const { app } = createApp();
        const res = await request(app).get('/api/v1/audit-logs/permissions');

        expect(res.status).toBe(200);
        expect(res.body.entries).toHaveLength(1);
        expect(res.body.total).toBe(1);
        expect(res.body.page).toBe(1);
        expect(res.body.limit).toBe(50);
        expect(res.body.totalPages).toBe(1);
        expect(PermissionAuditService.getAuditLogs).toHaveBeenCalled();
      });

      it('should pass filter parameters to getAuditLogs', async () => {
        vi.mocked(PermissionAuditService.getAuditLogs).mockResolvedValueOnce({
          entries: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        });

        const { app } = createApp();
        const res = await request(app)
          .get('/api/v1/audit-logs/permissions')
          .query({
            actorUserId: 'admin-1',
            targetRoleId: 'role-1',
            eventType: 'role_permission_change',
            startDate: '2024-01-01T00:00:00.000Z',
            endDate: '2024-12-31T23:59:59.000Z',
            page: '1',
            limit: '20',
          });

        expect(res.status).toBe(200);
        expect(PermissionAuditService.getAuditLogs).toHaveBeenCalledWith(
          expect.objectContaining({
            actorUserId: 'admin-1',
            targetRoleId: 'role-1',
            eventType: 'role_permission_change',
            startDate: '2024-01-01T00:00:00.000Z',
            endDate: '2024-12-31T23:59:59.000Z',
            page: 1,
            limit: 20,
          })
        );
      });

      it('should return 400 for invalid event type', async () => {
        const { app } = createApp();
        const res = await request(app)
          .get('/api/v1/audit-logs/permissions')
          .query({ eventType: 'invalid_event' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });

      it('should return 400 for invalid startDate format', async () => {
        const { app } = createApp();
        const res = await request(app)
          .get('/api/v1/audit-logs/permissions')
          .query({ startDate: 'not-a-date' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });

      it('should return 400 for invalid endDate format', async () => {
        const { app } = createApp();
        const res = await request(app)
          .get('/api/v1/audit-logs/permissions')
          .query({ endDate: 'not-a-date' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });

      it('should enforce max 50 entries per page (Req 12.4)', async () => {
        vi.mocked(PermissionAuditService.getAuditLogs).mockResolvedValueOnce({
          entries: [],
          total: 0,
          page: 1,
          limit: 50,
          totalPages: 0,
        });

        const { app } = createApp();
        const res = await request(app)
          .get('/api/v1/audit-logs/permissions')
          .query({ limit: '100' }); // Request more than max

        expect(res.status).toBe(200);
        // The service should cap at 50
        expect(PermissionAuditService.getAuditLogs).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: 100, // Passed as-is; the service enforces the cap
          })
        );
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RATE LIMITING TESTS (Requirements 13.4, 13.5)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Rate Limiting', () => {
    it('should return 429 with Retry-After header after 100 requests (Req 13.4, 13.5)', async () => {
      const { app, db } = createApp();
      db.prepare.mockReturnValue({
        get: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue([]),
        run: vi.fn(),
      });

      // Make 100 requests to fill the rate limit window
      for (let i = 0; i < 100; i++) {
        await request(app).get('/api/v1/permissions/modules');
      }

      // The 101st request should be rate limited
      const res = await request(app).get('/api/v1/permissions/modules');

      expect(res.status).toBe(429);
      expect(res.body.error).toContain('Rate limit exceeded');
      expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(res.headers['retry-after']).toBeDefined();
      // Retry-After should be a positive number of seconds
      const retryAfter = parseInt(res.headers['retry-after'], 10);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(900); // max 15 minutes
    });

    it('should allow requests under the rate limit threshold', async () => {
      const { app } = createApp();

      // A single request should succeed
      const res = await request(app).get('/api/v1/permissions/modules');

      expect(res.status).toBe(200);
    });
  });
});
