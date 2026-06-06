/**
 * Process-File Worker
 *
 * Background job processor that moves files from the temp bucket to permanent
 * storage with integrity verification. Handles the complete file lifecycle:
 * uploading → processing → ready (or failed).
 *
 * Key behaviors:
 * - Verifies temp file exists (fails without retry if missing)
 * - Copies file from temp to permanent bucket (idempotent)
 * - Verifies SHA-256 checksum after copy (deletes corrupted file on mismatch)
 * - Deletes temp file on success
 * - Reports progress monotonically at each step (0–100)
 * - Retry up to 3 times with exponential backoff (2000ms base)
 * - Idempotent processing (no duplicate objects or records on retry)
 *
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 5.3, 9.5, 9.7
 */

import { createHash } from 'crypto';
import { UnrecoverableError } from 'bullmq';
import { Readable } from 'stream';
import { type JobProcessor } from '../services/worker-manager.js';

/**
 * Collects a Readable stream into a Buffer.
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Computes SHA-256 checksum of a Buffer, returned as a 64-char lowercase hex string.
 */
function computeSHA256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Process-file worker processor.
 *
 * Algorithm:
 * 1. Extract job data: { tempKey, targetBucket, metadata: { fileId, storageKey, checksum, contentType } }
 * 2. Verify temp file exists — if missing, throw UnrecoverableError (no retry)
 * 3. Report progress(10)
 * 4. Update FileRecord status to 'processing'
 * 5. Copy file from temp to permanent (with idempotency check)
 * 6. Report progress(50)
 * 7. Download copied file and compute SHA-256 checksum
 * 8. If checksum mismatch: delete corrupted file, update FileRecord to 'failed', throw error
 * 9. Report progress(70)
 * 10. Delete temp file
 * 11. Report progress(80)
 * 12. Update FileRecord status to 'ready'
 * 13. Report progress(100)
 *
 * Idempotency: Before copying, checks if file already exists in permanent bucket
 * with correct checksum. If so, skips the copy step.
 */
