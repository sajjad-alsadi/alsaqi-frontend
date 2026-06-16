/**
 * Property-based test for registry-consistent default permissions.
 *
 * Feature: code-review-remediation, Property 6: Default permissions are
 * consistent with the module registry.
 *
 * Property 6 (design.md → "Property 6: Default permissions are consistent with
 * the module registry"):
 *   "For any role and module, the derived default permission set equals the
 *    registry's declared defaults for that role and contains only actions that
 *    the module's registry entry lists as valid (granted actions ⊆ registry
 *    actions). There is a single derived source, so no second list can diverge."
 *
 * Strategy: `DEFAULT_PERMISSIONS` in `permissions.ts` is DERIVED from the
 * `ModuleRegistry` (the single source of truth populated by `permissions/modules.ts`)
 * via `deriveDefaultPermissions`. We exercise that derived output directly across
 * every (role, module) pair — the entire input space is finite (6 roles × 19
 * modules) — and additionally drive ≥100 fast-check runs over randomly sampled
 * (role, module) pairs to assert, for each pair, that:
 *   1. the derived granted actions equal the registry entry's `defaults[role]`
 *      filtered to the module's valid `actions` (single derived source), AND
 *   2. every granted action is a member of the module's registry `actions`
 *      (granted actions ⊆ registry actions).
 *
 * **Validates: Requirements 8.1, 8.2, 8.4**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_PERMISSIONS, ROLES, type Role, type Module } from '../permissions';
import { ModuleRegistry } from './registry';
// Side-effect import: ensure every module is registered in the ModuleRegistry
// before we read from it (mirrors how permissions.ts derives its defaults).
import './modules';
import type { PermissionAction } from './types';

const ALL_ROLES = Object.values(ROLES) as Role[];
const ALL_MODULES = ModuleRegistry.getAllModules();
const ALL_MODULE_NAMES = ALL_MODULES.map((m) => m.name);

/**
 * The expected derived default for a (role, module): the registry's declared
 * defaults for that role, filtered to the actions the module's entry lists as
 * valid. This is the single-source derivation the property asserts against.
 */
function expectedDerived(roleModule: { role: Role; moduleName: string }): PermissionAction[] {
  const mod = ModuleRegistry.getModule(roleModule.moduleName);
  if (!mod) return [];
  const declared: PermissionAction[] = mod.defaults[roleModule.role] ?? [];
  return declared.filter((action) => mod.actions.includes(action));
}

const roleArb = fc.constantFrom(...ALL_ROLES);
const moduleNameArb = fc.constantFrom(...ALL_MODULE_NAMES);

describe('Feature: code-review-remediation, Property 6: registry-consistent defaults (Requirements 8.1, 8.2, 8.4)', () => {
  it('derived defaults equal the registry defaults and are a subset of registry actions for any (role, module)', () => {
    fc.assert(
      fc.property(roleArb, moduleNameArb, (role, moduleName) => {
        const mod = ModuleRegistry.getModule(moduleName)!;
        const derived = DEFAULT_PERMISSIONS[role][moduleName as Module] ?? [];

        // (1) Single derived source: equals registry declared defaults filtered to valid actions.
        expect([...derived].sort()).toEqual(expectedDerived({ role, moduleName }).sort());

        // (2) granted actions ⊆ registry actions.
        for (const action of derived) {
          expect(mod.actions).toContain(action);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('holds exhaustively across every (role, module) pair', () => {
    for (const role of ALL_ROLES) {
      for (const mod of ALL_MODULES) {
        const derived = DEFAULT_PERMISSIONS[role][mod.name as Module] ?? [];

        // Single derived source.
        expect([...derived].sort()).toEqual(
          expectedDerived({ role, moduleName: mod.name }).sort()
        );

        // granted ⊆ registry actions.
        for (const action of derived) {
          expect(mod.actions).toContain(action);
        }
      }
    }
  });

  it('exposes a default entry for every registered module under every role', () => {
    for (const role of ALL_ROLES) {
      for (const mod of ALL_MODULES) {
        expect(DEFAULT_PERMISSIONS[role][mod.name as Module]).toBeDefined();
      }
    }
  });
});
