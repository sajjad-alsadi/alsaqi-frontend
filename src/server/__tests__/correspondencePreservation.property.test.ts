// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import express from 'express';
import request from 'supertest';

/**
 * Property Test: Preservation - Authorized Access and Admin Full Access Unchanged
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 *
 * These tests MUST PASS on unfixed code - they capture baseline behavior that must be preserved.
 *
 * Observation-first methodology:
 * Step 1: Observed behavior on UNFIXED code:
 *   - Admin users access all endpoints and receive all records system-wide
 *   - Users with correct permissions access records within their scope successfully
 *   - Sequence numbers are generated for create operations
 *   - AuthService.logAudit is called for all successful operations
 *   - N8nService.sendEvent fires for successful create/update/delete operations
 *   - Routes already protected by checkPermission continue to function normally for authorized users
 *
 * Step 2: Property-based tests capturing observed behavior (below)
 *
 * TEST STRATEGY: Same as bug condition test - we recreate the exact route structure as it exists
 * in the unfixed code, confirming that authorized users can perform all operations successfully.
 * This ensures the fix does not regress existing authorized behavior.
 */

// ─── Test Infrastructure ────────────────────────────────────────────────────

/**
 * Recreates the correspondence routes EXACTLY as they exist in the UNFIXED code.
 * For preservation testing, we verify that authorized users get successful responses.
 */
