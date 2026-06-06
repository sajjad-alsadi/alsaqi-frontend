/**
 * BullMQ queue and worker configuration.
 * Controls concurrency, retry behavior, and cleanup scheduling.
 */

export interface QueueConfig {
  /** Number of concurrent jobs per worker (min: 1, max: 50, default: 3) */
  concurrency: number;
  /** Maximum retry attempts for failed jobs (default: 3) */
  maxAttempts: number;
  /** Base delay for exponential backoff in milliseconds (default: 2000) */
  backoffBaseMs: number;
  /** Backoff strategy (default: exponential) */
  backoffType: 'exponential' | 'fixed';
  /** Graceful shutdown timeout in milliseconds (default: 30000) */
  shutdownTimeoutMs: number;
  /** Cleanup-temp job interval in minutes (min: 5, max: 10080, default: 60) */
  cleanupIntervalMinutes: number;
  /** Age threshold for temp file deletion in hours (default: 24) */
  tempFileMaxAgeHours: number;
  /** Whether to remove completed jobs from Redis (default: true, keeps last 1000) */
  removeOnComplete: boolean | number;
  /** Whether to remove failed jobs from Redis (default: false, keeps last 5000) */
  removeOnFail: boolean | number;
  /** Stalled job check interval in milliseconds (default: 30000) */
  stalledIntervalMs: number;
  /** Maximum stalled job count before considering worker dead (default: 1) */
  maxStalledCount: number;
}

export function getQueueConfig(): QueueConfig {
  const concurrency = parseInt(process.env.QUEUE_CONCURRENCY || '3', 10);
  const cleanupInterval = parseInt(process.env.QUEUE_CLEANUP_INTERVAL_MINUTES || '60', 10);

  return {
    concurrency: Math.min(50, Math.max(1, concurrency)),
    maxAttempts: parseInt(process.env.QUEUE_MAX_ATTEMPTS || '3', 10),
    backoffBaseMs: parseInt(process.env.QUEUE_BACKOFF_BASE_MS || '2000', 10),
    backoffType: (process.env.QUEUE_BACKOFF_TYPE as 'exponential' | 'fixed') || 'exponential',
    shutdownTimeoutMs: parseInt(process.env.QUEUE_SHUTDOWN_TIMEOUT_MS || '30000', 10),
    cleanupIntervalMinutes: Math.min(10080, Math.max(5, cleanupInterval)),
    tempFileMaxAgeHours: parseInt(process.env.QUEUE_TEMP_FILE_MAX_AGE_HOURS || '24', 10),
    removeOnComplete: parseInt(process.env.QUEUE_REMOVE_ON_COMPLETE || '1000', 10),
    removeOnFail: parseInt(process.env.QUEUE_REMOVE_ON_FAIL || '5000', 10),
    stalledIntervalMs: parseInt(process.env.QUEUE_STALLED_INTERVAL_MS || '30000', 10),
    maxStalledCount: parseInt(process.env.QUEUE_MAX_STALLED_COUNT || '1', 10),
  };
}
