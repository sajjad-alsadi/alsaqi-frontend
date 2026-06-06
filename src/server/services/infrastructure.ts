/**
 * Infrastructure Bootstrap Module
 *
 * Initializes and exports all infrastructure services for the ALSAQI backend:
 * - CertificateManager: TLS certificate loading, rotation, and expiry checks
 * - StorageService: MinIO S3-compatible object storage abstraction
 * - QueueService: BullMQ job queue with Redis connection
 * - WorkerManager: Background job processors with lifecycle management
 *
 * Services are created lazily (on first call to initializeInfrastructure) and
 * exported as singletons for use across routes and middleware.
 *
 * Requirements: 7.1, 8.2
 */

import logger from '../utils/logger.js';
import { CertificateManager } from './certificate-manager.js';
import { StorageService } from './storage.service.js';
import { QueueService } from './queue.service.js';
import { WorkerManager } from './worker-manager.js';
import { processFileWorker } from '../workers/process-file.worker.js';
import { generatePdfWorker } from '../workers/generate-pdf.worker.js';
import { cleanupTempWorker } from '../workers/cleanup-temp.worker.js';
import { db } from '../db/index.js';

// ─── Singleton Service Instances ─────────────────────────────────────────────

let certificateManager: CertificateManager | null = null;
let storageService: StorageService | null = null;
let queueService: QueueService | null = null;
let workerManager: WorkerManager | null = null;
let initialized = false;

// ─── Getters (safe access with initialization guard) ─────────────────────────

/**
 * Returns the CertificateManager singleton.
 * Throws if infrastructure has not been initialized.
 */
export function getCertificateManager(): CertificateManager {
  if (!certificateManager) {
    throw new Error('[Infrastructure] CertificateManager not initialized. Call initializeInfrastructure() first.');
  }
  return certificateManager;
}

/**
 * Returns the StorageService singleton.
 * Throws if infrastructure has not been initialized.
 */
export function getStorageService(): StorageService {
  if (!storageService) {
    throw new Error('[Infrastructure] StorageService not initialized. Call initializeInfrastructure() first.');
  }
  return storageService;
}

/**
 * Returns the QueueService singleton.
 * Throws if infrastructure has not been initialized.
 */
export function getQueueService(): QueueService {
  if (!queueService) {
    throw new Error('[Infrastructure] QueueService not initialized. Call initializeInfrastructure() first.');
  }
  return queueService;
}

/**
 * Returns the WorkerManager singleton.
 * Throws if infrastructure has not been initialized.
 */
export function getWorkerManager(): WorkerManager {
  if (!workerManager) {
    throw new Error('[Infrastructure] WorkerManager not initialized. Call initializeInfrastructure() first.');
  }
  return workerManager;
}

/**
 * Returns true if infrastructure services have been initialized.
 */
export function isInfrastructureReady(): boolean {
  return initialized;
}

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Initializes all infrastructure services in the correct dependency order:
 *
 * 1. CertificateManager — loads TLS certs, starts file watchers
 * 2. StorageService — S3 client with CertificateManager for TLS
 * 3. QueueService — Redis/BullMQ with CertificateManager for TLS
 * 4. WorkerManager — registers processors, starts workers
 * 5. Schedule repeatable jobs (cleanup-temp)
 * 6. Start certificate expiry checks (daily)
 *
 * This function is idempotent — calling it multiple times has no effect
 * after the first successful initialization.
 */