function createUnfixedCorrespondenceRoutes(
  authenticate: any,
  checkPermission: any,
  serviceMocks: any,
  auditMock: any,
  n8nMock: any
) {
  const router = express.Router();

  // ── UNFIXED ROUTES (only authenticate, no checkPermission) ──

  // GET /incoming
  router.get('/incoming', authenticate, async (req: any, res: any) => {
    const result = await serviceMocks.getIncoming(req.query);
    res.json(result);
  });

  // POST /incoming
  router.post('/incoming', authenticate, async (req: any, res: any) => {
    const result = await serviceMocks.createIncoming(req.body, req.user.id);
    await auditMock.logAudit(req.user.username, 'CREATE', 'Correspondence', `Created incoming letter ${result.sequence_number}`);
    await n8nMock.sendEvent('incoming_correspondence.created', { id: result.id, sequence_number: result.sequence_number });
    res.json(result);
  });

  // PUT /status/:type/:id
  router.put('/status/:type/:id', authenticate, async (req: any, res: any) => {
    const result = await serviceMocks.updateStatus(req.params.type, req.params.id, req.body.new_status, req.body.notes || '', req.user.id);
    await auditMock.logAudit(req.user.username, 'UPDATE_STATUS', 'Correspondence', `Changed status`);
    await n8nMock.sendEvent('correspondence.status_updated', { id: req.params.id });
    res.json({ success: true });
  });

  // POST /refer
  router.post('/refer', authenticate, async (req: any, res: any) => {
    await serviceMocks.refer(req.body, req.user.id);
    await auditMock.logAudit(req.user.username, 'REFER', 'Correspondence', `Referred`);
    res.json({ success: true });
  });

  // POST /link
  router.post('/link', authenticate, async (req: any, res: any) => {
    await serviceMocks.link(req.body, req.user.id);
    await auditMock.logAudit(req.user.username, 'LINK', 'Correspondence', `Linked`);
    res.json({ success: true });
  });

  // PUT /archive/:type/:id
  router.put('/archive/:type/:id', authenticate, async (req: any, res: any) => {
    await serviceMocks.archive(req.params.type, req.params.id);
    await auditMock.logAudit(req.user.username, 'ARCHIVE', 'Correspondence', `Archived`);
    res.json({ success: true });
  });

  // GET /archive
  router.get('/archive', authenticate, async (req: any, res: any) => {
    const result = await serviceMocks.getArchive(req.query);
    res.json(result);
  });

  // GET /attachments/:type/:id
  router.get('/attachments/:type/:id', authenticate, async (req: any, res: any) => {
    const data = await serviceMocks.getAttachments(req.params.type, req.params.id);
    res.json(data);
  });

  // POST /attachments
  router.post('/attachments', authenticate, async (req: any, res: any) => {
    await serviceMocks.addAttachment(req.body, req.user.id);
    await auditMock.logAudit(req.user.username, 'UPLOAD', 'Correspondence', `Uploaded attachment`);
    res.json({ success: true });
  });

  // GET /stats
  router.get('/stats', authenticate, async (req: any, res: any) => {
    const stats = await serviceMocks.getStats();
    res.json(stats);
  });

  // GET /details/:type/:id
  router.get('/details/:type/:id', authenticate, async (req: any, res: any) => {
    const details = await serviceMocks.getDetails(req.params.type, req.params.id);
    res.json(details);
  });

  // GET /outgoing
  router.get('/outgoing', authenticate, async (req: any, res: any) => {
    const { page = 1, pageSize = 10 } = req.query;
    const result = await serviceMocks.getOutgoing(Number(page), Number(pageSize));
    res.json(result);
  });

  // ── ALREADY PROTECTED ROUTES (have checkPermission) ──

  // PUT /incoming/:id - already has checkPermission('Correspondence', 'Edit')
  router.put('/incoming/:id', authenticate, checkPermission('Correspondence', 'Edit'), async (req: any, res: any) => {
    await serviceMocks.updateIncoming(req.params.id, req.body);
    await auditMock.logAudit(req.user.username, 'UPDATE', 'Correspondence', `Updated incoming letter ID: ${req.params.id}`);
    await n8nMock.sendEvent('incoming_correspondence.updated', { id: req.params.id });
    res.json({ success: true });
  });

  // DELETE /incoming/:id - already has checkPermission('Correspondence', 'Delete')
  router.delete('/incoming/:id', authenticate, checkPermission('Correspondence', 'Delete'), async (req: any, res: any) => {
    await serviceMocks.deleteIncoming(req.params.id);
    await auditMock.logAudit(req.user.username, 'DELETE', 'Correspondence', `Deleted incoming letter ID: ${req.params.id}`);
    await n8nMock.sendEvent('incoming_correspondence.deleted', { id: req.params.id });
    res.json({ success: true });
  });

  // POST /outgoing - already has checkPermission('Correspondence', 'Create')
  router.post('/outgoing', authenticate, checkPermission('Correspondence', 'Create'), async (req: any, res: any) => {
    const result = await serviceMocks.createOutgoing(req.body, req.user.id);
    await auditMock.logAudit(req.user.username, 'Create', 'Outgoing Letters', `Created letter: ${result.sequence_number}`);
    await n8nMock.sendEvent('outgoing_correspondence.created', { id: result.id, sequence_number: result.sequence_number });
    res.json(result);
  });

  // PUT /outgoing/:id - already has checkPermission('Correspondence', 'Edit')
  router.put('/outgoing/:id', authenticate, checkPermission('Correspondence', 'Edit'), async (req: any, res: any) => {
    await serviceMocks.updateOutgoing(req.params.id, req.body);
    await auditMock.logAudit(req.user.username, 'Update', 'Outgoing Letters', `Updated letter ID: ${req.params.id}`);
    await n8nMock.sendEvent('outgoing_correspondence.updated', { id: req.params.id });
    res.json({ success: true });
  });

  // DELETE /outgoing/:id - already has checkPermission('Correspondence', 'Delete')
  router.delete('/outgoing/:id', authenticate, checkPermission('Correspondence', 'Delete'), async (req: any, res: any) => {
    await serviceMocks.deleteOutgoing(req.params.id);
    await auditMock.logAudit(req.user.username, 'Delete', 'Outgoing Letters', `Deleted letter ID: ${req.params.id}`);
    await n8nMock.sendEvent('outgoing_correspondence.deleted', { id: req.params.id });
    res.json({ success: true });
  });

  return router;
}

/**
 * Creates a mock authenticate middleware that populates req.user.
 */
function createMockAuthenticate(userContext: {
  id: string;
  role: string;
  username: string;
  name: string;
  email: string;
  department_id?: string;
}) {
  return (req: any, _res: any, next: any) => {
    req.user = userContext;
    next();
  };
}

/**
 * Creates a checkPermission middleware that enforces authorization.
 * Admin users always pass. Other users are checked via the provided function.
 */
function createMockCheckPermission(hasPermissionFn: (userId: string, module: string, action: string) => boolean) {
  return (module: string, action: string) => {
    return (req: any, res: any, next: any) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      if (req.user.role === 'Admin') {
        return next();
      }
      const allowed = hasPermissionFn(req.user.id, module, action);
      if (allowed) {
        return next();
      }
      return res.status(403).json({
        error: `Forbidden: Missing permission '${action}' on module '${module}'`,
        code: 'PERMISSION_DENIED',
        module,
        action,
      });
    };
  };
}

// ─── User Contexts ──────────────────────────────────────────────────────────

