// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createJobRoutes } from '../jobs.routes';
import { type QueueService, type JobStatus } from '../../services/queue.service';

/**
 * Unit Tests - Job Status Endpoint (Task 9.4)
 *
 * Tests the GET /jobs/:jobId/status endpoint that:
 * - Returns job state, progress, timestamps, result/error
 * - Returns 404 if job not found
 *
 * Validates: Requirements 5.1, 5.2, 5.4, 5.5
 */

// Mock authenticate middleware - passes through
const mockAuthenticate = (req: any, res: any, next: any) => {
  req.user = { id: 'test-user-id' };
  next();
};

function createMockQueueService(overrides: Partial<QueueService> = {}): QueueService {
  return {
    getJobStatus: vi.fn().mockResolvedValue(null),
    enqueue: vi.fn(),
    cancelJob: vi.fn(),
    getQueueHealth: vi.fn(),
    getRedisOptions: vi.fn(),
    getQueue: vi.fn(),
    scheduleRepeatableJobs: vi.fn(),
    close: vi.fn(),
    ...overrides,
  } as unknown as QueueService;
}

function createTestApp(queueService: QueueService) {
  const app = express();
  app.use(express.json());
  app.use('/jobs', createJobRoutes(mockAuthenticate, queueService));
  return app;
}

describe('Job Status Endpoint (Task 9.4)', () => {
  let mockQueueService: QueueService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueueService = createMockQueueService();
  });

  describe('GET /jobs/:jobId/status', () => {
    it('should return 404 when job is not found', async () => {
      (mockQueueService.getJobStatus as any).mockResolvedValue(null);

      const app = createTestApp(mockQueueService);
      const res = await request(app).get('/jobs/non-existent-job/status');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Job not found' });
    });

    it('should return 200 with job status when job exists (completed)', async () => {
      const completedJob: JobStatus = {
        id: 'job-123',
        state: 'completed',
        progress: 100,
        result: { fileId: 'file-abc' },
        failedReason: undefined,
        createdAt: new Date('2024-01-01T10:00:00Z'),
        processedAt: new Date('2024-01-01T10:00:05Z'),
        completedAt: new Date('2024-01-01T10:00:15Z'),
        attemptsMade: 1,
      };
      (mockQueueService.getJobStatus as any).mockResolvedValue(completedJob);

      const app = createTestApp(mockQueueService);
      const res = await request(app).get('/jobs/job-123/status');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('job-123');
      expect(res.body.state).toBe('completed');
      expect(res.body.progress).toBe(100);
      expect(res.body.result).toEqual({ fileId: 'file-abc' });
      expect(res.body.failedReason).toBeUndefined();
      expect(res.body.createdAt).toBe('2024-01-01T10:00:00.000Z');
      expect(res.body.processedAt).toBe('2024-01-01T10:00:05.000Z');
      expect(res.body.completedAt).toBe('2024-01-01T10:00:15.000Z');
      expect(res.body.attemptsMade).toBe(1);
    });

    it('should return 200 with failed job status including failedReason and attemptsMade', async () => {
      const failedJob: JobStatus = {
        id: 'job-456',
        state: 'failed',
        progress: 50,
        result: undefined,
        failedReason: 'Checksum mismatch after copy',
        createdAt: new Date('2024-01-01T10:00:00Z'),
        processedAt: new Date('2024-01-01T10:00:05Z'),
        completedAt: new Date('2024-01-01T10:01:00Z'),
        attemptsMade: 3,
      };
      (mockQueueService.getJobStatus as any).mockResolvedValue(failedJob);

      const app = createTestApp(mockQueueService);
      const res = await request(app).get('/jobs/job-456/status');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('job-456');
      expect(res.body.state).toBe('failed');
      expect(res.body.progress).toBe(50);
      expect(res.body.failedReason).toBe('Checksum mismatch after copy');
      expect(res.body.attemptsMade).toBe(3);
    });

    it('should return 200 with waiting job status (no processedAt or completedAt)', async () => {
      const waitingJob: JobStatus = {
        id: 'job-789',
        state: 'waiting',
        progress: 0,
        result: undefined,
        failedReason: undefined,
        createdAt: new Date('2024-01-01T10:00:00Z'),
        processedAt: undefined,
        completedAt: undefined,
        attemptsMade: 0,
      };
      (mockQueueService.getJobStatus as any).mockResolvedValue(waitingJob);

      const app = createTestApp(mockQueueService);
      const res = await request(app).get('/jobs/job-789/status');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('job-789');
      expect(res.body.state).toBe('waiting');
      expect(res.body.progress).toBe(0);
      expect(res.body.processedAt).toBeUndefined();
      expect(res.body.completedAt).toBeUndefined();
      expect(res.body.attemptsMade).toBe(0);
    });

    it('should return 200 with active job status showing progress', async () => {
      const activeJob: JobStatus = {
        id: 'job-active',
        state: 'active',
        progress: 70,
        result: undefined,
        failedReason: undefined,
        createdAt: new Date('2024-01-01T10:00:00Z'),
        processedAt: new Date('2024-01-01T10:00:05Z'),
        completedAt: undefined,
        attemptsMade: 1,
      };
      (mockQueueService.getJobStatus as any).mockResolvedValue(activeJob);

      const app = createTestApp(mockQueueService);
      const res = await request(app).get('/jobs/job-active/status');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('job-active');
      expect(res.body.state).toBe('active');
      expect(res.body.progress).toBe(70);
      expect(res.body.processedAt).toBe('2024-01-01T10:00:05.000Z');
      expect(res.body.completedAt).toBeUndefined();
    });

    it('should return 200 with delayed job status', async () => {
      const delayedJob: JobStatus = {
        id: 'job-delayed',
        state: 'delayed',
        progress: 0,
        result: undefined,
        failedReason: undefined,
        createdAt: new Date('2024-01-01T10:00:00Z'),
        processedAt: undefined,
        completedAt: undefined,
        attemptsMade: 0,
      };
      (mockQueueService.getJobStatus as any).mockResolvedValue(delayedJob);

      const app = createTestApp(mockQueueService);
      const res = await request(app).get('/jobs/job-delayed/status');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('job-delayed');
      expect(res.body.state).toBe('delayed');
    });

    it('should call getJobStatus with the jobId from the URL parameter', async () => {
      (mockQueueService.getJobStatus as any).mockResolvedValue(null);

      const app = createTestApp(mockQueueService);
      await request(app).get('/jobs/my-specific-job-id/status');

      expect(mockQueueService.getJobStatus).toHaveBeenCalledWith('my-specific-job-id');
    });

    it('should require authentication', async () => {
      const authRejectMiddleware = (req: any, res: any, next: any) => {
        return res.status(401).json({ error: 'Unauthorized' });
      };

      const app = express();
      app.use(express.json());
      app.use('/jobs', createJobRoutes(authRejectMiddleware, mockQueueService));

      const res = await request(app).get('/jobs/job-123/status');

      expect(res.status).toBe(401);
      expect(mockQueueService.getJobStatus).not.toHaveBeenCalled();
    });
  });
});
