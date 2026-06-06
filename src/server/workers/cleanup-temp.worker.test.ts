// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { WorkerContext } from '../services/worker-manager.js';
import type { JobDataMap } from '../services/queue.service.js';
import { cleanupTempWorker } from './cleanup-temp.worker.js';

describe('cleanupTempWorker', () => {
  let mockStorage: {
    listObjects: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };
  let mockReportProgress: ReturnType<typeof vi.fn>;
  let context: WorkerContext;

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  function createJob(olderThanMs: number = TWENTY_FOUR_HOURS_MS): Job<JobDataMap['cleanup-temp']> {
    return {
      data: { olderThanMs },
    } as Job<JobDataMap['cleanup-temp']>;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockStorage = {
      listObjects: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    mockReportProgress = vi.fn().mockResolvedValue(undefined);

    context = {
      storage: mockStorage as any,
      db: {},
      logger: mockLogger as any,
      reportProgress: mockReportProgress,
    };
  });

  it('should complete successfully with zero-file log when no objects exist', async () => {
    mockStorage.listObjects.mockResolvedValue([]);

    await cleanupTempWorker(createJob(), context);

    expect(mockStorage.listObjects).toHaveBeenCalledWith('', 'temp');
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[cleanup-temp] Zero files required cleanup',
      expect.objectContaining({ totalObjects: 0 }),
    );
    expect(mockReportProgress).toHaveBeenCalledWith(100);
    expect(mockStorage.delete).not.toHaveBeenCalled();
  });

  it('should complete successfully with zero-file log when no stale objects exist', async () => {
    const recentDate = new Date(Date.now() - 1000); // 1 second ago
    mockStorage.listObjects.mockResolvedValue([
      { key: 'recent-file.pdf', size: 1024, lastModified: recentDate, etag: 'abc' },
    ]);

    await cleanupTempWorker(createJob(), context);

    expect(mockLogger.info).toHaveBeenCalledWith(
      '[cleanup-temp] Zero files required cleanup',
      expect.objectContaining({ totalObjects: 1 }),
    );
    expect(mockReportProgress).toHaveBeenCalledWith(100);
    expect(mockStorage.delete).not.toHaveBeenCalled();
  });

  it('should delete stale objects older than olderThanMs', async () => {
    const staleDate = new Date(Date.now() - TWENTY_FOUR_HOURS_MS - 60000); // 24h + 1min ago
    mockStorage.listObjects.mockResolvedValue([
      { key: 'stale-file.pdf', size: 2048, lastModified: staleDate, etag: 'etag1' },
    ]);

    await cleanupTempWorker(createJob(), context);

    expect(mockStorage.delete).toHaveBeenCalledWith('stale-file.pdf', 'temp');
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[cleanup-temp] Cleanup completed',
      expect.objectContaining({
        deletedCount: 1,
        bytesReclaimed: 2048,
        failedCount: 0,
        totalStale: 1,
      }),
    );
  });

  it('should only delete objects older than the threshold, leaving recent ones', async () => {
    const staleDate = new Date(Date.now() - TWENTY_FOUR_HOURS_MS - 60000);
    const recentDate = new Date(Date.now() - 1000);

    mockStorage.listObjects.mockResolvedValue([
      { key: 'stale.pdf', size: 1000, lastModified: staleDate, etag: 'e1' },
      { key: 'recent.pdf', size: 500, lastModified: recentDate, etag: 'e2' },
    ]);

    await cleanupTempWorker(createJob(), context);

    expect(mockStorage.delete).toHaveBeenCalledTimes(1);
    expect(mockStorage.delete).toHaveBeenCalledWith('stale.pdf', 'temp');
  });

  it('should continue deleting remaining objects if individual deletes fail', async () => {
    const staleDate = new Date(Date.now() - TWENTY_FOUR_HOURS_MS - 60000);

    mockStorage.listObjects.mockResolvedValue([
      { key: 'file1.pdf', size: 100, lastModified: staleDate, etag: 'e1' },
      { key: 'file2.pdf', size: 200, lastModified: staleDate, etag: 'e2' },
      { key: 'file3.pdf', size: 300, lastModified: staleDate, etag: 'e3' },
    ]);

    // First delete fails, others succeed
    mockStorage.delete
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await cleanupTempWorker(createJob(), context);

    // All three should be attempted
    expect(mockStorage.delete).toHaveBeenCalledTimes(3);
    expect(mockStorage.delete).toHaveBeenCalledWith('file1.pdf', 'temp');
    expect(mockStorage.delete).toHaveBeenCalledWith('file2.pdf', 'temp');
    expect(mockStorage.delete).toHaveBeenCalledWith('file3.pdf', 'temp');
  });

  it('should log failed keys at error level', async () => {
    const staleDate = new Date(Date.now() - TWENTY_FOUR_HOURS_MS - 60000);

    mockStorage.listObjects.mockResolvedValue([
      { key: 'fail1.pdf', size: 100, lastModified: staleDate, etag: 'e1' },
      { key: 'success.pdf', size: 200, lastModified: staleDate, etag: 'e2' },
      { key: 'fail2.pdf', size: 300, lastModified: staleDate, etag: 'e3' },
    ]);

    mockStorage.delete
      .mockRejectedValueOnce(new Error('err'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('err'));

    await cleanupTempWorker(createJob(), context);

    expect(mockLogger.error).toHaveBeenCalledWith(
      '[cleanup-temp] Failed to delete some temp objects',
      expect.objectContaining({
        failedCount: 2,
        failedKeys: ['fail1.pdf', 'fail2.pdf'],
      }),
    );
  });

  it('should log deleted count and bytes reclaimed at info level', async () => {
    const staleDate = new Date(Date.now() - TWENTY_FOUR_HOURS_MS - 60000);

    mockStorage.listObjects.mockResolvedValue([
      { key: 'a.pdf', size: 1024, lastModified: staleDate, etag: 'e1' },
      { key: 'b.pdf', size: 2048, lastModified: staleDate, etag: 'e2' },
      { key: 'c.pdf', size: 512, lastModified: staleDate, etag: 'e3' },
    ]);

    await cleanupTempWorker(createJob(), context);

    expect(mockLogger.info).toHaveBeenCalledWith(
      '[cleanup-temp] Cleanup completed',
      expect.objectContaining({
        deletedCount: 3,
        bytesReclaimed: 1024 + 2048 + 512,
        failedCount: 0,
        totalStale: 3,
      }),
    );
  });

  it('should report progress incrementally during deletion', async () => {
    const staleDate = new Date(Date.now() - TWENTY_FOUR_HOURS_MS - 60000);

    mockStorage.listObjects.mockResolvedValue([
      { key: 'f1.pdf', size: 100, lastModified: staleDate, etag: 'e1' },
      { key: 'f2.pdf', size: 100, lastModified: staleDate, etag: 'e2' },
    ]);

    await cleanupTempWorker(createJob(), context);

    // First call: 10 (after listing)
    // During deletion: incremental progress from 10 to 100
    const progressCalls = mockReportProgress.mock.calls.map((c: any[]) => c[0]);
    expect(progressCalls[0]).toBe(10); // After listing
    // Progress should be increasing
    for (let i = 1; i < progressCalls.length; i++) {
      expect(progressCalls[i]).toBeGreaterThanOrEqual(progressCalls[i - 1]);
    }
    // Last progress call should be 100
    expect(progressCalls[progressCalls.length - 1]).toBe(100);
  });

  it('should complete successfully even if all deletes fail', async () => {
    const staleDate = new Date(Date.now() - TWENTY_FOUR_HOURS_MS - 60000);

    mockStorage.listObjects.mockResolvedValue([
      { key: 'f1.pdf', size: 100, lastModified: staleDate, etag: 'e1' },
      { key: 'f2.pdf', size: 200, lastModified: staleDate, etag: 'e2' },
    ]);

    mockStorage.delete
      .mockRejectedValueOnce(new Error('err1'))
      .mockRejectedValueOnce(new Error('err2'));

    // Should NOT throw
    await expect(cleanupTempWorker(createJob(), context)).resolves.toBeUndefined();

    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[cleanup-temp] Cleanup completed',
      expect.objectContaining({
        deletedCount: 0,
        bytesReclaimed: 0,
        failedCount: 2,
      }),
    );
  });

  it('should use job.data.olderThanMs to determine the cutoff time', async () => {
    const customOlderThanMs = 2 * 60 * 60 * 1000; // 2 hours
    const twoHoursAgo = new Date(Date.now() - customOlderThanMs - 60000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    mockStorage.listObjects.mockResolvedValue([
      { key: 'old.pdf', size: 100, lastModified: twoHoursAgo, etag: 'e1' },
      { key: 'new.pdf', size: 200, lastModified: oneHourAgo, etag: 'e2' },
    ]);

    await cleanupTempWorker(createJob(customOlderThanMs), context);

    expect(mockStorage.delete).toHaveBeenCalledTimes(1);
    expect(mockStorage.delete).toHaveBeenCalledWith('old.pdf', 'temp');
  });
});