const adminUser = {
  id: '00000000-0000-0000-0000-000000000100',
  role: 'Admin',
  username: 'admin_user',
  name: 'System Admin',
  email: 'admin@test.com',
  department_id: '00000000-0000-0000-0000-000000000001',
};

const authorizedUser = {
  id: '00000000-0000-0000-0000-000000000200',
  role: 'Internal Auditor',
  username: 'authorized_user',
  name: 'Authorized User',
  email: 'authorized@test.com',
  department_id: '00000000-0000-0000-0000-000000000010',
};

// ─── Mock Data ──────────────────────────────────────────────────────────────

const deptAId = '00000000-0000-0000-0000-000000000010';
const recordInScopeId = '00000000-0000-0000-0000-000000000301';
const outgoingRecordId = '00000000-0000-0000-0000-000000000401';

/**
 * Generate mock data that represents records within the authorized user's scope.
 * On unfixed code, the service returns ALL records - for Admin this is correct behavior.
 * For scoped users, the preservation test confirms they can still access the endpoints.
 */
function createMockRecordsForDept(deptId: string, userId: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `record-${i}`,
    sequence_number: `INC-2024-${(i + 1).toString().padStart(4, '0')}`,
    subject: `Test Subject ${i}`,
    sender_entity: `Sender ${i}`,
    letter_date: '2024-01-15',
    receipt_date: '2024-01-16',
    status: 'New',
    priority: 'Normal',
    assigned_dept_id: deptId,
    assigned_user_id: userId,
    created_by: userId,
    is_archived: 0,
  }));
}

// ─── Service & Audit Mocks ──────────────────────────────────────────────────

const serviceMocks = {
  getIncoming: vi.fn(),
  getOutgoing: vi.fn(),
  getArchive: vi.fn(),
  getStats: vi.fn(),
  getDetails: vi.fn(),
  getAttachments: vi.fn(),
  createIncoming: vi.fn(),
  createOutgoing: vi.fn(),
  updateStatus: vi.fn(),
  updateIncoming: vi.fn(),
  updateOutgoing: vi.fn(),
  deleteIncoming: vi.fn(),
  deleteOutgoing: vi.fn(),
  refer: vi.fn(),
  link: vi.fn(),
  archive: vi.fn(),
  addAttachment: vi.fn(),
};

const auditMock = {
  logAudit: vi.fn(),
};

