// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { validTableNameArb } from '../../test/helpers/arbitraries';

/**
 * Property Test: Code generation produces unique and sequential codes (Property 3)
 *
 * Feature: comprehensive-testing
 * Property 3: توليد الأكواد ينتج أكواداً فريدة ومتسلسلة
 *
 * **Validates: Requirements 12.1, 12.2**
 *
 * The AppCodeGenerator generates codes in format: {DeptCode}-{DocType}-{YY}-{NNN}
 *
 * Where:
 * - DeptCode: Department entity code (e.g., 'IA', 'FIN', 'IT')
 * - DocType: Document type based on table (PL, PR, TSK, FD, REP, REC, RSK, CBI, POL, LAW, FRD, CMP)
 * - YY: Two-digit year
 * - NNN: Zero-padded sequential number (001, 002, 003...)
 */

// ─── Mock the database module ────────────────────────────────────────────────

vi.mock('../../server/db/index', () => {
  const mockPrepare = vi.fn();
  return {
    db: {
      prepare: mockPrepare,
      validateIdentifier: (id: string) => {
        if (!/^[a-zA-Z0-9_]+$/.test(id)) {
          throw new Error(`Invalid database identifier: ${id}`);
        }
        return id;
      },
    },
  };
});

import { AppCodeGenerator } from '../../server/utils/AppCodeGenerator';
import { db } from '../../server/db/index';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Tables that support code generation (have entries in TABLE_CODE_COLUMNS) */
const TABLES_WITH_CODE_COLUMNS = [
  'audit_plans',
  'audit_programs',
  'audit_tasks',
  'audit_findings',
  'recommendations',
  'risk_register',
  'compliance_items',
] as const;

/** Expected DocType mapping for each table */
const TABLE_DOC_TYPES: Record<string, string> = {
  audit_plans: 'PL',
  audit_programs: 'PR',
  audit_tasks: 'TSK',
  audit_findings: 'FD',
  audit_reports: 'REP',
  recommendations: 'REC',
  risk_register: 'RSK',
  central_bank_instructions: 'CBI',
  internal_policies: 'POL',
  law_bank: 'LAW',
  fraud_log: 'FRD',
  compliance_items: 'CMP',
};

/** Arbitrary for tables that have code columns */
const codeTableArb = fc.constantFrom(...TABLES_WITH_CODE_COLUMNS);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sets up the db mock to simulate sequential code generation.
 * Each call to the LIKE query returns the previous code so the next number increments.
 */
function setupSequentialMock(deptCode: string, startingNumber: number = 0) {
  let callCount = 0;
  const shortYear = new Date().getFullYear().toString().slice(-2);

  (db.prepare as any).mockImplementation((sql: string) => {
    return {
      get: async (...params: any[]) => {
        // For resolveDepartmentCode query
        if (sql.includes('org_entities')) {
          return { entity_code: deptCode };
        }
        if (sql.includes('departments')) {
          return null;
        }
        // For the LIKE query to find latest record - simulate incrementing
        if (sql.includes('LIKE')) {
          const currentNumber = startingNumber + callCount;
          callCount++;
          if (currentNumber === 0) {
            return null; // No existing records for first call
          }
          // Return the "latest" code so next will be currentNumber + 1
          const prefix = params[0]?.replace('%', '') || `${deptCode}-DOC-${shortYear}-`;
          return { code: `${prefix}${currentNumber.toString().padStart(3, '0')}` };
        }
        return null;
      },
      all: async (...params: any[]) => [],
      run: async (...params: any[]) => ({ lastInsertRowid: 1, changes: 1 }),
    };
  });
}

/**
 * Sets up the db mock to return a fixed "latest" code number.
 */
