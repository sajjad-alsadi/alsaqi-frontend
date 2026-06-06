import path from 'path';
import logger from './logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export type BucketName = 'evidence' | 'reports' | 'temp' | 'backups';

export interface FileValidationInput {
  /** File content as a Buffer */
  buffer: Buffer;
  /** Original filename as provided by the user */
  filename: string;
  /** MIME type declared by the client (e.g., from Content-Type header) */
  declaredContentType: string;
  /** Target storage bucket */
  bucket: BucketName;
}

export interface FileValidationResult {
  valid: boolean;
  /** Detected MIME type from content inspection (null if detection failed) */
  detectedMimeType: string | null;
  /** List of validation errors; empty when valid */
  errors: FileValidationError[];
}

export interface FileValidationError {
  code: FileValidationErrorCode;
  message: string;
}

export type FileValidationErrorCode =
  | 'MIME_NOT_ALLOWED'
  | 'MIME_EXTENSION_MISMATCH'
  | 'MIME_DETECTION_FAILED'
  | 'FILE_TOO_LARGE'
  | 'FILE_EMPTY'
  | 'FILENAME_TOO_LONG'
  | 'FILENAME_PATH_TRAVERSAL';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Allowed MIME types for all buckets */
export const ALLOWED_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/gif',
] as const;

/** Per-bucket maximum file size in bytes */
export const BUCKET_MAX_SIZE: Record<BucketName, number> = {
  evidence: 50 * 1024 * 1024,   // 50 MB
  reports: 100 * 1024 * 1024,   // 100 MB
  temp: 100 * 1024 * 1024,      // 100 MB
  backups: 100 * 1024 * 1024,   // 100 MB
};

/** Maximum filename length in characters */
export const MAX_FILENAME_LENGTH = 255;

/**
 * Mapping from magika detection labels to MIME types.
 * Magika returns labels like 'pdf', 'png', 'docx', etc.
 */
const MAGIKA_LABEL_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  // zip-based formats (docx, xlsx are internally zip)
  zip: 'application/zip',
};

/**
 * Mapping from file extensions to expected MIME types.
 * Used to validate that detected MIME matches the file extension.
 */
const EXTENSION_TO_MIME: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.gif': ['image/gif'],
};

/**
 * Some formats (docx, xlsx) are zip-based, so magika may report 'zip'.
 * We allow 'zip' detection for these extensions.
 */
const ZIP_BASED_EXTENSIONS = new Set(['.docx', '.xlsx']);

// ─── Magika Singleton ────────────────────────────────────────────────────────

let magikaInstance: any = null;
let magikaInitPromise: Promise<void> | null = null;

async function getMagikaInstance(): Promise<any> {
  if (magikaInstance) return magikaInstance;

  if (!magikaInitPromise) {
    magikaInitPromise = (async () => {
      try {
        const { Magika } = await import('magika');
        const m = await Magika.create();
        magikaInstance = m;
        logger.info('[FileValidation] Magika content inspector initialized.');
      } catch (e) {
        logger.error('[FileValidation] Failed to initialize Magika:', e);
        magikaInstance = null;
      }
    })();
  }

  await magikaInitPromise;
  return magikaInstance;
}

// ─── Core Validation Function ────────────────────────────────────────────────

/**
 * Validates a file for upload by checking:
 * 1. File size (> 0 and ≤ bucket max)
 * 2. Filename length (≤ 255 chars) and path traversal prevention
 * 3. Content-based MIME detection via magika
 * 4. Detected MIME against allowed list
 * 5. Detected MIME matches declared file extension
 *
 * @param input - File validation input parameters
 * @returns Structured validation result with pass/fail and specific errors
 */
