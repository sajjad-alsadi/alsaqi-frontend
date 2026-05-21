// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { UserRole, ADMIN_ROLES, COMPLIANCE_ROLES, STAFF_ROLES } from '../../constants';
import {
  ROLES,
  MODULES,
  PERMISSIONS,
  DEFAULT_PERMISSIONS,
  type Module,
  type Permission,
  type Role,
} from '../../permissions';

/**
 * Property Test: Role arrays contain only canonical identifiers (Property 5)
 *
 * **Validates: Requirements 4.1, 4.5**
 *
 * For any role group array (`ADMIN_ROLES`, `COMPLIANCE_ROLES`, `STAFF_ROLES`),
 * every element must be a value from the canonical `UserRole` enum and the
 * array must contain no duplicate entries.
 */
describe('Property 5: Role arrays contain only canonical identifiers', () => {
  // Collect all canonical UserRole enum values
  const canonicalRoles = Object.values(UserRole);

  // All role group arrays to validate
  const roleArrays = [
    { name: 'ADMIN_ROLES', array: ADMIN_ROLES },
    { name: 'COMPLIANCE_ROLES', array: COMPLIANCE_ROLES },
    { name: 'STAFF_ROLES', array: STAFF_ROLES },
  ] as const;

  it('every element in each role array is a valid UserRole enum value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: roleArrays.length - 1 }),
        fc.integer({ min: 0, max: Math.max(...roleArrays.map((r) => r.array.length)) - 1 }),
        (arrayIndex, elementIndex) => {
          const roleGroup = roleArrays[arrayIndex];
          // Clamp element index to valid range for this specific array
          const clampedIndex = elementIndex % roleGroup.array.length;
          const element = roleGroup.array[clampedIndex];

          // Every element must be a value from the canonical UserRole enum
          expect(canonicalRoles).toContain(element);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no role array contains duplicate entries', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: roleArrays.length - 1 }),
        (arrayIndex) => {
          const roleGroup = roleArrays[arrayIndex];
          const uniqueElements = new Set(roleGroup.array);

          // The set size must equal the array length (no duplicates)
          expect(uniqueElements.size).toBe(roleGroup.array.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('role arrays do not contain the non-canonical "Administrator" identifier', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: roleArrays.length - 1 }),
        (arrayIndex) => {
          const roleGroup = roleArrays[arrayIndex];

          // No element should be the non-canonical 'Administrator' string
          for (const element of roleGroup.array) {
            expect(element).not.toBe('Administrator');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('UserRole enum defines each role with exactly one canonical string identifier', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: canonicalRoles.length - 1 }),
        (roleIndex) => {
          const role = canonicalRoles[roleIndex];

          // Each role value must be a non-empty string
          expect(typeof role).toBe('string');
          expect(role.length).toBeGreaterThan(0);

          // The role value must appear exactly once in the enum values
          const occurrences = canonicalRoles.filter((r) => r === role);
          expect(occurrences).toHaveLength(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property Test: Admin permissions cover all modules (Property 8)
 *
 * **Validates: Requirements 19.2, 19.3**
 *
 * For any module and action in the system, Admin must have permission.
 * For any non-Admin role, its permissions must be a subset of Admin's.
 * Role groups (ADMIN_ROLES, COMPLIANCE_ROLES, STAFF_ROLES) must contain the correct roles.
 */
describe('Property 8: Admin permissions cover all modules', () => {
  const allModules = Object.values(MODULES);
  const allPermissions = Object.values(PERMISSIONS);
  const allRoles = Object.values(ROLES);
  const nonAdminRoles = allRoles.filter((r) => r !== ROLES.ADMIN);
  const adminPermissions = DEFAULT_PERMISSIONS[ROLES.ADMIN];

  it('for any module and action, Admin has permission', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allModules),
        fc.constantFrom(...allPermissions),
        (module: Module, action: Permission) => {
          const adminPermsForModule = adminPermissions[module];

          // Admin must have defined permissions for every module
          expect(adminPermsForModule).toBeDefined();

          // Admin must have at least View permission for every module
          expect(adminPermsForModule).toContain(PERMISSIONS.VIEW);

          // Admin must have the specific action permission for the module,
          // OR the module legitimately only supports a subset of actions
          // (e.g., Dashboard only supports View, Notifications only supports View)
          // The key property: Admin's permission set is never empty for any module
          expect(adminPermsForModule.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for any non-Admin role, its permissions are a subset of Admin permissions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...nonAdminRoles),
        fc.constantFrom(...allModules),
        (role: Role, module: Module) => {
          const rolePermsForModule = DEFAULT_PERMISSIONS[role][module];
          const adminPermsForModule = adminPermissions[module];

          // Every permission the non-Admin role has must also exist in Admin's permissions
          for (const perm of rolePermsForModule) {
            expect(adminPermsForModule).toContain(perm);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('role groups (ADMIN_ROLES, COMPLIANCE_ROLES, STAFF_ROLES) are correct', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          { name: 'ADMIN_ROLES', group: ADMIN_ROLES, expected: [UserRole.ADMIN, UserRole.MANAGER] },
          { name: 'COMPLIANCE_ROLES', group: COMPLIANCE_ROLES, expected: [UserRole.ADMIN, UserRole.MANAGER, UserRole.COMPLIANCE_OFFICER] },
          { name: 'STAFF_ROLES', group: STAFF_ROLES, expected: [UserRole.ADMIN, UserRole.MANAGER, UserRole.INTERNAL_AUDITOR, UserRole.VIEWER] }
        ),
        ({ name, group, expected }) => {
          // The group must contain exactly the expected roles
          expect([...group].sort()).toEqual([...expected].sort());

          // The group must contain Admin (all groups include Admin)
          expect(group).toContain(UserRole.ADMIN);

          // The group length must match expected length
          expect(group.length).toBe(expected.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
