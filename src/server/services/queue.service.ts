/**
 * QueueService - BullMQ background job queue abstraction.
 *
 * Manages named queues for background processing, encapsulating Redis connection,
 * queue creation, job lifecycle management, and health monitoring.
 *
 * Uses BullMQ (Queue, QueueEvents) + ioredis for Redis connection with
 * CertificateManager for TLS configuration and exponential backoff reconnection.
 *
 * Requirements: 2.1, 5.1, 5.2, 5.4, 5.5, 8.1
 */

import { Queue, QueueEvents, type JobsOptions } from 'bullmq';
import Redis, { type RedisOptions } from 'ioredis';
import logger from '../utils/logger.js';
import { type RedisConfig, getRedisConfig } from '../config/redis.config.js';
import { type QueueConfig, getQueueConfig } from '../config/queue.config.js';
import { type CertificateManager } from './certificate-manager.js';
import { type BucketName } from '../../models/file-record.model.js';
import { assertJobPayloadSecurity } from '../utils/job-payload-validator.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type JobType = 'process-file' | 'generate-pdf' | 'send-notification' | 'cleanup-temp';

export interface FileMetadata {
  fileId: string;
  storageKey: string;
  checksum: string;
  contentType: string;
}

export interface JobDataMap {
  'process-file': {
    tempKey: string;
    targetBucket: BucketName;
    metadata: FileMetadata;
  };
  'generate-pdf': {
    reportId: string;
    auditId: string;
    template: string;
  };
  'send-notification': {
    userId: string;
    type: string;
    payload: Record<string, unknown>;
  };
  'cleanup-temp': {
    olderThanMs: number;
  };
}

export interface JobReference {
  jobId: string;
  queue: string;
  estimatedWaitMs: number;
}

export interface JobStatus {
  id: string;
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  progress: number;
  result?: unknown;
  failedReason?: string;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  attemptsMade: number;
}

export interface JobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: { type: 'exponential' | 'fixed'; delay: number };
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
}

export interface QueueHealth {
  connected: boolean;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  workers: number;
}

// ─── Queue name mapping ──────────────────────────────────────────────────────

const QUEUE_NAMES: Record<JobType, string> = {
  'process-file': 'process-file',
  'generate-pdf': 'generate-pdf',
  'send-notification': 'send-notification',
  'cleanup-temp': 'cleanup-temp',
};

// ─── QueueService ────────────────────────────────────────────────────────────

export class QueueService {
  private queues: Map<JobType, Queue> = new Map();
  private queueEvents: Map<JobType, QueueEvents> = new Map();
  private connection: Redis;
  private redisConfig: RedisConfig;
  private queueConfig: QueueConfig;
  private closed = false;

  constructor(
    redisConfig?: RedisConfig,
    queueConfig?: QueueConfig,
    private certificateManager?: CertificateManager,
  ) {
    this.redisConfig = redisConfig ?? getRedisConfig();
    this.queueConfig = queueConfig ?? getQueueConfig();
    this.connection = this.createRedisConnection();
    this.initializeQueues();
  }

  /**
   * Enqueues a typed job to the appropriate queue.
   * Returns a JobReference for status polling.
   *
   * Performs runtime payload security validation before enqueuing to ensure
   * no sensitive data (credentials, tokens, session data) is included.
   * Requirements: 11.4
   */
  async enqueue<T extends JobType>(
    type: T,
    data: JobDataMap[T],
    options?: JobOptions,
  ): Promise<JobReference> {
    // Defense-in-depth: validate payload contains no sensitive fields
    assertJobPayloadSecurity(type, data);

    const queue = this.queues.get(type);
    if (!queue) {
      throw new Error(`Queue not initialized for job type: ${type}`);
    }

    const jobOptions: JobsOptions = {
      attempts: options?.attempts ?? this.queueConfig.maxAttempts,
      backoff: options?.backoff ?? {
        type: this.queueConfig.backoffType,
        delay: this.queueConfig.backoffBaseMs,
      },
      removeOnComplete: options?.removeOnComplete ?? this.queueConfig.removeOnComplete,
      removeOnFail: options?.removeOnFail ?? this.queueConfig.removeOnFail,
      priority: options?.priority,
      delay: options?.delay,
    };

    const job = await queue.add(type, data, jobOptions);

    const waitingCount = await queue.getWaitingCount();
    // Rough estimate: assume 5 seconds average processing time per waiting job
    const estimatedWaitMs = waitingCount * 5000;

    logger.info(`[QueueService] Job enqueued`, {
      jobId: job.id,
      type,
      queue: QUEUE_NAMES[type],
    });

    return {
      jobId: job.id!,
      queue: QUEUE_NAMES[type],
      estimatedWaitMs,
    };
  }

