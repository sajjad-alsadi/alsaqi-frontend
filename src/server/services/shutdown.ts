/**
 * Graceful Shutdown Handler
 *
 * Registers SIGTERM and SIGINT signal handlers for orderly process shutdown.
 * On signal receipt:
 *   1. Stops certificate expiry checks and file watchers
 *   2. Drains active workers within a configurable timeout (default 30s)
 *   3. Closes QueueService (queues, queue events, and Redis connection)
 *   4. Logs progress at each step
 *   5. Exits the process after all cleanup completes
 *
 * If WorkerManager shutdown times out, BullMQ automatically returns remaining
 * active jobs to the queue for reprocessing.
 *
 * Requirements: 8.3, 8.4
 */

import logger from '../utils/logger.js';
import { type CertificateManager } from './certificate-manager.js';
import { type WorkerManager } from './worker-manager.js';
import { type QueueService } from './queue.service.js';

/**
 * Infrastructure services required for graceful shutdown.
 */
export interface ShutdownDependencies {
  certificateManager?: CertificateManager;
  workerManager?: WorkerManager;
  queueService?: QueueService;
}

/**
 * Options for shutdown behavior.
 */
export interface ShutdownOptions {
  /** Timeout in ms for draining active workers (default: 30000) */
  workerDrainTimeoutMs?: number;
  /** Whether to call process.exit after shutdown (default: true) */
  exitProcess?: boolean;
  /** Exit code on successful shutdown (default: 0) */
  exitCode?: number;
}

const DEFAULT_DRAIN_TIMEOUT_MS = 30_000;

let isShuttingDown = false;

/**
 * Performs the graceful shutdown sequence.
 * Idempotent — multiple calls (e.g., rapid SIGTERM + SIGINT) are safe.
 */
async function performShutdown(
  dependencies: ShutdownDependencies,
  options: ShutdownOptions,
  signal: string,
): Promise<void> {
  if (isShuttingDown) {
    logger.info(`[Shutdown] Already shutting down, ignoring duplicate ${signal}`);
    return;
  }
  isShuttingDown = true;

  const drainTimeout = options.workerDrainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS;

  logger.info(`[Shutdown] ${signal} received — starting graceful shutdown...`);

  // Step 1: Stop certificate expiry checks and file watchers
  if (dependencies.certificateManager) {
    try {
      logger.info('[Shutdown] Stopping certificate expiry checks...');
      dependencies.certificateManager.stopExpiryChecks();
      logger.info('[Shutdown] Stopping certificate file watchers...');
      dependencies.certificateManager.stopWatching();
      logger.info('[Shutdown] Certificate manager stopped.');
    } catch (error) {
      logger.error('[Shutdown] Error stopping certificate manager', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Step 2: Drain active workers within timeout
  if (dependencies.workerManager) {
    try {
      logger.info(`[Shutdown] Draining active workers (timeout: ${drainTimeout}ms)...`);
      await dependencies.workerManager.shutdown(drainTimeout);
      logger.info('[Shutdown] Workers drained successfully.');
    } catch (error) {
      logger.error('[Shutdown] Error draining workers', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Step 3: Close QueueService (queues, queue events, Redis connection)
  if (dependencies.queueService) {
    try {
      logger.info('[Shutdown] Closing queue service...');
      await dependencies.queueService.close();
      logger.info('[Shutdown] Queue service closed.');
    } catch (error) {
      logger.error('[Shutdown] Error closing queue service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('[Shutdown] Graceful shutdown complete.');

  // Step 4: Exit the process
  if (options.exitProcess !== false) {
    process.exit(options.exitCode ?? 0);
  }
}

/**
 * Registers SIGTERM and SIGINT signal handlers for graceful shutdown.
 *
 * Call this function during application bootstrap after all infrastructure
 * services have been initialized.
 *
 * @param dependencies - The infrastructure services to shut down
 * @param options - Optional configuration for shutdown behavior
 */
export function registerShutdownHandlers(
  dependencies: ShutdownDependencies,
  options: ShutdownOptions = {},
): void {
  const handler = (signal: string) => {
    // Use void to handle the async shutdown without unhandled promise rejection
    void performShutdown(dependencies, options, signal).catch((error) => {
      logger.error('[Shutdown] Unexpected error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    });
  };

  process.on('SIGTERM', () => handler('SIGTERM'));
  process.on('SIGINT', () => handler('SIGINT'));

  logger.info('[Shutdown] Graceful shutdown handlers registered (SIGTERM, SIGINT)');
}

/**
 * Resets the shutdown state. Primarily used for testing.
 * @internal
 */
export function _resetShutdownState(): void {
  isShuttingDown = false;
}
