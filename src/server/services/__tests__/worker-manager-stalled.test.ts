// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock bullmq
const mockWorkerOn = vi.hoisted(() => vi.fn());
const mockWorkerClose = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockWorkerIsPaused = vi.hoisted(() => vi.fn().mockReturnValue(false));

const MockWorker = vi.hoisted(() => vi.fn());

vi.mock('bullmq', () => ({
  Worker: MockWorker,
  Job: class MockJob {},
}));

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock queue config
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

import { WorkerManager } from '../worker-manager.js';

describe('WorkerManager - Stalled Job Recovery (Requirement 9.3)', () => {
  let workerManager: WorkerManager;
  const mockQueueService = {
    getRedisOptions: vi.fn().mockReturnValue({
      host: 'localhost',
      port: 6379,
    }),
  };
  const mockDependencies = {
    storage: {} as any,
    db: {} as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Configure MockWorker as a constructor that returns an object with proper methods
    MockWorker.mockImplementation(function (this: any, _name: string, _processor: any, opts: any) {
      this.on = mockWorkerOn;
      this.close = mockWorkerClose;
      this.isPaused = mockWorkerIsPaused;
      this.opts = opts;
      this.processing = new Map();
      return this;
    });
    workerManager = new WorkerManager(
      mockQueueService as any,
      mockDependencies,
    );
  });

  it('should configure stalledInterval from queue config (30000ms)', async () => {
    const mockProcessor = vi.fn();
    workerManager.registerProcessor('process-file', mockProcessor);

    await workerManager.start();

    // Verify Worker constructor was called with stalledInterval option
    expect(MockWorker).toHaveBeenCalledWith(
      'process-file',
      expect.any(Function),
      expect.objectContaining({
        stalledInterval: 30000,
      }),
    );
  });

  it('should configure maxStalledCount from queue config (1)', async () => {
    const mockProcessor = vi.fn();
    workerManager.registerProcessor('process-file', mockProcessor);

    await workerManager.start();

    // Verify Worker constructor was called with maxStalledCount option
    expect(MockWorker).toHaveBeenCalledWith(
      'process-file',
      expect.any(Function),
      expect.objectContaining({
        maxStalledCount: 1,
      }),
    );
  });

  it('should register stalled event handler on workers', async () => {
    const mockProcessor = vi.fn();
    workerManager.registerProcessor('process-file', mockProcessor);

    await workerManager.start();

    // Verify that the 'stalled' event listener was registered
    expect(mockWorkerOn).toHaveBeenCalledWith('stalled', expect.any(Function));
  });

  it('should configure concurrency from queue config', async () => {
    const mockProcessor = vi.fn();
    workerManager.registerProcessor('process-file', mockProcessor);

    await workerManager.start();

    expect(MockWorker).toHaveBeenCalledWith(
      'process-file',
      expect.any(Function),
      expect.objectContaining({
        concurrency: 3,
      }),
    );
  });

  it('should pass Redis connection options to workers', async () => {
    const mockProcessor = vi.fn();
    workerManager.registerProcessor('process-file', mockProcessor);

    await workerManager.start();

    expect(MockWorker).toHaveBeenCalledWith(
      'process-file',
      expect.any(Function),
      expect.objectContaining({
        connection: { host: 'localhost', port: 6379 },
      }),
    );
  });

  it('should configure all registered workers with stalled job settings', async () => {
    workerManager.registerProcessor('process-file', vi.fn());
    workerManager.registerProcessor('generate-pdf', vi.fn());
    workerManager.registerProcessor('cleanup-temp', vi.fn());

    await workerManager.start();

    // All 3 workers should have stalledInterval and maxStalledCount configured
    expect(MockWorker).toHaveBeenCalledTimes(3);

    for (const call of MockWorker.mock.calls) {
      expect(call[2]).toMatchObject({
        stalledInterval: 30000,
        maxStalledCount: 1,
      });
    }
  });
});
