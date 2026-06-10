/**
 * File Upload Validator Utility
 *
 * Validates files before upload in an air-gapped banking environment:
 * - File size against configurable max (default 10MB, range 1-100MB)
 * - File extension against configurable whitelist
 * - MIME type against configurable whitelist
 * - MIME type mismatch detection via magic bytes (file header)
 *
 * Returns per-file validation results for multi-file uploads
 * (rejects only invalid files, valid files proceed).
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

// --- Types ---

export interface ValidatorOptions {
  /** Maximum file size in bytes. Default: 10MB (10 * 1024 * 1024). Range: 1MB–100MB. */
  maxSizeBytes?: number;
  /** Allowed file extensions (lowercase, with leading dot). e.g. ['.pdf', '.docx'] */
  allowedExtensions?: string[];
  /** Allowed MIME types. e.g. ['application/pdf', 'image/jpeg'] */
  allowedMimeTypes?: string[];
}

export interface ValidationError {
  code: 'FILE_TOO_LARGE' | 'DISALLOWED_EXTENSION' | 'DISALLOWED_MIME_TYPE' | 'MIME_EXTENSION_MISMATCH';
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  file: File;
  valid: boolean;
  errors: ValidationError[];
}

// --- Constants ---

const ONE_MB = 1024 * 1024;
const DEFAULT_MAX_SIZE_BYTES = 10 * ONE_MB;
const MIN_MAX_SIZE_BYTES = 1 * ONE_MB;
const MAX_MAX_SIZE_BYTES = 100 * ONE_MB;

/**
 * Known magic byte signatures for common file types.
 * Each entry maps a MIME type to its expected byte header prefix.
 */
const MAGIC_BYTES: ReadonlyArray<{ mime: string; bytes: number[]; extensions: string[] }> = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46], extensions: ['.pdf'] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff], extensions: ['.jpg', '.jpeg'] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47], extensions: ['.png'] },
  // DOCX, XLSX, PPTX are ZIP-based (PK signature)
  {
    mime: 'application/zip',
    bytes: [0x50, 0x4b, 0x03, 0x04],
    extensions: ['.docx', '.xlsx', '.pptx', '.zip'],
  },
  // XLS (OLE Compound Document)
  { mime: 'application/vnd.ms-excel', bytes: [0xd0, 0xcf, 0x11, 0xe0], extensions: ['.xls'] },
];

/**
 * Maps extensions to the MIME types that are compatible with them.
 * This is used for mismatch detection: if the detected header suggests a MIME
 * that doesn't match the extension, we flag it.
 */
const EXTENSION_MIME_COMPATIBILITY: Readonly<Record<string, readonly string[]>> = {
  '.pdf': ['application/pdf'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip'],
  '.xls': ['application/vnd.ms-excel'],
  '.zip': ['application/zip'],
};

// --- Default Allowed Types ---

/**
 * Returns sensible default allowed types for a banking audit application.
 * Includes PDF, DOCX, XLSX, JPG, PNG — common for audit evidence and reports.
 */
export function getDefaultAllowedTypes(): {
  extensions: string[];
  mimeTypes: string[];
} {
  return {
    extensions: ['.pdf', '.docx', '.xlsx', '.jpg', '.jpeg', '.png'],
    mimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
    ],
  };
}

// --- Internal Helpers ---

/**
 * Clamp maxSizeBytes to the allowed range [1MB, 100MB].
 */
function clampMaxSize(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_SIZE_BYTES;
  return Math.max(MIN_MAX_SIZE_BYTES, Math.min(MAX_MAX_SIZE_BYTES, value));
}