export async function initializeInfrastructure(): Promise<void> {
  if (initialized) {
    logger.info('[Infrastructure] Already initialized, skipping.');
    return;
  }

  logger.info('[Infrastructure] Initializing infrastructure services...');

  try {
    // ── Step 1: CertificateManager ─────────────────────────────────────────
    logger.info('[Infrastructure] Step 1/6: Initializing CertificateManager...');
    certificateManager = new CertificateManager();
    certificateManager.startWatching();
    logger.info('[Infrastructure] CertificateManager initialized and watching cert files.');

    // ── Step 2: StorageService ─────────────────────────────────────────────
    logger.info('[Infrastructure] Step 2/6: Initializing StorageService...');
    storageService = new StorageService(undefined, certificateManager);
    logger.info('[Infrastructure] StorageService initialized with MinIO client.');

    // ── Step 3: QueueService ───────────────────────────────────────────────
    logger.info('[Infrastructure] Step 3/6: Initializing QueueService...');
    queueService = new QueueService(undefined, undefined, certificateManager);
    logger.info('[Infrastructure] QueueService initialized with Redis connection.');

    // ── Step 4: WorkerManager ──────────────────────────────────────────────
    logger.info('[Infrastructure] Step 4/6: Initializing WorkerManager and registering processors...');
    workerManager = new WorkerManager(queueService, {
      storage: storageService,
      db,
    });

    // Register all job processors
    workerManager.registerProcessor('process-file', processFileWorker);
    workerManager.registerProcessor('generate-pdf', generatePdfWorker);
    workerManager.registerProcessor('cleanup-temp', cleanupTempWorker);
    // send-notification is a placeholder — registered as a no-op until implemented
    workerManager.registerProcessor('send-notification', async (job, context) => {
      context.logger.info('[send-notification] Placeholder processor invoked', {
        jobId: job.id,
        data: job.data,
      });
      await context.reportProgress(100);
    });

    logger.info('[Infrastructure] All processors registered.');

    // ── Step 5: Start Workers ──────────────────────────────────────────────
    logger.info('[Infrastructure] Step 5/6: Starting workers...');
    await workerManager.start();
    logger.info('[Infrastructure] Workers started successfully.');

    // ── Step 6: Schedule repeatable jobs and start expiry checks ────────────
    logger.info('[Infrastructure] Step 6/6: Scheduling repeatable jobs and starting expiry checks...');
    await queueService.scheduleRepeatableJobs();
    certificateManager.startExpiryChecks();
    logger.info('[Infrastructure] Repeatable jobs scheduled and certificate expiry checks started.');

    initialized = true;
    logger.info('[Infrastructure] All infrastructure services initialized successfully.');
  } catch (error) {
    logger.error('[Infrastructure] Failed to initialize infrastructure services', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Clean up any partially initialized services
    await shutdownInfrastructure();
    throw error;
  }
}

// ─── Shutdown ────────────────────────────────────────────────────────────────

/**
 * Gracefully shuts down all infrastructure services in reverse order:
 *
 * 1. Stop certificate expiry checks
 * 2. Stop certificate file watchers
 * 3. Drain and stop workers (with timeout)
 * 4. Close queue connections
 * 5. (StorageService has no persistent connections to close)
 *
 * Called during SIGTERM handling for graceful shutdown.
 */
export async function shutdownInfrastructure(): Promise<void> {
  logger.info('[Infrastructure] Shutting down infrastructure services...');

  // Stop certificate expiry checks
  if (certificateManager) {
    try {
      certificateManager.stopExpiryChecks();
      certificateManager.stopWatching();
      logger.info('[Infrastructure] CertificateManager stopped.');
    } catch (error) {
      logger.error('[Infrastructure] Error stopping CertificateManager', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Drain workers
  if (workerManager) {
    try {
      await workerManager.shutdown();
      logger.info('[Infrastructure] WorkerManager shut down.');
    } catch (error) {
      logger.error('[Infrastructure] Error shutting down WorkerManager', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Close queue service (Redis connections)
  if (queueService) {
    try {
      await queueService.close();
      logger.info('[Infrastructure] QueueService closed.');
    } catch (error) {
      logger.error('[Infrastructure] Error closing QueueService', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  initialized = false;
  certificateManager = null;
  storageService = null;
  queueService = null;
  workerManager = null;

  logger.info('[Infrastructure] All infrastructure services shut down.');
}
