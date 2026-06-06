// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mockQueueAdd = vi.hoisted(() => vi.fn());
const mockQueueGetJob = vi.hoisted(() => vi.fn());
const mockQueueGetWaitingCount = vi.hoisted(() => vi.fn());
const mockQueueGetJobCounts = vi.hoisted(() => vi.fn());
const mockQueueGetWorkers = vi.hoisted(() => vi.fn());
const mockQueueClose = vi.hoisted(() => vi.fn());
const mockQueueEventsClose = vi.hoisted(() => vi.fn());
const mockQueueUpsertJobScheduler = vi.hoisted(() => vi.fn());

// ─── Mock bullmq ─────────────────────────────────────────────────────────────

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    name: string;
    add = mockQueueAdd;
    getJob = mockQueueGetJob;
    getWaitingCount = mockQueueGetWaitingCount;
    getJobCounts = mockQueueGetJobCounts;
    getWorkers = mockQueueGetWorkers;
    close = mockQueueClose;
    upsertJobScheduler = mockQueueUpsertJobScheduler;
    constructor(name: string, _opts?: any) {
      this.name = name;
    }
  },
  QueueEvents: class MockQueueEvents {
    close = mockQueueEventsClose;
    constructor(_name: string, _opts?: any) {}
  },
}));

// ─── Mock ioredis ────────────────────────────────────────────────────────────

const mockRedisQuit = vi.hoisted(() => vi.fn().mockResolvedValue('OK'));
const mockRedisDuplicate = vi.hoisted(() => vi.fn());
const mockRedisOn = vi.hoisted(() => vi.fn());

vi.mock('ioredis', () => {
  const MockRedis = class {
    status = 'ready';
    quit = mockRedisQuit;
    duplicate = mockRedisDuplicate;
    on = mockRedisOn;
    constructor(_opts?: any) {
      mockRedisDuplicate.mockReturnThis();
    }
  };
  return { default: MockRedis };
});

// ─── Mock logger ─────────────────────────────────────────────────────────────