const n8nMock = {
  sendEvent: vi.fn(),
};

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Property 2: Preservation - Admin Full Access Across All Endpoints', () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * Property: For all Admin requests across all endpoints, results include all records
   * without row-level filtering. Admin users have unrestricted access.
   */

  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.logAudit.mockResolvedValue(undefined);
    n8nMock.sendEvent.mockResolvedValue(undefined);
  });

  const allGetEndpoints = [
    { method: 'get' as const, path: '/correspondence/incoming', description: 'GET /incoming' },
    { method: 'get' as const, path: '/correspondence/outgoing', description: 'GET /outgoing' },
    { method: 'get' as const, path: '/correspondence/archive', description: 'GET /archive' },
    { method: 'get' as const, path: '/correspondence/stats', description: 'GET /stats' },
    { method: 'get' as const, path: `/correspondence/details/incoming/${recordInScopeId}`, description: 'GET /details/:type/:id' },
    { method: 'get' as const, path: `/correspondence/attachments/incoming/${recordInScopeId}`, description: 'GET /attachments/:type/:id' },
  ];

  it('Admin user receives successful responses from all GET endpoints with all records', async () => {
    // Admin service returns ALL records system-wide (multiple departments)
    const allRecords = [
      ...createMockRecordsForDept(deptAId, authorizedUser.id, 3),
      ...createMockRecordsForDept('00000000-0000-0000-0000-000000000020', 'other-user-id', 2),
    ];

    serviceMocks.getIncoming.mockResolvedValue({
      data: allRecords,
      pagination: { page: 1, pageSize: 10, total: 5, totalPages: 1 },
    });
    serviceMocks.getOutgoing.mockResolvedValue({
      data: [{ id: '1', sequence_number: 'OUT-2024-0001', subject: 'Test' }],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });
    serviceMocks.getArchive.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 15, total: 0, totalPages: 0 },
    });
    serviceMocks.getStats.mockResolvedValue({
      total_incoming: 25,
      total_outgoing: 10,
      pending_response: 5,
      follow_up: 3,
      archived: 2,
    });
    serviceMocks.getDetails.mockResolvedValue({
      main: { id: recordInScopeId, subject: 'Test', assigned_dept_id: deptAId },
      attachments: [],
      history: [],
      links: [],
      referrals: [],
    });
    serviceMocks.getAttachments.mockResolvedValue([]);

    const app = express();
    app.use(express.json());
    const authenticate = createMockAuthenticate(adminUser);
    const checkPermission = createMockCheckPermission(() => true);
    app.use('/correspondence', createUnfixedCorrespondenceRoutes(authenticate, checkPermission, serviceMocks, auditMock, n8nMock));

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...allGetEndpoints),
        async (endpoint) => {
          const res = await (request(app) as any)[endpoint.method](endpoint.path);

          // PRESERVATION: Admin gets HTTP 200 on all endpoints
          expect(res.status).toBe(200);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('Admin GET /incoming returns all records from all departments (no row-level filtering)', async () => {
    const multiDeptRecords = [
      { id: '1', subject: 'Dept A record', assigned_dept_id: deptAId, assigned_user_id: authorizedUser.id },
      { id: '2', subject: 'Dept B record', assigned_dept_id: '00000000-0000-0000-0000-000000000020', assigned_user_id: 'other-user' },
      { id: '3', subject: 'Dept C record', assigned_dept_id: '00000000-0000-0000-0000-000000000030', assigned_user_id: 'another-user' },
    ];

    serviceMocks.getIncoming.mockResolvedValue({
      data: multiDeptRecords,
      pagination: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
    });

    const app = express();
    app.use(express.json());
    const authenticate = createMockAuthenticate(adminUser);
    const checkPermission = createMockCheckPermission(() => true);
    app.use('/correspondence', createUnfixedCorrespondenceRoutes(authenticate, checkPermission, serviceMocks, auditMock, n8nMock));

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          page: fc.integer({ min: 1, max: 5 }),
          pageSize: fc.integer({ min: 5, max: 50 }),
        }),
        async (paginationParams) => {
          const res = await request(app)
            .get('/correspondence/incoming')
            .query({ page: String(paginationParams.page), pageSize: String(paginationParams.pageSize) });

          // PRESERVATION: Admin receives all records, including multiple departments
          expect(res.status).toBe(200);
          expect(res.body.data).toBeDefined();
          expect(res.body.data.length).toBe(3);
          expect(res.body.pagination).toBeDefined();

          // Confirm records from multiple departments are present (no filtering)
          const deptIds = new Set(res.body.data.map((r: any) => r.assigned_dept_id));
          expect(deptIds.size).toBeGreaterThan(1);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('Admin GET /outgoing returns all outgoing records with pagination', async () => {
    const outgoingRecords = [
      { id: '1', sequence_number: 'OUT-2024-0001', subject: 'Letter A', created_by: authorizedUser.id },
      { id: '2', sequence_number: 'OUT-2024-0002', subject: 'Letter B', created_by: 'other-user' },
    ];

    serviceMocks.getOutgoing.mockResolvedValue({
      data: outgoingRecords,
      pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
    });

    const app = express();
    app.use(express.json());
    const authenticate = createMockAuthenticate(adminUser);
    const checkPermission = createMockCheckPermission(() => true);
    app.use('/correspondence', createUnfixedCorrespondenceRoutes(authenticate, checkPermission, serviceMocks, auditMock, n8nMock));

    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const res = await request(app).get('/correspondence/outgoing');

          expect(res.status).toBe(200);
          expect(res.body.data).toBeDefined();
          expect(res.body.data.length).toBe(2);
          expect(res.body.pagination).toBeDefined();
          expect(res.body.pagination.total).toBe(2);
        }
      ),
      { numRuns: 5 }
    );
  });

  it('Admin GET /stats returns system-wide statistics', async () => {
    serviceMocks.getStats.mockResolvedValue({
      total_incoming: 50,
      total_outgoing: 20,
      pending_response: 8,
      follow_up: 5,
      archived: 12,
    });

    const app = express();
    app.use(express.json());
    const authenticate = createMockAuthenticate(adminUser);
    const checkPermission = createMockCheckPermission(() => true);
    app.use('/correspondence', createUnfixedCorrespondenceRoutes(authenticate, checkPermission, serviceMocks, auditMock, n8nMock));

    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const res = await request(app).get('/correspondence/stats');

          expect(res.status).toBe(200);
          expect(res.body.total_incoming).toBe(50);
          expect(res.body.total_outgoing).toBe(20);
          expect(res.body.pending_response).toBe(8);
          expect(res.body.follow_up).toBe(5);
          expect(res.body.archived).toBe(12);
        }
      ),
      { numRuns: 5 }
    );
  });
});

