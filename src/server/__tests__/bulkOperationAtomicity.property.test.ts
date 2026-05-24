// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

/**
 * Property Test: Bulk Operation Atomicity (Property 11)
 *
 * Feature: api-audit-improvements
 * Property 11: Bulk Operation Atomicity
 *
 * **Validates: Requirements 16.1, 16.2**
 *
 * For any batch of N items where at least one item fails validation or processing,
 * the entire transaction SHALL be rolled back and zero items SHALL be persisted
 * to the database. Conversely, for any batch where all items are valid, all N
 * items SHALL be persisted.
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

vi.mock('../../server/db/index', () => ({
  db: {
    prepare: mockPrepare,
    transaction: mockTransaction,
    validateIdentifier: mockValidateIdentifier,
  },
}));

vi.mock('../../server/utils/n8nService', () => ({
  N8nService: {
    sendEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../server/utils/AppCodeGenerator', () => ({
  AppCodeGenerator: {
    generateCode: vi.fn(),
    generateFindingCode: vi.fn(),
  },
}));

vi.mock('crypto', () => ({
  default: {
    createHash: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(() => 'mock-hash-value'),
    })),
  },
}));

import { BulkOperationsService, BULK_ALLOWED_RESOURCES } from '../../server/services/BulkOperationsService';

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates a valid resource name from the allowed list */
const resourceArb = fc.constantFrom(...Object.keys(BULK_ALLOWED_RESOURCES));

/** Generates a valid username */
const usernameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{2,15}$/);

/** Generates a batch size between 1 and 20 (kept small for test performance) */
const batchSizeArb = fc.integer({ min: 1, max: 20 });

/** Generates a valid create item (has at least one non-id field) */
const validCreateItemArb = fc.record({
  title: fc.string({ minLength: 1, maxLength: 50 }),
  status: fc.constantFrom('Open', 'In Progress', 'Closed', 'Active'),
});

/** Generates a valid update item (has id + at least one other field) */
const validUpdateItemArb = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  status: fc.constantFrom('Open', 'In Progress', 'Closed', 'Active'),
});

/** Generates a valid delete item (has id) */
const validDeleteItemArb = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
});

/**
 * Generates the index at which a processing failure should occur.
 * Used to simulate a failure at a random position in the batch.
 */
