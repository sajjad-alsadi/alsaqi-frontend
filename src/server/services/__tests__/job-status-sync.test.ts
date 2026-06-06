// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mockQueueEventsOn = vi.hoisted(() => vi.fn());
const mockQueueEventsClose = vi.hoisted(() => vi.fn());
const mockDbPrepareRun = vi.hoisted(() => vi.fn());
const mockDbPrepareGet = vi.hoisted(() => vi.fn());

// ─── Mock bullmq ─────────────────────────────────────────────────────────────

vi.mock('bullmq', () => ({
  QueueEvents: class MockQueueEvents {
    on = mockQueueEventsOn;
    close = mockQueueEventsClose;
    constructor(_name: string, _opts?: any) {}
  },
}));

// ─── Mock database ───────────────────────────────────────────────────────────

vi.mock('../../db/index.js', () => ({
  db: {
    prepare: vi.fn(() => ({
      run: mockDbPrepareRun,
      get: mockDbPrepareGet,
      all: vi.fn().mockResolvedValue([]),
    })),
  },
}));

// ─── Mock logger ─────────────────────────────────────────────────────────────

vi.mock('../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { JobStatusSyncService } from '../job-status-sync.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('JobStatusSyncService', () => {
  let service: JobStatusSyncService;
  const redisOptions = { host: 'localhost', port: 6379 };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbPrepareRun.mockResolvedValue({ changes: 1 });
    mockQueueEventsClose.mockResolvedValue(undefined);

    service = new JobStatusSyncService({
      redisOptions,
      syncTimeoutMs: 5000,
    });
  });

  afterEach(async () => {
    await service.close();
  });

  describe('start()', () => {
    it('should create QueueEvents for all 4 job type queues', async () => {
      await service.start();

      // Each queue attaches 6 event handlers (waiting, active, progress, completed, failed, delayed)
      // 4 queues × 6 events = 24 calls to .on()
      expect(mockQueueEventsOn).toHaveBeenCalledTimes(24);
    });

    it('should listen to waiting events', async () => {
      await service.start();

      const waitingCalls = mockQueueEventsOn.mock.calls.filter(
        (call) => call[0] === 'waiting'
      );
      expect(waitingCalls).toHaveLength(4); // One per queue
    });

    it('should listen to active events', async () => {
      await service.start();

      const activeCalls = mockQueueEventsOn.mock.calls.filter(
        (call) => call[0] === 'active'
      );
      expect(activeCalls).toHaveLength(4);
    });

    it('should listen to completed events', async () => {
      await service.start();

      const completedCalls = mockQueueEventsOn.mock.calls.filter(
        (call) => call[0] === 'completed'
      );
      expect(completedCalls).toHaveLength(4);
    });

    it('should listen to failed events', async () => {
      await service.start();

      const failedCalls = mockQueueEventsOn.mock.calls.filter(
        (call) => call[0] === 'failed'
      );
      expect(failedCalls).toHaveLength(4);
    });

    it('should listen to progress events', async () => {
      await service.start();

      const progressCalls = mockQueueEventsOn.mock.calls.filter(
        (call) => call[0] === 'progress'
      );
      expect(progressCalls).toHaveLength(4);
    });

    it('should listen to delayed events', async () => {
      await service.start();

      const delayedCalls = mockQueueEventsOn.mock.calls.filter(
        (call) => call[0] === 'delayed'
      );
      expect(delayedCalls).toHaveLength(4);
    });

    it('should throw if called after close', async () => {
      await service.close();
      await expect(service.start()).rejects.toThrow('has been closed');
    });
  });

  describe('createJobRecord()', () => {
    it('should insert a new job record into PostgreSQL', async () => {
      await service.createJobRecord({
        jobId: 'job-123',
        type: 'process-file',
        data: { tempKey: 'pending/test', targetBucket: 'evidence' },
        createdBy: 'user-1',
        maxAttempts: 3,
      });

      expect(mockDbPrepareRun).toHaveBeenCalledWith(
        'job-123',
        'process-file',
        JSON.stringify({ tempKey: 'pending/test', targetBucket: 'evidence' }),
        3,
        'user-1',
      );
    });

    it('should throw on database errors', async () => {
      mockDbPrepareRun.mockRejectedValue(new Error('Connection failed'));

      await expect(
        service.createJobRecord({
          jobId: 'job-err',
          type: 'generate-pdf',
          data: { reportId: 'r1', auditId: 'a1', template: 'standard' },
          createdBy: 'user-2',
          maxAttempts: 3,
        })
      ).rejects.toThrow('Connection failed');
    });
  });

  describe('event handler: active', () => {
    it('should update job status to processing with startedAt', async () => {
      await service.start();

      // Get the 'active' event handler from one of the queues
      const activeCall = mockQueueEventsOn.mock.calls.find(
        (call) => call[0] === 'active'
      );
      expect(activeCall).toBeDefined();

      const handler = activeCall![1];
      await handler({ jobId: 'job-active-1' });

      expect(mockDbPrepareRun).toHaveBeenCalledWith(
        'processing',
        expect.any(String), // startedAt ISO string
        'job-active-1',
      );
    });
  });

  describe('event handler: completed', () => {
    it('should update job status to completed with result', async () => {
      await service.start();

      const completedCall = mockQueueEventsOn.mock.calls.find(
        (call) => call[0] === 'completed'
      );
      const handler = completedCall![1];

      await handler({ jobId: 'job-done-1', returnvalue: JSON.stringify({ fileId: 'f1' }) });

      expect(mockDbPrepareRun).toHaveBeenCalledWith(
        'completed',
        expect.any(String), // completedAt
        JSON.stringify({ fileId: 'f1' }), // result
        100, // progress
        'job-done-1',
      );
    });

    it('should handle null returnvalue', async () => {
      await service.start();

      const completedCall = mockQueueEventsOn.mock.calls.find(
        (call) => call[0] === 'completed'
      );
      const handler = completedCall![1];

      await handler({ jobId: 'job-done-2', returnvalue: null });

      expect(mockDbPrepareRun).toHaveBeenCalled();
    });
  });

  describe('event handler: failed', () => {
    it('should update job status to failed with error reason', async () => {
      await service.start();

      const failedCall = mockQueueEventsOn.mock.calls.find(
        (call) => call[0] === 'failed'
      );
      const handler = failedCall![1];

      await handler({ jobId: 'job-fail-1', failedReason: 'Checksum mismatch' });

      expect(mockDbPrepareRun).toHaveBeenCalledWith(
        'failed',
        expect.any(String), // completedAt
        'Checksum mismatch', // error
        'job-fail-1',
      );
    });
  });

  describe('event handler: progress', () => {
    it('should update progress as a number', async () => {
      await service.start();

      const progressCall = mockQueueEventsOn.mock.calls.find(
        (call) => call[0] === 'progress'
      );
      const handler = progressCall![1];

      await handler({ jobId: 'job-prog-1', data: 50 });

      expect(mockDbPrepareRun).toHaveBeenCalledWith(50, 'job-prog-1', 50);
    });

    it('should ignore invalid progress values', async () => {
      await service.start();

      const progressCall = mockQueueEventsOn.mock.calls.find(
        (call) => call[0] === 'progress'
      );
      const handler = progressCall![1];

      mockDbPrepareRun.mockClear();
      await handler({ jobId: 'job-prog-2', data: -5 });

      // Should not have called db.prepare for invalid progress
      expect(mockDbPrepareRun).not.toHaveBeenCalled();
    });

    it('should ignore progress values over 100', async () => {
      await service.start();

      const progressCall = mockQueueEventsOn.mock.calls.find(
        (call) => call[0] === 'progress'
      );
      const handler = progressCall![1];

      mockDbPrepareRun.mockClear();
      await handler({ jobId: 'job-prog-3', data: 150 });

      expect(mockDbPrepareRun).not.toHaveBeenCalled();
    });
  });

  describe('event handler: waiting', () => {
    it('should update job status to queued', async () => {
      await service.start();

      const waitingCall = mockQueueEventsOn.mock.calls.find(
        (call) => call[0] === 'waiting'
      );
      const handler = waitingCall![1];

      await handler({ jobId: 'job-wait-1' });

      expect(mockDbPrepareRun).toHaveBeenCalledWith('queued', 'job-wait-1');
    });
  });

  describe('event handler: delayed', () => {
    it('should update job status to queued (delayed maps to queued)', async () => {
      await service.start();

      const delayedCall = mockQueueEventsOn.mock.calls.find(
        (call) => call[0] === 'delayed'
      );
      const handler = delayedCall![1];

      await handler({ jobId: 'job-delayed-1' });

      expect(mockDbPrepareRun).toHaveBeenCalledWith('queued', 'job-delayed-1');
    });
  });

  describe('timeout and retry behavior', () => {
    it('should retry once if first update times out', async () => {
      // First call times out, second succeeds
      let callCount = 0;
      mockDbPrepareRun.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 100)
          );
        }
        return Promise.resolve({ changes: 1 });
      });

      // Use short timeout for testing
      const shortTimeoutService = new JobStatusSyncService({
        redisOptions,
        syncTimeoutMs: 50,
      });

      await shortTimeoutService.start();

      const activeCall = mockQueueEventsOn.mock.calls.find(
        (call) => call[0] === 'active'
      );
      const handler = activeCall![1];

      await handler({ jobId: 'job-timeout-1' });

      // Should have been called at least twice (first attempt + retry)
      expect(callCount).toBeGreaterThanOrEqual(2);

      await shortTimeoutService.close();
    });
  });

  describe('close()', () => {
    it('should close all QueueEvents', async () => {
      await service.start();
      await service.close();

      // 4 queues
      expect(mockQueueEventsClose).toHaveBeenCalledTimes(4);
    });

    it('should be idempotent', async () => {
      await service.start();
      await service.close();
      await service.close();

      // Still only 4 closes
      expect(mockQueueEventsClose).toHaveBeenCalledTimes(4);
    });
  });
});
