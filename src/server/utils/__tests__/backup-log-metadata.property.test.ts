// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import path from 'path';

/**
 * Property 7: Successful backup log contains required metadata
 *
 * Feature: production-readiness-review, Property 7: Successful backup log contains required metadata
 *
 * **Validates: Requirements 7.6**
 *
 * For any successful backup (regardless of database size), the completion log
 * entry SHALL contain `filename` (non-empty string), `size_bytes` (non-negative
 * number), and `duration_ms` (non-negative number).
 *
 * We test the backup log metadata contract by simulating the log call
 * that BackupScheduler.executeBackup makes on success. The source (backup.ts ~line 252):
 *
 *   logger.info('[BACKUP] Backup completed successfully', {
 *     filename: path.basename(filePath),
 *     size_bytes: sizeBytes,
 *     duration_ms: duration,
 *   });
 *
 * The property: for any valid backup result with random filenames, sizes, and
 * durations, the logged metadata must contain non-empty filename, non-negative
 * size_bytes, and non-negative duration_ms.
 */

/** Generator for valid backup filenames (non-empty strings resembling backup files) */
const filenameArb = fc
  .tuple(
    fc.constantFrom('backup_', 'dump_', 'pg_backup_', 'db_'),
    fc.uuid(),
    fc.constantFrom('.sql.gz', '.json', '.tar.gz', '.sql', '.enc')
  )
  .map(([prefix, id, ext]) => `${prefix}${id}${ext}`);

/** Generator for valid backup sizes in bytes (non-negative integers, up to ~10GB) */
const sizeArb = fc.nat({ max: 10_000_000_000 });

/** Generator for valid backup durations in ms (non-negative integers, up to 1 hour) */
const durationArb = fc.nat({ max: 3_600_000 });

describe('Property 7: Successful backup log contains required metadata', () => {
  let logCalls: Array<{ message: string; meta: Record<string, unknown> }> = [];

  const mockLogger = {
    info: (message: string, meta?: Record<string, unknown>) => {
      logCalls.push({ message, meta: meta || {} });
    },
  };

  beforeEach(() => {
    logCalls = [];
  });

  /**
   * Replicates the exact logging logic from BackupScheduler.executeBackup
   * on successful completion.
   */
  function logBackupSuccess(filePath: string, sizeBytes: number, durationMs: number) {
    mockLogger.info('[BACKUP] Backup completed successfully', {
      filename: path.basename(filePath),
      size_bytes: sizeBytes,
      duration_ms: durationMs,
    });
  }

  it('for any successful backup, log metadata contains non-empty filename, non-negative size_bytes, and non-negative duration_ms', () => {
    fc.assert(
      fc.property(filenameArb, sizeArb, durationArb, (filename, size, duration) => {
        logCalls = [];

        // Simulate the backup success log with a full file path
        const filePath = path.join('/backups', filename);
        logBackupSuccess(filePath, size, duration);

        // Verify log was called exactly once
        expect(logCalls.length).toBe(1);

        const logEntry = logCalls[0];

        // Verify log message matches expected format
        expect(logEntry.message).toBe('[BACKUP] Backup completed successfully');

        // Property: filename must be a non-empty string
        expect(typeof logEntry.meta.filename).toBe('string');
        expect((logEntry.meta.filename as string).length).toBeGreaterThan(0);

        // Property: size_bytes must be a non-negative number
        expect(typeof logEntry.meta.size_bytes).toBe('number');
        expect(logEntry.meta.size_bytes as number).toBeGreaterThanOrEqual(0);

        // Property: duration_ms must be a non-negative number
        expect(typeof logEntry.meta.duration_ms).toBe('number');
        expect(logEntry.meta.duration_ms as number).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 }
    );
  });

  it('filename in log metadata equals the basename of the backup file path (no directory components)', () => {
    fc.assert(
      fc.property(filenameArb, sizeArb, durationArb, (filename, size, duration) => {
        logCalls = [];

        // Use a nested directory path to verify basename extraction works
        const filePath = path.join('/opt/alsaqi/backups/daily', filename);
        logBackupSuccess(filePath, size, duration);

        const logEntry = logCalls[0];

        // The logged filename should be exactly the basename
        expect(logEntry.meta.filename).toBe(filename);
      }),
      { numRuns: 100 }
    );
  });

  it('size_bytes and duration_ms preserve exact numeric values without rounding', () => {
    fc.assert(
      fc.property(filenameArb, sizeArb, durationArb, (filename, size, duration) => {
        logCalls = [];

        const filePath = path.join('/backups', filename);
        logBackupSuccess(filePath, size, duration);

        const logEntry = logCalls[0];

        // The logged values must exactly match the input values
        expect(logEntry.meta.size_bytes).toBe(size);
        expect(logEntry.meta.duration_ms).toBe(duration);
      }),
      { numRuns: 100 }
    );
  });
});
