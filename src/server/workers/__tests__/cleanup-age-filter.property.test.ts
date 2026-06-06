/**
 * Property-based test for Temp Cleanup Age Filter.
 *
 * **Validates: Requirements 10.2**
 *
 * Property 8: Temp Cleanup Age Filter
 * For any set of objects in the temp bucket, the cleanup-temp worker SHALL delete
 * all and only those objects with a creation timestamp older than 24 hours.
 * Objects younger than 24 hours SHALL remain untouched.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import type { Job } from 'bullmq';
import type { WorkerContext } from '../../services/worker-manager.js';
import type { JobDataMap } from '../../services/queue.service.js';
import type { StorageObject } from '../../services/storage.service.js';
import { cleanupTempWorker } from '../cleanup-temp.worker.js';

// ─── Generators ────────────────────────────────────────────────────────────────

/**
 * Generate an olderThanMs threshold (the configurable cutoff).
 * Default is 24 hours (86400000ms), but we test with various thresholds.
 */
const thresholdMsArb: fc.Arbitrary<number> = fc.constantFrom(
  86_400_000, // 24 hours (default)
  86_400_000, // Weighted towards default
  86_400_000, // Weighted towards default
  3_600_000, // 1 hour
  2 * 86_400_000, // 48 hours
);

/**
 * Generate a random storage object key.
 */
const objectKeyArb: fc.Arbitrary<string> = fc.oneof(
  fc.stringMatching(/^[a-z0-9_-]{1,32}\.[a-z]{2,4}$/),
  fc.tuple(
    fc.stringMatching(/^[a-z]{1,8}$/),
    fc.stringMatching(/^[a-z0-9]{1,12}$/),
    fc.constantFrom('.pdf', '.docx', '.png', '.jpg', '.xlsx'),
  ).map(([prefix, name, ext]) => `pending/${prefix}/${name}${ext}`),
);

/**
 * Generate a positive file size (1 byte to 50MB).
 */
const fileSizeArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 50 * 1024 * 1024 });

/**
 * Generate an etag string.
 */
const etagArb: fc.Arbitrary<string> = fc.stringMatching(/^[a-f0-9]{32}$/);

/**
 * Generate an age offset in milliseconds.
 * Ranges from 1 second to 7 days to cover objects both younger and older than threshold.
 */
const ageOffsetMsArb: fc.Arbitrary<number> = fc.integer({
  min: 1_000, // 1 second
  max: 7 * 24 * 60 * 60 * 1000, // 7 days
});

/**
 * Generate a StorageObject with a specific lastModified date based on a given reference time and offset.
 */
const storageObjectArb = (referenceTime: number): fc.Arbitrary<StorageObject> =>
  fc.tuple(objectKeyArb, fileSizeArb, etagArb, ageOffsetMsArb).map(
    ([key, size, etag, ageMs]) => ({
      key,
      size,
      etag,
      lastModified: new Date(referenceTime - ageMs),
    }),
  );

/**
 * Generate a list of 0–20 storage objects with various ages.
 */
const objectListArb = (referenceTime: number): fc.Arbitrary<StorageObject[]> =>
  fc.array(storageObjectArb(referenceTime), { minLength: 0, maxLength: 20 });

// ─── Helpers ───────────────────────────────────────────────────────────────────

function createJob(olderThanMs: number): Job<JobDataMap['cleanup-temp']> {
  return {
    data: { olderThanMs },
  } as Job<JobDataMap['cleanup-temp']>;
}

function createMockContext() {
  const deletedKeys: string[] = [];

  const mockStorage = {
    listObjects: vi.fn(),
    delete: vi.fn().mockImplementation(async (key: string) => {
      deletedKeys.push(key);
    }),
    upload: vi.fn(),
    download: vi.fn(),
    getPresignedUrl: vi.fn(),
    copy: vi.fn(),
    exists: vi.fn(),
  };

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };

  const mockReportProgress = vi.fn().mockResolvedValue(undefined);

  const context: WorkerContext = {
    storage: mockStorage as any,
    db: {},
    logger: mockLogger as any,
    reportProgress: mockReportProgress,
  };

  return { context, mockStorage, mockLogger, deletedKeys };
}

// ─── Property Tests ────────────────────────────────────────────────────────────

