/**
 * WorkerManager - Orchestrates BullMQ workers for background job processing.
 *
 * Registers typed processor functions for each JobType, manages worker lifecycle
 * (start, shutdown with graceful drain), and injects shared dependencies
 * (storage, db, logger) into processor functions via WorkerContext.
 *
 * Requirements: 8.2, 8.3, 8.4, 8.5
 */

import { Worker, Job } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import logger from '../utils/logger.js';
import { type QueueConfig, getQueueConfig } from '../config/queue.config.js';
import { type QueueService, type JobType, type JobDataMap } from './queue.service.js';
import { type StorageService } from './storage.service.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Shared dependencies injected into every job processor function.
 */
export interface WorkerContext {
  storage: StorageService;
  db: unknown;
  logger: typeof logger;
  reportProgress: (percent: number) => Promise<void>;
}

/**
 * A typed processor function for a specific JobType.
 * Receives the BullMQ Job instance and a WorkerContext with shared dependencies.
 */
export type JobProcessor<T extends JobType> = (
  job: Job<JobDataMap[T]>,
  context: WorkerContext,
) => Promise<void>;

/**
 * Information about a running worker instance.
 */
export interface WorkerInfo {
  queue: string;
  concurrency: number;
  running: number;
  paused: boolean;
}

// ─── WorkerManager ───────────────────────────────────────────────────────────

export class WorkerManager {
  private processors: Map<JobType, JobProcessor<any>> = new Map();
  private workers: Map<JobType, Worker> = new Map();
  private redisOptions: RedisOptions;
  private queueConfig: QueueConfig;
  private started = false;

  // Shared dependencies for WorkerContext
  private storage: StorageService;
  private db: unknown;

  constructor(
    queueService: QueueService,
    dependencies: {
      storage: StorageService;
      db: unknown;
    },
    queueConfig?: QueueConfig,
  ) {
    this.redisOptions = queueService.getRedisOptions();
    this.queueConfig = queueConfig ?? getQueueConfig();
    this.storage = dependencies.storage;
    this.db = dependencies.db;
  }

  /**
   * Registers a typed processor function for a specific JobType.
   * Must be called before start(). Registering after start() has no effect
   * until workers are restarted.
   */
  registerProcessor<T extends JobType>(type: T, processor: JobProcessor<T>): void {
    if (this.started) {
      logger.warn(`[WorkerManager] Registering processor for "${type}" after start. Restart workers to apply.`);
    }
    this.processors.set(type, processor);
    logger.info(`[WorkerManager] Processor registered for job type: ${type}`);
  }

  /**
   * Starts BullMQ workers for each registered processor.
   * Each worker uses the configured concurrency (default: 3, min: 1, max: 50).
   */
  async start(): Promise<void> {
    if (this.started) {
      logger.warn('[WorkerManager] Workers already started.');
      return;
    }

    if (this.processors.size === 0) {
      logger.warn('[WorkerManager] No processors registered. Nothing to start.');
      return;
    }

    const concurrency = this.queueConfig.concurrency;

    for (const [type, processor] of this.processors) {
      const worker = new Worker<JobDataMap[typeof type]>(
        type,
        async (job: Job<JobDataMap[typeof type]>) => {
          const context: WorkerContext = {
            storage: this.storage,
            db: this.db,
            logger,
            reportProgress: async (percent: number) => {
              // Clamp to valid range [0, 100]
              const clamped = Math.min(100, Math.max(0, Math.round(percent)));
              await job.updateProgress(clamped);
            },
          };

          await processor(job, context);
        },
        {
          connection: this.redisOptions,
          concurrency,
          stalledInterval: this.queueConfig.stalledIntervalMs,
          maxStalledCount: this.queueConfig.maxStalledCount,
        },
      );

      // Worker event handlers
      worker.on('completed', (job) => {
        logger.info(`[WorkerManager] Job completed`, {
          jobId: job.id,
          queue: type,
        });
      });

      worker.on('failed', (job, error) => {
        logger.error(`[WorkerManager] Job failed`, {
          jobId: job?.id,
          queue: type,
          error: error.message,
          attemptsMade: job?.attemptsMade,
        });
      });

      worker.on('error', (error) => {
        logger.error(`[WorkerManager] Worker error`, {
          queue: type,
          error: error.message,
        });
      });

      worker.on('stalled', (jobId) => {
        logger.warn(`[WorkerManager] Job stalled`, {
          jobId,
          queue: type,
        });
      });

      this.workers.set(type, worker);
      logger.info(`[WorkerManager] Worker started for "${type}" with concurrency ${concurrency}`);
    }

    this.started = true;
    logger.info(`[WorkerManager] All workers started (${this.workers.size} workers)`);
  }

  /**
   * Gracefully shuts down all workers.
   *
   * Calls Worker.close() on each worker with the specified timeout.
   * BullMQ's Worker.close() waits for active jobs to complete within the timeout.
   * If the timeout elapses, BullMQ automatically returns remaining active jobs
   * to the queue for reprocessing.
   *
   * @param timeoutMs - Shutdown timeout in milliseconds (default: from config, typically 30000)
   */
  async shutdown(timeoutMs?: number): Promise<void> {
    if (!this.started) {
      logger.info('[WorkerManager] Workers not started, nothing to shut down.');
      return;
    }

    const timeout = timeoutMs ?? this.queueConfig.shutdownTimeoutMs;
    logger.info(`[WorkerManager] Shutting down workers (timeout: ${timeout}ms)...`);

    const shutdownResults = await Promise.allSettled(
      Array.from(this.workers.entries()).map(async ([type, worker]) => {
        try {
          // Worker.close(force) - if timeout elapses, BullMQ handles returning
          // active jobs to the queue automatically
          await Promise.race([
            worker.close(),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error(`Shutdown timeout for "${type}"`)), timeout),
            ),
          ]);
          logger.info(`[WorkerManager] Worker "${type}" shut down gracefully`);
        } catch (error) {
          // If timeout elapses, force close the worker
          // BullMQ automatically returns active jobs to the queue
          logger.warn(`[WorkerManager] Worker "${type}" shutdown timed out, forcing close`, {
            error: error instanceof Error ? error.message : String(error),
          });
          try {
            await worker.close(true);
          } catch (forceError) {
            logger.error(`[WorkerManager] Failed to force close worker "${type}"`, {
              error: forceError instanceof Error ? forceError.message : String(forceError),
            });
          }
        }
      }),
    );

    // Log summary
    const failed = shutdownResults.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      logger.warn(`[WorkerManager] ${failed.length} worker(s) had shutdown issues`);
    }

    this.workers.clear();
    this.started = false;
    logger.info('[WorkerManager] All workers shut down');
  }

  /**
   * Returns information about all active workers.
   */
  getActiveWorkers(): WorkerInfo[] {
    const workerInfos: WorkerInfo[] = [];

    for (const [type, worker] of this.workers) {
      workerInfos.push({
        queue: type,
        concurrency: this.queueConfig.concurrency,
        running: (worker as any).processing?.size ?? 0,
        paused: worker.isPaused(),
      });
    }

    return workerInfos;
  }
}
