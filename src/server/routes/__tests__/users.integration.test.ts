// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { UserRole } from '../../../constants';

/**
 * Integration Tests - Users Routes
 *
 * Tests the user management routes using supertest against a minimal Express app.
 * Covers CRUD operations, authentication requirements, authorization, and error handling.
 */

interface MockUser {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  department: string;
  status: string;
}

function createUsersTestApp(options?: { authenticatedRole?: string }) {
  const app = express();
  app.use(express.json());

  const users: MockUser[] = [
    {
      id: 'user-1',
      username: 'admin',
      name: 'Admin User',
      email: 'admin@company.com',
      role: UserRole.ADMIN,
      department: 'IT',
      status: 'Active',
    },
    {
      id: 'user-2',
      username: 'auditor1',
      name: 'John Auditor',
      email: 'john@company.com',
      role: UserRole.INTERNAL_AUDITOR,
      department: 'Audit',
      status: 'Active',
    },
    {
      id: 'user-3',
      username: 'suspended_user',
      name: 'Suspended User',
      email: 'suspended@company.com',
      role: UserRole.VIEWER,
      department: 'Finance',
      status: 'Suspended',
    },
  ];

  const authenticatedRole = options?.authenticatedRole || UserRole.ADMIN;

  // Simulate authenticate middleware
  const authenticate = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { id: 'auth-user-1', role: authenticatedRole, username: 'admin', name: 'Admin User', email: 'admin@test.com' };
    next();
  };

  // Simulate checkPermission middleware (Admin bypass)
  const checkPermission = (module: string, action: string) => (req: any, res: any, next: any) => {
    if (req.user.role === UserRole.ADMIN) return next();
    return res.status(403).json({ error: `Forbidden: Missing permission ${action} on ${module}` });
  };

  const authorize = (roles: readonly string[]) => (req: any, res: any, next: any) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    next();
  };

  const router = express.Router();

  // GET /init
  router.get('/init', authenticate, checkPermission('User', 'View'), (req, res) => {
    res.json({ roles: Object.values(UserRole), departments: ['IT', 'Audit', 'Finance'] });
  });

  // GET all users
  router.get('/', authenticate, checkPermission('User', 'View'), (req, res) => {
    const { status, department, role } = req.query;
    let filtered = [...users];
    if (status) filtered = filtered.filter(u => u.status === status);
    if (department) filtered = filtered.filter(u => u.department === department);
    if (role) filtered = filtered.filter(u => u.role === role);
    res.json({ data: filtered, total: filtered.length });
  });

  // GET /summary
  router.get('/summary', authenticate, checkPermission('User', 'View'), (req, res) => {
    res.json({
      total: users.length,
      active: users.filter(u => u.status === 'Active').length,
      suspended: users.filter(u => u.status === 'Suspended').length,
    });
  });

  // GET /list (accessible to all authenticated users)
  router.get('/list', authenticate, (req, res) => {
    res.json(users.filter(u => u.status === 'Active').map(u => ({ id: u.id, name: u.name, role: u.role })));
  });

  // GET /:id
  router.get('/:id', authenticate, checkPermission('User', 'View'), (req, res) => {
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });

  // POST create user
  router.post('/', authenticate, checkPermission('User', 'Create'), (req, res) => {
    const { username, password, name, email, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required for new users' });
    }
    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Name, email, and role are required' });
    }
    // Check duplicate username
    if (users.find(u => u.username === username)) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    const newUser: MockUser = {
      id: `user-${Date.now()}`,
      username,
      name,
      email,
      role,
      department: req.body.department || '',
      status: 'Active',
    };
    users.push(newUser);
    res.status(201).json(newUser);
  });

  // PUT update user
  router.put('/:id', authenticate, checkPermission('User', 'Edit'), (req, res) => {
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });
    users[idx] = { ...users[idx], ...req.body };
    res.json({ success: true });
  });

  // POST suspend
  router.post('/:id/suspend', authenticate, checkPermission('User', 'Edit'), (req, res) => {
    const id = req.params.id;
    // Cannot suspend yourself
    if ((req as any).user.id === id) {
      return res.status(403).json({ error: 'Cannot perform this action on your own account' });
    }
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });
    users[idx].status = users[idx].status === 'Suspended' ? 'Active' : 'Suspended';
    res.json({ success: true, status: users[idx].status });
  });

  // DELETE user
  router.delete('/:id', authenticate, checkPermission('User', 'Delete'), (req, res) => {
    const id = req.params.id;
    if ((req as any).user.id === id) {
      return res.status(403).json({ error: 'Cannot perform this action on your own account' });
    }
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });
    users.splice(idx, 1);
    res.json({ success: true });
  });

  // POST reset-password
  router.post('/:id/reset-password', authenticate, checkPermission('User', 'Edit'), (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Invalid password data' });
    }
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
  });

  app.use('/api/users', router);

  return { app };
}