/**
 * Extract the file extension (lowercase, with dot) from a filename.
 * Returns empty string if no extension is present.
 */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot < 0) return '';
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Format bytes into a human-readable string (e.g. "10.5 MB").
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < ONE_MB) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / ONE_MB).toFixed(1)} MB`;
}

/**
 * Read the first N bytes of a file using FileReader and return as Uint8Array.
 */
function readFileHeader(file: File, numBytes: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const slice = file.slice(0, numBytes);
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        resolve(new Uint8Array(0));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Detect the MIME type from magic bytes. Returns the detected MIME or null if unknown.
 */
function detectMimeFromBytes(header: Uint8Array): string | null {
  for (const sig of MAGIC_BYTES) {
    if (header.length >= sig.bytes.length) {
      const match = sig.bytes.every((byte, i) => header[i] === byte);
      if (match) return sig.mime;
    }
  }
  return null;
}

/**
 * Check if a detected MIME (from magic bytes) is compatible with the file extension.
 * Returns true if compatible or if we can't determine compatibility (unknown extension).
 */
function isMimeCompatibleWithExtension(detectedMime: string, extension: string): boolean {
  const compatibleMimes = EXTENSION_MIME_COMPATIBILITY[extension];
  if (!compatibleMimes) {
    // Unknown extension — can't validate, allow through
    return true;
  }
  return compatibleMimes.includes(detectedMime);
}

// --- Synchronous Validation ---

/**
 * Validate file size (synchronous).
 */
function validateSize(file: File, maxSizeBytes: number): ValidationError | null {
  if (file.size > maxSizeBytes) {
    return {
      code: 'FILE_TOO_LARGE',
      message: `File size (${formatBytes(file.size)}) exceeds maximum allowed size (${formatBytes(maxSizeBytes)})`,
      details: {
        actualSize: file.size,
        maxSize: maxSizeBytes,
        actualSizeFormatted: formatBytes(file.size),
        maxSizeFormatted: formatBytes(maxSizeBytes),
      },
    };
  }
  return null;
}

/**
 * Validate file extension against the allowed list (synchronous).
 */
function validateExtension(file: File, allowedExtensions: string[]): ValidationError | null {
  const ext = getExtension(file.name);
  if (!ext || !allowedExtensions.includes(ext)) {
    return {
      code: 'DISALLOWED_EXTENSION',
      message: `File extension "${ext || '(none)'}" is not allowed. Allowed types: ${allowedExtensions.join(', ')}`,
      details: {
        actualExtension: ext || null,
        allowedExtensions,
      },
    };
  }
  return null;
}

/**
 * Validate MIME type against the allowed list (synchronous).
 */
function validateMimeType(file: File, allowedMimeTypes: string[]): ValidationError | null {
  if (!allowedMimeTypes.includes(file.type)) {
    return {
      code: 'DISALLOWED_MIME_TYPE',
      message: `MIME type "${file.type || '(unknown)'}" is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`,
      details: {
        actualMimeType: file.type || null,
        allowedMimeTypes,
      },
    };
  }
  return null;
}

// --- Main Validation Function ---

/**
 * Validate multiple files for upload.
 *
 * Performs per-file validation and returns individual results so that
 * only invalid files are rejected while valid files can proceed.
 *
 * Size and extension/MIME type checks are synchronous.
 * Magic bytes detection is async (requires FileReader).
 *
 * @param files - Array of File objects to validate
 * @param options - Optional configuration for validation rules
 * @returns Promise<ValidationResult[]> — one result per input file
 *
 * @example
 * ```ts
 * const results = await validateFiles(selectedFiles, {
 *   maxSizeBytes: 5 * 1024 * 1024, // 5MB
 *   allowedExtensions: ['.pdf', '.docx'],
 *   allowedMimeTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
 * });
 *
 * const validFiles = results.filter(r => r.valid).map(r => r.file);
 * const invalidFiles = results.filter(r => !r.valid);
 * ```
 */
export async function validateFiles(
  files: File[],
  options?: ValidatorOptions,
): Promise<ValidationResult[]> {
  const defaults = getDefaultAllowedTypes();
  const maxSizeBytes = clampMaxSize(options?.maxSizeBytes);
  const allowedExtensions = options?.allowedExtensions ?? defaults.extensions;
  const allowedMimeTypes = options?.allowedMimeTypes ?? defaults.mimeTypes;

  const results = await Promise.all(
    files.map(async (file): Promise<ValidationResult> => {
      const errors: ValidationError[] = [];

      // 1. Size check (synchronous)
      const sizeError = validateSize(file, maxSizeBytes);
      if (sizeError) errors.push(sizeError);

      // 2. Extension check (synchronous)
      const extError = validateExtension(file, allowedExtensions);
      if (extError) errors.push(extError);

      // 3. MIME type check (synchronous)
      const mimeError = validateMimeType(file, allowedMimeTypes);
      if (mimeError) errors.push(mimeError);

      // 4. Magic bytes mismatch detection (async)
      // Only perform if the file passed extension check (has a known extension)
      if (!extError && file.size > 0) {
        try {
          const header = await readFileHeader(file, 8);
          const detectedMime = detectMimeFromBytes(header);

          if (detectedMime !== null) {
            const ext = getExtension(file.name);
            if (!isMimeCompatibleWithExtension(detectedMime, ext)) {
              errors.push({
                code: 'MIME_EXTENSION_MISMATCH',
                message: `File content does not match its extension. Expected content for "${ext}" but detected a different file type`,
                details: {
                  extension: ext,
                  detectedMime,
                  declaredMime: file.type,
                },
              });
            }
          }
        } catch {
          // If we can't read the file header, skip magic byte validation
          // This is a graceful degradation — other checks still apply
        }
      }

      return {
        file,
        valid: errors.length === 0,
        errors,
      };
    }),
  );

  return results;
}
