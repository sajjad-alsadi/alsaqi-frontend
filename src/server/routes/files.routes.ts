/**
 * File Routes
 *
 * POST /api/files/upload - Upload a file to object storage via temp bucket.
 * GET /api/files/:fileId/download - Download a file via presigned URL redirect.
 *
 * Accepts multipart file upload, validates with file-validation module,
 * streams to temp bucket, computes SHA-256, creates FileRecord,
 * enqueues process-file job, returns 202 Accepted with jobId.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 3.1, 3.2, 3.4, 3.5, 3.6, 11.5
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler } from '../utils/asyncHandler';
import { validateFile } from '../utils/file-validation';
import { StorageService, UploadTimeoutError } from '../services/storage.service';
import { QueueService } from '../services/queue.service';
import { generateStorageKey, type EntityRef } from '../utils/storage-key';
import { AuthService } from '../services/AuthService';
import { db } from '../db/index';
import logger from '../utils/logger';
import type { BucketName, FileStatus } from '../../models/file-record.model';
import { ADMIN_ROLES } from '../../constants';

// ─── Types ───────────────────────────────────────────────────────────────────

interface UploadRequestBody {
  entityType?: string;
  entityId?: string;
}

// ─── Route Factory ───────────────────────────────────────────────────────────

export function createFileRoutes(
  authenticate: any,
  storageService: StorageService,
  queueService: QueueService,
  logError: any,
) {
  const router = Router();

  /**
   * POST /upload
   *
   * Accepts a multipart file upload. Validates the file, streams to the
   * MinIO temp bucket, computes SHA-256 checksum, creates a FileRecord,
   * and enqueues a process-file background job.
   *
   * Returns 202 Accepted with { jobId, fileId }.
   * Returns 400 for validation failures.
   * Returns 503 if MinIO is unreachable.
   */
  router.post('/upload', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id as string;
    const username = (req as any).user.username as string;

    // ── 1. Check for uploaded file ─────────────────────────────────────────
    const files = (req as any).files;
    if (!files || !files.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file provided. Upload a file with field name "file".' },
      });
    }

    const uploadedFile = files.file;

    // Reject multiple files (array means multiple were uploaded)
    if (Array.isArray(uploadedFile)) {
      return res.status(400).json({
        success: false,
        error: { code: 'MULTIPLE_FILES', message: 'Only a single file upload is supported.' },
      });
    }

    // ── 2. Parse request body for entity association ───────────────────────
    const body: UploadRequestBody = req.body || {};
    const entityType = body.entityType as string | undefined;
    const entityId = body.entityId as string | undefined;

    // Determine the target bucket based on entity type
    const targetBucket: BucketName = resolveTargetBucket(entityType);

    // ── 3. Validate file using the file-validation module ──────────────────
    const validationResult = await validateFile({
      buffer: uploadedFile.data,
      filename: uploadedFile.name,
      declaredContentType: uploadedFile.mimetype,
      bucket: targetBucket,
    });

    if (!validationResult.valid) {
      await logAuditTrail(username, 'UPLOAD', 'Files', null, 'failure', validationResult.errors.map(e => e.message).join('; '));
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'File validation failed.',
          details: validationResult.errors,
        },
      });
    }

    // ── 4. Compute SHA-256 checksum ────────────────────────────────────────
    const checksum = crypto
      .createHash('sha256')
      .update(uploadedFile.data)
      .digest('hex');

    // ── 5. Generate storage key ────────────────────────────────────────────
    const entityRef: EntityRef | undefined = (entityType && entityId)
      ? { type: entityType as EntityRef['type'], id: entityId }
      : undefined;

    // Use a default entity ref for unassociated uploads
    const effectiveEntityRef: EntityRef = entityRef ?? { type: 'audit', id: 'unassociated' };
    const storageKey = generateStorageKey(effectiveEntityRef, uploadedFile.name);
    const tempKey = `pending/${storageKey}`;

    // ── 6. Stream file to temp bucket ──────────────────────────────────────
    try {
      await storageService.upload({
        key: tempKey,
        body: uploadedFile.data,
        contentType: validationResult.detectedMimeType || uploadedFile.mimetype,
        bucket: 'temp',
        metadata: { checksum, uploadedBy: userId },
      });
    } catch (error: any) {
      // If upload timed out (Requirement 9.4): update FileRecord to failed
      if (error instanceof UploadTimeoutError) {
        logger.error('[FileUpload] Upload timed out, marking file as failed', {
          key: tempKey,
          timeoutMs: error.timeoutMs,
        });
        await logAuditTrail(username, 'UPLOAD', 'Files', null, 'failure', `Upload timed out after ${error.timeoutMs}ms`);
        return res.status(408).json({
          success: false,
          error: {
            code: 'UPLOAD_TIMEOUT',
            message: `File upload exceeded the maximum allowed time (${error.timeoutMs / 1000}s). Please try again with a smaller file or better connection.`,
          },
        });
      }

      // If MinIO is unreachable, return 503
      if (isStorageUnavailableError(error)) {
        logger.error('[FileUpload] MinIO unreachable during upload', { error: error.message });
        await logAuditTrail(username, 'UPLOAD', 'Files', null, 'failure', 'Storage temporarily unavailable');
        return res.status(503).json({
          success: false,
          error: {
            code: 'STORAGE_UNAVAILABLE',
            message: 'Storage is temporarily unavailable. Please retry your upload.',
          },
        });
      }
      throw error;
    }

    // ── 7. Create FileRecord in PostgreSQL ─────────────────────────────────
    const fileId = uuidv4();
    const now = new Date();
    const sanitizedName = sanitizeOriginalName(uploadedFile.name);
    const contentType = validationResult.detectedMimeType || uploadedFile.mimetype;
    const fileSize = uploadedFile.data.length;

    await db.prepare(`
      INSERT INTO files (id, original_name, storage_key, bucket, content_type, size, checksum, uploaded_by, associated_entity, associated_entity_type, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fileId,
      sanitizedName,
      storageKey,
      targetBucket,
      contentType,
      fileSize,
      checksum,
      userId,
      entityId || null,
      entityType || null,
      'uploading' satisfies FileStatus,
      now.toISOString(),
      now.toISOString(),
    );

    // ── 8. Enqueue process-file job ────────────────────────────────────────
    const jobRef = await queueService.enqueue('process-file', {
      tempKey,
      targetBucket,
      metadata: {
        fileId,
        storageKey,
        checksum,
        contentType,
      },
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    // ── 9. Log to audit trail ──────────────────────────────────────────────
    await logAuditTrail(username, 'UPLOAD', 'Files', fileId, 'success', `Uploaded file: ${sanitizedName}`);

    // ── 10. Return 202 Accepted ────────────────────────────────────────────
    logger.info('[FileUpload] File accepted for processing', {
      fileId,
      jobId: jobRef.jobId,
      filename: sanitizedName,
      size: fileSize,
    });

    return res.status(202).json({
      success: true,
      message: 'File accepted for processing',
      jobId: jobRef.jobId,
      fileId,
    });
  }));

  /**
   * GET /:fileId/download
   *
   * Downloads a file by generating a presigned URL and redirecting (302).
   * Only files with status 'ready' can be downloaded.
   *
   * Returns 302 redirect to presigned URL on success.
   * Returns 404 if file not found or not ready.
   * Returns 403 if user not authorized to access this file.
   *
   * Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 11.5
   */
  router.get('/:fileId/download', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id as string;
    const username = (req as any).user.username as string;
    const userRole = (req as any).user.role as string;
    const fileId = req.params.fileId;

    // ── 1. Look up FileRecord by fileId ────────────────────────────────────
    const fileRecord = await db.prepare(`
      SELECT id, original_name, storage_key, bucket, content_type, size, checksum, uploaded_by, associated_entity, associated_entity_type, status, created_at, updated_at
      FROM files WHERE id = ?
    `).get(fileId) as any;

    // ── 2. If not found: return 404 ────────────────────────────────────────
    if (!fileRecord) {
      await logAuditTrail(username, 'DOWNLOAD', 'Files', fileId, 'failure', 'File not found');
      return res.status(404).json({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: 'File not found.' },
      });
    }

    // ── 3. If status !== 'ready': return 404 ───────────────────────────────
    if (fileRecord.status !== 'ready') {
      await logAuditTrail(username, 'DOWNLOAD', 'Files', fileId, 'failure', `File not available for download (status: ${fileRecord.status})`);
      return res.status(404).json({
        success: false,
        error: { code: 'FILE_NOT_AVAILABLE', message: 'File not available for download.' },
      });
    }

    // ── 4. Authorization: file belongs to user or user has admin role ──────
    const isOwner = fileRecord.uploaded_by === userId;
    const isAdmin = ADMIN_ROLES.includes(userRole as any);

    if (!isOwner && !isAdmin) {
      await logAuditTrail(username, 'DOWNLOAD', 'Files', fileId, 'failure', 'Insufficient permissions');
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions to access this file.' },
      });
    }

    // ── 5. Generate presigned URL ──────────────────────────────────────────
    const presignedUrl = await storageService.getPresignedUrl(
      fileRecord.storage_key,
      fileRecord.bucket as BucketName,
      3600,
    );

    // ── 6. Log download to audit trail ─────────────────────────────────────
    await logAuditTrail(username, 'DOWNLOAD', 'Files', fileId, 'success', `Downloaded file: ${fileRecord.original_name}`);

    logger.info('[FileDownload] Presigned URL generated', {
      fileId,
      userId,
      filename: fileRecord.original_name,
    });

    // ── 7. Redirect 302 to presigned URL ───────────────────────────────────
    return res.redirect(302, presignedUrl);
  }));

  return router;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Resolves the target bucket based on entity type.
 * Defaults to 'evidence' for most upload scenarios.
 */
function resolveTargetBucket(entityType?: string): BucketName {
  if (entityType === 'report') return 'reports';
  return 'evidence';
}

/**
 * Sanitizes the original filename for storage in the database.
 * Removes path separators and null bytes, trims to 255 chars.
 */
function sanitizeOriginalName(filename: string): string {
  let sanitized = filename;
  sanitized = sanitized.replace(/\0/g, '');
  sanitized = sanitized.replace(/\\/g, '');
  sanitized = sanitized.replace(/\//g, '');
  if (sanitized.length > 255) {
    sanitized = sanitized.slice(0, 255);
  }
  return sanitized;
}

/**
 * Determines if an error indicates that MinIO/storage is unreachable.
 */
function isStorageUnavailableError(error: any): boolean {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  const code = (error.code || '').toLowerCase();
  const name = (error.name || '').toLowerCase();

  return (
    code === 'econnrefused' ||
    code === 'econnreset' ||
    code === 'etimedout' ||
    code === 'enotfound' ||
    name === 'networkingerror' ||
    message.includes('connect econnrefused') ||
    message.includes('network') ||
    message.includes('socket hang up') ||
    message.includes('timeout') ||
    message.includes('unreachable')
  );
}

/**
 * Logs a file operation to the audit trail.
 * Requirement: 11.5
 */
async function logAuditTrail(
  username: string,
  operation: string,
  module: string,
  fileId: string | null,
  outcome: 'success' | 'failure',
  details: string,
): Promise<void> {
  try {
    const logDetails = fileId
      ? `[${outcome}] File ${fileId}: ${details}`
      : `[${outcome}] ${details}`;
    await AuthService.logAudit(username, operation, module, logDetails);
  } catch (error) {
    // Don't let audit logging failures break the main flow
    logger.error('[FileUpload] Failed to log audit trail', { error, operation, fileId });
  }
}
