// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Use vi.hoisted to create mock references that can be used in vi.mock factories
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
vi.mock('../db/index', () => ({
  db: {
    prepare: mockPrepare,
    transaction: mockTransaction,
    validateIdentifier: mockValidateIdentifier,
  },
}));

// Mock N8nService
vi.mock('../utils/n8nService', () => ({
  N8nService: {
    sendEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock AppCodeGenerator
vi.mock('../utils/AppCodeGenerator', () => ({
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

import { BulkOperationsService } from '../services/BulkOperationsService';

/**
 * Property Test: Bulk Operation Response Consistency (Property 12)
 *
 * Feature: api-audit-improvements
 * Property 12: Bulk Operation Response Consistency
 *
 * **Validates: Requirements 16.3, 16.4**
 *
 * For any bulk operation result, the `processed` count SHALL equal `success`
 * count plus `failed` count, and the `details` array length SHALL equal the
 * `processed` count.
 */

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates a valid batch size between 1 and 50 */
const batchSizeArb = fc.integer({ min: 1, max: 50 });

/** Generates a valid resource name from the allowed list */
const resourceArb = fc.constantFrom(
  'audit-plans',
  'audit-tasks',
  'audit-programs',
  'recommendations',
  'risk-register',
  'fraud-log'
);

/** Generates a valid username (non-empty alphanumeric) */
const usernameArb = fc.constantFrom('admin', 'user1', 'testuser', 'auditor', 'manager');

/** Generates a bulk operation type */
const operationArb = fc.constantFrom('create' as const, 'update' as const, 'delete' as const);

// ─── Helper: Setup mocks for a given operation ────────────────────────────────

function setupSuccessfulMocks() {
  // Use a single mockImplementation that always succeeds
  const mockGet = vi.fn().mockResolvedValue({ id: 1, hash: 'prev-hash' });
  const mockRun = vi.fn().mockResolvedValue({ lastInsertRowid: 1, changes: 1 });
  const mockAll = vi.fn().mockResolvedValue([]);

  mockPrepare.mockReturnValue({
    get: mockGet,
    all: mockAll,
    run: mockRun,
  });

  // Transaction mock: execute the function immediately
  mockTransaction.mockImplementation((fn: Function) => {
    return async (...args: any[]) => fn(...args);
  });
}

function generateItems(operation: 'create' | 'update' | 'delete', batchSize: number): any[] {
  switch (operation) {
    case 'create':
      return Array.from({ length: batchSize }, (_, i) => ({
        title: `Item ${i}`,
      }));
    case 'update':
      return Array.from({ length: batchSize }, (_, i) => ({
        id: i + 1,
        status: 'Closed',
      }));
    case 'delete':
      return Array.from({ length: batchSize }, (_, i) => ({
        id: i + 1,
      }));
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 12: Bulk Operation Response Consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessfulMocks();
  });

  describe('processed equals success + failed', () => {
    it('for any successful bulk create, processed === success + failed', async () => {
      await fc.assert(
        fc.asyncProperty(
          batchSizeArb,
          resourceArb,
          usernameArb,
          async (batchSize, resource, username) => {
            setupSuccessfulMocks();

            const items = generateItems('create', batchSize);
            const result = await BulkOperationsService.execute(resource, 'create', items, username);

            // Property: processed === success + failed
            expect(result.processed).toBe(result.success + result.failed);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('for any successful bulk update, processed === success + failed', async () => {
      await fc.assert(
        fc.asyncProperty(
          batchSizeArb,
          resourceArb,
          usernameArb,
          async (batchSize, resource, username) => {
            setupSuccessfulMocks();

            const items = generateItems('update', batchSize);
            const result = await BulkOperationsService.execute(resource, 'update', items, username);

            // Property: processed === success + failed
            expect(result.processed).toBe(result.success + result.failed);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('for any successful bulk delete, processed === success + failed', async () => {
      await fc.assert(
        fc.asyncProperty(
          batchSizeArb,
          resourceArb,
          usernameArb,
          async (batchSize, resource, username) => {
            setupSuccessfulMocks();

            const items = generateItems('delete', batchSize);
            const result = await BulkOperationsService.execute(resource, 'delete', items, username);

            // Property: processed === success + failed
            expect(result.processed).toBe(result.success + result.failed);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('details array length equals processed count', () => {
    it('for any successful bulk create, details.length === processed', async () => {
      await fc.assert(
        fc.asyncProperty(
          batchSizeArb,
          resourceArb,
          usernameArb,
          async (batchSize, resource, username) => {
            setupSuccessfulMocks();

            const items = generateItems('create', batchSize);
            const result = await BulkOperationsService.execute(resource, 'create', items, username);

            // Property: details.length === processed
            expect(result.details.length).toBe(result.processed);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('for any successful bulk update, details.length === processed', async () => {
      await fc.assert(
        fc.asyncProperty(
          batchSizeArb,
          resourceArb,
          usernameArb,
          async (batchSize, resource, username) => {
            setupSuccessfulMocks();

            const items = generateItems('update', batchSize);
            const result = await BulkOperationsService.execute(resource, 'update', items, username);

            // Property: details.length === processed
            expect(result.details.length).toBe(result.processed);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('for any successful bulk delete, details.length === processed', async () => {
      await fc.assert(
        fc.asyncProperty(
          batchSizeArb,
          resourceArb,
          usernameArb,
          async (batchSize, resource, username) => {
            setupSuccessfulMocks();

            const items = generateItems('delete', batchSize);
            const result = await BulkOperationsService.execute(resource, 'delete', items, username);

            // Property: details.length === processed
            expect(result.details.length).toBe(result.processed);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('combined consistency: processed === details.length === success + failed', () => {
    it('all three consistency invariants hold simultaneously for any batch size and operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          batchSizeArb,
          resourceArb,
          operationArb,
          usernameArb,
          async (batchSize, resource, operation, username) => {
            setupSuccessfulMocks();

            const items = generateItems(operation, batchSize);
            const result = await BulkOperationsService.execute(resource, operation, items, username);

            // All three consistency invariants:
            // 1. processed === success + failed
            expect(result.processed).toBe(result.success + result.failed);
            // 2. details.length === processed
            expect(result.details.length).toBe(result.processed);
            // 3. Combined: details.length === success + failed
            expect(result.details.length).toBe(result.success + result.failed);
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});
