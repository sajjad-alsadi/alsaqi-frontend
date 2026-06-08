// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

/**
 * Property Test: Backup Retention Deletes Only Expired Records (Property 6)
 *
 * Feature: production-readiness-review
 * Property 6: Backup retention deletes only expired records
 *
 * **Validates: Requirements 7.3**
 *
 * For any set of backup records with varying timestamps and for any retention
 * period N days, executing the retention cleanup SHALL delete exactly those
 * records whose `started_at` is older than N days and preserve all records
 * newer than N days.
 */

// ─── Mock Setup ──────────────────────────────────────────────────────────────

// Track database operations
let mockDbRecords: Array<{ id: string; file_path: string; started_at: string; status: string }> = [];
let deletedRecordIds: string[] = [];

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    statSync: vi.fn(() => ({ isDirectory: () => false })),
    unlinkSync: vi.fn(),
    rmSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    createReadStream: vi.fn(),
    readdirSync: vi.fn(() => []),
  },
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
  unlinkSync: vi.fn(),
  rmSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  createReadStream: vi.fn(),
  readdirSync: vi.fn(() => []),
}));

// Mock node-cron
vi.mock('node-cron', () => ({
  default: {
    validate: vi.fn(() => true),
    schedule: vi.fn(() => ({ stop: vi.fn() })),
  },
}));

// Mock @aws-sdk/client-s3
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: vi.fn() })),
  PutObjectCommand: vi.fn(),
}));

// Mock the logger
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the db module
vi.mock('../../db/index', () => ({
  db: {
    isExternal: false,
    prepare: vi.fn((sql: string) => {
      if (sql.includes('SELECT') && sql.includes('backup_history') && sql.includes('started_at <')) {
        return {
          all: vi.fn((...args: any[]) => {
            const cutoffStr = args[0];
            // Return records older than the cutoff and not running
            return mockDbRecords.filter(
              (r) => r.started_at < cutoffStr && r.status !== 'running'
            );
          }),
        };
      }
      if (sql.includes('DELETE FROM backup_history')) {
        return {
          run: vi.fn((...args: any[]) => {
            const id = args[0];
            deletedRecordIds.push(id);
          }),
        };
      }
      // Default for other queries (INSERT, UPDATE, SELECT)
      return {
        all: vi.fn(() => []),
        run: vi.fn(),
      };
    }),
    validateIdentifier: vi.fn((name: string) => name),
  },
}));

import { BackupScheduler } from '../backup';

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates a retention period between 1 and 365 days */
const retentionDaysArb = fc.integer({ min: 1, max: 365 });

/**
 * Generates a backup record with a timestamp at a given days offset from now.
 * daysAgo: 0 = now, positive = in the past
 */
function backupRecordArb(now: Date) {
  return fc.record({
    id: fc.uuid(),
    daysAgo: fc.integer({ min: -30, max: 730 }),
    status: fc.constantFrom('success', 'partial', 'failed') as fc.Arbitrary<string>,
  }).map(({ id, daysAgo, status }) => {
    const recordDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    return {
      id,
      file_path: `/backups/backup_${id}.sql.gz`,
      started_at: recordDate.toISOString(),
      status,
    };
  });
}

/** Generates a non-empty array of backup records */
function backupRecordsArb(now: Date) {
  return fc.array(backupRecordArb(now), { minLength: 1, maxLength: 20 });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 6: Backup retention deletes only expired records', () => {
  const fixedNow = new Date('2024-06-15T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    mockDbRecords = [];
    deletedRecordIds = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('for any set of records and retention period N, only records older than N days are deleted', async () => {
    await fc.assert(
      fc.asyncProperty(
        backupRecordsArb(fixedNow),
        retentionDaysArb,
        async (records, retentionDays) => {
          // Reset tracking state
          mockDbRecords = records;
          deletedRecordIds = [];

          // Compute expected cutoff (same logic as applyRetentionPolicy)
          const cutoffDate = new Date(fixedNow.getTime());
          cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
          const cutoffStr = cutoffDate.toISOString();

          // Determine which records SHOULD be deleted (older than cutoff, not running)
          const expectedDeleted = records.filter(
            (r) => r.started_at < cutoffStr && r.status !== 'running'
          );
          const expectedPreserved = records.filter(
            (r) => r.started_at >= cutoffStr || r.status === 'running'
          );

          // Create scheduler with the given retention period and call applyRetentionPolicy
          const scheduler = new BackupScheduler({ retentionDays });

          // Access the private method via prototype and await it
          await (scheduler as any).applyRetentionPolicy();

          // Verify: exactly the expired records were deleted
          const expectedDeletedIds = new Set(expectedDeleted.map((r) => r.id));
          const actualDeletedIds = new Set(deletedRecordIds);

          // All expired records should be deleted
          for (const id of expectedDeletedIds) {
            expect(actualDeletedIds.has(id)).toBe(true);
          }

          // No preserved records should be deleted
          for (const record of expectedPreserved) {
            expect(actualDeletedIds.has(record.id)).toBe(false);
          }

          // Total deleted count matches
          expect(deletedRecordIds.length).toBe(expectedDeleted.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('records exactly at the retention boundary are preserved (not deleted)', async () => {
    await fc.assert(
      fc.asyncProperty(
        retentionDaysArb,
        fc.uuid(),
        async (retentionDays, id) => {
          // Reset tracking state
          deletedRecordIds = [];

          // Create a record exactly at the boundary (exactly N days ago)
          const cutoffDate = new Date(fixedNow.getTime());
          cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

          const boundaryRecord = {
            id,
            file_path: `/backups/backup_${id}.sql.gz`,
            started_at: cutoffDate.toISOString(),
            status: 'success',
          };

          mockDbRecords = [boundaryRecord];

          const scheduler = new BackupScheduler({ retentionDays });
          await (scheduler as any).applyRetentionPolicy();

          // The query uses started_at < cutoffStr (strict less than),
          // so boundary records (started_at === cutoffStr) should NOT be deleted
          expect(deletedRecordIds).not.toContain(id);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('records newer than retention period are always preserved', async () => {
    await fc.assert(
      fc.asyncProperty(
        retentionDaysArb,
        fc.uuid(),
        fc.integer({ min: 0, max: 364 }),
        async (retentionDays, id, daysBeforeRetention) => {
          // Reset tracking state
          deletedRecordIds = [];

          // Create a record strictly newer than the retention cutoff
          const daysAgo = Math.max(0, retentionDays - daysBeforeRetention - 1);
          const recordDate = new Date(fixedNow.getTime() - daysAgo * 24 * 60 * 60 * 1000);

          const newRecord = {
            id,
            file_path: `/backups/backup_${id}.sql.gz`,
            started_at: recordDate.toISOString(),
            status: 'success',
          };

          mockDbRecords = [newRecord];

          const scheduler = new BackupScheduler({ retentionDays });
          await (scheduler as any).applyRetentionPolicy();

          // Record newer than retention period should NOT be deleted
          expect(deletedRecordIds).not.toContain(id);
        }
      ),
      { numRuns: 100 }
    );
  });
});