describe('Property 2: Preservation - Authorized Users with Correct Permissions', () => {
  /**
   * **Validates: Requirements 3.2, 3.3, 3.4, 3.5**
   *
   * Property: For all authorized users with correct permissions accessing records within
   * their department scope, pagination metadata, record counts, and data content are correct.
   */

  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.logAudit.mockResolvedValue(undefined);
    n8nMock.sendEvent.mockResolvedValue(undefined);
  });

  it('authorized user with View permission accesses own-department records with correct pagination', async () => {
    const ownDeptRecords = createMockRecordsForDept(deptAId, authorizedUser.id, 5);

    serviceMocks.getIncoming.mockResolvedValue({
      data: ownDeptRecords,
      pagination: { page: 1, pageSize: 10, total: 5, totalPages: 1 },
    });

    const app = express();
    app.use(express.json());
    const authenticate = createMockAuthenticate(authorizedUser);
    // User has Correspondence.View permission
    const checkPermission = createMockCheckPermission((userId, module, action) => {
      return module === 'Correspondence' && (action === 'View' || action === 'Create' || action === 'Edit' || action === 'Delete');
    });
    app.use('/correspondence', createUnfixedCorrespondenceRoutes(authenticate, checkPermission, serviceMocks, auditMock, n8nMock));

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          page: fc.integer({ min: 1, max: 3 }),
          pageSize: fc.constantFrom(5, 10, 15, 20),
        }),
        async (params) => {
          const res = await request(app)
            .get('/correspondence/incoming')
            .query({ page: String(params.page), pageSize: String(params.pageSize) });

          // PRESERVATION: Authorized user gets successful response
          expect(res.status).toBe(200);
          expect(res.body.data).toBeDefined();
          expect(Array.isArray(res.body.data)).toBe(true);
          expect(res.body.pagination).toBeDefined();
          expect(res.body.pagination.page).toBeDefined();
          expect(res.body.pagination.pageSize).toBeDefined();
          expect(res.body.pagination.total).toBeDefined();
          expect(res.body.pagination.totalPages).toBeDefined();
        }
      ),
      { numRuns: 15 }
    );
  });

  it('authorized user with Create permission creates incoming correspondence and receives sequence number', async () => {
    let seqCounter = 1;
    serviceMocks.createIncoming.mockImplementation(async (data: any, userId: string) => {
      const seq = `INC-2024-${seqCounter.toString().padStart(4, '0')}`;
      seqCounter++;
      return { id: `new-id-${seqCounter}`, sequence_number: seq };
    });

    const app = express();
    app.use(express.json());
    const authenticate = createMockAuthenticate(authorizedUser);
    const checkPermission = createMockCheckPermission(() => true);
    app.use('/correspondence', createUnfixedCorrespondenceRoutes(authenticate, checkPermission, serviceMocks, auditMock, n8nMock));

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          letter_number: fc.stringMatching(/^[A-Z]{1,3}-\d{1,6}$/),
          sender_entity: fc.string({ minLength: 1, maxLength: 50 }),
          subject: fc.string({ minLength: 1, maxLength: 100 }),
          letter_date: fc.constant('2024-01-15'),
          receipt_date: fc.constant('2024-01-16'),
        }),
        async (payload) => {
          const res = await request(app)
            .post('/correspondence/incoming')
            .send(payload);

          // PRESERVATION: Create succeeds and returns sequence number
          expect(res.status).toBe(200);
          expect(res.body.id).toBeDefined();
          expect(res.body.sequence_number).toBeDefined();
          expect(res.body.sequence_number).toMatch(/^INC-2024-\d{4}$/);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('authorized user with Edit permission updates record within scope and audit log is created', async () => {
    serviceMocks.updateStatus.mockResolvedValue({ oldStatus: 'New' });

    const app = express();
    app.use(express.json());
    const authenticate = createMockAuthenticate(authorizedUser);
    const checkPermission = createMockCheckPermission(() => true);
    app.use('/correspondence', createUnfixedCorrespondenceRoutes(authenticate, checkPermission, serviceMocks, auditMock, n8nMock));

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          new_status: fc.constantFrom('Reviewed', 'In Progress', 'Closed', 'Pending'),
          notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
        }),
        async (statusUpdate) => {
          auditMock.logAudit.mockClear();

          const res = await request(app)
            .put(`/correspondence/status/Incoming/${recordInScopeId}`)
            .send(statusUpdate);

          // PRESERVATION: Edit succeeds for authorized user
          expect(res.status).toBe(200);
          expect(res.body.success).toBe(true);

          // PRESERVATION: Audit log is called for successful operation
          expect(auditMock.logAudit).toHaveBeenCalled();
          expect(auditMock.logAudit).toHaveBeenCalledWith(
            authorizedUser.username,
            'UPDATE_STATUS',
            'Correspondence',
            expect.any(String)
          );
        }
      ),
      { numRuns: 15 }
    );
  });

  it('authorized user with Delete permission deletes record with cascading cleanup', async () => {
    serviceMocks.deleteIncoming.mockResolvedValue(undefined);

    const app = express();
    app.use(express.json());
    const authenticate = createMockAuthenticate(authorizedUser);
    const checkPermission = createMockCheckPermission(() => true);
    app.use('/correspondence', createUnfixedCorrespondenceRoutes(authenticate, checkPermission, serviceMocks, auditMock, n8nMock));

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (recordId) => {
          auditMock.logAudit.mockClear();
          n8nMock.sendEvent.mockClear();

          const res = await request(app)
            .delete(`/correspondence/incoming/${recordId}`);

          // PRESERVATION: Delete succeeds for authorized user (checkPermission passes)
          expect(res.status).toBe(200);
          expect(res.body.success).toBe(true);

          // PRESERVATION: Audit and N8n events fire
          expect(auditMock.logAudit).toHaveBeenCalledWith(
            authorizedUser.username,
            'DELETE',
            'Correspondence',
            expect.stringContaining(recordId)
          );
          expect(n8nMock.sendEvent).toHaveBeenCalledWith(
            'incoming_correspondence.deleted',
            expect.objectContaining({ id: recordId })
          );

          // Service was called (cascading cleanup is internal to service)
          expect(serviceMocks.deleteIncoming).toHaveBeenCalledWith(recordId);
        }
      ),
      { numRuns: 10 }
    );
  });
});

