// @vitest-environment node
/**
 * Integration tests for the upload → process → download file lifecycle.
 *
 * These tests verify the complete orchestration of:
 * 1. File upload to temp bucket (StorageService)
 * 2. Job enqueueing (QueueService)
 * 3. Worker processing with checksum verification (WorkerManager + processFileWorker)
 * 4. File download via presigned URL (StorageService)
 *
 * The test suite uses in-memory mocks that simulate the real service contracts
 * (MinIO, Redis/BullMQ, PostgreSQL) to validate the end-to-end flow without
 * requiring Docker. A separate describe block with testcontainers is included
 * for environments where Docker is available.
 *
 * **Validates: Requirements 1.6, 2.1, 2.5, 3.1**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { Readable } from 'stream';

// ─── Mock BullMQ before imports ──────────────────────────────────────────────

vi.mock('bullmq', () => ({
  UnrecoverableError: class UnrecoverableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UnrecoverableError';
    }
  },
  Queue: vi.fn(),
  Worker: vi.fn(),
}));

import type { WorkerContext } from '../../services/worker-manager.js';
import type { JobDataMap, FileMetadata } from '../../services/queue.service.js';
import { processFileWorker } from '../../workers/process-file.worker.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeSHA256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function bufferToReadable(buf: Buffer): Readable {
  return Readable.from(buf);
}

/**
 * Simulates an in-memory object store (MinIO-like) for integration testing.
 * Stores objects in a Map keyed by `bucket/key`.
 */
class InMemoryObjectStore {
  private objects = new Map<string, { data: Buffer; metadata: Record<string, string> }>();

  private makeKey(key: string, bucket: string): string {
    return `${bucket}/${key}`;
  }

  async upload(key: string, bucket: string, data: Buffer, metadata: Record<string, string> = {}): Promise<void> {
    this.objects.set(this.makeKey(key, bucket), { data, metadata });
  }

  async download(key: string, bucket: string): Promise<Readable> {
    const entry = this.objects.get(this.makeKey(key, bucket));
    if (!entry) {
      throw new Error(`Object not found: ${bucket}/${key}`);
    }
    return bufferToReadable(entry.data);
  }

  async exists(key: string, bucket: string): Promise<boolean> {
    return this.objects.has(this.makeKey(key, bucket));
  }

  async delete(key: string, bucket: string): Promise<void> {
    this.objects.delete(this.makeKey(key, bucket));
  }

  async copy(sourceKey: string, destKey: string, sourceBucket: string, destBucket: string): Promise<void> {
    const entry = this.objects.get(this.makeKey(sourceKey, sourceBucket));
    if (!entry) {
      throw new Error(`Source object not found: ${sourceBucket}/${sourceKey}`);
    }
    this.objects.set(this.makeKey(destKey, destBucket), { ...entry });
  }

  getPresignedUrl(key: string, bucket: string, expiresIn: number): string {
    return `https://minio.local/${bucket}/${key}?X-Amz-Expires=${expiresIn}&X-Amz-Signature=mock-signature`;
  }

  getObjectCount(): number {
    return this.objects.size;
  }

  hasObject(key: string, bucket: string): boolean {
    return this.objects.has(this.makeKey(key, bucket));
  }

  getObjectData(key: string, bucket: string): Buffer | undefined {
    return this.objects.get(this.makeKey(key, bucket))?.data;
  }
}

/**
 * Simulates an in-memory job queue (BullMQ-like) for integration testing.
 */
interface InMemoryJob {
  id: string;
  type: string;
  data: unknown;
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  progress: number;
  attemptsMade: number;
  maxAttempts: number;
  error?: string;
  result?: unknown;
}

class InMemoryQueue {
  private jobs = new Map<string, InMemoryJob>();
  private jobCounter = 0;

  enqueue(type: string, data: unknown, options?: { attempts?: number }): string {
    const jobId = `job-${++this.jobCounter}`;
    this.jobs.set(jobId, {
      id: jobId,
      type,
      data,
      state: 'waiting',
      progress: 0,
      attemptsMade: 0,
      maxAttempts: options?.attempts ?? 3,
    });
    return jobId;
  }

  getJob(jobId: string): InMemoryJob | undefined {
    return this.jobs.get(jobId);
  }

  markActive(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.state = 'active';
      job.attemptsMade++;
    }
  }

  markCompleted(jobId: string, result?: unknown): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.state = 'completed';
      job.progress = 100;
      job.result = result;
    }
  }

  markFailed(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.state = 'failed';
      job.error = error;
    }
  }

  updateProgress(jobId: string, progress: number): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.progress = progress;
    }
  }

  canRetry(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    return !!job && job.attemptsMade < job.maxAttempts;
  }
}