describe('Property 8: Temp Cleanup Age Filter', () => {
  const originalDateNow = Date.now;

  afterEach(() => {
    Date.now = originalDateNow;
  });

  /**
   * **Validates: Requirements 10.2**
   *
   * The cleanup-temp worker SHALL delete all objects with a lastModified timestamp
   * older than the threshold (olderThanMs) and SHALL NOT delete any objects
   * younger than the threshold.
   */
  it('deletes all and only objects older than the threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        thresholdMsArb,
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        async (thresholdMs, numOld, numNew) => {
          // Use a fixed reference time for deterministic behavior
          const referenceTime = 1_700_000_000_000;

          // Generate "old" objects: definitely older than threshold
          const oldObjects: StorageObject[] = Array.from({ length: numOld }, (_, i) => ({
            key: `old-file-${i}.pdf`,
            size: (i + 1) * 1024,
            etag: `etag-old-${i}`,
            // Age: threshold + 1 minute to threshold + several days beyond threshold
            lastModified: new Date(referenceTime - thresholdMs - (i + 1) * 60_000),
          }));

          // Generate "new" objects: definitely newer than threshold
          const newObjects: StorageObject[] = Array.from({ length: numNew }, (_, i) => ({
            key: `new-file-${i}.pdf`,
            size: (i + 1) * 512,
            etag: `etag-new-${i}`,
            // Age: 1 second to half the threshold - safely within the threshold
            lastModified: new Date(
              referenceTime - Math.max(1000, Math.floor(thresholdMs / (numNew + 1)) * (i + 1) - 60_000),
            ),
          }));

          // Ensure new objects are actually newer than cutoff
          const cutoff = referenceTime - thresholdMs;
          const safeNewObjects = newObjects.map((obj, i) => ({
            ...obj,
            lastModified: new Date(cutoff + (i + 1) * 60_000), // 1–N minutes after cutoff
          }));

          const allObjects = [...oldObjects, ...safeNewObjects];

          // Mock Date.now() to return our reference time during worker execution
          Date.now = () => referenceTime;

          const { context, mockStorage, deletedKeys } = createMockContext();
          mockStorage.listObjects.mockResolvedValue(allObjects);

          const job = createJob(thresholdMs);
          await cleanupTempWorker(job, context);

          // Verify: all old objects should be deleted
          for (const obj of oldObjects) {
            expect(deletedKeys).toContain(obj.key);
          }

          // Verify: no new objects should be deleted
          for (const obj of safeNewObjects) {
            expect(deletedKeys).not.toContain(obj.key);
          }

          // Verify: exactly the right number of deletes were made
          expect(deletedKeys.length).toBe(numOld);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 10.2**
   *
   * For any arbitrary set of objects with random timestamps, the worker partitions
   * them correctly: objects older than threshold are deleted, younger ones remain.
   */
  it('correctly partitions arbitrary object sets by age threshold', async () => {
    const referenceTime = 1_700_000_000_000; // Fixed reference for reproducibility

    await fc.assert(
      fc.asyncProperty(
        objectListArb(referenceTime),
        thresholdMsArb,
        async (objects, thresholdMs) => {
          // Determine expected partitions based on the threshold
          const cutoffTime = referenceTime - thresholdMs;
          const expectedDeleted = objects.filter(
            (obj) => obj.lastModified.getTime() < cutoffTime,
          );
          const expectedKept = objects.filter(
            (obj) => obj.lastModified.getTime() >= cutoffTime,
          );

          // Mock Date.now to return our reference time
          Date.now = () => referenceTime;

          const { context, mockStorage, deletedKeys } = createMockContext();
          mockStorage.listObjects.mockResolvedValue(objects);

          const job = createJob(thresholdMs);
          await cleanupTempWorker(job, context);

          // All objects older than threshold should be deleted
          for (const obj of expectedDeleted) {
            expect(deletedKeys).toContain(obj.key);
          }

          // No objects newer than threshold should be deleted
          for (const obj of expectedKept) {
            expect(deletedKeys).not.toContain(obj.key);
          }

          // Total deletions should equal the number of stale objects
          expect(deletedKeys.length).toBe(expectedDeleted.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 10.2**
   *
   * Objects exactly at the boundary (lastModified == cutoffTime) SHALL NOT be deleted.
   * Only objects strictly older are deleted.
   */
  it('does not delete objects exactly at the boundary age', async () => {
    await fc.assert(
      fc.asyncProperty(thresholdMsArb, async (thresholdMs) => {
        const referenceTime = 1_700_000_000_000;
        const cutoffTime = referenceTime - thresholdMs;

        // Create boundary objects: exactly at cutoff time
        const boundaryObjects: StorageObject[] = [
          {
            key: 'boundary-exact.pdf',
            size: 1024,
            etag: 'etag-boundary',
            lastModified: new Date(cutoffTime),
          },
          // One slightly older (should be deleted)
          {
            key: 'just-over.pdf',
            size: 2048,
            etag: 'etag-over',
            lastModified: new Date(cutoffTime - 1),
          },
          // One slightly newer (should not be deleted)
          {
            key: 'just-under.pdf',
            size: 512,
            etag: 'etag-under',
            lastModified: new Date(cutoffTime + 1),
          },
        ];

        Date.now = () => referenceTime;

        const { context, mockStorage, deletedKeys } = createMockContext();
        mockStorage.listObjects.mockResolvedValue(boundaryObjects);

        const job = createJob(thresholdMs);
        await cleanupTempWorker(job, context);

        // Boundary object (exactly at cutoff): NOT deleted because
        // the filter is obj.lastModified.getTime() < cutoffTime (strict less than)
        expect(deletedKeys).not.toContain('boundary-exact.pdf');

        // One millisecond older than cutoff: deleted
        expect(deletedKeys).toContain('just-over.pdf');

        // One millisecond newer than cutoff: not deleted
        expect(deletedKeys).not.toContain('just-under.pdf');

        expect(deletedKeys.length).toBe(1);
      }),
      { numRuns: 100 },
    );
  });
});