vi.mock('../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Mock configs ────────────────────────────────────────────────────────────

vi.mock('../../config/redis.config.js', () => ({
  getRedisConfig: () => ({
    host: 'localhost',
    port: 6379,
    password: undefined,
    db: 0,
    useTLS: false,
    maxRetriesPerRequest: null,
    connectTimeoutMs: 5000,
    enableReadyCheck: true,
  }),
}));

vi.mock('../../config/queue.config.js', () => ({
  getQueueConfig: () => ({
    concurrency: 3,
    maxAttempts: 3,
    backoffBaseMs: 2000,
    backoffType: 'exponential',
    shutdownTimeoutMs: 30000,
    cleanupIntervalMinutes: 60,
    tempFileMaxAgeHours: 24,
    removeOnComplete: 1000,
    removeOnFail: 5000,
    stalledIntervalMs: 30000,
    maxStalledCount: 1,
  }),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { QueueService, type JobType } from '../queue.service.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('QueueService', () => {
  let service: QueueService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisDuplicate.mockReturnValue({
      status: 'ready',
      on: vi.fn(),
      quit: vi.fn(),
      duplicate: vi.fn().mockReturnThis(),
    });
    service = new QueueService();
  });

  afterEach(async () => {
    mockQueueClose.mockResolvedValue(undefined);
    mockQueueEventsClose.mockResolvedValue(undefined);
    await service.close();
  });

  describe('enqueue()', () => {
    it('should enqueue a process-file job and return a JobReference', async () => {
      const mockJob = { id: 'job-123' };
      mockQueueAdd.mockResolvedValue(mockJob);
      mockQueueGetWaitingCount.mockResolvedValue(2);

      const result = await service.enqueue('process-file', {
        tempKey: 'pending/test-key',
        targetBucket: 'evidence',
        metadata: {
          fileId: 'file-1',
          storageKey: 'audit/1/20240101T120000-uuid.pdf',
          checksum: 'a'.repeat(64),
          contentType: 'application/pdf',
        },
      });

      expect(result).toEqual({
        jobId: 'job-123',
        queue: 'process-file',
        estimatedWaitMs: 10000, // 2 waiting * 5000
      });
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'process-file',
        expect.objectContaining({ tempKey: 'pending/test-key' }),
        expect.objectContaining({ attempts: 3 }),
      );
    });

    it('should enqueue a generate-pdf job', async () => {
      mockQueueAdd.mockResolvedValue({ id: 'job-456' });
      mockQueueGetWaitingCount.mockResolvedValue(0);

      const result = await service.enqueue('generate-pdf', {
        reportId: 'report-1',
        auditId: 'audit-1',
        template: 'standard',
      });

      expect(result.jobId).toBe('job-456');
      expect(result.queue).toBe('generate-pdf');
      expect(result.estimatedWaitMs).toBe(0);
    });

    it('should enqueue a send-notification job', async () => {
      mockQueueAdd.mockResolvedValue({ id: 'job-789' });
      mockQueueGetWaitingCount.mockResolvedValue(1);

      const result = await service.enqueue('send-notification', {
        userId: 'user-1',
        type: 'upload-complete',
        payload: { fileId: 'file-1' },
      });

      expect(result.jobId).toBe('job-789');
      expect(result.queue).toBe('send-notification');
    });

    it('should enqueue a cleanup-temp job', async () => {
      mockQueueAdd.mockResolvedValue({ id: 'job-cleanup' });
      mockQueueGetWaitingCount.mockResolvedValue(0);

      const result = await service.enqueue('cleanup-temp', {
        olderThanMs: 86400000,
      });

      expect(result.jobId).toBe('job-cleanup');
      expect(result.queue).toBe('cleanup-temp');
    });

    it('should apply custom job options', async () => {
      mockQueueAdd.mockResolvedValue({ id: 'job-custom' });
      mockQueueGetWaitingCount.mockResolvedValue(0);

      await service.enqueue(
        'process-file',
        {
          tempKey: 'pending/test',
          targetBucket: 'evidence',
          metadata: {
            fileId: 'f1',
            storageKey: 'key',
            checksum: 'a'.repeat(64),
            contentType: 'application/pdf',
          },
        },
        {
          attempts: 5,
          priority: 1,
          delay: 1000,
          backoff: { type: 'fixed', delay: 5000 },
        },
      );

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'process-file',
        expect.any(Object),
        expect.objectContaining({
          attempts: 5,
          priority: 1,
          delay: 1000,
          backoff: { type: 'fixed', delay: 5000 },
        }),
      );
    });
  });

  describe('getJobStatus()', () => {
    it('should return job status when job is found', async () => {
      const now = Date.now();
      const mockJob = {
        id: 'job-123',
        progress: 50,
        returnvalue: { result: 'done' },
        failedReason: null,
        timestamp: now,
        processedOn: now + 1000,
        finishedOn: null,
        attemptsMade: 1,
        getState: vi.fn().mockResolvedValue('active'),
      };
      mockQueueGetJob.mockResolvedValue(mockJob);

      const status = await service.getJobStatus('job-123');

      expect(status).not.toBeNull();
      expect(status!.id).toBe('job-123');
      expect(status!.state).toBe('active');
      expect(status!.progress).toBe(50);
      expect(status!.result).toEqual({ result: 'done' });
      expect(status!.attemptsMade).toBe(1);
      expect(status!.processedAt).toBeInstanceOf(Date);
      expect(status!.completedAt).toBeUndefined();
    });

    it('should return null when job is not found', async () => {
      mockQueueGetJob.mockResolvedValue(null);

      const status = await service.getJobStatus('nonexistent');

      expect(status).toBeNull();
    });

    it('should map completed state correctly', async () => {
      const now = Date.now();
      const mockJob = {
        id: 'job-done',
        progress: 100,
        returnvalue: { fileId: 'abc' },
        failedReason: null,
        timestamp: now,
        processedOn: now + 500,
        finishedOn: now + 3000,
        attemptsMade: 1,
        getState: vi.fn().mockResolvedValue('completed'),
      };
      mockQueueGetJob.mockResolvedValue(mockJob);

      const status = await service.getJobStatus('job-done');

      expect(status!.state).toBe('completed');
      expect(status!.completedAt).toBeInstanceOf(Date);
      expect(status!.progress).toBe(100);
    });

    it('should map failed state with failedReason', async () => {
      const now = Date.now();
      const mockJob = {
        id: 'job-fail',
        progress: 30,
        returnvalue: null,
        failedReason: 'Checksum mismatch',
        timestamp: now,
        processedOn: now + 200,
        finishedOn: now + 1000,
        attemptsMade: 3,
        getState: vi.fn().mockResolvedValue('failed'),
      };
      mockQueueGetJob.mockResolvedValue(mockJob);

      const status = await service.getJobStatus('job-fail');

      expect(status!.state).toBe('failed');
      expect(status!.failedReason).toBe('Checksum mismatch');
      expect(status!.attemptsMade).toBe(3);
    });
  });

  describe('cancelJob()', () => {
    it('should cancel a waiting job', async () => {
      const mockJob = {
        id: 'job-cancel',
        getState: vi.fn().mockResolvedValue('waiting'),
        remove: vi.fn().mockResolvedValue(undefined),
        moveToFailed: vi.fn(),
      };
      mockQueueGetJob.mockResolvedValue(mockJob);

      const result = await service.cancelJob('job-cancel');

      expect(result).toBe(true);
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('should cancel a delayed job', async () => {
      const mockJob = {
        id: 'job-delayed',
        getState: vi.fn().mockResolvedValue('delayed'),
        remove: vi.fn().mockResolvedValue(undefined),
        moveToFailed: vi.fn(),
      };
      mockQueueGetJob.mockResolvedValue(mockJob);

      const result = await service.cancelJob('job-delayed');

      expect(result).toBe(true);
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('should cancel an active job by moving to failed', async () => {
      const mockJob = {
        id: 'job-active',
        getState: vi.fn().mockResolvedValue('active'),
        remove: vi.fn(),
        moveToFailed: vi.fn().mockResolvedValue(undefined),
      };
      mockQueueGetJob.mockResolvedValue(mockJob);

      const result = await service.cancelJob('job-active');

      expect(result).toBe(true);
      expect(mockJob.moveToFailed).toHaveBeenCalled();
    });

    it('should return false for already completed jobs', async () => {
      const mockJob = {
        id: 'job-completed',
        getState: vi.fn().mockResolvedValue('completed'),
        remove: vi.fn(),
        moveToFailed: vi.fn(),
      };
      mockQueueGetJob.mockResolvedValue(mockJob);

      const result = await service.cancelJob('job-completed');

      expect(result).toBe(false);
    });

    it('should return false when job is not found', async () => {
      mockQueueGetJob.mockResolvedValue(null);

      const result = await service.cancelJob('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getQueueHealth()', () => {
    it('should return aggregated health metrics from all queues', async () => {
      mockQueueGetJobCounts.mockResolvedValue({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
      });
      mockQueueGetWorkers.mockResolvedValue([{ id: 'w1' }]);

      const health = await service.getQueueHealth();

      // 4 queues, each with the same mock counts
      expect(health.connected).toBe(true);
      expect(health.waiting).toBe(20);    // 5 * 4 queues
      expect(health.active).toBe(8);      // 2 * 4 queues
      expect(health.completed).toBe(400); // 100 * 4 queues
      expect(health.failed).toBe(12);     // 3 * 4 queues
      expect(health.delayed).toBe(4);     // 1 * 4 queues
      expect(health.workers).toBe(4);     // 1 * 4 queues
    });

    it('should handle errors gracefully and continue', async () => {
      mockQueueGetJobCounts.mockRejectedValue(new Error('Connection lost'));
      mockQueueGetWorkers.mockResolvedValue([]);

      const health = await service.getQueueHealth();

      // Errors are caught, defaults remain 0
      expect(health.connected).toBe(true); // Redis mock status is 'ready'
      expect(health.waiting).toBe(0);
      expect(health.active).toBe(0);
    });
  });

  describe('scheduleRepeatableJobs()', () => {
    it('should schedule cleanup-temp as a repeatable job with configured interval', async () => {
      mockQueueUpsertJobScheduler.mockResolvedValue(undefined);

      await service.scheduleRepeatableJobs();

      expect(mockQueueUpsertJobScheduler).toHaveBeenCalledWith(
        'cleanup-temp-scheduler',
        { every: 60 * 60 * 1000 }, // 60 minutes in ms
        expect.objectContaining({
          name: 'cleanup-temp',
          data: { olderThanMs: 24 * 60 * 60 * 1000 }, // 24 hours in ms
          opts: expect.objectContaining({
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          }),
        }),
      );
    });

    it('should use custom interval from queue config', async () => {
      mockQueueUpsertJobScheduler.mockResolvedValue(undefined);
      mockQueueClose.mockResolvedValue(undefined);
      mockQueueEventsClose.mockResolvedValue(undefined);

      // Create service with custom config
      const customService = new QueueService(
        undefined,
        {
          concurrency: 3,
          maxAttempts: 3,
          backoffBaseMs: 2000,
          backoffType: 'exponential',
          shutdownTimeoutMs: 30000,
          cleanupIntervalMinutes: 15,
          tempFileMaxAgeHours: 48,
          removeOnComplete: 1000,
          removeOnFail: 5000,
          stalledIntervalMs: 30000,
          maxStalledCount: 1,
        },
      );

      await customService.scheduleRepeatableJobs();

      expect(mockQueueUpsertJobScheduler).toHaveBeenCalledWith(
        'cleanup-temp-scheduler',
        { every: 15 * 60 * 1000 }, // 15 minutes in ms
        expect.objectContaining({
          data: { olderThanMs: 48 * 60 * 60 * 1000 }, // 48 hours in ms
        }),
      );

      await customService.close();
    });
  });

  describe('close()', () => {
    it('should close all queues and Redis connection', async () => {
      mockQueueClose.mockResolvedValue(undefined);
      mockQueueEventsClose.mockResolvedValue(undefined);
      mockRedisQuit.mockResolvedValue('OK');

      await service.close();

      // QueueEvents closed (4 queues)
      expect(mockQueueEventsClose).toHaveBeenCalledTimes(4);
      // Queues closed (4 queues)
      expect(mockQueueClose).toHaveBeenCalledTimes(4);
      // Redis quit
      expect(mockRedisQuit).toHaveBeenCalled();
    });

    it('should not close twice (idempotent)', async () => {
      mockQueueClose.mockResolvedValue(undefined);
      mockQueueEventsClose.mockResolvedValue(undefined);

      await service.close();
      await service.close();

      // Only 4 QueueEvents + 4 Queues from first call
      expect(mockQueueEventsClose).toHaveBeenCalledTimes(4);
      expect(mockQueueClose).toHaveBeenCalledTimes(4);
    });
  });

  describe('getRedisOptions()', () => {
    it('should return Redis connection options', () => {
      const options = service.getRedisOptions();

      expect(options.host).toBe('localhost');
      expect(options.port).toBe(6379);
      expect(options.maxRetriesPerRequest).toBeNull();
      expect(options.connectTimeout).toBe(5000);
      expect(options.enableReadyCheck).toBe(true);
      expect(options.retryStrategy).toBeDefined();
    });

    it('should have exponential backoff retry strategy', () => {
      const options = service.getRedisOptions();

      // Verify exponential backoff: min(1000 * 2^(n-1), 30000)
      expect(options.retryStrategy!(1)).toBe(1000);
      expect(options.retryStrategy!(2)).toBe(2000);
      expect(options.retryStrategy!(3)).toBe(4000);
      expect(options.retryStrategy!(4)).toBe(8000);
      expect(options.retryStrategy!(5)).toBe(16000);
      expect(options.retryStrategy!(6)).toBe(30000); // capped at 30s
      expect(options.retryStrategy!(10)).toBe(30000); // still capped
    });
  });

  describe('TLS configuration', () => {
    it('should apply TLS config from CertificateManager when TLS is enabled', () => {
      const mockCertManager = {
        getRedisSSLConfig: vi.fn().mockReturnValue({
          tls: {
            rejectUnauthorized: true,
            ca: Buffer.from('ca-cert'),
            cert: Buffer.from('client-cert'),
            key: Buffer.from('client-key'),
          },
        }),
        getPostgresSSLConfig: vi.fn(),
        getMinioSSLConfig: vi.fn(),
        reloadCertificates: vi.fn(),
      } as any;

      const redisConfig = {
        host: 'redis.example.com',
        port: 6380,
        password: 'secret',
        db: 0,
        useTLS: true,
        maxRetriesPerRequest: null,
        connectTimeoutMs: 5000,
        enableReadyCheck: true,
      };

      const tlsService = new QueueService(redisConfig, undefined, mockCertManager);
      const options = tlsService.getRedisOptions();

      expect(options.tls).toBeDefined();
      expect(options.tls!.rejectUnauthorized).toBe(true);
      expect(mockCertManager.getRedisSSLConfig).toHaveBeenCalled();

      // Clean up
      mockQueueClose.mockResolvedValue(undefined);
      mockQueueEventsClose.mockResolvedValue(undefined);
      tlsService.close();
    });

    it('should use system CA when TLS enabled but no CertificateManager', () => {
      const redisConfig = {
        host: 'redis.example.com',
        port: 6380,
        password: 'secret',
        db: 0,
        useTLS: true,
        maxRetriesPerRequest: null,
        connectTimeoutMs: 5000,
        enableReadyCheck: true,
      };

      const tlsService = new QueueService(redisConfig, undefined, undefined);
      const options = tlsService.getRedisOptions();

      expect(options.tls).toEqual({ rejectUnauthorized: true });

      mockQueueClose.mockResolvedValue(undefined);
      mockQueueEventsClose.mockResolvedValue(undefined);
      tlsService.close();
    });
  });
});