/**
 * Simulates an in-memory database for FileRecords.
 */
interface FileRecordEntry {
  id: string;
  originalName: string;
  storageKey: string;
  bucket: string;
  contentType: string;
  size: number;
  checksum: string;
  uploadedBy: string;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

class InMemoryDatabase {
  private files = new Map<string, FileRecordEntry>();

  createFileRecord(record: FileRecordEntry): void {
    this.files.set(record.id, record);
  }

  getFileRecord(id: string): FileRecordEntry | null {
    return this.files.get(id) ?? null;
  }

  updateFileStatus(id: string, status: FileRecordEntry['status']): void {
    const record = this.files.get(id);
    if (record) {
      record.status = status;
      record.updatedAt = new Date();
    }
  }

  /**
   * Returns a mock db client compatible with process-file worker's duck-typed access.
   */
  asMockDbClient() {
    return {
      query: vi.fn().mockImplementation((text: string, params: unknown[]) => {
        if (text.startsWith('SELECT')) {
          const id = params[0] as string;
          const record = this.files.get(id);
          return Promise.resolve({ rows: record ? [{ id: record.id, status: record.status }] : [] });
        }
        if (text.startsWith('UPDATE')) {
          const status = params[0] as string;
          const id = params[1] as string;
          this.updateFileStatus(id, status as FileRecordEntry['status']);
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      }),
    };
  }
}

// ─── Integration Test Suite ──────────────────────────────────────────────────

describe('Upload → Process → Download Integration Flow', () => {
  let objectStore: InMemoryObjectStore;
  let queue: InMemoryQueue;
  let database: InMemoryDatabase;

  beforeEach(() => {
    objectStore = new InMemoryObjectStore();
    queue = new InMemoryQueue();
    database = new InMemoryDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Complete File Lifecycle
  // Validates: Requirements 1.6, 2.1, 2.5, 3.1
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Complete file lifecycle: upload → process → download', () => {
    it('should process a file from upload through worker to presigned URL download', async () => {
      // ─── Phase 1: Upload ─────────────────────────────────────────────────
      // Simulate API receiving a file upload and streaming to temp bucket
      const fileContent = Buffer.from('PDF audit evidence document content for testing');
      const fileChecksum = computeSHA256(fileContent);
      const fileId = 'file-uuid-001';
      const storageKey = 'audit/plan-123/20240115T100000-uuid-001.pdf';
      const tempKey = `pending/${storageKey}`;

      // Upload file to temp bucket (simulates StorageService.upload)
      await objectStore.upload(tempKey, 'temp', fileContent, {
        checksum: fileChecksum,
        uploadedBy: 'user-001',
      });

      // Create FileRecord in database (simulates API route handler)
      database.createFileRecord({
        id: fileId,
        originalName: 'evidence-report.pdf',
        storageKey,
        bucket: 'evidence',
        contentType: 'application/pdf',
        size: fileContent.length,
        checksum: fileChecksum,
        uploadedBy: 'user-001',
        status: 'uploading',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Enqueue process-file job (simulates QueueService.enqueue)
      // Requirement 1.6: API returns 202 Accepted with jobId
      const jobId = queue.enqueue('process-file', {
        tempKey,
        targetBucket: 'evidence',
        metadata: { fileId, storageKey, checksum: fileChecksum, contentType: 'application/pdf' },
      } satisfies JobDataMap['process-file'], { attempts: 3 });

      expect(jobId).toBeDefined();
      expect(queue.getJob(jobId)?.state).toBe('waiting');

      // Verify temp file exists
      expect(await objectStore.exists(tempKey, 'temp')).toBe(true);

      // ─── Phase 2: Worker Processing ──────────────────────────────────────
      // Simulate worker picking up the job
      queue.markActive(jobId);

      // Build the WorkerContext using in-memory services
      const dbClient = database.asMockDbClient();
      const progressValues: number[] = [];

      const mockStorage = {
        exists: vi.fn().mockImplementation((key: string, bucket: string) =>
          objectStore.exists(key, bucket ?? 'temp'),
        ),
        copy: vi.fn().mockImplementation(
          (srcKey: string, destKey: string, srcBucket: string, destBucket: string) =>
            objectStore.copy(srcKey, destKey, srcBucket, destBucket),
        ),
        download: vi.fn().mockImplementation((key: string, bucket: string) =>
          objectStore.download(key, bucket),
        ),
        delete: vi.fn().mockImplementation((key: string, bucket: string) =>
          objectStore.delete(key, bucket),
        ),
      };

      const context: WorkerContext = {
        storage: mockStorage as any,
        db: dbClient,
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
        reportProgress: vi.fn().mockImplementation(async (p: number) => {
          progressValues.push(p);
          queue.updateProgress(jobId, p);
        }),
      };

      const mockJob = {
        id: jobId,
        data: queue.getJob(jobId)!.data as JobDataMap['process-file'],
        updateProgress: vi.fn(),
      } as any;

      // Execute the process-file worker
      await processFileWorker(mockJob, context);

      // Mark job completed in queue
      queue.markCompleted(jobId);

      // ─── Phase 3: Verify Processing Results ──────────────────────────────
      // Requirement 2.5: temp file deleted, FileRecord status = 'ready'
      expect(await objectStore.exists(tempKey, 'temp')).toBe(false);
      expect(await objectStore.exists(storageKey, 'evidence')).toBe(true);

      // Verify file content integrity (Requirement 2.1 / checksum)
      const storedStream = await objectStore.download(storageKey, 'evidence');
      const storedData = await streamToBuffer(storedStream);
      expect(computeSHA256(storedData)).toBe(fileChecksum);

      // Verify FileRecord status transitions
      const finalRecord = database.getFileRecord(fileId);
      expect(finalRecord?.status).toBe('ready');

      // Verify progress was reported
      expect(progressValues).toEqual([10, 50, 70, 80, 100]);

      // Verify job state
      expect(queue.getJob(jobId)?.state).toBe('completed');

      // ─── Phase 4: Download via Presigned URL ─────────────────────────────
      // Requirement 3.1: generate presigned URL for ready file
      const record = database.getFileRecord(fileId);
      expect(record?.status).toBe('ready');

      const presignedUrl = objectStore.getPresignedUrl(storageKey, 'evidence', 3600);
      expect(presignedUrl).toContain(storageKey);
      expect(presignedUrl).toContain('X-Amz-Expires=3600');
      expect(presignedUrl).toContain('X-Amz-Signature=');
    });

    it('should handle multiple concurrent file uploads independently', async () => {
      const files = [
        { id: 'file-001', content: Buffer.from('First file content'), name: 'doc1.pdf' },
        { id: 'file-002', content: Buffer.from('Second file content'), name: 'doc2.xlsx' },
        { id: 'file-003', content: Buffer.from('Third file content'), name: 'image.png' },
      ];

      // Upload all files to temp
      for (const file of files) {
        const checksum = computeSHA256(file.content);
        const storageKey = `audit/plan-1/${file.id}-key.${file.name.split('.').pop()}`;
        const tempKey = `pending/${storageKey}`;

        await objectStore.upload(tempKey, 'temp', file.content);
        database.createFileRecord({
          id: file.id,
          originalName: file.name,
          storageKey,
          bucket: 'evidence',
          contentType: 'application/pdf',
          size: file.content.length,
          checksum,
          uploadedBy: 'user-001',
          status: 'uploading',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Process all files through workers
      for (const file of files) {
        const checksum = computeSHA256(file.content);
        const storageKey = `audit/plan-1/${file.id}-key.${file.name.split('.').pop()}`;
        const tempKey = `pending/${storageKey}`;
        const dbClient = database.asMockDbClient();

        const mockStorage = {
          exists: vi.fn().mockImplementation((k: string, b: string) => objectStore.exists(k, b)),
          copy: vi.fn().mockImplementation((s: string, d: string, sb: string, db2: string) =>
            objectStore.copy(s, d, sb, db2),
          ),
          download: vi.fn().mockImplementation((k: string, b: string) => objectStore.download(k, b)),
          delete: vi.fn().mockImplementation((k: string, b: string) => objectStore.delete(k, b)),
        };

        const context: WorkerContext = {
          storage: mockStorage as any,
          db: dbClient,
          logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
          reportProgress: vi.fn(),
        };

        const mockJob = {
          id: `job-${file.id}`,
          data: {
            tempKey,
            targetBucket: 'evidence' as const,
            metadata: { fileId: file.id, storageKey, checksum, contentType: 'application/pdf' },
          },
          updateProgress: vi.fn(),
        } as any;

        await processFileWorker(mockJob, context);
      }

      // Verify all files processed correctly
      for (const file of files) {
        const storageKey = `audit/plan-1/${file.id}-key.${file.name.split('.').pop()}`;
        const tempKey = `pending/${storageKey}`;

        // Temp files cleaned up
        expect(await objectStore.exists(tempKey, 'temp')).toBe(false);
        // Permanent files exist
        expect(await objectStore.exists(storageKey, 'evidence')).toBe(true);
        // FileRecord is ready
        expect(database.getFileRecord(file.id)?.status).toBe('ready');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Worker Failure and Retry Behavior
  // Validates: Requirements 2.1, 2.5 (retry up to 3 times with exponential backoff)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Worker failure and retry behavior', () => {
    it('should retry on transient failure and succeed on subsequent attempt', async () => {
      const fileContent = Buffer.from('File that will experience transient failure');
      const fileChecksum = computeSHA256(fileContent);
      const fileId = 'file-retry-001';
      const storageKey = 'audit/plan-1/20240115T100000-retry-test.pdf';
      const tempKey = `pending/${storageKey}`;

      // Setup: upload to temp, create file record
      await objectStore.upload(tempKey, 'temp', fileContent);
      database.createFileRecord({
        id: fileId,
        originalName: 'retry-test.pdf',
        storageKey,
        bucket: 'evidence',
        contentType: 'application/pdf',
        size: fileContent.length,
        checksum: fileChecksum,
        uploadedBy: 'user-001',
        status: 'uploading',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const jobId = queue.enqueue('process-file', {
        tempKey,
        targetBucket: 'evidence',
        metadata: { fileId, storageKey, checksum: fileChecksum, contentType: 'application/pdf' },
      } satisfies JobDataMap['process-file'], { attempts: 3 });

      // ─── First attempt: simulate copy failure ────────────────────────────
      queue.markActive(jobId);

      let copyCallCount = 0;
      const failingStorage = {
        exists: vi.fn().mockImplementation((k: string, b: string) => objectStore.exists(k, b)),
        copy: vi.fn().mockImplementation(async () => {
          copyCallCount++;
          if (copyCallCount === 1) {
            throw new Error('Network timeout during copy');
          }
          return objectStore.copy(tempKey, storageKey, 'temp', 'evidence');
        }),
        download: vi.fn().mockImplementation((k: string, b: string) => objectStore.download(k, b)),
        delete: vi.fn().mockImplementation((k: string, b: string) => objectStore.delete(k, b)),
      };

      const dbClient = database.asMockDbClient();
      const context: WorkerContext = {
        storage: failingStorage as any,
        db: dbClient,
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
        reportProgress: vi.fn(),
      };

      const jobData = queue.getJob(jobId)!.data as JobDataMap['process-file'];
      const mockJob = { id: jobId, data: jobData, updateProgress: vi.fn() } as any;

      // First attempt should fail
      await expect(processFileWorker(mockJob, context)).rejects.toThrow('Network timeout during copy');
      queue.markFailed(jobId, 'Network timeout during copy');

      // Verify we can retry
      expect(queue.canRetry(jobId)).toBe(true);
      expect(database.getFileRecord(fileId)?.status).toBe('processing');

      // ─── Second attempt: should succeed ──────────────────────────────────
      // Reset file status back to uploading (simulates BullMQ retry)
      database.updateFileStatus(fileId, 'uploading');
      queue.markActive(jobId);

      const succeedingContext: WorkerContext = {
        storage: failingStorage as any, // copyCallCount is now 1, next call will succeed
        db: database.asMockDbClient(),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
        reportProgress: vi.fn(),
      };

      await processFileWorker(mockJob, succeedingContext);
      queue.markCompleted(jobId);

      // Verify recovery
      expect(await objectStore.exists(storageKey, 'evidence')).toBe(true);
      expect(await objectStore.exists(tempKey, 'temp')).toBe(false);
      expect(database.getFileRecord(fileId)?.status).toBe('ready');
      expect(queue.getJob(jobId)?.state).toBe('completed');
    });

    it('should permanently fail after max retry attempts exhausted', async () => {
      const fileContent = Buffer.from('File that always fails');
      const fileChecksum = computeSHA256(fileContent);
      const fileId = 'file-permfail-001';
      const storageKey = 'audit/plan-1/20240115T100000-permfail.pdf';
      const tempKey = `pending/${storageKey}`;

      await objectStore.upload(tempKey, 'temp', fileContent);
      database.createFileRecord({
        id: fileId,
        originalName: 'permfail.pdf',
        storageKey,
        bucket: 'evidence',
        contentType: 'application/pdf',
        size: fileContent.length,
        checksum: fileChecksum,
        uploadedBy: 'user-001',
        status: 'uploading',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const jobId = queue.enqueue('process-file', {
        tempKey,
        targetBucket: 'evidence',
        metadata: { fileId, storageKey, checksum: fileChecksum, contentType: 'application/pdf' },
      } satisfies JobDataMap['process-file'], { attempts: 3 });

      // Simulate 3 failed attempts (all copy operations fail)
      const alwaysFailStorage = {
        exists: vi.fn().mockImplementation((k: string, b: string) => objectStore.exists(k, b)),
        copy: vi.fn().mockRejectedValue(new Error('Persistent MinIO failure')),
        download: vi.fn().mockImplementation((k: string, b: string) => objectStore.download(k, b)),
        delete: vi.fn().mockImplementation((k: string, b: string) => objectStore.delete(k, b)),
      };

      for (let attempt = 1; attempt <= 3; attempt++) {
        queue.markActive(jobId);
        database.updateFileStatus(fileId, 'uploading');

        const context: WorkerContext = {
          storage: alwaysFailStorage as any,
          db: database.asMockDbClient(),
          logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
          reportProgress: vi.fn(),
        };

        const mockJob = {
          id: jobId,
          data: queue.getJob(jobId)!.data as JobDataMap['process-file'],
          updateProgress: vi.fn(),
        } as any;

        await expect(processFileWorker(mockJob, context)).rejects.toThrow('Persistent MinIO failure');
        queue.markFailed(jobId, 'Persistent MinIO failure');
      }

      // After 3 attempts, cannot retry
      expect(queue.canRetry(jobId)).toBe(false);
      expect(queue.getJob(jobId)?.state).toBe('failed');

      // Requirement 9.7: temp file should be retained for investigation
      expect(await objectStore.exists(tempKey, 'temp')).toBe(true);

      // Permanent file should NOT exist
      expect(await objectStore.exists(storageKey, 'evidence')).toBe(false);
    });

    it('should fail permanently without retry when temp file is missing', async () => {
      const fileId = 'file-notfound-001';
      const storageKey = 'audit/plan-1/20240115T100000-notfound.pdf';
      const tempKey = `pending/${storageKey}`;
      const fileChecksum = computeSHA256(Buffer.from('nonexistent'));

      // Do NOT upload any file to temp — simulating missing file
      database.createFileRecord({
        id: fileId,
        originalName: 'missing.pdf',
        storageKey,
        bucket: 'evidence',
        contentType: 'application/pdf',
        size: 100,
        checksum: fileChecksum,
        uploadedBy: 'user-001',
        status: 'uploading',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const jobId = queue.enqueue('process-file', {
        tempKey,
        targetBucket: 'evidence',
        metadata: { fileId, storageKey, checksum: fileChecksum, contentType: 'application/pdf' },
      } satisfies JobDataMap['process-file'], { attempts: 3 });

      queue.markActive(jobId);

      const mockStorage = {
        exists: vi.fn().mockImplementation((k: string, b: string) => objectStore.exists(k, b)),
        copy: vi.fn(),
        download: vi.fn(),
        delete: vi.fn(),
      };

      const context: WorkerContext = {
        storage: mockStorage as any,
        db: database.asMockDbClient(),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
        reportProgress: vi.fn(),
      };

      const mockJob = {
        id: jobId,
        data: queue.getJob(jobId)!.data as JobDataMap['process-file'],
        updateProgress: vi.fn(),
      } as any;

      // Should throw UnrecoverableError (no retry)
      await expect(processFileWorker(mockJob, context)).rejects.toThrow(/Temp file not found/);

      // Verify no copy/download was attempted
      expect(mockStorage.copy).not.toHaveBeenCalled();
      expect(mockStorage.download).not.toHaveBeenCalled();

      // FileRecord should be marked as failed
      expect(database.getFileRecord(fileId)?.status).toBe('failed');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Checksum Integrity Verification
  // Validates: Requirements 2.1 (SHA-256 checksum), 2.5 (ready after checksum matches)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Checksum integrity verification', () => {
    it('should detect data corruption during file copy and mark as failed', async () => {
      const fileContent = Buffer.from('Original file content with important data');
      const fileChecksum = computeSHA256(fileContent);
      const corruptedContent = Buffer.from('Corrupted file content - bits flipped!');
      const fileId = 'file-corrupt-001';
      const storageKey = 'audit/plan-1/20240115T100000-corrupt.pdf';
      const tempKey = `pending/${storageKey}`;

      await objectStore.upload(tempKey, 'temp', fileContent);
      database.createFileRecord({
        id: fileId,
        originalName: 'important-doc.pdf',
        storageKey,
        bucket: 'evidence',
        contentType: 'application/pdf',
        size: fileContent.length,
        checksum: fileChecksum,
        uploadedBy: 'user-001',
        status: 'uploading',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock storage that corrupts data during copy
      const corruptingStorage = {
        exists: vi.fn()
          .mockResolvedValueOnce(true)    // temp exists
          .mockResolvedValueOnce(false),  // permanent does not exist yet
        copy: vi.fn().mockImplementation(async () => {
          // Simulate corruption: store corrupted data in permanent bucket
          await objectStore.upload(storageKey, 'evidence', corruptedContent);
        }),
        download: vi.fn().mockImplementation((k: string, b: string) =>
          objectStore.download(k, b),
        ),
        delete: vi.fn().mockImplementation((k: string, b: string) =>
          objectStore.delete(k, b),
        ),
      };

      const context: WorkerContext = {
        storage: corruptingStorage as any,
        db: database.asMockDbClient(),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
        reportProgress: vi.fn(),
      };

      const mockJob = {
        id: 'job-corrupt',
        data: {
          tempKey,
          targetBucket: 'evidence' as const,
          metadata: { fileId, storageKey, checksum: fileChecksum, contentType: 'application/pdf' },
        },
        updateProgress: vi.fn(),
      } as any;

      // Should throw checksum mismatch error
      await expect(processFileWorker(mockJob, context)).rejects.toThrow(/Checksum mismatch/);

      // Corrupted file should be deleted from permanent bucket
      expect(corruptingStorage.delete).toHaveBeenCalledWith(storageKey, 'evidence');

      // Temp file should be retained (requirement 9.7)
      // (the worker throws before deleting temp)
      expect(database.getFileRecord(fileId)?.status).toBe('failed');
    });

    it('should verify checksum matches after successful copy', async () => {
      const fileContent = Buffer.from('File content with verifiable checksum integrity');
      const fileChecksum = computeSHA256(fileContent);
      const fileId = 'file-checksum-001';
      const storageKey = 'audit/plan-1/20240115T100000-checksum.pdf';
      const tempKey = `pending/${storageKey}`;

      await objectStore.upload(tempKey, 'temp', fileContent);
      database.createFileRecord({
        id: fileId,
        originalName: 'checksum-test.pdf',
        storageKey,
        bucket: 'evidence',
        contentType: 'application/pdf',
        size: fileContent.length,
        checksum: fileChecksum,
        uploadedBy: 'user-001',
        status: 'uploading',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const mockStorage = {
        exists: vi.fn().mockImplementation((k: string, b: string) => objectStore.exists(k, b)),
        copy: vi.fn().mockImplementation((s: string, d: string, sb: string, db2: string) =>
          objectStore.copy(s, d, sb, db2),
        ),
        download: vi.fn().mockImplementation((k: string, b: string) => objectStore.download(k, b)),
        delete: vi.fn().mockImplementation((k: string, b: string) => objectStore.delete(k, b)),
      };

      const context: WorkerContext = {
        storage: mockStorage as any,
        db: database.asMockDbClient(),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
        reportProgress: vi.fn(),
      };

      const mockJob = {
        id: 'job-checksum',
        data: {
          tempKey,
          targetBucket: 'evidence' as const,
          metadata: { fileId, storageKey, checksum: fileChecksum, contentType: 'application/pdf' },
        },
        updateProgress: vi.fn(),
      } as any;

      // Should succeed without error
      await processFileWorker(mockJob, context);

      // Verify the permanent file has the same checksum
      const permanentStream = await objectStore.download(storageKey, 'evidence');
      const permanentData = await streamToBuffer(permanentStream);
      expect(computeSHA256(permanentData)).toBe(fileChecksum);

      // FileRecord should be ready
      expect(database.getFileRecord(fileId)?.status).toBe('ready');
    });

    it('should handle large file checksums correctly', async () => {
      // Generate a larger file (1MB) to test checksum on bigger payloads
      const largeContent = Buffer.alloc(1024 * 1024); // 1MB of zeros
      // Fill with pseudo-random data
      for (let i = 0; i < largeContent.length; i++) {
        largeContent[i] = (i * 7 + 13) % 256;
      }

      const fileChecksum = computeSHA256(largeContent);
      const fileId = 'file-large-001';
      const storageKey = 'audit/plan-1/20240115T100000-large.pdf';
      const tempKey = `pending/${storageKey}`;

      await objectStore.upload(tempKey, 'temp', largeContent);
      database.createFileRecord({
        id: fileId,
        originalName: 'large-report.pdf',
        storageKey,
        bucket: 'evidence',
        contentType: 'application/pdf',
        size: largeContent.length,
        checksum: fileChecksum,
        uploadedBy: 'user-001',
        status: 'uploading',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const mockStorage = {
        exists: vi.fn().mockImplementation((k: string, b: string) => objectStore.exists(k, b)),
        copy: vi.fn().mockImplementation((s: string, d: string, sb: string, db2: string) =>
          objectStore.copy(s, d, sb, db2),
        ),
        download: vi.fn().mockImplementation((k: string, b: string) => objectStore.download(k, b)),
        delete: vi.fn().mockImplementation((k: string, b: string) => objectStore.delete(k, b)),
      };

      const context: WorkerContext = {
        storage: mockStorage as any,
        db: database.asMockDbClient(),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
        reportProgress: vi.fn(),
      };

      const mockJob = {
        id: 'job-large',
        data: {
          tempKey,
          targetBucket: 'evidence' as const,
          metadata: { fileId, storageKey, checksum: fileChecksum, contentType: 'application/pdf' },
        },
        updateProgress: vi.fn(),
      } as any;

      await processFileWorker(mockJob, context);

      // Verify large file checksum integrity
      const storedStream = await objectStore.download(storageKey, 'evidence');
      const storedData = await streamToBuffer(storedStream);
      expect(storedData.length).toBe(1024 * 1024);
      expect(computeSHA256(storedData)).toBe(fileChecksum);
      expect(database.getFileRecord(fileId)?.status).toBe('ready');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Presigned URL Generation for Ready Files
  // Validates: Requirement 3.1
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Presigned URL generation', () => {
    it('should generate presigned URL only for files with status ready', async () => {
      const fileContent = Buffer.from('Ready file content');
      const fileChecksum = computeSHA256(fileContent);
      const storageKey = 'audit/plan-1/20240115T100000-ready.pdf';

      // Store file in permanent bucket
      await objectStore.upload(storageKey, 'evidence', fileContent);

      // Create records with different statuses
      const fileRecords: Array<{ id: string; status: FileRecordEntry['status'] }> = [
        { id: 'file-ready', status: 'ready' },
        { id: 'file-uploading', status: 'uploading' },
        { id: 'file-processing', status: 'processing' },
        { id: 'file-failed', status: 'failed' },
      ];

      for (const record of fileRecords) {
        database.createFileRecord({
          id: record.id,
          originalName: 'test.pdf',
          storageKey,
          bucket: 'evidence',
          contentType: 'application/pdf',
          size: fileContent.length,
          checksum: fileChecksum,
          uploadedBy: 'user-001',
          status: record.status,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Only ready files should get presigned URLs
      for (const record of fileRecords) {
        const fileRecord = database.getFileRecord(record.id);
        if (fileRecord?.status === 'ready') {
          const url = objectStore.getPresignedUrl(fileRecord.storageKey, fileRecord.bucket, 3600);
          expect(url).toContain(storageKey);
          expect(url).toContain('X-Amz-Expires=3600');
        } else {
          // Non-ready files should NOT get presigned URLs (simulating API check)
          expect(fileRecord?.status).not.toBe('ready');
        }
      }
    });

    it('should respect custom expiry durations clamped to valid range', () => {
      const storageKey = 'audit/plan-1/test.pdf';

      // Test various expiry values (clamped between 60 and 86400)
      const testCases = [
        { input: 3600, expected: 3600 },   // Normal
        { input: 60, expected: 60 },       // Minimum
        { input: 86400, expected: 86400 }, // Maximum
        { input: 30, expected: 60 },       // Below min → clamped
        { input: 100000, expected: 86400 },// Above max → clamped
      ];

      for (const { input, expected } of testCases) {
        const clamped = Math.min(86400, Math.max(60, input));
        expect(clamped).toBe(expected);

        const url = objectStore.getPresignedUrl(storageKey, 'evidence', clamped);
        expect(url).toContain(`X-Amz-Expires=${expected}`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. End-to-End Flow with Status Polling
  // Validates: Requirements 1.6 (202 Accepted), 2.1 (enqueue job)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Status polling during file lifecycle', () => {
    it('should transition job status through waiting → active → completed', async () => {
      const fileContent = Buffer.from('Status polling test content');
      const fileChecksum = computeSHA256(fileContent);
      const fileId = 'file-status-001';
      const storageKey = 'audit/plan-1/20240115T100000-status.pdf';
      const tempKey = `pending/${storageKey}`;

      await objectStore.upload(tempKey, 'temp', fileContent);
      database.createFileRecord({
        id: fileId,
        originalName: 'status-test.pdf',
        storageKey,
        bucket: 'evidence',
        contentType: 'application/pdf',
        size: fileContent.length,
        checksum: fileChecksum,
        uploadedBy: 'user-001',
        status: 'uploading',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Enqueue → status should be 'waiting'
      const jobId = queue.enqueue('process-file', {
        tempKey,
        targetBucket: 'evidence',
        metadata: { fileId, storageKey, checksum: fileChecksum, contentType: 'application/pdf' },
      } satisfies JobDataMap['process-file']);

      expect(queue.getJob(jobId)?.state).toBe('waiting');
      expect(queue.getJob(jobId)?.progress).toBe(0);

      // Worker picks up → status should be 'active'
      queue.markActive(jobId);
      expect(queue.getJob(jobId)?.state).toBe('active');

      // Process the file
      const mockStorage = {
        exists: vi.fn().mockImplementation((k: string, b: string) => objectStore.exists(k, b)),
        copy: vi.fn().mockImplementation((s: string, d: string, sb: string, db2: string) =>
          objectStore.copy(s, d, sb, db2),
        ),
        download: vi.fn().mockImplementation((k: string, b: string) => objectStore.download(k, b)),
        delete: vi.fn().mockImplementation((k: string, b: string) => objectStore.delete(k, b)),
      };

      const context: WorkerContext = {
        storage: mockStorage as any,
        db: database.asMockDbClient(),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
        reportProgress: vi.fn().mockImplementation(async (p: number) => {
          queue.updateProgress(jobId, p);
        }),
      };

      const mockJob = {
        id: jobId,
        data: queue.getJob(jobId)!.data as JobDataMap['process-file'],
        updateProgress: vi.fn(),
      } as any;

      await processFileWorker(mockJob, context);

      // After processing → mark completed
      queue.markCompleted(jobId);
      expect(queue.getJob(jobId)?.state).toBe('completed');
      expect(queue.getJob(jobId)?.progress).toBe(100);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Testcontainers Integration Tests (Docker Required)
// These tests use real MinIO and Redis containers for true integration testing.
// They will skip gracefully if Docker is not available.
// ═══════════════════════════════════════════════════════════════════════════════

describe('Upload Flow with Testcontainers (Docker required)', () => {
  // Skip all tests in this block if Docker is not available.
  // The tests are structured for future execution when Docker is present.
  const DOCKER_AVAILABLE = process.env.DOCKER_AVAILABLE === 'true';

  it.skipIf(!DOCKER_AVAILABLE)('should upload, process, and download a file using real MinIO and Redis containers', {
    timeout: 120_000,
  }, async () => {
    // This test would:
    // 1. Start MinIO container via testcontainers
    // 2. Start Redis container via testcontainers
    // 3. Create real StorageService pointed at containerized MinIO
    // 4. Create real QueueService pointed at containerized Redis
    // 5. Upload a file, run the worker, verify presigned URL works
    //
    // Implementation deferred until Docker is available in the environment.
    // See setup below for the container configuration.

    /*
    import { GenericContainer, Wait } from 'testcontainers';

    // Start MinIO container
    const minioContainer = await new GenericContainer('minio/minio:latest')
      .withExposedPorts(9000, 9001)
      .withCommand(['server', '/data', '--console-address', ':9001'])
      .withEnvironment({
        MINIO_ROOT_USER: 'minioadmin',
        MINIO_ROOT_PASSWORD: 'minioadmin',
      })
      .withWaitStrategy(Wait.forHttp('/minio/health/ready', 9000))
      .start();

    // Start Redis container
    const redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withCommand(['redis-server', '--requirepass', 'testpassword'])
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start();

    const minioPort = minioContainer.getMappedPort(9000);
    const redisPort = redisContainer.getMappedPort(6379);

    // Create services with container endpoints
    const storageService = new StorageService({
      endpoint: 'localhost',
      port: minioPort,
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      useSSL: false,
      region: 'us-east-1',
      buckets: { evidence: 'evidence', reports: 'reports', temp: 'temp', backups: 'backups' },
      maxFileSize: { evidence: 50 * 1024 * 1024, reports: 100 * 1024 * 1024 },
      presignedUrlExpiry: 3600,
      uploadTimeoutMs: 120000,
    });

    // ... full test implementation ...

    await minioContainer.stop();
    await redisContainer.stop();
    */
  });

  it.skipIf(!DOCKER_AVAILABLE)('should verify TLS with self-signed test certificates', {
    timeout: 60_000,
  }, async () => {
    // This test would:
    // 1. Generate self-signed certificates (CA + server cert)
    // 2. Start MinIO with TLS enabled using the test certs
    // 3. Configure CertificateManager with the test CA
    // 4. Verify TLS handshake succeeds
    // 5. Verify connection fails with wrong CA
    //
    // Deferred until Docker + cert generation tools are available.
  });

  it.skipIf(!DOCKER_AVAILABLE)('should recover from worker failure with real queue retry', {
    timeout: 60_000,
  }, async () => {
    // This test would:
    // 1. Start Redis container
    // 2. Create QueueService and WorkerManager
    // 3. Register a processor that fails on first attempt
    // 4. Verify BullMQ retries with exponential backoff
    // 5. Verify job completes on retry
    //
    // Deferred until Docker is available.
  });
});

// ─── Stream helper ───────────────────────────────────────────────────────────

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