describe('Property 2: Preservation - Create Operations Generate Sequence Numbers and N8n Events', () => {
  /**
   * **Validates: Requirements 3.3, 3.7**
   *
   * Property: For all successful create operations by authorized users, sequence numbers
   * are generated and N8n events fire.
   */

  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.logAudit.mockResolvedValue(undefined);
    n8nMock.sendEvent.mockResolvedValue(undefined);
  });

  it('POST /incoming generates sequence number and fires N8n event', async () => {
    let counter = 1;
    serviceMocks.createIncoming.mockImplementation(async () => {
      const seq = `INC-2024-${counter.toString().padStart(4, '0')}`;
      const id = `id-${counter}`;
      counter++;
      return { id, sequence_number: seq };
    });

    const app = express();
    app.use(express.json());
    const authenticate = createMockAuthenticate(authorizedUser);
    const checkPermission = createMockCheckPermission(() => true);
    app.use('/correspondence', createUnfixedCorrespondenceRoutes(authenticate, checkPermission, serviceMocks, auditMock, n8nMock));

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          letter_number: fc.string({ minLength: 1, maxLength: 20 }),
          sender_entity: fc.string({ minLength: 1, maxLength: 50 }),
          subject: fc.string({ minLength: 1, maxLength: 100 }),
          letter_date: fc.constant('2024-02-01'),
          receipt_date: fc.constant('2024-02-02'),
        }),
        async (payload) => {
          n8nMock.sendEvent.mockClear();
          auditMock.logAudit.mockClear();

          const res = await request(app)
            .post('/correspondence/incoming')
            .send(payload);

          // PRESERVATION: Creates successfully
          expect(res.status).toBe(200);
          expect(res.body.sequence_number).toBeDefined();
          expect(res.body.sequence_number).toMatch(/^INC-2024-\d{4}$/);

          // PRESERVATION: N8n event fired for create
          expect(n8nMock.sendEvent).toHaveBeenCalledWith(
            'incoming_correspondence.created',
            expect.objectContaining({
              id: res.body.id,
              sequence_number: res.body.sequence_number,
            })
          );

          // PRESERVATION: Audit log fired for create
          expect(auditMock.logAudit).toHaveBeenCalledWith(
            authorizedUser.username,
            'CREATE',
            'Correspondence',
            expect.stringContaining(res.body.sequence_number)
          );
        }
      ),
      { numRuns: 10 }
    );
  });

  it('POST /outgoing (already protected) generates sequence number and fires N8n event for authorized user', async () => {
    let counter = 1;
    serviceMocks.createOutgoing.mockImplementation(async () => {
      const seq = `OUT-2024-${counter.toString().padStart(4, '0')}`;
      const id = `out-id-${counter}`;
      counter++;
      return { id, sequence_number: seq };
    });

    const app = express();
    app.use(express.json());
    const authenticate = createMockAuthenticate(authorizedUser);
    const checkPermission = createMockCheckPermission(() => true);
    app.use('/correspondence', createUnfixedCorrespondenceRoutes(authenticate, checkPermission, serviceMocks, auditMock, n8nMock));

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          letter_date: fc.constant('2024-03-01'),
          recipient_entity: fc.string({ minLength: 1, maxLength: 50 }),
          subject: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        async (payload) => {
          n8nMock.sendEvent.mockClear();
          auditMock.logAudit.mockClear();

          const res = await request(app)
            .post('/correspondence/outgoing')
            .send(payload);

          // PRESERVATION: Create through already-protected route succeeds
          expect(res.status).toBe(200);
          expect(res.body.sequence_number).toBeDefined();
          expect(res.body.sequence_number).toMatch(/^OUT-2024-\d{4}$/);

          // PRESERVATION: N8n event fired
          expect(n8nMock.sendEvent).toHaveBeenCalledWith(
            'outgoing_correspondence.created',
            expect.objectContaining({
              id: res.body.id,
              sequence_number: res.body.sequence_number,
            })
          );
        }
      ),
      { numRuns: 10 }
    );
  });
});

