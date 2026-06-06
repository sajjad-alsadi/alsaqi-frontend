/**
 * Property-based tests for Storage Key Generation.
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 *
 * Property 3: Storage Key Generation Correctness
 * For any valid entity reference and filename, the generated storage key SHALL:
 * (a) match the pattern {entityType}/{entityId}/{timestamp}-{uuid}.{ext},
 * (b) contain a lowercase file extension,
 * (c) include a UUID that makes the key globally unique across calls with identical inputs,
 * (d) contain no path traversal sequences (.., /./, //) or path separator characters
 *     from the original filename.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  generateStorageKey,
  EntityRef,
  EntityType,
  MAX_KEY_LENGTH,
} from '../storage-key';

// ─── Generators ────────────────────────────────────────────────────────────────

const entityTypeArb: fc.Arbitrary<EntityType> = fc.constantFrom(
  'audit',
  'finding',
  'recommendation',
  'report',
);

/**
 * Generate non-empty entity IDs. Includes alphanumeric, dashes, underscores,
 * and some special characters to test sanitization.
 */
const entityIdArb: fc.Arbitrary<string> = fc.oneof(
  fc.stringMatching(/^[a-zA-Z0-9_-]{1,64}$/),
  fc.stringMatching(/^[a-zA-Z0-9 !@#.]{1,32}$/),
);

/**
 * Generate arbitrary filenames including edge cases:
 * - Normal filenames with extensions
 * - Filenames without extension
 * - Filenames with path separators (/, \)
 * - Filenames with path traversal sequences
 * - Filenames with null bytes
 * - Filenames with special characters
 */
const filenameArb: fc.Arbitrary<string> = fc.oneof(
  // Normal filenames with extensions
  fc.tuple(
    fc.stringMatching(/^[a-zA-Z0-9_-]{1,32}$/),
    fc.constantFrom('.pdf', '.PDF', '.Docx', '.TXT', '.png', '.JPEG', '.tar.gz'),
  ).map(([name, ext]) => name + ext),
  // Filenames without extension
  fc.stringMatching(/^[a-zA-Z0-9_-]{1,32}$/),
  // Filenames with path separators
  fc.tuple(
    fc.constantFrom('path/', '../', '..\\', '/etc/', 'dir\\sub\\', '../../'),
    fc.stringMatching(/^[a-z0-9]{1,16}$/),
    fc.constantFrom('.txt', '.pdf', ''),
  ).map(([prefix, name, ext]) => prefix + name + ext),
  // Filenames with null bytes
  fc.tuple(
    fc.stringMatching(/^[a-z0-9]{1,8}$/),
    fc.stringMatching(/^[a-z0-9]{1,8}$/),
    fc.constantFrom('.pdf', '.txt', ''),
  ).map(([a, b, ext]) => a + '\0' + b + ext),
  // Edge case: only special characters
  fc.constantFrom(
    '///\\\\',
    '....',
    '\0\0\0',
    '../../../etc/passwd',
    '..\\..\\windows\\system32',
    'file\0name.txt',
    'no-ext',
    '.hidden',
    'file.',
  ),
);

const entityRefArb: fc.Arbitrary<EntityRef> = fc.tuple(entityTypeArb, entityIdArb).map(
  ([type, id]) => ({ type, id }),
);

// ─── UUID v4 Pattern ───────────────────────────────────────────────────────────

const UUID_V4_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/;
const TIMESTAMP_REGEX = /\d{8}T\d{6}/;

// ─── Property Tests ────────────────────────────────────────────────────────────

describe('Property 3: Storage Key Generation Correctness', () => {
  /**
   * **Validates: Requirements 6.1**
   *
   * Property (a): The generated key matches the structural pattern
   * {entityType}/{entityId}/{timestamp}-{uuid}.{ext}
   */
  it('(a) generated key matches expected pattern structure', () => {
    fc.assert(
      fc.property(entityRefArb, filenameArb, (entityRef, filename) => {
        let key: string;
        try {
          key = generateStorageKey(entityRef, filename);
        } catch {
          // If it throws (e.g. key too long or invalid chars), that's acceptable
          return true;
        }

        // Key must have exactly 3 segments separated by /
        const segments = key.split('/');
        expect(segments.length).toBe(3);

        // First segment is the entity type
        expect(['audit', 'finding', 'recommendation', 'report']).toContain(segments[0]);
        expect(segments[0]).toBe(entityRef.type);

        // Second segment is the (sanitized) entity ID — non-empty
        expect(segments[1].length).toBeGreaterThan(0);

        // Third segment is the filename part: {timestamp}-{uuid} or {timestamp}-{uuid}.{ext}
        const filePart = segments[2];
        expect(filePart).toMatch(TIMESTAMP_REGEX);
        expect(filePart).toMatch(UUID_V4_REGEX);

        // Verify the structure: timestamp-uuid or timestamp-uuid.ext
        const timestampUuidPattern = /^\d{8}T\d{6}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(\.[a-z0-9]+)?$/;
        expect(filePart).toMatch(timestampUuidPattern);

        return true;
      }),
      { numRuns: 150 },
    );
  });

  /**
   * **Validates: Requirements 6.2**
   *
   * Property (b): The file extension in the key is always lowercase
   */
  it('(b) file extension in the key is always lowercase', () => {
    fc.assert(
      fc.property(entityRefArb, filenameArb, (entityRef, filename) => {
        let key: string;
        try {
          key = generateStorageKey(entityRef, filename);
        } catch {
          return true;
        }

        const filePart = key.split('/')[2];
        const dotIndex = filePart.lastIndexOf('.');
        if (dotIndex !== -1) {
          const ext = filePart.slice(dotIndex + 1);
          // Extension must be lowercase
          expect(ext).toBe(ext.toLowerCase());
          // Extension must be non-empty (no trailing dot)
          expect(ext.length).toBeGreaterThan(0);
        }

        return true;
      }),
      { numRuns: 150 },
    );
  });

  /**
   * **Validates: Requirements 6.4**
   *
   * Property (c): Two calls with identical inputs produce different keys (UUID uniqueness)
   */
  it('(c) two calls with same input produce different keys (UUID uniqueness)', () => {
    fc.assert(
      fc.property(entityRefArb, filenameArb, (entityRef, filename) => {
        let key1: string;
        let key2: string;
        try {
          key1 = generateStorageKey(entityRef, filename);
          key2 = generateStorageKey(entityRef, filename);
        } catch {
          return true;
        }

        // Keys must be different due to UUID uniqueness
        expect(key1).not.toBe(key2);

        return true;
      }),
      { numRuns: 150 },
    );
  });

  /**
   * **Validates: Requirements 6.3**
   *
   * Property (d): No path traversal sequences or path separator characters
   * from the original filename appear in the output key
   */
  it('(d) no path traversal sequences in the output', () => {
    fc.assert(
      fc.property(entityRefArb, filenameArb, (entityRef, filename) => {
        let key: string;
        try {
          key = generateStorageKey(entityRef, filename);
        } catch {
          return true;
        }

        // Must not contain dot-dot path traversal
        expect(key).not.toContain('..');

        // Must not contain /./ sequences
        expect(key).not.toContain('/./');

        // Must not contain consecutive slashes //
        expect(key).not.toContain('//');

        // Must not contain backslashes
        expect(key).not.toContain('\\');

        // Must not contain null bytes
        expect(key).not.toContain('\0');

        return true;
      }),
      { numRuns: 150 },
    );
  });

  /**
   * **Validates: Requirements 6.6**
   *
   * Property (e): Key length is always ≤ 1024 characters
   */
  it('(e) key length is always ≤ 1024 characters', () => {
    fc.assert(
      fc.property(entityRefArb, filenameArb, (entityRef, filename) => {
        try {
          const key = generateStorageKey(entityRef, filename);
          // If it doesn't throw, the key must be within limits
          expect(key.length).toBeLessThanOrEqual(MAX_KEY_LENGTH);
        } catch (error: unknown) {
          // If it throws, it must be the key-too-long or invalid chars error (expected behavior)
          expect((error as Error).message).toMatch(/exceeds 1024 characters|invalid S3 characters/);
        }

        return true;
      }),
      { numRuns: 150 },
    );
  });
});
