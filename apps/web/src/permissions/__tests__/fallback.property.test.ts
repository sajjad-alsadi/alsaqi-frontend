/**
 * Property-based tests for the narrowing permission fallback (Requirement 9).
 *
 * Feature: frontend-audit-remediation, Property 10: No privilege escalation in
 * fallback
 *
 * Property 10: No privilege escalation in fallback
 *   - For any role and any Confirmed_Permissions set (including the empty/absent
 *     case), the effective fallback permission set is a subset of
 *     Confirmed_Permissions; and when no Confirmed_Permissions exist, the
 *     fallback contains no write actions (read-only).
 *   **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { MODULES } from '../../permissions';
import {
  READ_ONLY_PERMISSION_SET,
  computeFallback,
} from '../fallback';
import type { PermissionAction, UserPermissionSet } from '../types';

const ALL_ACTIONS: readonly PermissionAction[] = ['View', 'Create', 'Edit', 'Delete', 'Approve'];
const WRITE_ACTIONS: readonly PermissionAction[] = ['Create', 'Edit', 'Delete', 'Approve'];
const MODULE_NAMES: readonly string[] = Object.values(MODULES);

// A set of role identifiers, including ones outside the known set so the
// fallback is exercised for any role string.
const roleArb = fc.oneof(
  fc.constantFrom('admin', 'internal_auditor', 'compliance_officer', 'risk_officer', 'manager', 'viewer'),
  fc.string(),
);

// Per-module action lists: any subset of the five actions (possibly empty).
const actionsArb = fc.uniqueArray(fc.constantFrom(...ALL_ACTIONS), {
  minLength: 0,
  maxLength: ALL_ACTIONS.length,
});

// An arbitrary permission map over known modules. Some modules may be absent
// (so intersection meaningfully drops them), some may carry write actions.
const permissionsMapArb = fc.dictionary(fc.constantFrom(...MODULE_NAMES), actionsArb, {
  maxKeys: MODULE_NAMES.length,
});

// A full UserPermissionSet built from an arbitrary role and permission map.
const permissionSetArb = (): fc.Arbitrary<UserPermissionSet> =>
  fc.tuple(roleArb, permissionsMapArb).map(([role, permissions]) => ({
    userId: 'user-1',
    role,
    roleId: 'role-1',
    isCustomRole: false,
    permissions,
    overrides: [],
  }));

/**
 * Returns true when every `(module, action)` pair in `sub` is also present in
 * `sup` — i.e. `sub` grants nothing beyond `sup`.
 */
function isSubsetOf(sub: UserPermissionSet, sup: UserPermissionSet): boolean {
  for (const [moduleName, actions] of Object.entries(sub.permissions)) {
    const supActions = sup.permissions[moduleName];
    if (!supActions) return false;
    for (const action of actions) {
      if (!supActions.includes(action)) return false;
    }
  }
  return true;
}

/** Collects every action granted across all modules of a permission set. */
function allGrantedActions(set: UserPermissionSet): PermissionAction[] {
  return Object.values(set.permissions).flat();
}

describe('Property 10: no privilege escalation in fallback', () => {
  it('fallback is a subset of confirmed permissions when confirmed permissions exist', () => {
    fc.assert(
      fc.property(permissionSetArb(), permissionSetArb(), (confirmed, staticDefaults) => {
        const fallback = computeFallback(confirmed, staticDefaults);
        // Req 9.1, 9.3, 9.4: the effective set never grants anything the server
        // has not confirmed.
        expect(isSubsetOf(fallback, confirmed)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('fallback contains no write actions when no confirmed permissions exist', () => {
    fc.assert(
      fc.property(permissionSetArb(), (staticDefaults) => {
        // Req 9.2: absent confirmed permissions → read-only fallback.
        const fallback = computeFallback(null, staticDefaults);
        const granted = allGrantedActions(fallback);
        for (const action of granted) {
          expect(WRITE_ACTIONS).not.toContain(action);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('the read-only permission set grants only View on every module', () => {
    const granted = allGrantedActions(READ_ONLY_PERMISSION_SET);
    expect(granted.length).toBeGreaterThan(0);
    for (const action of granted) {
      expect(action).toBe('View');
    }
  });
});