describe('Users Integration Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    const testApp = createUsersTestApp();
    app = testApp.app;
  });

  describe('GET /api/users', () => {
    it('should return 200 with list of users when authenticated as Admin', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBe(3);
      expect(res.body.total).toBe(3);
    });

    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/users');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/users?status=Active')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data.every((u: any) => u.status === 'Active')).toBe(true);
    });

    it('should filter by department', async () => {
      const res = await request(app)
        .get('/api/users?department=IT')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].department).toBe('IT');
    });
  });

  describe('GET /api/users/init', () => {
    it('should return roles and departments', async () => {
      const res = await request(app)
        .get('/api/users/init')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.roles).toBeDefined();
      expect(res.body.departments).toBeDefined();
    });
  });

  describe('GET /api/users/summary', () => {
    it('should return user count summary', async () => {
      const res = await request(app)
        .get('/api/users/summary')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.active).toBe(2);
      expect(res.body.suspended).toBe(1);
    });
  });

  describe('GET /api/users/list', () => {
    it('should return active users list (accessible to all authenticated users)', async () => {
      const res = await request(app)
        .get('/api/users/list')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2); // Only active users
    });
  });

  describe('GET /api/users/:id', () => {
    it('should return user details for valid ID', async () => {
      const res = await request(app)
        .get('/api/users/user-2')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('user-2');
      expect(res.body.username).toBe('auditor1');
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .get('/api/users/non-existent')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });
  });

  describe('POST /api/users', () => {
    it('should return 201 with created user on valid data', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', 'Bearer valid-token')
        .send({
          username: 'newuser',
          password: 'securepass123',
          name: 'New User',
          email: 'newuser@company.com',
          role: UserRole.VIEWER,
          department: 'HR',
        });

      expect(res.status).toBe(201);
      expect(res.body.username).toBe('newuser');
      expect(res.body.role).toBe(UserRole.VIEWER);
    });

    it('should return 400 when username or password is missing', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'No Creds', email: 'no@creds.com', role: 'Viewer' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Username and password');
    });

    it('should return 409 when username already exists', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', 'Bearer valid-token')
        .send({
          username: 'admin',
          password: 'pass123',
          name: 'Duplicate',
          email: 'dup@company.com',
          role: 'Viewer',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists');
    });
  });

  describe('PUT /api/users/:id', () => {
    it('should return 200 on successful update', async () => {
      const res = await request(app)
        .put('/api/users/user-2')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated Name', department: 'Security' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .put('/api/users/non-existent')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/users/:id/suspend', () => {
    it('should toggle user suspension status', async () => {
      const res = await request(app)
        .post('/api/users/user-2/suspend')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('Suspended');
    });

    it('should return 403 when trying to suspend yourself', async () => {
      const res = await request(app)
        .post('/api/users/auth-user-1/suspend')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('own account');
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('should return 200 on successful deletion', async () => {
      const res = await request(app)
        .delete('/api/users/user-3')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 403 when trying to delete yourself', async () => {
      const res = await request(app)
        .delete('/api/users/auth-user-1')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('own account');
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .delete('/api/users/non-existent')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/users/:id/reset-password', () => {
    it('should return 200 on valid password reset', async () => {
      const res = await request(app)
        .post('/api/users/user-2/reset-password')
        .set('Authorization', 'Bearer valid-token')
        .send({ newPassword: 'newSecurePass123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when password is too short', async () => {
      const res = await request(app)
        .post('/api/users/user-2/reset-password')
        .set('Authorization', 'Bearer valid-token')
        .send({ newPassword: 'ab' });

      expect(res.status).toBe(400);
    });
  });

  describe('Authorization - Non-Admin users', () => {
    it('should return 403 for non-admin users on protected routes', async () => {
      const { app: viewerApp } = createUsersTestApp({ authenticatedRole: UserRole.VIEWER });

      const res = await request(viewerApp)
        .get('/api/users')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
    });

    it('should allow non-admin users to access /list endpoint', async () => {
      const { app: viewerApp } = createUsersTestApp({ authenticatedRole: UserRole.VIEWER });

      const res = await request(viewerApp)
        .get('/api/users/list')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
    });
  });
});