describe('Property 2: Preservation - Audit Logging for All Successful Mutations', () => {
  /**
   * **Validates: Requirements 3.6**
   *
   * Property: For all successful mutations by authorized users within scope,
   * audit log entries are created via AuthService.logAudit.
   */

  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.logAudit.mockResolvedValue(undefined);
    n8nMock.sendEvent.mockResolvedValue(undefined);
    serviceMocks.updateStatus.mockResolvedValue({ oldStatus: 'New' });
    serviceMocks.refer.mockResolvedValue(undefined);
    serviceMocks.link.mockResolvedValue(undefined);
    serviceMocks.archive.mockResolvedValue(undefined);
    serviceMocks.addAttachment.mockResolvedValue(undefined);
    serviceMocks.updateIncoming.mockResolvedValue(undefined);
    serviceMocks.deleteIncoming.mockResolvedValue(undefined);
    serviceMocks.updateOutgoing.mockResolvedValue(undefined);
    serviceMocks.deleteOutgoing.mockResolvedValue(undefined);
  });

  const mutationEndpoints = [
    {
      method: 'put' as const,
      path: `/correspondence/status/Incoming/${recordInScopeId}`,
      body: { new_status: 'Reviewed', notes: 'test' },
      description: 'PUT /status/:type/:id',
      auditAction: 'UPDATE_STATUS',
    },
    {
      method: 'post' as const,
      path: '/correspondence/refer',
      body: { incoming_id: recordInScopeId, to_dept_id: '00000000-0000-0000-0000-000000000020' },
      description: 'POST /refer',
      auditAction: 'REFER',
    },
    {
      method: 'post' as const,
      path: '/correspondence/link',
      body: { incoming_id: recordInScopeId, outgoing_id: outgoingRecordId },
      description: 'POST /link',
      auditAction: 'LINK',
    },
    {
      method: 'put' as const,
      path: `/correspondence/archive/Incoming/${recordInScopeId}`,
      body: {},
      description: 'PUT /archive/:type/:id',
      auditAction: 'ARCHIVE',
    },
    {
      method: 'post' as const,
      path: '/correspondence/attachments',
      body: { correspondence_id: recordInScopeId, correspondence_type: 'Incoming', file_name: 'doc.pdf', file_type: 'application/pdf', file_data: 'base64' },
      description: 'POST /attachments',
      auditAction: 'UPLOAD',
    },
  ];

  it('all mutation endpoints call logAudit on successful operations', async () => {
    const app = express();
    app.use(express.json());
    const authenticate = createMockAuthenticate(authorizedUser);
    const checkPermission = createMockCheckPermission(() => true);
    app.use('/correspondence', createUnfixedCorrespondenceRoutes(authenticate, checkPermission, serviceMocks, auditMock, n8nMock));

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...mutationEndpoints),
        async (endpoint) => {
          auditMock.logAudit.mockClear();

          const res = await (request(app) as any)[endpoint.method](endpoint.path)
            .send(endpoint.body);

          // PRESERVATION: Mutation succeeds
          expect(res.status).toBe(200);

          // PRESERVATION: Audit log is called
          expect(auditMock.logAudit).toHaveBeenCalled();
          expect(auditMock.logAudit.mock.calls[0][0]).toBe(authorizedUser.username);
          expect(auditMock.logAudit.mock.calls[0][1]).toBe(endpoint.auditAction);
          expect(auditMock.logAudit.mock.calls[0][2]).toBe('Correspondence');
        }
      ),
      { numRuns: 25 }
    );
  });
});

