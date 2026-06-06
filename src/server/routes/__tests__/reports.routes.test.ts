// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp, createMockDb, createAuthenticatedRequest } from '../../../test/helpers/server';
import { createReportRoutes } from '../reports.routes';

describe('Reports Routes', () => {
  let app: ReturnType<typeof createTestApp>['app'];
  let authenticate: ReturnType<typeof createTestApp>['authenticate'];
  let mockDb: ReturnType<typeof createMockDb>;
  let mockQueueService: any;
  let mockStorageService: any;
  let authRequest: ReturnType<typeof createAuthenticatedRequest>;

  beforeEach(() => {
    const testApp = createTestApp();
    app = testApp.app;
    authenticate = testApp.authenticate;

    mockDb = createMockDb();

    mockQueueService = {
      enqueue: vi.fn().mockResolvedValue({
        jobId: 'job-123',
        queue: 'generate-pdf',
        estimatedWaitMs: 5000,
      }),
    };

    mockStorageService = {
      getPresignedUrl: vi.fn().mockResolvedValue('https://minio.local/reports/test.pdf?signed=true'),
    };

    const router = createReportRoutes(mockDb, authenticate, mockQueueService, mockStorageService);
    app.use('/api/reports', router);

    authRequest = createAuthenticatedRequest(app);
  });

  describe('POST /api/reports/generate', () => {
    it('should return 202 with jobId and reportId when valid auditId is provided', async () => {
      const response = await authRequest
        .post('/api/reports/generate')
        .send({ auditId: 'audit-456' });

      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('jobId', 'job-123');
      expect(response.body).toHaveProperty('reportId');
      expect(response.body.reportId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should enqueue a generate-pdf job with correct data', async () => {
      await authRequest
        .post('/api/reports/generate')
        .send({ auditId: 'audit-456', template: 'detailed' });

      expect(mockQueueService.enqueue).toHaveBeenCalledWith(
        'generate-pdf',
        expect.objectContaining({
          auditId: 'audit-456',
          template: 'detailed',
          reportId: expect.any(String),
        }),
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        }),
      );
    });

    it('should use "default" template when none is specified', async () => {
      await authRequest
        .post('/api/reports/generate')
        .send({ auditId: 'audit-456' });

      expect(mockQueueService.enqueue).toHaveBeenCalledWith(
        'generate-pdf',
        expect.objectContaining({
          template: 'default',
        }),
        expect.any(Object),
      );
    });

    it('should create a report record in the database', async () => {
      await authRequest
        .post('/api/reports/generate')
        .send({ auditId: 'audit-456', template: 'summary' });

      expect(mockDb.prepare).toHaveBeenCalled();
      expect(mockDb.mockRun).toHaveBeenCalledWith(
        expect.any(String), // reportId (UUID)
        'audit-456',
        'Generated Report - summary',
        'pending',
      );
    });

    it('should return 400 when auditId is missing', async () => {
      const response = await authRequest
        .post('/api/reports/generate')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'auditId is required');
    });

    it('should return 401 when not authenticated', async () => {
      const { default: request } = await import('supertest');
      const response = await request(app)
        .post('/api/reports/generate')
        .send({ auditId: 'audit-456' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/reports/:id/download', () => {
    it('should redirect 302 to presigned URL when report is ready', async () => {
      mockDb.mockGet.mockResolvedValue({
        id: 'report-789',
        audit_id: 'audit-456',
        status: 'ready',
        content: 'audits/audit-456/reports/report-789.pdf',
      });

      const response = await authRequest.get('/api/reports/report-789/download');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('https://minio.local/reports/test.pdf?signed=true');
    });

    it('should call getPresignedUrl with the correct storage key', async () => {
      const storageKey = 'audits/audit-456/reports/report-789.pdf';
      mockDb.mockGet.mockResolvedValue({
        id: 'report-789',
        audit_id: 'audit-456',
        status: 'ready',
        content: storageKey,
      });

      await authRequest.get('/api/reports/report-789/download');

      expect(mockStorageService.getPresignedUrl).toHaveBeenCalledWith(
        storageKey,
        'reports',
        3600,
      );
    });

    it('should return 404 when report is not found', async () => {
      mockDb.mockGet.mockResolvedValue(null);

      const response = await authRequest.get('/api/reports/nonexistent/download');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Report not found');
    });

    it('should return 404 when report status is not ready', async () => {
      mockDb.mockGet.mockResolvedValue({
        id: 'report-789',
        audit_id: 'audit-456',
        status: 'pending',
        content: null,
      });

      const response = await authRequest.get('/api/reports/report-789/download');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Report is not available for download');
      expect(response.body).toHaveProperty('status', 'pending');
    });

    it('should return 404 when report is ready but has no storage key', async () => {
      mockDb.mockGet.mockResolvedValue({
        id: 'report-789',
        audit_id: 'audit-456',
        status: 'ready',
        content: null,
      });

      const response = await authRequest.get('/api/reports/report-789/download');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Report file not found in storage');
    });

    it('should return 401 when not authenticated', async () => {
      const { default: request } = await import('supertest');
      const response = await request(app).get('/api/reports/report-789/download');

      expect(response.status).toBe(401);
    });
  });
});