const failureIndexArb = (batchSize: number) => fc.integer({ min: 0, max: batchSize - 1 });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 11: Bulk Operation Atomicity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('if any item fails during processing, entire transaction rolls back (zero persisted)', async () => {
    await fc.assert(
      fc.asyncProperty(
        resourceArb,
        usernameArb,
        batchSizeArb.filter(n => n >= 2), // Need at least 2 items to have a failure after some succeed
        async (resource, username, batchSize) => {
          vi.clearAllMocks();

          // Pick a random failure index
          const failureIndex = Math.floor(Math.random() * batchSize);

          // Track how many items were "persisted" before rollback
          let persistedCount = 0;
          let transactionRolledBack = false;

          // Mock transaction: simulates real transaction behavior
          // If the function throws, the transaction rolls back (nothing persisted)
          mockTransaction.mockImplementation((fn: Function) => {
            return async (...args: any[]) => {
              persistedCount = 0;
              try {
                const result = await fn(...args);
                return result;
              } catch (error) {
                // Transaction rolled back - reset persisted count
                transactionRolledBack = true;
                persistedCount = 0;
                throw error;
              }
            };
          });

          // Mock prepare: succeed for items before failureIndex, fail at failureIndex
          mockPrepare.mockImplementation((sql: string) => {
            if (sql.includes('INSERT INTO')) {
              return {
                run: vi.fn(async () => {
                  if (persistedCount === failureIndex) {
                    throw new Error('Simulated DB constraint violation');
                  }
                  persistedCount++;
                  return { lastInsertRowid: persistedCount, changes: 1 };
                }),
              };
            }
            // For audit trail or other queries
            return {
              get: vi.fn().mockResolvedValue({ hash: 'prev-hash' }),
              run: vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 }),
            };
          });

          // Generate valid items for create operation
          const items = Array.from({ length: batchSize }, () => ({
            title: `Item ${Math.random().toString(36).slice(2, 10)}`,
            status: 'Open',
          }));

          // Execute: should throw because one item fails during processing
          let threw = false;
          try {
            await BulkOperationsService.execute(resource, 'create', items, username);
          } catch (error: any) {
            threw = true;
          }

          // Property: The operation threw (indicating failure)
          expect(threw).toBe(true);

          // Property: Transaction was rolled back, so zero items are persisted
          expect(transactionRolledBack).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('if all items are valid, all N items are persisted', async () => {
    await fc.assert(
      fc.asyncProperty(
        resourceArb,
        usernameArb,
        batchSizeArb,
        async (resource, username, batchSize) => {
          vi.clearAllMocks();

          // Track persisted items
          let persistedCount = 0;

          // Mock transaction: execute function directly (simulates successful commit)
          mockTransaction.mockImplementation((fn: Function) => {
            return async (...args: any[]) => {
              persistedCount = 0;
              return fn(...args);
            };
          });

          // Mock prepare: all operations succeed
          mockPrepare.mockImplementation((sql: string) => {
            if (sql.includes('INSERT INTO') && !sql.includes('audit_trail')) {
              return {
                run: vi.fn(async () => {
                  persistedCount++;
                  return { lastInsertRowid: persistedCount, changes: 1 };
                }),
              };
            }
            // For audit trail queries
            return {
              get: vi.fn().mockResolvedValue({ hash: 'prev-hash' }),
              run: vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 }),
            };
          });

          // Generate valid items for create operation
          const items = Array.from({ length: batchSize }, (_, i) => ({
            title: `Item ${i + 1}`,
            status: 'Open',
          }));

          // Execute: should succeed
          const result = await BulkOperationsService.execute(resource, 'create', items, username);

          // Property: All N items were persisted
          expect(persistedCount).toBe(batchSize);

          // Property: Response reports all items as successful
          expect(result.processed).toBe(batchSize);
          expect(result.success).toBe(batchSize);
          expect(result.failed).toBe(0);
          expect(result.details).toHaveLength(batchSize);

          // Property: Each item in details is marked as successful
          for (let i = 0; i < batchSize; i++) {
            expect(result.details[i].success).toBe(true);
            expect(result.details[i].index).toBe(i);
          }
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('validation failure rejects entire batch without processing any items', async () => {
    await fc.assert(
      fc.asyncProperty(
        resourceArb,
        usernameArb,
        batchSizeArb.filter(n => n >= 2),
        async (resource, username, batchSize) => {
          vi.clearAllMocks();

          // Track if any DB operations were attempted
          let dbOperationsAttempted = 0;

          mockTransaction.mockImplementation((fn: Function) => {
            return async (...args: any[]) => fn(...args);
          });

          mockPrepare.mockImplementation(() => ({
            run: vi.fn(async () => {
              dbOperationsAttempted++;
              return { lastInsertRowid: dbOperationsAttempted, changes: 1 };
            }),
            get: vi.fn().mockResolvedValue({ hash: 'prev-hash' }),
          }));

          // Generate items where at least one is invalid for update (missing id)
          const invalidIndex = Math.floor(Math.random() * batchSize);
          const items = Array.from({ length: batchSize }, (_, i) => {
            if (i === invalidIndex) {
              // Invalid: missing id for update operation
              return { status: 'Closed' };
            }
            return { id: i + 1, status: 'Closed' };
          });

          // Execute update: should throw ValidationError because one item lacks id
          let threw = false;
          try {
            await BulkOperationsService.execute(resource, 'update', items, username);
          } catch (error: any) {
            threw = true;
            // Property: Error indicates validation failure
            expect(error.message).toContain('validation failed');
          }

          // Property: The operation threw
          expect(threw).toBe(true);

          // Property: Zero DB operations were attempted (validation rejects before processing)
          expect(dbOperationsAttempted).toBe(0);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});
