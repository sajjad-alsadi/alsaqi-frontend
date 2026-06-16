import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeFallback, intersect, READ_ONLY_PERMISSION_SET } from './fallback';
import { MODULES } from '../permissions';
import type { PermissionAction, UserPermissionSet } from './types';

/**
 * Property-Based Tests for the narrowing permission fallback (Requirement 7).
 *
 * Feature: code-review-remediation, Property 5: Fallback permissions never widen
 * beyond static role defaults — for any confirmed permission set and static role
 * defaults, the computed fallback set equals the element-wise intersection of the
 * two and is therefore a subset of the static defaults; it grants no
 * `(module, action)` pair the static defaults do not contain (so low-privilege
 * roles are denied UserManagement/SystemLogs during a cache outage).
 *
 * **Validates: Requirements 7.1, 7.2, 7.3**
 */

const ALL_MODULES = Object.values(MODULES);
const ALL_ACTIONS: PermissionAction[] = ['View', 'Create', 'Edit', 'Delete', 'Approve'];

/** Arbitrary subset (possibly empty) of the five permission actions for one module. */
const actionsArb = fc.uniqueArray(fc.constantFrom(...ALL_ACTIONS), {
  maxLength: ALL_ACTIONS.length,
});

/**
 * Arbitrary permission map: a subset of known modules, each mapped to a subset of
 * actions. Intelligently constrained to the real `(module, action)` input space.
 */
const permissionMapArb: fc.Arbitrary<Record<string, PermissionAction[]>> = fc
  .subarray(ALL_MODULES, { minLength: 0, maxLength: ALL_MODULES.length })
  .chain((modules) =>
    fc
      .tuple(...modules.map(() => actionsArb))
      .map((actionLists) => {
        const map: Record<string, PermissionAction[]> = {};
        modules.forEach((moduleName, i) => {
          map[moduleName] = actionLists[i] as PermissionAction[];
        });
        return map;
      }),
  );

/** Wraps a permission map into a full UserPermissionSet. */
const permissionSetArb: fc.Arbitrary<UserPermissionSet> = permissionMapArb.map(
  (permissions) => ({
    userId: 'u',
    role: 'some-role',
    roleId: 'r',
    isCustomRole: false,
    permissions,
    overrides: [],
  }),
);

/** Flattens a permission set into a set of `module:action` pair strings. */
function pairs(set: UserPermissionSet): Set<string> {
  const result = new Set<string>();
  for (const [moduleName, actions] of Object.entries(set.permissions)) {
    for (const action of actions) {
      result.add(`${moduleName}:${action}`);
    }
  }
  return result;
}

/** Element-wise intersection of two permission sets, as a set of pair strings. */
function intersectionPairs(a: UserPermissionSet, b: UserPermissionSet): Set<string> {
  const pa = pairs(a);
  const pb = pairs(b);
  return new Set([...pa].filter((pair) => pb.has(pair)));
}

/** Asserts that `subset` ⊆ `superset` over `module:action` pairs. */
function assertSubset(subset: Set<string>, superset: Set<string>): void {
  for (const pair of subset) {
    expect(superset.has(pair)).toBe(true);
  }
}

describe('Property 5: Fallback permissions never widen beyond static role defaults', () => {
  // Feature: code-review-remediation, Property 5

  it('confirmed branch: fallback equals staticDefaults ∩ confirmed and is a subset of staticDefaults', () => {
    fc.assert(
      fc.property(permissionSetArb, permissionSetArb, (confirmed, staticDefaults) => {
        const result = computeFallback(confirmed, staticDefaults);
        const resultPairs = pairs(result);

        // Equals the element-wise intersection of the two inputs (Req 7.1).
        expect(resultPairs).toEqual(intersectionPairs(staticDefaults, confirmed));

        // Subset of the static defaults — never widens beyond them (Req 7.2).
        assertSubset(resultPairs, pairs(staticDefaults));

        // Subset of the confirmed set too — no privilege escalation.
        assertSubset(resultPairs, pairs(confirmed));
      }),
      { numRuns: 100 },
    );
  });

  it('no-cache branch: fallback equals READ_ONLY ∩ staticDefaults, granting at most View and never widening beyond static defaults', () => {
    fc.assert(
      fc.property(permissionSetArb, (staticDefaults) => {
        const result = computeFallback(null, staticDefaults);
        const resultPairs = pairs(result);

        // Equals the intersection of READ_ONLY_PERMISSION_SET with the static
        // defaults (Req 7.1).
        expect(resultPairs).toEqual(
          intersectionPairs(READ_ONLY_PERMISSION_SET, staticDefaults),
        );

        // Subset of the static defaults — no module/action it lacks (Req 7.2).
        assertSubset(resultPairs, pairs(staticDefaults));

        // Grants only View; every write action is denied during the outage.
        for (const actions of Object.values(result.permissions)) {
          for (const action of actions) {
            expect(action).toBe('View');
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('no-cache branch: View is denied on any module the static defaults do not grant View on, e.g. admin modules for low-privilege roles (Req 7.2, 7.3)', () => {
    fc.assert(
      fc.property(permissionSetArb, (staticDefaults) => {
        const result = computeFallback(null, staticDefaults);

        for (const moduleName of ALL_MODULES) {
          const staticHasView = (staticDefaults.permissions[moduleName] ?? []).includes(
            'View',
          );
          const fallbackHasView = (result.permissions[moduleName] ?? []).includes('View');
          // Fallback grants View on a module only when the static defaults do.
          expect(fallbackHasView).toBe(staticHasView);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('intersect is a subset of both inputs for any pair of permission sets', () => {
    fc.assert(
      fc.property(permissionSetArb, permissionSetArb, (a, b) => {
        const result = intersect(a, b);
        const resultPairs = pairs(result);
        assertSubset(resultPairs, pairs(a));
        assertSubset(resultPairs, pairs(b));
        expect(resultPairs).toEqual(intersectionPairs(a, b));
      }),
      { numRuns: 100 },
    );
  });
});