  /**
   * Returns the current status of a job by ID.
   * Searches all queues to find the job.
   */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    for (const [, queue] of this.queues) {
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();

        // Map BullMQ states to our JobStatus states
        const mappedState = this.mapJobState(state);

        const progress = typeof job.progress === 'number' ? job.progress : 0;

        return {
          id: job.id!,
          state: mappedState,
          progress,
          result: job.returnvalue ?? undefined,
          failedReason: job.failedReason ?? undefined,
          createdAt: new Date(job.timestamp),
          processedAt: job.processedOn ? new Date(job.processedOn) : undefined,
          completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
          attemptsMade: job.attemptsMade,
        };
      }
    }

    return null;
  }

  /**
   * Cancels a job by ID.
   * Returns true if the job was found and removed, false otherwise.
   */
  async cancelJob(jobId: string): Promise<boolean> {
    for (const [, queue] of this.queues) {
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        // Can only cancel waiting or delayed jobs
        if (state === 'waiting' || state === 'delayed') {
          await job.remove();
          logger.info(`[QueueService] Job cancelled`, { jobId });
          return true;
        }
        // For active jobs, attempt to move to failed state
        if (state === 'active') {
          await job.moveToFailed(new Error('Job cancelled by user'), job.id!, true);
          logger.info(`[QueueService] Active job cancelled`, { jobId });
          return true;
        }
        return false;
      }
    }
    return false;
  }

  /**
   * Returns health metrics for all queues including connection status and job counts.
   */
  async getQueueHealth(): Promise<QueueHealth> {
    const connected = this.connection.status === 'ready';

    let waiting = 0;
    let active = 0;
    let completed = 0;
    let failed = 0;
    let delayed = 0;
    let workers = 0;

    for (const [, queue] of this.queues) {
      try {
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'completed',
          'failed',
          'delayed',
        );
        waiting += counts.waiting ?? 0;
        active += counts.active ?? 0;
        completed += counts.completed ?? 0;
        failed += counts.failed ?? 0;
        delayed += counts.delayed ?? 0;

        // Get worker count from queue's workers list
        const queueWorkers = await queue.getWorkers();
        workers += queueWorkers.length;
      } catch (error) {
        logger.error(`[QueueService] Failed to get queue health metrics`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      connected,
      waiting,
      active,
      completed,
      failed,
      delayed,
      workers,
    };
  }

  /**
   * Returns the underlying Redis connection options for use by workers.
   * Workers need their own connection but with the same config.
   */
  getRedisOptions(): RedisOptions {
    return this.buildRedisOptions();
  }

  /**
   * Returns the queue instance for a given job type.
   * Used by WorkerManager to create workers on the same queue.
   */
  getQueue(type: JobType): Queue | undefined {
    return this.queues.get(type);
  }

  /**
   * Schedules repeatable jobs (e.g., cleanup-temp).
   * Uses BullMQ's upsertJobScheduler to ensure only one repeatable job exists
   * (idempotent on restart — no duplicates).
   *
   * Requirements: 10.1
   */
  async scheduleRepeatableJobs(): Promise<void> {
    const queue = this.queues.get('cleanup-temp');
    if (!queue) {
      logger.error('[QueueService] Cannot schedule cleanup-temp: queue not initialized');
      return;
    }

    const intervalMs = this.queueConfig.cleanupIntervalMinutes * 60 * 1000;
    const olderThanMs = this.queueConfig.tempFileMaxAgeHours * 60 * 60 * 1000;

    await queue.upsertJobScheduler(
      'cleanup-temp-scheduler',
      { every: intervalMs },
      {
        name: 'cleanup-temp',
        data: { olderThanMs },
        opts: {
          attempts: this.queueConfig.maxAttempts,
          backoff: {
            type: this.queueConfig.backoffType,
            delay: this.queueConfig.backoffBaseMs,
          },
          removeOnComplete: this.queueConfig.removeOnComplete,
          removeOnFail: this.queueConfig.removeOnFail,
        },
      },
    );

    logger.info('[QueueService] Repeatable cleanup-temp job scheduled', {
      intervalMinutes: this.queueConfig.cleanupIntervalMinutes,
      olderThanMs,
    });
  }

  /**
   * Closes all queues, queue events, and the Redis connection.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    logger.info('[QueueService] Closing queue service...');

    // Close QueueEvents first
    for (const [type, queueEvents] of this.queueEvents) {
      try {
        await queueEvents.close();
      } catch (error) {
        logger.error(`[QueueService] Error closing QueueEvents for ${type}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Close queues
    for (const [type, queue] of this.queues) {
      try {
        await queue.close();
      } catch (error) {
        logger.error(`[QueueService] Error closing queue ${type}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Disconnect Redis
    try {
      await this.connection.quit();
    } catch (error) {
      logger.error(`[QueueService] Error disconnecting Redis`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.queues.clear();
    this.queueEvents.clear();

    logger.info('[QueueService] Queue service closed.');
  }

  // ─── Private Methods ─────────────────────────────────────────────────────────

  /**
   * Creates the shared Redis connection with TLS support and reconnection strategy.
   */
  private createRedisConnection(): Redis {
    const options = this.buildRedisOptions();
    const redis = new Redis(options);

    redis.on('connect', () => {
      logger.info('[QueueService] Redis connected');
    });

    redis.on('error', (error) => {
      logger.error('[QueueService] Redis connection error', {
        error: error.message,
      });
    });

    redis.on('close', () => {
      logger.warn('[QueueService] Redis connection closed');
    });

    redis.on('reconnecting', (delay: number) => {
      logger.info(`[QueueService] Redis reconnecting in ${delay}ms`);
    });

    return redis;
  }

  /**
   * Builds Redis connection options with TLS from CertificateManager
   * and exponential backoff reconnection strategy.
   */
  private buildRedisOptions(): RedisOptions {
    const options: RedisOptions = {
      host: this.redisConfig.host,
      port: this.redisConfig.port,
      password: this.redisConfig.password,
      db: this.redisConfig.db,
      maxRetriesPerRequest: this.redisConfig.maxRetriesPerRequest,
      connectTimeout: this.redisConfig.connectTimeoutMs,
      enableReadyCheck: this.redisConfig.enableReadyCheck,
      retryStrategy: (times: number) => {
        // Exponential backoff: min(1000 * 2^(times-1), 30000)
        const delay = Math.min(1000 * Math.pow(2, times - 1), 30000);
        logger.info(`[QueueService] Redis retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      },
    };

    // Apply TLS config from CertificateManager if TLS is enabled
    if (this.redisConfig.useTLS && this.certificateManager) {
      const sslConfig = this.certificateManager.getRedisSSLConfig();
      options.tls = sslConfig.tls;
    } else if (this.redisConfig.useTLS) {
      // TLS enabled but no CertificateManager: use system CA with rejectUnauthorized
      options.tls = { rejectUnauthorized: true };
    }

    return options;
  }

  /**
   * Initializes BullMQ Queue and QueueEvents for each job type.
   */
  private initializeQueues(): void {
    const jobTypes: JobType[] = ['process-file', 'generate-pdf', 'send-notification', 'cleanup-temp'];

    for (const type of jobTypes) {
      const queueName = QUEUE_NAMES[type];

      const queue = new Queue(queueName, {
        connection: this.connection.duplicate(),
        defaultJobOptions: {
          attempts: this.queueConfig.maxAttempts,
          backoff: {
            type: this.queueConfig.backoffType,
            delay: this.queueConfig.backoffBaseMs,
          },
          removeOnComplete: this.queueConfig.removeOnComplete,
          removeOnFail: this.queueConfig.removeOnFail,
        },
      });

      const queueEvents = new QueueEvents(queueName, {
        connection: this.connection.duplicate(),
      });

      this.queues.set(type, queue);
      this.queueEvents.set(type, queueEvents);

      logger.info(`[QueueService] Queue initialized: ${queueName}`);
    }
  }

  /**
   * Maps BullMQ internal job states to the public JobStatus state type.
   */
  private mapJobState(
    state: string,
  ): 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' {
    switch (state) {
      case 'waiting':
      case 'prioritized':
      case 'wait':
        return 'waiting';
      case 'active':
        return 'active';
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'delayed':
        return 'delayed';
      default:
        return 'waiting';
    }
  }
}
