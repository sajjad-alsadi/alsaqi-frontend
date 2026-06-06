// @vitest-environment node
/**
 * Unit tests for process-file worker.
 *
 * Tests the complete file processing lifecycle:
 * - Temp file existence verification
 * - File copy from temp to permanent bucket
 * - SHA-256 checksum verification
 * - Temp file cleanup
 * - FileRecord status transitions
 * - Progress reporting
 * - Idempotent processing
 *
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 5.3, 9.5, 9.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import type { WorkerContext } from '../services/worker-manager.js';
import type { JobDataMap } from '../services/queue.service.js';
import { processFileWorker } from './process-file.worker.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeSHA256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function bufferToReadable(buf: Buffer): Readable {
  return Readable.from(buf);
}

// ─── Mock factories ──────────────────────────────────────────────────────────

function createMockStorage(overrides: Record<string, unknown> = {}) {
  return {
    exists: vi.fn().mockResolvedValue(true),
    copy: vi.fn().mockResolvedValue({ key: '', bucket: 'evidence', etag: '', size: 0, url: '' }),
    download: vi.fn().mockResolvedValue(bufferToReadable(Buffer.from('test'))),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockDb(rows: Array<{ id: string; status: string }> = []) {
  return {
    query: vi.fn().mockImplementation((text: string, _params: unknown[]) => {
      if (text.startsWith('SELECT')) {
        return Promise.resolve({ rows });
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

function createMockJob(data: {
  tempKey: string;
  targetBucket: 'evidence' | 'reports' | 'temp' | 'backups';
  metadata: {
    fileId: string;
    storageKey: string;
    checksum: string;
    contentType: string;
  };
}) {
  return {
    id: 'test-job-1',
    data,
    updateProgress: vi.fn(),
  } as any;
}

function createContext(overrides: Partial<WorkerContext> = {}): WorkerContext {
  const progressValues: number[] = [];
  return {
    storage: createMockStorage() as any,
    db: createMockDb([{ id: 'file-1', status: 'uploading' }]),
    logger: createMockLogger() as any,
    reportProgress: vi.fn().mockImplementation(async (p: number) => { progressValues.push(p); }),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('processFileWorker', () => {
  const fileContent = Buffer.from('hello world file content');
  const fileChecksum = computeSHA256(fileContent);

  const jobData = {
    tempKey: 'pending/audit/abc/20240101T120000-uuid.pdf',
    targetBucket: 'evidence' as const,
    metadata: {
      fileId: 'file-1',
      storageKey: 'audit/abc/20240101T120000-uuid.pdf',
      checksum: fileChecksum,
      contentType: 'application/pdf',
    },
  };

  describe('happy path', () => {
    it('should process file successfully through all steps', async () => {
      const storage = createMockStorage({
        exists: vi.fn()
          .mockResolvedValueOnce(true)   // temp file exists
          .mockResolvedValueOnce(false), // permanent file does not exist yet
        download: vi.fn().mockResolvedValue(bufferToReadable(fileContent)),
      });

      const db = createMockDb([{ id: 'file-1', status: 'uploading' }]);
      const progressValues: number[] = [];

      const context: WorkerContext = {
        storage: storage as any,
        db,
        logger: createMockLogger() as any,
        reportProgress: vi.fn().mockImplementation(async (p: number) => {
          progressValues.push(p);
        }),
      };

      const job = createMockJob(jobData);

      await processFileWorker(job, context);

      // Verify temp file existence was checked
      expect(storage.exists).toHaveBeenCalledWith(jobData.tempKey, 'temp');

      // Verify file was copied
      expect(storage.copy).toHaveBeenCalledWith(
        jobData.tempKey,
        jobData.metadata.storageKey,
        'temp',
        'evidence',
      );

      // Verify checksum verification (download from permanent)
      expect(storage.download).toHaveBeenCalledWith(
        jobData.metadata.storageKey,
        'evidence',
      );

      // Verify temp file was deleted
      expect(storage.delete).toHaveBeenCalledWith(jobData.tempKey, 'temp');

      // Verify FileRecord status updates
      expect(db.query).toHaveBeenCalledWith(
        'UPDATE files SET status = $1, "updatedAt" = NOW() WHERE id = $2',
        ['processing', 'file-1'],
      );
      expect(db.query).toHaveBeenCalledWith(
        'UPDATE files SET status = $1, "updatedAt" = NOW() WHERE id = $2',
        ['ready', 'file-1'],
      );

      // Verify progress is monotonically non-decreasing
      expect(progressValues).toEqual([10, 50, 70, 80, 100]);
      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
      }
    });
  });

  describe('temp file missing', () => {
    it('should throw UnrecoverableError when temp file does not exist', async () => {
      const storage = createMockStorage({
        exists: vi.fn().mockResolvedValue(false),
      });

      const db = createMockDb([{ id: 'file-1', status: 'uploading' }]);
      const context: WorkerContext = {
        storage: storage as any,
        db,
        logger: createMockLogger() as any,
        reportProgress: vi.fn(),
      };

      const job = createMockJob(jobData);

      await expect(processFileWorker(job, context)).rejects.toThrow(
        /Temp file not found/,
      );

      // Should update status to 'failed'
      expect(db.query).toHaveBeenCalledWith(
        'UPDATE files SET status = $1, "updatedAt" = NOW() WHERE id = $2',
        ['failed', 'file-1'],
      );

      // Should NOT attempt copy or delete
      expect(storage.copy).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });
  });

  describe('checksum mismatch', () => {
    it('should delete corrupted file and mark as failed on checksum mismatch', async () => {
      const corruptedContent = Buffer.from('corrupted data');

      const storage = createMockStorage({
        exists: vi.fn()
          .mockResolvedValueOnce(true)   // temp exists
          .mockResolvedValueOnce(false), // permanent does not exist
        download: vi.fn().mockResolvedValue(bufferToReadable(corruptedContent)),
      });

      const db = createMockDb([{ id: 'file-1', status: 'uploading' }]);
      const context: WorkerContext = {
        storage: storage as any,
        db,
        logger: createMockLogger() as any,
        reportProgress: vi.fn(),
      };

      const job = createMockJob(jobData);

      await expect(processFileWorker(job, context)).rejects.toThrow(
        /Checksum mismatch/,
      );

      // Should delete the corrupted permanent file
      expect(storage.delete).toHaveBeenCalledWith(
        jobData.metadata.storageKey,
        'evidence',
      );

      // Should NOT delete temp file (retained for investigation, req 9.7)
      expect(storage.delete).not.toHaveBeenCalledWith(jobData.tempKey, 'temp');

      // Should update FileRecord to 'failed'
      expect(db.query).toHaveBeenCalledWith(
        'UPDATE files SET status = $1, "updatedAt" = NOW() WHERE id = $2',
        ['failed', 'file-1'],
      );
    });
  });

  describe('idempotent processing', () => {
    it('should skip copy when permanent file already exists with correct checksum', async () => {
      const storage = createMockStorage({
        exists: vi.fn()
          .mockResolvedValueOnce(true)  // temp exists
          .mockResolvedValueOnce(true), // permanent already exists
        download: vi.fn().mockResolvedValue(bufferToReadable(fileContent)),
      });

      const db = createMockDb([{ id: 'file-1', status: 'processing' }]);
      const context: WorkerContext = {
        storage: storage as any,
        db,
        logger: createMockLogger() as any,
        reportProgress: vi.fn(),
      };

      const job = createMockJob(jobData);

      await processFileWorker(job, context);

      // Should NOT call copy since file already exists with correct checksum
      expect(storage.copy).not.toHaveBeenCalled();

      // Should still delete temp file
      expect(storage.delete).toHaveBeenCalledWith(jobData.tempKey, 'temp');
    });

    it('should re-copy when permanent file exists but has wrong checksum', async () => {
      const wrongContent = Buffer.from('wrong content');

      const storage = createMockStorage({
        exists: vi.fn()
          .mockResolvedValueOnce(true)  // temp exists
          .mockResolvedValueOnce(true), // permanent exists (but wrong checksum)
        download: vi.fn()
          .mockResolvedValueOnce(bufferToReadable(wrongContent))  // first download: existing file (wrong checksum)
          .mockResolvedValueOnce(bufferToReadable(fileContent)),   // second download: after re-copy (correct)
      });

      const db = createMockDb([{ id: 'file-1', status: 'uploading' }]);
      const context: WorkerContext = {
        storage: storage as any,
        db,
        logger: createMockLogger() as any,
        reportProgress: vi.fn(),
      };

      const job = createMockJob(jobData);

      await processFileWorker(job, context);

      // Should delete the corrupted existing file first
      expect(storage.delete).toHaveBeenCalledWith(
        jobData.metadata.storageKey,
        'evidence',
      );

      // Should then copy the file
      expect(storage.copy).toHaveBeenCalledWith(
        jobData.tempKey,
        jobData.metadata.storageKey,
        'temp',
        'evidence',
      );
    });

    it('should not update status to processing if already in processing state', async () => {
      const storage = createMockStorage({
        exists: vi.fn()
          .mockResolvedValueOnce(true)   // temp exists
          .mockResolvedValueOnce(false), // permanent does not exist
        download: vi.fn().mockResolvedValue(bufferToReadable(fileContent)),
      });

      const db = createMockDb([{ id: 'file-1', status: 'processing' }]);
      const context: WorkerContext = {
        storage: storage as any,
        db,
        logger: createMockLogger() as any,
        reportProgress: vi.fn(),
      };

      const job = createMockJob(jobData);

      await processFileWorker(job, context);

      // Should NOT update to 'processing' since it's already in that state
      const updateCalls = (db.query as any).mock.calls.filter(
        (call: any[]) =>
          call[0].includes('UPDATE') && call[1][0] === 'processing',
      );
      expect(updateCalls).toHaveLength(0);
    });
  });

  describe('progress reporting', () => {
    it('should report progress values that are monotonically non-decreasing', async () => {
      const storage = createMockStorage({
        exists: vi.fn()
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(false),
        download: vi.fn().mockResolvedValue(bufferToReadable(fileContent)),
      });

      const db = createMockDb([{ id: 'file-1', status: 'uploading' }]);
      const progressValues: number[] = [];
      const context: WorkerContext = {
        storage: storage as any,
        db,
        logger: createMockLogger() as any,
        reportProgress: vi.fn().mockImplementation(async (p: number) => {
          progressValues.push(p);
        }),
      };

      const job = createMockJob(jobData);

      await processFileWorker(job, context);

      // All progress values should be in [0, 100]
      for (const p of progressValues) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(100);
      }

      // Should be monotonically non-decreasing
      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
      }

      // Final progress should be 100
      expect(progressValues[progressValues.length - 1]).toBe(100);
    });
  });
});