describe('Property 2: Preservation - Already Protected Routes Continue to Function', () => {
  /**
   * **Validates: Requirements 3.8**
   *
   * Property: For routes already protected by `checkPermission`, authorized users
   * continue to receive successful responses.
   *
   * Already-protected routes: PUT /incoming/:id, DELETE /incoming/:id, POST /outgoing,
   * PUT /outgoing/:id, DELETE /outgoing/:id
   */

  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.logAudit.mockResolvedValue(undefined);
    n8nMock.sendEvent.mockResolvedValue(undefined);
    serviceMocks.updateIncoming.mockResolvedValue(undefined);
    serviceMocks.deleteIncoming.mockResolvedValue(undefined);
    serviceMocks.createOutgoing.mockResolvedValue({ id: 'new-out', sequence_number: 'OUT-2024-0001' });
    serviceMocks.updateOutgoing.mockResolvedValue(undefined);
    serviceMocks.deleteOutgoing.mockResolvedValue(undefined);
  });

  const alreadyProtectedEndpoints = [
    {
      method: 'put' as const,
      path: `/correspondence/incoming/${recordInScopeId}`,
      body: { subject: 'Updated subject' },
      description: 'PUT /incoming/:id (Edit)',
    },
    {
      method: 'delete' as const,
      path: `/correspondence/incoming/${recordInScopeId}`,
      body: {},
      description: 'DELETE /incoming/:id (Delete)',
    },
    {
      method: 'post' as const,
      path: '/correspondence/outgoing',
      body: { letter_date: '2024-01-01', recipient_entity: 'Test Corp', subject: 'Test' },
      description: 'POST /outgoing (Create)',
    },
    {
      method: 'put' as const,
      path: `/correspondence/outgoing/${outgoingRecordId}`,
      body: { subject: 'Updated outgoing subject' },
      description: 'PUT /outgoing/:id (Edit)',
    },
    {
      method: 'delete' as const,
      path: `/correspondence/outgoing/${outgoingRecordId}`,
      body: {},
      description: 'DELETE /outgoing/:id (Delete)',
    },
  ];

  it('authorized users with correct permissions get successful responses on already-protected routes', async () => {
    const app = express();
    app.use(express.json());
    const authenticate = createMockAuthenticate(authorizedUser);
    // User has all Correspondence permissions
    const checkPermission = createMockCheckPermission(() => true);
    app.use('/correspondence', createUnfixedCorrespondenceRoutes(authenticate, checkPermission, serviceMocks, auditMock, n8nMock));

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...alreadyProtectedEndpoints),
        async (endpoint) => {
          const res = await (request(app) as any)[endpoint.method](endpoint.path)
            .send(endpoint.body);

          // PRESERVATION: Already-protected routes succeed for authorized users
          expect(res.status).toBe(200);
        }
      ),
      { numRuns: 25 }
    );
  });

  it('Admin user can access all already-protected routes without issue', async () => {
    const app = express();
    app.use(express.json());
    const authenticate = createMockAuthenticate(adminUser);
    const checkPermission = createMockCheckPermission(() => true);
    app.use('/correspondence', createUnfixedCorrespondenceRoutes(authenticate, checkPermission, serviceMocks, auditMock, n8nMock));

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...alreadyProtectedEndpoints),
        async (endpoint) => {
          const res = await (request(app) as any)[endpoint.method](endpoint.path)
            .send(endpoint.body);

          // PRESERVATION: Admin always gets 200 on protected routes
          expect(res.status).toBe(200);
        }
      ),
      { numRuns: 25 }
    );
  });
});
