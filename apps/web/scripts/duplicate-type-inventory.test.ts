/**
 * Tests for the duplicate-type inventory generator (FIX-FE-2, requirement 2.4).
 *
 * Verifies the inventory:
 *   - covers every Local_Type in `apps/web/src/types.ts` that also exists in
 *     `@alsaqi/shared` (completeness — "no duplicate matching this condition is
 *     absent from the list"),
 *   - classifies each entry as one of the two allowed statuses, and
 *   - correctly flags the known divergent types as `divergent-needs-reconciliation`
 *     and the structurally-identical types as `duplicate-removable`.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error - plain ESM JS module without type declarations
import { generateDuplicateTypeInventory, STATUS } from './duplicate-type-inventory.mjs';

type InventoryEntry = { typeName: string; filePath: string; status: string };

describe('duplicate-type inventory (requirement 2.4)', () => {
  const { inventory } = generateDuplicateTypeInventory() as {
    inventory: InventoryEntry[];
  };
  const byName = new Map(inventory.map((e) => [e.typeName, e]));

  it('produces well-formed records', () => {
    expect(inventory.length).toBeGreaterThan(0);
    for (const entry of inventory) {
      expect(typeof entry.typeName).toBe('string');
      expect(entry.typeName.length).toBeGreaterThan(0);
      expect(entry.filePath).toMatch(/^apps\/web\/src\//);
      expect([STATUS.REMOVABLE, STATUS.DIVERGENT]).toContain(entry.status);
    }
  });

  it('covers every duplicate Local_Type from src/types.ts (completeness)', () => {
    // All data-model types declared in apps/web/src/types.ts that also exist
    // as a Shared_Type in @alsaqi/shared. None may be absent.
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
      expect(byName.has(name), `missing inventory entry for ${name}`).toBe(true);
    }
  });

  it('flags divergent local types for reconciliation', () => {
    // Per the design note: these carry extra fields / narrower unions and must
    // NOT be silently deleted.
    for (const name of ['AuditFinding', 'AuditPlan', 'Recommendation']) {
      expect(byName.get(name)?.status, `${name} should be divergent`).toBe(
        STATUS.DIVERGENT
      );
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
      expect(byName.get(name)?.status, `${name} should be removable`).toBe(
        STATUS.REMOVABLE
      );
    }
  });
});
