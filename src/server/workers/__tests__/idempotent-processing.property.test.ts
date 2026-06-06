// @vitest-environment node
/**
 * Property-based tests for Idempotent Job Processing.
 *
 * **Validates: Requirements 9.5**
 *
 * Property 7: Idempotent Job Processing
 * For any process-file job executed multiple times with the same job data,
 * the WorkerManager SHALL produce exactly one file in the target bucket with
 * the correct content. Repeated processing SHALL not create duplicate storage
 * objects or duplicate FileRecords.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { createHash } from 'crypto';
import { Readable } from 'stream';

// Mock bullmq's UnrecoverableError before importing the worker
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

// ─── Generators ────────────────────────────────────────────────────────────────

/**
 * Generate arbitrary file content as a non-empty Buffer (1–512 bytes).
 */
const fileContentArb: fc.Arbitrary<Buffer> = fc
  .uint8Array({ minLength: 1, maxLength: 512 })
  .map((arr) => Buffer.from(arr));

/**
 * Generate the number of times to execute the job (2–5).
 */
const executionCountArb: fc.Arbitrary<number> = fc.integer({ min: 2, max: 5 });

/**
 * Generate a valid target bucket name.
 */
const targetBucketArb = fc.constantFrom('evidence' as const, 'reports' as const);

// ─── Property Tests ────────────────────────────────────────────────────────────

describe('Property 7: Idempotent Job Processing', () => {
  /**
   * **Validates: Requirements 9.5**
   *
   * For any process-file job executed multiple times with the same job data,
   * the WorkerManager SHALL produce exactly one file in the target bucket
   * with the correct content. Repeated processing SHALL not create duplicate
   * storage objects or duplicate FileRecords.
   */
  it('repeated execution with same job data produces exactly one file and no duplicate records', async () => {
    await fc.assert(
      fc.asyncProperty(
        fileContentArb,
        targetBucketArb,
        executionCountArb,
        async (content, targetBucket, execCount) => {
          const checksum = computeSHA256(content);
          const storageKey = 'audit/abc123/20240101T120000-aaaa1111-bb22-4cc3-dd44-eeeeff556677.pdf';
          const tempKey = `pending/${storageKey}`;
          const fileId = 'file-idempotent-001';

          // ─── Simulated permanent bucket state (shared across executions) ────
          let permanentFileExists = false;
          let permanentFileContent: Buffer = Buffer.alloc(0);
          let copyCallCount = 0;
          const statusUpdates: string[] = [];
          let currentDbStatus = 'uploading';

          // Execute the worker multiple times with the same job data
          for (let i = 0; i < execCount; i++) {
            const storage = {
              exists: vi.fn().mockImplementation(async (key: string, bucket: string) => {
                if (bucket === 'temp') return true;
                return permanentFileExists;
              }),
              copy: vi.fn().mockImplementation(async () => {
                copyCallCount++;
                permanentFileExists = true;
                permanentFileContent = Buffer.from(content);
                return { key: storageKey, bucket: targetBucket, etag: 'etag', size: content.length, url: '' };
              }),
              download: vi.fn().mockImplementation(async () => {
                return bufferToReadable(Buffer.from(permanentFileContent));
              }),
              delete: vi.fn().mockResolvedValue(undefined),
            };

            const db = {
              query: vi.fn().mockImplementation(async (text: string, params: unknown[]) => {
                if (text.startsWith('SELECT')) {
                  return { rows: [{ id: fileId, status: currentDbStatus }] };
                }
                if (text.startsWith('UPDATE')) {
                  const newStatus = (params as string[])[0];
                  statusUpdates.push(newStatus);
                  currentDbStatus = newStatus;
                }
                return { rows: [] };
              }),
            };

            const context: WorkerContext = {
              storage: storage as any,
              db,
              logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
              reportProgress: vi.fn().mockResolvedValue(undefined),
            };

            const job = {
              id: `job-${i}`,
              data: {
                tempKey,
                targetBucket,
                metadata: { fileId, storageKey, checksum, contentType: 'application/pdf' },
              },
              updateProgress: vi.fn(),
            } as any;

            await processFileWorker(job, context);
          }

          // ─── Assertions ─────────────────────────────────────────────────────

          // 1. copy called at most once — first run copies, subsequent runs skip
          expect(copyCallCount).toBeLessThanOrEqual(1);

          // 2. Exactly one file exists in permanent bucket
          expect(permanentFileExists).toBe(true);

          // 3. The permanent file content matches the original checksum
          expect(computeSHA256(permanentFileContent)).toBe(checksum);

          // 4. No duplicate 'ready' status updates
          const readyUpdates = statusUpdates.filter((s) => s === 'ready');
          expect(readyUpdates.length).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 9.5**
   *
   * Storage.copy is invoked exactly once even when the same job runs multiple times.
   * The idempotency check (file exists + correct checksum) prevents redundant copies.
   */
  it('storage.copy is called exactly once across repeated executions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fileContentArb,
        executionCountArb,
        async (content, execCount) => {
          const checksum = computeSHA256(content);
          const storageKey = 'finding/xyz789/20240215T093000-cccc2222-dd33-4ee4-ff55-aabbccddeeff.docx';
          const tempKey = `pending/${storageKey}`;
          const fileId = 'file-copy-once-test';

          let totalCopyCalls = 0;
          let fileInPermanent = false;
          let storedContent: Buffer = Buffer.alloc(0);
          let currentDbStatus = 'uploading';

          for (let i = 0; i < execCount; i++) {
            const storage = {
              exists: vi.fn().mockImplementation(async (_key: string, bucket: string) => {
                if (bucket === 'temp') return true;
                return fileInPermanent;
              }),
              copy: vi.fn().mockImplementation(async () => {
                totalCopyCalls++;
                fileInPermanent = true;
                storedContent = Buffer.from(content);
                return { key: storageKey, bucket: 'evidence', etag: 'etag', size: content.length, url: '' };
              }),
              download: vi.fn().mockImplementation(async () => {
                return bufferToReadable(Buffer.from(storedContent));
              }),
              delete: vi.fn().mockResolvedValue(undefined),
            };

            const db = {
              query: vi.fn().mockImplementation(async (text: string, params: unknown[]) => {
                if (text.startsWith('SELECT')) {
                  return { rows: [{ id: fileId, status: currentDbStatus }] };
                }
                if (text.startsWith('UPDATE')) {
                  const newStatus = (params as string[])[0];
                  currentDbStatus = newStatus;
                }
                return { rows: [] };
              }),
            };

            const context: WorkerContext = {
              storage: storage as any,
              db,
              logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
              reportProgress: vi.fn().mockResolvedValue(undefined),
            };

            const job = {
              id: `job-copy-${i}`,
              data: {
                tempKey,
                targetBucket: 'evidence' as const,
                metadata: { fileId, storageKey, checksum, contentType: 'application/pdf' },
              },
              updateProgress: vi.fn(),
            } as any;

            await processFileWorker(job, context);
          }

          // Copy must be called exactly once (first run), not on subsequent runs
          expect(totalCopyCalls).toBe(1);

          // File should exist in permanent bucket with correct content
          expect(fileInPermanent).toBe(true);
          expect(computeSHA256(storedContent)).toBe(checksum);
        },
      ),
      { numRuns: 50 },
    );
  });
});
