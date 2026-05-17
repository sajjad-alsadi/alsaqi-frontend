// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { UserRole, ADMIN_ROLES, COMPLIANCE_ROLES, STAFF_ROLES } from '../../constants';

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