function setupFixedMock(deptCode: string, latestNumber: number | null = null) {
  const shortYear = new Date().getFullYear().toString().slice(-2);

  (db.prepare as any).mockImplementation((sql: string) => {
    return {
      get: async (...params: any[]) => {
        if (sql.includes('org_entities')) {
          return { entity_code: deptCode };
        }
        if (sql.includes('departments')) {
          return null;
        }
        if (sql.includes('LIKE')) {
          if (latestNumber === null) return null;
          const prefix = params[0]?.replace('%', '') || `${deptCode}-DOC-${shortYear}-`;
          return { code: `${prefix}${latestNumber.toString().padStart(3, '0')}` };
        }
        return null;
      },
      all: async (...params: any[]) => [],
      run: async (...params: any[]) => ({ lastInsertRowid: 1, changes: 1 }),
    };
  });
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 3: Code generation produces unique and sequential codes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Test 1: Generated codes follow the expected pattern
   *
   * For any supported table name, the generated code matches the regex pattern
   * ^[A-Z]{2,4}-[A-Z]{2,3}-\d{2}-\d{3,}$
   *
   * **Validates: Requirements 12.1**
   */
  describe('Test 1: Generated codes follow the expected pattern', () => {
    it('for any supported table name, the generated code matches the expected regex pattern', async () => {
      const shortYear = new Date().getFullYear().toString().slice(-2);

      await fc.assert(
        fc.asyncProperty(
          codeTableArb,
          fc.stringMatching(/^[A-Z]{2,4}$/),
          async (tableName, deptCode) => {
            setupFixedMock(deptCode, null);

            const result = await AppCodeGenerator.generateCode(tableName, deptCode);

            // Code should not be null for supported tables
            expect(result).not.toBeNull();

            // Code should match the general pattern: {DeptCode}-{DocType}-{YY}-{NNN}
            const pattern = /^[A-Z]{2,4}-[A-Z]{2,3}-\d{2}-\d{3,}$/;
            expect(result).toMatch(pattern);

            // Verify the year portion is correct
            const parts = result!.split('-');
            expect(parts[2]).toBe(shortYear);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Test 2: Sequential codes are unique
   *
   * For any table, generating N codes sequentially produces N unique codes.
   *
   * **Validates: Requirements 12.2**
   */
  describe('Test 2: Sequential codes are unique', () => {
    it('for any table, generating N codes sequentially produces N unique codes', async () => {
      await fc.assert(
        fc.asyncProperty(
          codeTableArb,
          fc.integer({ min: 2, max: 5 }),
          async (tableName, count) => {
            setupSequentialMock('IA', 0);

            const codes: string[] = [];
            for (let i = 0; i < count; i++) {
              const code = await AppCodeGenerator.generateCode(tableName, 'IA');
              expect(code).not.toBeNull();
              codes.push(code!);
            }

            // All codes should be unique
            const uniqueCodes = new Set(codes);
            expect(uniqueCodes.size).toBe(codes.length);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Test 3: Sequential codes are incrementing
   *
   * For any table, each subsequent code has a higher number than the previous one.
   *
   * **Validates: Requirements 12.2**
   */
  describe('Test 3: Sequential codes are incrementing', () => {
    it('for any table, each subsequent code has a higher sequential number', async () => {
      await fc.assert(
        fc.asyncProperty(
          codeTableArb,
          fc.integer({ min: 2, max: 5 }),
          async (tableName, count) => {
            setupSequentialMock('IA', 0);

            const numbers: number[] = [];
            for (let i = 0; i < count; i++) {
              const code = await AppCodeGenerator.generateCode(tableName, 'IA');
              expect(code).not.toBeNull();

              // Extract the sequential number (last part after the last dash)
              const parts = code!.split('-');
              const seqNumber = parseInt(parts[parts.length - 1], 10);
              expect(seqNumber).not.toBeNaN();
              numbers.push(seqNumber);
            }

            // Each number should be strictly greater than the previous
            for (let i = 1; i < numbers.length; i++) {
              expect(numbers[i]).toBeGreaterThan(numbers[i - 1]);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Test 4: Each table uses its correct DocType
   *
   * Verify the mapping: audit_plans→PL, audit_programs→PR, audit_tasks→TSK,
   * audit_findings→FD, recommendations→REC, risk_register→RSK, compliance_items→CMP
   *
   * **Validates: Requirements 12.1**
   */
  describe('Test 4: Each table uses its correct DocType', () => {
    const tableDocTypePairs: Array<[string, string]> = [
      ['audit_plans', 'PL'],
      ['audit_programs', 'PR'],
      ['audit_tasks', 'TSK'],
      ['audit_findings', 'FD'],
      ['recommendations', 'REC'],
      ['risk_register', 'RSK'],
      ['compliance_items', 'CMP'],
    ];

    it('for any table with code generation, the DocType segment matches the expected mapping', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...tableDocTypePairs),
          fc.stringMatching(/^[A-Z]{2,4}$/),
          async ([tableName, expectedDocType], deptCode) => {
            setupFixedMock(deptCode, null);

            const result = await AppCodeGenerator.generateCode(tableName, deptCode);
            expect(result).not.toBeNull();

            // The DocType is the second segment: {DeptCode}-{DocType}-{YY}-{NNN}
            const parts = result!.split('-');
            expect(parts[1]).toBe(expectedDocType);
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
