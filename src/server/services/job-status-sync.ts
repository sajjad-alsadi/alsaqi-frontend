/**
 * JobStatusSyncService - Synchronizes BullMQ state changes to PostgreSQL JobRecords.
 *
 * Listens to BullMQ QueueEvents (completed, failed, active, waiting, progress)
 * and updates the corresponding JobRecord in PostgreSQL within 5 seconds.
 *
 * Maps BullMQ states:
 *   waiting  → queued
 *   active   → processing
 *   completed → completed
 *   failed   → failed
 *   delayed  → queued
 *
 * Requirements: 2.7, 5.6
 */

import { QueueEvents } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { db } from '../db/index.js';
import logger from '../utils/logger.js';
import {
  type JobType,
  type JobRecordStatus,
  mapBullMQStateToJobRecordStatus,
} from '../../models/job-record.model.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface JobStatusSyncOptions {
  /** Redis connection options (passed to QueueEvents) */
  redisOptions: RedisOptions;
  /** Maximum time in ms to wait for a DB update before retrying (default: 5000) */
  syncTimeoutMs?: number;
}

// ─── Queue name mapping ──────────────────────────────────────────────────────

const JOB_TYPE_QUEUES: Record<JobType, string> = {
  'process-file': 'process-file',
  'generate-pdf': 'generate-pdf',
  'send-notification': 'send-notification',
  'cleanup-temp': 'cleanup-temp',
};

// ─── JobStatusSyncService ────────────────────────────────────────────────────

export class JobStatusSyncService {
  private queueEventsMap: Map<string, QueueEvents> = new Map();
  private redisOptions: RedisOptions;
  private syncTimeoutMs: number;
  private closed = false;

  constructor(options: JobStatusSyncOptions) {
    this.redisOptions = options.redisOptions;
    this.syncTimeoutMs = options.syncTimeoutMs ?? 5000;
  }

  /**
   * Starts listening to BullMQ QueueEvents for all job type queues.
   * Attaches event handlers that sync state changes to PostgreSQL.
   */
  async start(): Promise<void> {
    if (this.closed) {
      throw new Error('JobStatusSyncService has been closed');
    }

    for (const [jobType, queueName] of Object.entries(JOB_TYPE_QUEUES)) {
      const queueEvents = new QueueEvents(queueName, {
        connection: this.redisOptions,
      });

      this.attachEventHandlers(queueEvents, jobType as JobType);
      this.queueEventsMap.set(queueName, queueEvents);

      logger.info(`[JobStatusSync] Listening to events for queue: ${queueName}`);
    }
  }

