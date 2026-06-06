/**
 * Storage Key Generation
 *
 * Generates unique, collision-free storage keys for MinIO/S3 object storage.
 * Keys follow the pattern: {entityType}/{entityId}/{timestamp}-{uuid}.{ext}
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { v4 as uuidv4 } from 'uuid';

// ─── Types ───────────────────────────────────────────────────────────────────

export type EntityType = 'audit' | 'finding' | 'recommendation' | 'report';

export interface EntityRef {
  type: EntityType;
  id: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum allowed length for an S3 object key */
export const MAX_KEY_LENGTH = 1024;

/**
 * Valid S3 key characters regex.
 * S3 keys can contain: alphanumeric, forward slash, dash, underscore, dot, and more.
 * We restrict to safe characters: a-z, A-Z, 0-9, /, -, _, .
 */
const VALID_S3_KEY_REGEX = /^[a-zA-Z0-9\/\-_.]+$/;

// ─── Sanitization ────────────────────────────────────────────────────────────

/**
 * Sanitizes a filename by removing path traversal and dangerous characters.
 * Removes: forward slash (/), backslash (\), dot-dot sequences (..), null bytes.
 *
 * Requirements: 6.5
 */
export function sanitizeFilename(filename: string): string {
  let sanitized = filename;

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Remove backslashes
  sanitized = sanitized.replace(/\\/g, '');

  // Remove forward slashes
  sanitized = sanitized.replace(/\//g, '');

  // Remove dot-dot sequences (repeatedly to handle nested cases like ....)
  while (sanitized.includes('..')) {
    sanitized = sanitized.replace(/\.\./g, '');
  }

  return sanitized;
}

// ─── Extension Extraction ────────────────────────────────────────────────────

/**
 * Extracts and lowercases the file extension from a sanitized filename.
 * Returns undefined if no extension is present.
 *
 * Requirements: 6.2, 6.3
 */
export function extractExtension(sanitizedFilename: string): string | undefined {
  const lastDot = sanitizedFilename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === sanitizedFilename.length - 1) {
    // No dot found, dot is at the start (hidden file), or dot is the last character
    return undefined;
  }

  const ext = sanitizedFilename.slice(lastDot + 1).toLowerCase();
  if (ext.length === 0) {
    return undefined;
  }

  return ext;
}

// ─── Timestamp Generation ────────────────────────────────────────────────────

/**
 * Generates an ISO-like timestamp string for lexicographic sorting.
 * Format: YYYYMMDDTHHmmss
 *
 * Requirements: 6.1
 */
export function generateTimestamp(date: Date = new Date()): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');

  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

// ─── Key Generation ──────────────────────────────────────────────────────────

/**
 * Generates a unique storage key for an entity's file.
 *
 * Pattern: {entityType}/{entityId}/{timestamp}-{uuid}.{ext}
 *
 * - Sanitizes the filename before extracting the extension
 * - Extension is lowercase; omitted entirely if missing (no trailing dot)
 * - UUID v4 ensures global uniqueness
 * - Key is ≤ 1024 characters with valid S3 characters only
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 *
 * @param entityRef - Entity type and ID for organization
 * @param filename - Original filename (will be sanitized)
 * @returns Generated storage key
 * @throws Error if the generated key exceeds 1024 characters
 */
export function generateStorageKey(
  entityRef: EntityRef,
  filename: string,
): string {
  // Step 1: Sanitize the filename
  const sanitized = sanitizeFilename(filename);

  // Step 2: Extract and lowercase extension
  const ext = extractExtension(sanitized);

  // Step 3: Generate timestamp
  const timestamp = generateTimestamp();

  // Step 4: Generate UUID v4
  const uuid = uuidv4();

  // Step 5: Sanitize the entity ID (remove invalid S3 characters)
  const safeEntityId = entityRef.id.replace(/[^a-zA-Z0-9\-_\.]/g, '_');

  // Step 6: Compose the key
  const filenamePart = ext
    ? `${timestamp}-${uuid}.${ext}`
    : `${timestamp}-${uuid}`;

  const key = `${entityRef.type}/${safeEntityId}/${filenamePart}`;

  // Step 7: Validate key length
  if (key.length > MAX_KEY_LENGTH) {
    throw new Error(
      `Generated storage key exceeds ${MAX_KEY_LENGTH} characters (got ${key.length})`,
    );
  }

  // Step 8: Validate all characters are valid S3 key characters
  if (!VALID_S3_KEY_REGEX.test(key)) {
    throw new Error(
      'Generated storage key contains invalid S3 characters',
    );
  }

  return key;
}