const processFileWorker: JobProcessor<'process-file'> = async (job, context) => {
  const { tempKey, targetBucket, metadata } = job.data;
  const { storage, db, logger, reportProgress } = context;
  const { fileId, storageKey, checksum } = metadata;

  logger.info('[process-file] Starting file processing', {
    jobId: job.id,
    fileId,
    tempKey,
    targetBucket,
    storageKey,
  });

  // ─── Step 1–2: Verify temp file exists ───────────────────────────────────────
  // If the temp file is missing, this is an unrecoverable error (no retry).
  // Requirement 2.8: fail without retry if source file not found.
  const tempExists = await storage.exists(tempKey, 'temp');
  if (!tempExists) {
    logger.error('[process-file] Temp file not found — unrecoverable', {
      jobId: job.id,
      fileId,
      tempKey,
    });

    // Update FileRecord to failed
    await updateFileStatus(db, fileId, 'failed');

    throw new UnrecoverableError(
      `Temp file not found: ${tempKey}. Source file missing — cannot process.`,
    );
  }

  // ─── Step 3: Report progress(10) ────────────────────────────────────────────
  await reportProgress(10);

  // ─── Step 4: Update FileRecord status to 'processing' ───────────────────────
  // Idempotency: only update if current status is 'uploading' (not already processing/ready)
  // Requirement 2.2: set status to processing before copy
  const currentRecord = await getFileRecord(db, fileId);
  if (currentRecord && currentRecord.status === 'uploading') {
    await updateFileStatus(db, fileId, 'processing');
  }

  // ─── Step 5: Copy from temp to permanent bucket ──────────────────────────────
  // Idempotency: check if permanent file already exists with correct checksum before copying
  // Requirement 9.5: no duplicate objects on retry
  let skipCopy = false;
  const permanentExists = await storage.exists(storageKey, targetBucket);
  if (permanentExists) {
    // Verify the existing file's checksum matches expected
    const existingStream = await storage.download(storageKey, targetBucket);
    const existingBuffer = await streamToBuffer(existingStream);
    const existingChecksum = computeSHA256(existingBuffer);

    if (existingChecksum === checksum) {
      skipCopy = true;
      logger.info('[process-file] Permanent file already exists with correct checksum (idempotent skip)', {
        jobId: job.id,
        fileId,
        storageKey,
      });
    } else {
      // Existing file is corrupted — delete and re-copy
      logger.warn('[process-file] Permanent file exists but checksum mismatch — re-copying', {
        jobId: job.id,
        fileId,
        storageKey,
        expected: checksum,
        actual: existingChecksum,
      });
      await storage.delete(storageKey, targetBucket);
    }
  }

  if (!skipCopy) {
    await storage.copy(tempKey, storageKey, 'temp', targetBucket);
    logger.info('[process-file] File copied to permanent bucket', {
      jobId: job.id,
      fileId,
      storageKey,
      targetBucket,
    });
  }

  // ─── Step 6: Report progress(50) ────────────────────────────────────────────
  await reportProgress(50);

  // ─── Step 7: Download copied file and compute SHA-256 checksum ───────────────
  // Requirement 2.3: verify checksum matches original upload checksum
  // If we skipped copy because checksum already matched, we can skip re-verification
  if (!skipCopy) {
    const copiedStream = await storage.download(storageKey, targetBucket);
    const copiedBuffer = await streamToBuffer(copiedStream);
    const copiedChecksum = computeSHA256(copiedBuffer);

    // ─── Step 8: Checksum mismatch handling ──────────────────────────────────────
    // Requirement 2.4: delete corrupted file, mark job failed, set FileRecord to 'failed'
    // Retain temp file for investigation (requirement 9.7)
    if (copiedChecksum !== checksum) {
      logger.error('[process-file] Checksum mismatch — file corrupted in transit', {
        jobId: job.id,
        fileId,
        expected: checksum,
        actual: copiedChecksum,
      });

      await storage.delete(storageKey, targetBucket);
      await updateFileStatus(db, fileId, 'failed');

      throw new Error(
        `Checksum mismatch after copy: expected ${checksum}, got ${copiedChecksum}. Corrupted file deleted from permanent bucket.`,
      );
    }
  }

  // ─── Step 9: Report progress(70) ────────────────────────────────────────────
  await reportProgress(70);

  // ─── Step 10: Delete temp file ───────────────────────────────────────────────
  // Requirement 2.5: delete temp file on success
  await storage.delete(tempKey, 'temp');

  // ─── Step 11: Report progress(80) ───────────────────────────────────────────
  await reportProgress(80);

  logger.info('[process-file] Temp file deleted', {
    jobId: job.id,
    fileId,
    tempKey,
  });

  // ─── Step 12: Update FileRecord status to 'ready' ───────────────────────────
  // Idempotency: only update if not already 'ready'
  // Requirement 2.5: update FileRecord status to ready on success
  const recordBeforeReady = await getFileRecord(db, fileId);
  if (recordBeforeReady && recordBeforeReady.status !== 'ready') {
    await updateFileStatus(db, fileId, 'ready');
  }

  // ─── Step 13: Report progress(100) ──────────────────────────────────────────
  await reportProgress(100);

  logger.info('[process-file] File processing complete', {
    jobId: job.id,
    fileId,
    storageKey,
    targetBucket,
  });
};

// ─── Database helper functions ───────────────────────────────────────────────
// These interact with the db client passed via WorkerContext.
// The db client is typed as `unknown` in WorkerContext, so we use
// a duck-typing approach compatible with the project's database layer.

interface FileRecordRow {
  id: string;
  status: string;
}

/**
 * Retrieves a FileRecord from the database by ID.
 * Returns null if not found.
 */
async function getFileRecord(db: unknown, fileId: string): Promise<FileRecordRow | null> {
  const dbClient = db as {
    query?: (text: string, params: unknown[]) => Promise<{ rows: FileRecordRow[] }>;
  };

  if (dbClient && typeof dbClient.query === 'function') {
    const result = await dbClient.query(
      'SELECT id, status FROM files WHERE id = $1',
      [fileId],
    );
    return result.rows[0] ?? null;
  }

  return null;
}

/**
 * Updates the FileRecord status and updatedAt timestamp.
 */
async function updateFileStatus(
  db: unknown,
  fileId: string,
  status: string,
): Promise<void> {
  const dbClient = db as {
    query?: (text: string, params: unknown[]) => Promise<unknown>;
  };

  if (dbClient && typeof dbClient.query === 'function') {
    await dbClient.query(
      'UPDATE files SET status = $1, "updatedAt" = NOW() WHERE id = $2',
      [status, fileId],
    );
  }
}

export { processFileWorker };
export default processFileWorker;