  /**
   * Creates an initial JobRecord when a job is enqueued.
   * Called by the QueueService when enqueueing a new job.
   */
  async createJobRecord(params: {
    jobId: string;
    type: JobType;
    data: Record<string, unknown>;
    createdBy: string;
    maxAttempts: number;
  }): Promise<void> {
    const { jobId, type, data, createdBy, maxAttempts } = params;

    try {
      await this.executeWithTimeout(async () => {
        await db.prepare(`
          INSERT INTO job_records (id, type, status, data, progress, attempts, max_attempts, created_by, created_at)
          VALUES (?, ?, 'queued', ?, 0, 0, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO NOTHING
        `).run(jobId, type, JSON.stringify(data), maxAttempts, createdBy);
      });

      logger.info(`[JobStatusSync] Created job record`, { jobId, type });
    } catch (error) {
      logger.error(`[JobStatusSync] Failed to create job record`, {
        jobId,
        type,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Closes all QueueEvents listeners and cleans up resources.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    logger.info('[JobStatusSync] Closing job status sync service...');

    for (const [queueName, queueEvents] of this.queueEventsMap) {
      try {
        await queueEvents.close();
      } catch (error) {
        logger.error(`[JobStatusSync] Error closing QueueEvents for ${queueName}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.queueEventsMap.clear();
    logger.info('[JobStatusSync] Job status sync service closed.');
  }

  // ─── Private Methods ─────────────────────────────────────────────────────────

  /**
   * Attaches event handlers to a QueueEvents instance.
   * Handles: waiting, active, progress, completed, failed.
   */
  private attachEventHandlers(queueEvents: QueueEvents, jobType: JobType): void {
    queueEvents.on('waiting', async ({ jobId }) => {
      await this.updateJobStatus(jobId, 'queued');
    });

    queueEvents.on('active', async ({ jobId }) => {
      await this.updateJobStatus(jobId, 'processing', {
        startedAt: new Date(),
      });
    });

    queueEvents.on('progress', async ({ jobId, data: progressData }) => {
      const progress = typeof progressData === 'number'
        ? progressData
        : (typeof progressData === 'object' && progressData !== null && 'progress' in progressData)
          ? (progressData as { progress: number }).progress
          : undefined;

      if (progress !== undefined && progress >= 0 && progress <= 100) {
        await this.updateJobProgress(jobId, Math.round(progress));
      }
    });

    queueEvents.on('completed', async ({ jobId, returnvalue }) => {
      let result: Record<string, unknown> | undefined;
      if (returnvalue) {
        try {
          result = typeof returnvalue === 'string'
            ? JSON.parse(returnvalue)
            : returnvalue;
        } catch {
          result = { raw: returnvalue };
        }
      }

      await this.updateJobStatus(jobId, 'completed', {
        completedAt: new Date(),
        result,
        progress: 100,
      });
    });

    queueEvents.on('failed', async ({ jobId, failedReason }) => {
      await this.updateJobStatus(jobId, 'failed', {
        completedAt: new Date(),
        error: failedReason,
      });
    });

    queueEvents.on('delayed', async ({ jobId }) => {
      await this.updateJobStatus(jobId, 'queued');
    });
  }

  /**
   * Updates the job status in PostgreSQL.
   * Must complete within syncTimeoutMs. Retries once on timeout.
   */
  private async updateJobStatus(
    jobId: string,
    status: JobRecordStatus,
    extra?: {
      startedAt?: Date;
      completedAt?: Date;
      result?: Record<string, unknown>;
      error?: string;
      progress?: number;
    },
  ): Promise<void> {
    const executeUpdate = async () => {
      const setClauses: string[] = ['status = ?'];
      const params: unknown[] = [status];

      if (extra?.startedAt) {
        setClauses.push('started_at = ?');
        params.push(extra.startedAt.toISOString());
      }

      if (extra?.completedAt) {
        setClauses.push('completed_at = ?');
        params.push(extra.completedAt.toISOString());
      }

      if (extra?.result !== undefined) {
        setClauses.push('result = ?');
        params.push(JSON.stringify(extra.result));
      }

      if (extra?.error !== undefined) {
        setClauses.push('error = ?');
        params.push(extra.error);
      }

      if (extra?.progress !== undefined) {
        setClauses.push('progress = ?');
        params.push(extra.progress);
      }

      // Increment attempts when transitioning to processing
      if (status === 'processing') {
        setClauses.push('attempts = attempts + 1');
      }

      params.push(jobId);

      await db.prepare(
        `UPDATE job_records SET ${setClauses.join(', ')} WHERE id = ?`
      ).run(...params);
    };

    try {
      await this.executeWithTimeout(executeUpdate);
    } catch (error) {
      // Requirement 5.6: retry once if first attempt exceeds 5 seconds
      logger.warn(`[JobStatusSync] First update attempt failed for job ${jobId}, retrying...`, {
        error: error instanceof Error ? error.message : String(error),
      });

      try {
        await this.executeWithTimeout(executeUpdate);
      } catch (retryError) {
        // Requirement 5.6: fail the job if retry also exceeds the time limit
        logger.error(`[JobStatusSync] Retry failed for job ${jobId}. Marking as failed.`, {
          error: retryError instanceof Error ? retryError.message : String(retryError),
        });

        // Only try to mark as failed if we weren't already trying to set failed status
        if (status !== 'failed') {
          try {
            await db.prepare(
              `UPDATE job_records SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`
            ).run(
              `Sync timeout: database update exceeded ${this.syncTimeoutMs}ms limit after retry`,
              new Date().toISOString(),
              jobId,
            );
          } catch {
            // Last resort - log and give up
            logger.error(`[JobStatusSync] Could not mark job ${jobId} as failed after sync timeout`);
          }
        }
      }
    }
  }

  /**
   * Updates only the progress field for a job.
   */
  private async updateJobProgress(jobId: string, progress: number): Promise<void> {
    try {
      await this.executeWithTimeout(async () => {
        await db.prepare(
          `UPDATE job_records SET progress = ? WHERE id = ? AND progress <= ?`
        ).run(progress, jobId, progress);
      });
    } catch (error) {
      // Progress updates are non-critical; log and continue
      logger.warn(`[JobStatusSync] Failed to update progress for job ${jobId}`, {
        progress,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Executes an async function with a timeout.
   * Throws if the function does not complete within syncTimeoutMs.
   */
  private async executeWithTimeout(fn: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${this.syncTimeoutMs}ms`));
      }, this.syncTimeoutMs);

      fn()
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}
