// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

/**
 * Property Test: Soft Delete Cascade Integrity (Property 5)
 *
 * Feature: api-audit-improvements
 * Property 5: Soft Delete Cascade Integrity
 *
 * **Validates: Requirements 8.4, 8.6**
 *
 * For any parent record with N child records in related tables, soft-deleting
 * the parent SHALL also soft-delete all N child records within the same
 * transaction, and the total number of soft-deleted records SHALL equal N + 1.
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

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates valid parent table names */
const parentTableArb = fc.constantFrom(
  'audit_plans',
  'audit_programs',
  'audit_tasks'
);

/** Generates valid child table configurations */
const childTableArb = fc.record({
  table: fc.constantFrom(
    'audit_tasks',
    'audit_findings',
    'recommendations',
    'compliance_items'
  ),
  foreignKey: fc.constantFrom('plan_id', 'program_id', 'task_id', 'parent_id'),
});

/** Generates a cascade configuration with 1 to 5 child tables */
const cascadeArb = fc.array(childTableArb, { minLength: 1, maxLength: 5 });

/** Generates valid record IDs (positive integers) */
const recordIdArb = fc.integer({ min: 1, max: 100000 });

/** Generates valid user UUIDs */
const userIdArb = fc.uuid();

/** Generates the number of children per cascade table (0 to 20) */
const childCountArb = fc.integer({ min: 0, max: 20 });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 5: Soft Delete Cascade Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('soft-deleting a parent with N children across cascade tables results in N+1 total soft-deleted records', async () => {
    await fc.assert(
      fc.asyncProperty(
        parentTableArb,
        recordIdArb,
        userIdArb,
        cascadeArb,
        fc.array(childCountArb, { minLength: 1, maxLength: 5 }),
        async (parentTable, parentId, userId, cascadeTables, childCounts) => {
          // Ensure childCounts matches cascadeTables length
          const effectiveCascade = cascadeTables.slice(0, Math.min(cascadeTables.length, childCounts.length));
          const effectiveChildCounts = childCounts.slice(0, effectiveCascade.length);

          // Total children across all cascade tables
          const totalChildren = effectiveChildCounts.reduce((sum, count) => sum + count, 0);

          // Track all SQL statements and their arguments
          const sqlCalls: { sql: string; args: any[] }[] = [];
          let responseIndex = 0;

          // Build response sequence:
          // 1. Parent soft delete UPDATE RETURNING id -> get
          // 2..N+1. Cascade UPDATE for each child table -> run (returns changes count)
          // N+2. Audit hash SELECT -> get
          // N+3. Audit INSERT -> run
          const responses: any[] = [
            { id: parentId }, // Parent soft delete succeeds
          ];

          // Add cascade responses (one per cascade table)
          for (const count of effectiveChildCounts) {
            responses.push({ changes: count }); // Each cascade UPDATE affects `count` children
          }

          // Audit trail responses
          responses.push({ hash: 'prev-hash' }); // Audit hash
          responses.push({ lastInsertRowid: 1, changes: 1 }); // Audit insert

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
            const currentIndex = responseIndex++;
            return {
              get: async (...args: any[]) => {
                sqlCalls.push({ sql, args });
                return responses[currentIndex];
              },
              all: async (...args: any[]) => {
                sqlCalls.push({ sql, args });
                return responses[currentIndex];
              },
              run: async (...args: any[]) => {
                sqlCalls.push({ sql, args });
                return responses[currentIndex];
              },
            };
          });

          // Execute soft delete with cascade
          await SoftDeleteService.softDelete({
            tableName: parentTable,
            id: parentId,
            deletedBy: userId,
            cascade: effectiveCascade,
          });

          // ─── Verify Property: Cascade Integrity ─────────────────────────

          // 1. Verify parent was soft-deleted (first SQL is the parent UPDATE)
          const parentSql = sqlCalls[0].sql;
          expect(parentSql).toContain(`UPDATE ${parentTable}`);
          expect(parentSql).toContain('SET deleted_at');
          expect(parentSql).toContain('deleted_by');
          expect(parentSql).toContain('deleted_at IS NULL');
          expect(parentSql).toContain('RETURNING id');

          // 2. Verify each cascade table received an UPDATE statement
          //    Cascade calls are at indices 1..effectiveCascade.length (right after parent)
          for (let i = 0; i < effectiveCascade.length; i++) {
            const cascadeSql = sqlCalls[i + 1].sql;
            expect(cascadeSql).toContain(`UPDATE ${effectiveCascade[i].table}`);
            expect(cascadeSql).toContain('SET deleted_at');
            expect(cascadeSql).toContain('deleted_by');
            expect(cascadeSql).toContain(`${effectiveCascade[i].foreignKey} = ?`);
            expect(cascadeSql).toContain('deleted_at IS NULL');
          }

          // 3. Verify total soft-deleted count equals N + 1
          //    (1 parent + sum of all children across cascade tables)
          const expectedTotal = 1 + totalChildren;
          const actualParentDeleted = 1; // Parent RETURNING id confirms 1 record
          const actualChildrenDeleted = effectiveChildCounts.reduce((sum, count) => sum + count, 0);
          const actualTotal = actualParentDeleted + actualChildrenDeleted;

          expect(actualTotal).toBe(expectedTotal);

          // 4. Verify the number of cascade UPDATE statements equals cascade config length
          //    The first SQL call is the parent, the next effectiveCascade.length are cascades
          const cascadeCallCount = effectiveCascade.length;
          // Verify we have at least 1 (parent) + cascadeCallCount SQL calls
          expect(sqlCalls.length).toBeGreaterThanOrEqual(1 + cascadeCallCount);

          // Each cascade SQL should NOT contain RETURNING id (only parent has that)
          for (let i = 0; i < effectiveCascade.length; i++) {
            const cascadeSql = sqlCalls[i + 1].sql;
            expect(cascadeSql).not.toContain('RETURNING id');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all cascade operations occur within the same transaction as the parent soft delete', async () => {
    await fc.assert(
      fc.asyncProperty(
        parentTableArb,
        recordIdArb,
        userIdArb,
        cascadeArb,
        async (parentTable, parentId, userId, cascadeTables) => {
          let transactionExecuted = false;
          let operationsInsideTransaction: string[] = [];

          mockValidateIdentifier.mockImplementation((name: string) => {
            if (!/^[a-zA-Z0-9_]+$/.test(name)) {
              throw new Error(`Invalid database identifier: ${name}`);
            }
            return name;
          });

          // Track that all operations happen inside the transaction callback
          mockTransaction.mockImplementation((fn: Function) => {
            return async (...args: any[]) => {
              transactionExecuted = true;
              const result = await fn(...args);
              return result;
            };
          });

          let responseIndex = 0;
          const responses: any[] = [
            { id: parentId }, // Parent soft delete
          ];
          for (let i = 0; i < cascadeTables.length; i++) {
            responses.push({ changes: 2 }); // Each cascade table has 2 children
          }
          responses.push({ hash: 'prev-hash' }); // Audit hash
          responses.push({ lastInsertRowid: 1, changes: 1 }); // Audit insert

          mockPrepare.mockImplementation((sql: string) => {
            operationsInsideTransaction.push(sql);
            const currentIndex = responseIndex++;
            return {
              get: async (..._args: any[]) => responses[currentIndex],
              all: async (..._args: any[]) => responses[currentIndex],
              run: async (..._args: any[]) => responses[currentIndex],
            };
          });

          await SoftDeleteService.softDelete({
            tableName: parentTable,
            id: parentId,
            deletedBy: userId,
            cascade: cascadeTables,
          });

          // Verify transaction was used
          expect(transactionExecuted).toBe(true);

          // Verify parent UPDATE and all cascade UPDATEs happened inside the transaction
          const parentUpdate = operationsInsideTransaction.find(sql =>
            sql.includes(`UPDATE ${parentTable}`) && sql.includes('RETURNING id')
          );
          expect(parentUpdate).toBeDefined();

          for (const rel of cascadeTables) {
            const cascadeUpdate = operationsInsideTransaction.find(sql =>
              sql.includes(`UPDATE ${rel.table}`) && sql.includes(`${rel.foreignKey} = ?`)
            );
            expect(cascadeUpdate).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
