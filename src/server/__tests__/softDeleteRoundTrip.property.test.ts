// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

/**
 * Property Test: Soft Delete Round-Trip (Property 4)
 *
 * Feature: api-audit-improvements
 * Property 4: Soft Delete Round-Trip
 *
 * **Validates: Requirements 8.1, 8.2, 8.3**
 *
 * For any record in any soft-delete-enabled table, performing a soft delete
 * followed by a restore SHALL return the record to its original active state
 * with `deleted_at` equal to null, and while soft-deleted the record SHALL NOT
 * appear in standard query results.
 */

// ─── Hoisted Mocks ──────────────────────────────────────────────────────────

const { mockPrepare, mockTransaction, mockValidateIdentifier } = vi.hoisted(() => ({
  mockPrepare: vi.fn(),
  mockTransaction: vi.fn(),
  mockValidateIdentifier: vi.fn((name: string) => {
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new Error(`Invalid database identifier: ${name}`);
    }
    return name;
  }),
}));

// Mock the database module
vi.mock('../../server/db/index', () => ({
  db: {
    prepare: mockPrepare,
    transaction: mockTransaction,
    validateIdentifier: mockValidateIdentifier,
  },
}));

// Mock N8nService
vi.mock('../../server/utils/n8nService', () => ({
  N8nService: {
    sendEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock AppCodeGenerator
vi.mock('../../server/utils/AppCodeGenerator', () => ({
  AppCodeGenerator: {
    generateCode: vi.fn(),
    generateFindingCode: vi.fn(),
  },
}));

// Mock crypto
vi.mock('crypto', () => ({
  default: {
    createHash: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(() => 'mock-hash-value'),
    })),
  },
}));

import { SoftDeleteService } from '../../server/services/SoftDeleteService';
import { BaseService } from '../../server/services/BaseService';

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates valid table names (alphanumeric + underscore, common entity tables) */
const tableNameArb = fc.constantFrom(
  'audit_plans',
  'audit_tasks',
  'audit_programs',
  'audit_findings',
  'recommendations',
  'risk_register',
  'compliance_items'
);

/** Generates valid record IDs (positive integers) */
const recordIdArb = fc.integer({ min: 1, max: 100000 });

/** Generates valid user UUIDs */
const userIdArb = fc.uuid();

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Sets up the mock database to capture SQL statements and provide sequential responses.
 * Each call to db.prepare(sql) captures the SQL and returns a statement object.
 * The statement's get/all/run methods return the next value from the response queue.
 */
function setupMocksWithResponses(responses: any[]) {
  const sqlCalls: string[] = [];
  let responseIndex = 0;

  mockValidateIdentifier.mockImplementation((name: string) => {
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new Error(`Invalid database identifier: ${name}`);
    }
    return name;
  });

  mockTransaction.mockImplementation((fn: Function) => {
    return async (...args: any[]) => fn(...args);
  });

  mockPrepare.mockImplementation((sql: string) => {
    sqlCalls.push(sql);
    return {
      get: async (..._args: any[]) => responses[responseIndex++],
      all: async (..._args: any[]) => responses[responseIndex++],
      run: async (..._args: any[]) => responses[responseIndex++],
    };
  });

  return { sqlCalls };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 4: Soft Delete Round-Trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('soft delete followed by restore returns record to original active state (deleted_at = null)', async () => {
    await fc.assert(
      fc.asyncProperty(
        tableNameArb,
        recordIdArb,
        userIdArb,
        async (tableName, recordId, userId) => {
          // Responses for the full round-trip:
          // Phase 1 - Soft Delete (inside transaction):
          //   1. UPDATE ... RETURNING id (soft delete main record) -> get
          //   2. SELECT hash FROM audit_trail (get previous hash) -> get
          //   3. INSERT INTO audit_trail (log audit) -> run
          // Phase 2 - Restore (no transaction):
          //   4. UPDATE ... SET deleted_at = NULL ... RETURNING id -> get
          //   5. SELECT hash FROM audit_trail (get previous hash) -> get
          //   6. INSERT INTO audit_trail (log audit) -> run
          const { sqlCalls } = setupMocksWithResponses([
            { id: recordId },                              // 0: soft delete RETURNING
            { hash: 'prev-hash' },                         // 1: audit hash
            { lastInsertRowid: 1, changes: 1 },            // 2: audit insert
            { id: recordId },                              // 3: restore RETURNING
            { hash: 'prev-hash' },                         // 4: audit hash
            { lastInsertRowid: 2, changes: 1 },            // 5: audit insert
          ]);

          // Phase 1: Soft Delete
          await SoftDeleteService.softDelete({
            tableName,
            id: recordId,
            deletedBy: userId,
          });

          // Verify soft delete SQL sets deleted_at and requires record is not already deleted
          const softDeleteSql = sqlCalls[0];
          expect(softDeleteSql).toContain('deleted_at');
          expect(softDeleteSql).toContain('deleted_by');
          expect(softDeleteSql).toContain('deleted_at IS NULL');

          // Phase 2: Restore
          await SoftDeleteService.restore(tableName, recordId, userId);

          // Find the restore SQL (should clear deleted_at and deleted_by)
          const restoreSql = sqlCalls.find(sql =>
            sql.includes('SET deleted_at = NULL') && sql.includes('deleted_by = NULL')
          );
          expect(restoreSql).toBeDefined();
          expect(restoreSql!).toContain('deleted_at IS NOT NULL');

          // The round-trip property: after soft delete + restore,
          // the restore SQL clears deleted_at and deleted_by back to NULL
          // confirming the record returns to its original active state
          expect(restoreSql!).toContain('SET deleted_at = NULL, deleted_by = NULL');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('soft-deleted records do not appear in standard findAll queries (deleted_at IS NULL filter)', async () => {
    await fc.assert(
      fc.asyncProperty(
        tableNameArb,
        fc.integer({ min: 1, max: 10 }),
        async (tableName, totalActiveRecords) => {
          // findAll makes 2 prepare calls: COUNT and SELECT
          const activeRecords = Array.from({ length: totalActiveRecords }, (_, i) => ({
            id: i + 1,
            title: `Active Record ${i + 1}`,
            deleted_at: null,
          }));

          const { sqlCalls } = setupMocksWithResponses([
            { total: totalActiveRecords },  // 0: COUNT query -> get
            activeRecords,                   // 1: SELECT query -> all
          ]);

          const result = await BaseService.findAll(tableName, { page: 1, pageSize: 20 });

          // Both COUNT and SELECT queries must include the soft-delete exclusion filter
          expect(sqlCalls.length).toBeGreaterThanOrEqual(2);
          const countQuery = sqlCalls[0];
          const selectQuery = sqlCalls[1];
          expect(countQuery).toContain('deleted_at IS NULL');
          expect(selectQuery).toContain('deleted_at IS NULL');

          // Verify no returned records have deleted_at set (all are active)
          expect(Array.isArray(result.data)).toBe(true);
          for (const record of result.data) {
            expect(record.deleted_at).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('soft-deleted records do not appear in standard findById queries (deleted_at IS NULL filter)', async () => {
    await fc.assert(
      fc.asyncProperty(
        tableNameArb,
        recordIdArb,
        async (tableName, recordId) => {
          // findById returns null when record is soft-deleted (filtered by deleted_at IS NULL)
          const { sqlCalls } = setupMocksWithResponses([
            null, // 0: SELECT ... WHERE id = ? AND deleted_at IS NULL -> get returns null
          ]);

          // findById should throw NotFoundError for soft-deleted records
          await expect(
            BaseService.findById(tableName, recordId)
          ).rejects.toThrow();

          // Verify the query includes the soft-delete exclusion filter
          const findByIdQuery = sqlCalls[0];
          expect(findByIdQuery).toContain('deleted_at IS NULL');
          expect(findByIdQuery).toContain('WHERE id = ?');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('restore only succeeds on soft-deleted records (requires deleted_at IS NOT NULL)', async () => {
    await fc.assert(
      fc.asyncProperty(
        tableNameArb,
        recordIdArb,
        userIdArb,
        async (tableName, recordId, userId) => {
          // Mock: restore on a record that is NOT soft-deleted returns null
          const { sqlCalls } = setupMocksWithResponses([
            null, // 0: UPDATE ... WHERE deleted_at IS NOT NULL -> get returns null
          ]);

          // Restore should throw NotFoundError for records that aren't soft-deleted
          await expect(
            SoftDeleteService.restore(tableName, recordId, userId)
          ).rejects.toThrow();

          // Verify the SQL requires deleted_at IS NOT NULL
          const restoreQuery = sqlCalls[0];
          expect(restoreQuery).toContain('deleted_at IS NOT NULL');
        }
      ),
      { numRuns: 100 }
    );
  });
});