export async function validateFile(input: FileValidationInput): Promise<FileValidationResult> {
  const { buffer, filename, declaredContentType, bucket } = input;
  const errors: FileValidationError[] = [];

  // ── 1. Validate file size ──────────────────────────────────────────────────
  if (buffer.length === 0) {
    errors.push({
      code: 'FILE_EMPTY',
      message: 'File is empty (0 bytes). Files must contain content.',
    });
  } else {
    const maxSize = BUCKET_MAX_SIZE[bucket];
    if (buffer.length > maxSize) {
      const maxMB = Math.round(maxSize / (1024 * 1024));
      const actualMB = (buffer.length / (1024 * 1024)).toFixed(2);
      errors.push({
        code: 'FILE_TOO_LARGE',
        message: `File size (${actualMB} MB) exceeds the maximum allowed size (${maxMB} MB) for bucket "${bucket}".`,
      });
    }
  }

  // ── 2. Validate filename ───────────────────────────────────────────────────
  if (filename.length > MAX_FILENAME_LENGTH) {
    errors.push({
      code: 'FILENAME_TOO_LONG',
      message: `Filename exceeds maximum length of ${MAX_FILENAME_LENGTH} characters (actual: ${filename.length}).`,
    });
  }

  if (containsPathTraversal(filename)) {
    errors.push({
      code: 'FILENAME_PATH_TRAVERSAL',
      message: 'Filename contains path traversal sequences (../, ..\\\, //, or null bytes) which are not allowed.',
    });
  }

  // ── 3. Content-based MIME detection via magika ─────────────────────────────
  let detectedMimeType: string | null = null;

  const magika = await getMagikaInstance();
  if (!magika) {
    errors.push({
      code: 'MIME_DETECTION_FAILED',
      message: 'Content inspection service (magika) is unavailable. File type could not be verified.',
    });

    return { valid: errors.length === 0, detectedMimeType, errors };
  }

  try {
    const bytes = new Uint8Array(buffer);
    const result = await magika.identifyBytes(bytes);
    const label = result?.prediction?.output?.label;

    if (!label || label === 'unknown' || label === 'empty') {
      errors.push({
        code: 'MIME_DETECTION_FAILED',
        message: `Content inspection could not determine the file type (detected: ${label || 'none'}). Upload rejected.`,
      });

      return { valid: errors.length === 0, detectedMimeType, errors };
    }

    // Resolve the detected label to a MIME type
    detectedMimeType = MAGIKA_LABEL_TO_MIME[label] || `application/x-${label}`;

    // ── 4. Check detected MIME against allowed list ────────────────────────
    const ext = path.extname(filename).toLowerCase();
    const isZipBased = ZIP_BASED_EXTENSIONS.has(ext);

    // For zip-based formats, if magika detects 'zip', we use the extension's MIME instead
    let effectiveMimeType = detectedMimeType;
    if (isZipBased && label === 'zip') {
      const expectedMimes = EXTENSION_TO_MIME[ext];
      if (expectedMimes && expectedMimes.length > 0) {
        effectiveMimeType = expectedMimes[0];
      }
    }

    if (!ALLOWED_MIME_TYPES.includes(effectiveMimeType)) {
      errors.push({
        code: 'MIME_NOT_ALLOWED',
        message: `Detected content type "${effectiveMimeType}" (label: ${label}) is not in the allowed list. Accepted types: ${ALLOWED_MIME_TYPES.join(', ')}.`,
      });
    }

    // ── 5. Validate detected MIME matches file extension ──────────────────
    if (ext) {
      const expectedMimesForExt = EXTENSION_TO_MIME[ext];
      if (expectedMimesForExt) {
        const mimeMatchesExtension =
          expectedMimesForExt.includes(effectiveMimeType) ||
          (isZipBased && label === 'zip');

        if (!mimeMatchesExtension) {
          errors.push({
            code: 'MIME_EXTENSION_MISMATCH',
            message: `Detected content type "${effectiveMimeType}" (label: ${label}) does not match file extension "${ext}". Expected: ${expectedMimesForExt.join(' or ')}.`,
          });
        }
      } else {
        // Extension not in our known mapping - might be a mismatch
        errors.push({
          code: 'MIME_EXTENSION_MISMATCH',
          message: `File extension "${ext}" is not recognized. Cannot verify it matches detected content type "${effectiveMimeType}".`,
        });
      }
    }
  } catch (e: any) {
    logger.error('[FileValidation] Magika identification failed:', e);
    errors.push({
      code: 'MIME_DETECTION_FAILED',
      message: 'Content inspection failed unexpectedly. File type could not be verified.',
    });
  }

  return {
    valid: errors.length === 0,
    detectedMimeType,
    errors,
  };
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Checks if a filename contains path traversal sequences.
 * Detects: ../, ..\, //, null bytes (\0)
 */
export function containsPathTraversal(filename: string): boolean {
  if (filename.includes('\0')) return true;
  if (filename.includes('../')) return true;
  if (filename.includes('..\\')) return true;
  if (filename.includes('//')) return true;
  // Also catch bare '..' which could be used in path manipulation
  if (filename === '..' || filename.startsWith('..') && (filename[2] === '/' || filename[2] === '\\')) return true;
  return false;
}

/**
 * Resets the magika instance (useful for testing).
 * @internal
 */
export function _resetMagikaForTesting(): void {
  magikaInstance = null;
  magikaInitPromise = null;
}
