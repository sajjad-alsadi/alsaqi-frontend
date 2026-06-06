// @vitest-environment node
/**
 * Property-based test for Upload Integrity Round-Trip.
 *
 * **Validates: Requirements 1.4, 2.3**
 *
 * Property 1: Upload Integrity Round-Trip
 * For any file content uploaded through the system, the SHA-256 checksum computed
 * at upload time SHALL equal the SHA-256 checksum of the file stored in the
 * permanent bucket after processing. The checksum computation is deterministic:
 * the same byte content always produces the same hash.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { createHash } from 'crypto';
import { Readable } from 'stream';

// Mock bullmq before importing the worker
vi.mock('bullmq', () => ({
  UnrecoverableError: class UnrecoverableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UnrecoverableError';
    }
  },
}));

import type { WorkerContext } from '../../services/worker-manager.js';
import { processFileWorker } from '../process-file.worker.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeSHA256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function bufferToReadable(buf: Buffer): Readable {
  return Readable.from(buf);
}

// ─── Mock factories ──────────────────────────────────────────────────────────

/**
 * Creates a mock storage service that simulates the upload→copy→download flow.
 * The storage holds a reference to file content and returns it on download,
 * simulating the real MinIO behaviour where copy preserves bytes exactly.
 */
function createMockStorage(fileContent: Buffer) {
  // Simulates storage: copy stores content, download returns it
  let storedContent: Buffer = fileContent;

  return {
    exists: vi.fn()
      .mockResolvedValueOnce(true)   // temp file exists
      .mockResolvedValueOnce(false), // permanent file does not yet exist
    copy: vi.fn().mockImplementation(async () => {
      // Copy preserves the exact bytes (simulating MinIO copy)
      storedContent = fileContent;
      return { key: '', bucket: 'evidence', etag: '', size: fileContent.length, url: '' };
    }),
    download: vi.fn().mockImplementation(async () => {
      // Returns what was stored (simulating download from permanent bucket)
      return bufferToReadable(storedContent);
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockDb() {
  return {
    query: vi.fn().mockImplementation((text: string) => {
      if (text.startsWith('SELECT')) {
        return Promise.resolve({ rows: [{ id: 'file-1', status: 'uploading' }] });
      }
      return Promise.resolve({ rows: [] });
    }),
  };
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

// ─── Property Tests ────────────────────────────────────────────────────────────

describe('Property 1: Upload Integrity Round-Trip', () => {
  /**
   * **Validates: Requirements 1.4, 2.3**
   *
   * For any file content uploaded through the system, the SHA-256 checksum
   * computed at upload time SHALL equal the SHA-256 checksum of the file stored
   * in the permanent bucket after processing.
   */
  it('SHA-256 checksum at upload time equals checksum of file in permanent bucket after processing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 4096 }),
        async (bytes) => {
          const fileContent = Buffer.from(bytes);

          // Step 1: Compute SHA-256 at "upload time" (as the API would)
          const uploadChecksum = computeSHA256(fileContent);

          // Step 2: Create mocked storage that simulates copy→download flow
          const storage = createMockStorage(fileContent);
          const db = createMockDb();

          const context: WorkerContext = {
            storage: storage as any,
            db,
            logger: createMockLogger() as any,
            reportProgress: vi.fn().mockResolvedValue(undefined),
          };

          const job = {
            id: 'test-job',
            data: {
              tempKey: 'pending/audit/entity1/20240101T120000-uuid.pdf',
              targetBucket: 'evidence' as const,
              metadata: {
                fileId: 'file-1',
                storageKey: 'audit/entity1/20240101T120000-uuid.pdf',
                checksum: uploadChecksum,
                contentType: 'application/pdf',
              },
            },
          } as any;

          // Step 3: Run the processFileWorker — should succeed without throwing
          await processFileWorker(job, context);

          // Step 4: The worker internally computes SHA-256 of the downloaded file
          // and compares it against metadata.checksum. If they don't match, it throws.
          // The fact that processFileWorker completed without throwing proves
          // the integrity round-trip: upload checksum === permanent file checksum.

          // Verify that download was called (checksum verification happened)
          expect(storage.download).toHaveBeenCalled();

          // Verify the file was marked as 'ready' (successful processing)
          const readyCalls = (db.query as any).mock.calls.filter(
            (call: any[]) =>
              call[0].includes('UPDATE') && call[1]?.[0] === 'ready',
          );
          expect(readyCalls.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.4, 2.3**
   *
   * The checksum computation is deterministic: the same byte content always
   * produces the same hash.
   */
  it('SHA-256 computation is deterministic: same bytes always produce same hash', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 8192 }),
        (bytes) => {
          const buffer = Buffer.from(bytes);

          // Compute checksum multiple times on the same content
          const hash1 = computeSHA256(buffer);
          const hash2 = computeSHA256(buffer);
          const hash3 = computeSHA256(Buffer.from(bytes)); // fresh buffer, same bytes

          // All must be identical
          expect(hash1).toBe(hash2);
          expect(hash2).toBe(hash3);

          // Must be a valid 64-char hex string
          expect(hash1).toMatch(/^[0-9a-f]{64}$/);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.4, 2.3**
   *
   * If the file content is corrupted during the copy (checksum mismatch),
   * the worker detects it and throws, proving the integrity check works
   * for any arbitrary content.
   */
  it('detects corruption when stored file differs from upload (checksum mismatch)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 4096 }),
        fc.uint8Array({ minLength: 1, maxLength: 4096 }),
        async (originalBytes, corruptedBytes) => {
          const originalContent = Buffer.from(originalBytes);
          const corruptedContent = Buffer.from(corruptedBytes);

          // Only test when contents are actually different
          if (originalContent.equals(corruptedContent)) {
            return true; // Skip — same content would produce same checksum
          }

          const uploadChecksum = computeSHA256(originalContent);
          const corruptedChecksum = computeSHA256(corruptedContent);

          // Checksums must differ for different content
          expect(uploadChecksum).not.toBe(corruptedChecksum);

          // Create storage that returns corrupted content on download
          const storage = {
            exists: vi.fn()
              .mockResolvedValueOnce(true)   // temp exists
              .mockResolvedValueOnce(false), // permanent not yet there
            copy: vi.fn().mockResolvedValue({
              key: '', bucket: 'evidence', etag: '', size: 0, url: '',
            }),
            download: vi.fn().mockResolvedValue(bufferToReadable(corruptedContent)),
            delete: vi.fn().mockResolvedValue(undefined),
          };

          const db = createMockDb();
          const context: WorkerContext = {
            storage: storage as any,
            db,
            logger: createMockLogger() as any,
            reportProgress: vi.fn().mockResolvedValue(undefined),
          };

          const job = {
            id: 'test-job',
            data: {
              tempKey: 'pending/audit/entity1/20240101T120000-uuid.pdf',
              targetBucket: 'evidence' as const,
              metadata: {
                fileId: 'file-1',
                storageKey: 'audit/entity1/20240101T120000-uuid.pdf',
                checksum: uploadChecksum,
                contentType: 'application/pdf',
              },
            },
          } as any;

          // Worker should detect the corruption and throw
          await expect(processFileWorker(job, context)).rejects.toThrow(
            /Checksum mismatch/,
          );

          // Corrupted file should be deleted from permanent bucket
          expect(storage.delete).toHaveBeenCalledWith(
            job.data.metadata.storageKey,
            'evidence',
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
