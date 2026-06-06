/**
 * FileRecord Model
 *
 * Represents a file stored in MinIO object storage.
 * Tracks metadata, integrity info, and lifecycle status.
 *
 * Requirements: 1.5, 1.7
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type BucketName = 'evidence' | 'reports' | 'temp' | 'backups';

export type FileStatus = 'uploading' | 'processing' | 'ready' | 'failed' | 'deleted';

export type AssociatedEntityType = 'audit' | 'finding' | 'recommendation' | 'report';

// ─── Interface ───────────────────────────────────────────────────────────────

export interface FileRecord {
  id: string;                         // UUID v4
  originalName: string;               // User-provided filename (max 255 chars)
  storageKey: string;                 // MinIO object key (path within bucket)
  bucket: BucketName;                 // Target bucket
  contentType: string;                // MIME type
  size: number;                       // Bytes (positive)
  checksum: string;                   // SHA-256 hash (64-char hex string)
  encryptionKeyId?: string;           // Reference to encryption key (if encrypted)
  uploadedBy: string;                 // User ID
  associatedEntity?: string;          // e.g., "audit:abc123"
  associatedEntityType?: AssociatedEntityType;
  status: FileStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Validation ──────────────────────────────────────────────────────────────

/** Maximum allowed filename length in characters */
export const MAX_FILENAME_LENGTH = 255;

/** SHA-256 checksum hex string length */
export const CHECKSUM_LENGTH = 64;

/** Regex for a valid SHA-256 hex string (exactly 64 lowercase hex chars) */
const CHECKSUM_REGEX = /^[0-9a-f]{64}$/;

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validates that a filename does not exceed the maximum length
 * and does not contain path traversal sequences.
 */
export function validateFilename(filename: string): ValidationError | null {
  if (!filename || filename.length === 0) {
    return { field: 'originalName', message: 'Filename must not be empty' };
  }
  if (filename.length > MAX_FILENAME_LENGTH) {
    return {
      field: 'originalName',
      message: `Filename must not exceed ${MAX_FILENAME_LENGTH} characters (got ${filename.length})`,
    };
  }
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\') || filename.includes('\0')) {
    return {
      field: 'originalName',
      message: 'Filename contains invalid path traversal characters',
    };
  }
  return null;
}

/**
 * Validates that a checksum is a valid SHA-256 hex string (64 lowercase hex characters).
 */
export function validateChecksum(checksum: string): ValidationError | null {
  if (!checksum || checksum.length === 0) {
    return { field: 'checksum', message: 'Checksum must not be empty' };
  }
  if (!CHECKSUM_REGEX.test(checksum)) {
    return {
      field: 'checksum',
      message: 'Checksum must be a valid SHA-256 hex string (64 lowercase hex characters)',
    };
  }
  return null;
}

/**
 * Validates that a file size is a positive number.
 */
export function validateFileSize(size: number): ValidationError | null {
  if (typeof size !== 'number' || !Number.isFinite(size)) {
    return { field: 'size', message: 'Size must be a finite number' };
  }
  if (size <= 0) {
    return { field: 'size', message: 'Size must be positive (got ' + size + ')' };
  }
  if (!Number.isInteger(size)) {
    return { field: 'size', message: 'Size must be an integer (whole bytes)' };
  }
  return null;
}

/**
 * Validates all fields of a FileRecord creation payload.
 * Returns an array of validation errors (empty if valid).
 */
export function validateFileRecord(
  record: Pick<FileRecord, 'originalName' | 'checksum' | 'size'>
): ValidationError[] {
  const errors: ValidationError[] = [];

  const filenameError = validateFilename(record.originalName);
  if (filenameError) errors.push(filenameError);

  const checksumError = validateChecksum(record.checksum);
  if (checksumError) errors.push(checksumError);

  const sizeError = validateFileSize(record.size);
  if (sizeError) errors.push(sizeError);

  return errors;
}
