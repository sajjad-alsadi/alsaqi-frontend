/**
 * Narrowing permission fallback (Requirement 7).
 *
 * When the permissions API fails, the effective permission set must never widen
 * a user's access beyond the role's static defaults. These helpers compute a
 * fallback that is always a subset of the role's static defaults:
 *
 * - With confirmed permissions: intersect the static role defaults with the
 *   confirmed set, keeping only `(module, action)` pairs present in BOTH.
 * - With no confirmed permissions (e.g. a cache outage on first load): intersect
 *   the read-only permission set with the role's static defaults, so a
 *   low-privilege role is granted at most `View` on the modules its static
 *   defaults already include — and is denied admin modules such as
 *   `UserManagement`/`SystemLogs` it never had (Req 7.1, 7.2, 7.3).
 *
 * The backend remains the authoritative access control (Req 7.4); these helpers
 * only constrain the client-side advisory state.
 */
import { MODULES } from '../permissions';
import type { PermissionAction, UserPermissionSet } from './types';

/** The only action considered read access; all others (Create/Edit/Delete/Approve) are writes. */
const READ_ONLY_ACTION: PermissionAction = 'View';

/**
 * Builds a permission map granting only `View` on every known module.
 */
function buildReadOnlyPermissions(): Record<string, PermissionAction[]> {
  const permissions: Record<string, PermissionAction[]> = {};
  for (const moduleName of Object.values(MODULES)) {
    permissions[moduleName] = [READ_ONLY_ACTION];
  }
  return permissions;
}

/**
 * A read-only permission set used as the fallback when no confirmed permissions
 * exist for the current user. Contains only `View` actions — no write actions
 * (Create/Edit/Delete/Approve) — so it can never escalate privileges.
 */
export const READ_ONLY_PERMISSION_SET: UserPermissionSet = {
  userId: '',
  role: 'read-only',
  roleId: '',
  isCustomRole: false,
  permissions: buildReadOnlyPermissions(),
  overrides: [],
};

/**
 * Intersects two permission sets, keeping only `(module, action)` pairs that are
 * present in BOTH `a` and `b`. The returned set carries the identity metadata of
 * `b` (the authoritative/confirmed set) and drops overrides so it can never grant
 * an action beyond the intersection.
 *
 * The result is guaranteed to be a subset of both inputs.
 */
export function intersect(a: UserPermissionSet, b: UserPermissionSet): UserPermissionSet {
  const permissions: Record<string, PermissionAction[]> = {};

  for (const [moduleName, aActions] of Object.entries(a.permissions)) {
    const bActions = b.permissions[moduleName];
    if (!bActions) continue;

    const common = aActions.filter((action) => bActions.includes(action));
    if (common.length > 0) {
      permissions[moduleName] = common;
    }
  }

  return {
    userId: b.userId,
    role: b.role,
    roleId: b.roleId,
    isCustomRole: b.isCustomRole,
    permissions,
    overrides: [],
  };
}

/**
 * Computes the effective fallback permission set when the permissions API fails.
 *
 * - When no confirmed permissions exist (e.g. the permissions cache is
 *   unavailable on first load), returns the intersection of
 *   `READ_ONLY_PERMISSION_SET` with the role's static defaults (Req 7.1). The
 *   result grants at most `View` on modules the role's static defaults already
 *   include, so it never widens beyond the static defaults (Req 7.2) and a
 *   low-privilege role is denied admin modules such as `UserManagement` and
 *   `SystemLogs` during the outage (Req 7.3).
 * - Otherwise returns the intersection of the static role defaults and the
 *   confirmed set, which is always a subset of both — no privilege escalation.
 *
 * The backend remains the authoritative access control (Req 7.4).
 */
export function computeFallback(
  confirmed: UserPermissionSet | null,
  staticDefaults: UserPermissionSet,
): UserPermissionSet {
  if (!confirmed) {
    return intersect(READ_ONLY_PERMISSION_SET, staticDefaults);
  }
  return intersect(staticDefaults, confirmed);
}
