/**
 * Tests for the duplicate-type inventory (FIX-FE-2, requirement 2.4).
 *
 * IMPORTANT — what this inventory is:
 *   The duplicate-type inventory is the FIX-FE-2 deliverable for criterion 2.4:
 *   a RECORD of every Local_Type in `apps/web/src/types.ts` that also existed as
 *   a Shared_Type in `@alsaqi/shared` AT THE TIME OF THE AUDIT (pre-removal). That
 *   complete, stable record is checked in at
 *   `apps/web/scripts/duplicate-type-inventory.json` (13 entries).
 *
 *   FIX-FE-2 task 1.3 (criteria 2.3/2.5) has since REMOVED all
 *   `duplicate-removable` Local_Types from `apps/web/src/types.ts`, replacing them
 *   with imports from `@alsaqi/shared`. Only the 3 `divergent-needs-reconciliation`
 *   types (AuditPlan, AuditFinding, Recommendation) still live in src/types.ts.
 *
 *   Therefore:
 *     - Completeness (criterion 2.4) and status classification are validated
 *       against the RECORDED artifact (the stable deliverable), NOT against the
 *       live generator run against the now-cleaned source.
 *     - The live generator is still exercised for well-formedness, and is expected
 *       to return only a SUBSET of the recorded artifact (the divergent types that
 *       remain after the cleanup).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
// @ts-expect-error - plain ESM JS module without type declarations
import { generateDuplicateTypeInventory, STATUS } from './duplicate-type-inventory.mjs';

type InventoryEntry = { typeName: string; filePath: string; status: string };

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_PATH = resolve(__dirname, 'duplicate-type-inventory.json');

// The recorded artifact: the criterion-2.4 deliverable (full pre-removal record).
const recordedInventory = JSON.parse(
  readFileSync(ARTIFACT_PATH, 'utf-8')
) as InventoryEntry[];
const recordedByName = new Map(recordedInventory.map((e) => [e.typeName, e]));

describe('duplicate-type inventory artifact (requirement 2.4)', () => {
  it('records well-formed entries', () => {
    expect(recordedInventory.length).toBeGreaterThan(0);
    for (const entry of recordedInventory) {
      expect(typeof entry.typeName).toBe('string');
      expect(entry.typeName.length).toBeGreaterThan(0);
      expect(entry.filePath).toMatch(/^apps\/web\/src\//);
      expect([STATUS.REMOVABLE, STATUS.DIVERGENT]).toContain(entry.status);
    }
  });

  it('covers every duplicate Local_Type that existed pre-removal (completeness)', () => {
    // The full set of data-model types that were declared in apps/web/src/types.ts
    // and also existed as a Shared_Type in @alsaqi/shared at audit time. The
    // recorded artifact (criterion 2.4) must contain every one of them.
    const expectedDuplicates = [
      'User',
      'AuditPlan',
      'AuditTask',
      'AuditProgram',
      'AuditProcedure',
      'AuditFinding',
      'AuditEvidence',
      'Recommendation',
      'RiskItem',
      'CentralBankInstruction',
      'Notification',
      'AuditTrail',
      'AuditReport',
    ];
    for (const name of expectedDuplicates) {
      expect(
        recordedByName.has(name),
        `missing recorded inventory entry for ${name}`
      ).toBe(true);
    }
  });

  it('flags divergent local types for reconciliation', () => {
    // These carry extra fields / narrower unions and must NOT be silently deleted.
    for (const name of ['AuditFinding', 'AuditPlan', 'Recommendation']) {
      expect(
        recordedByName.get(name)?.status,
        `${name} should be divergent`
      ).toBe(STATUS.DIVERGENT);
    }
  });

  it('marks structurally-identical local types as removable', () => {
    for (const name of [
      'User',
      'AuditTask',
      'AuditProgram',
      'AuditProcedure',
      'AuditEvidence',
      'RiskItem',
      'CentralBankInstruction',
      'Notification',
      'AuditTrail',
      'AuditReport',
    ]) {
      expect(
        recordedByName.get(name)?.status,
        `${name} should be removable`
      ).toBe(STATUS.REMOVABLE);
    }
  });
});

describe('duplicate-type inventory generator (post-cleanup live run)', () => {
  const { inventory } = generateDuplicateTypeInventory() as {
    inventory: InventoryEntry[];
  };

  it('produces well-formed records', () => {
    // After task 1.3 removed the removable duplicates, the live generator may
    // legitimately return a smaller list — but every record it does return must
    // still be well-formed.
    for (const entry of inventory) {
      expect(typeof entry.typeName).toBe('string');
      expect(entry.typeName.length).toBeGreaterThan(0);
      expect(entry.filePath).toMatch(/^apps\/web\/src\//);
      expect([STATUS.REMOVABLE, STATUS.DIVERGENT]).toContain(entry.status);
    }
  });

  it('returns only a subset of the recorded (pre-removal) inventory', () => {
    // The duplicate-removable types were removed by task 1.3 (criteria 2.3/2.5),
    // so the live generator can never report MORE than the recorded artifact.
    for (const entry of inventory) {
      expect(
        recordedByName.has(entry.typeName),
        `${entry.typeName} is not part of the recorded pre-removal inventory`
      ).toBe(true);
    }
  });

  it('still reports the divergent types that remain in src/types.ts', () => {
    // The 3 divergent types were intentionally NOT removed (they need
    // reconciliation), so the live generator must still surface them.
    const liveByName = new Map(inventory.map((e) => [e.typeName, e]));
    for (const name of ['AuditFinding', 'AuditPlan', 'Recommendation']) {
      expect(liveByName.get(name)?.status, `${name} should still be divergent`).toBe(
        STATUS.DIVERGENT
      );
    }
  });
});
