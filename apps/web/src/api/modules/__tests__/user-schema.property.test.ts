/**
 * Property-based tests for user schema password rejection.
 *
 * Feature: frontend-audit-remediation, Property 21: User schema rejects password fields
 *
 * Property 21: User schema rejects password fields
 *   For any otherwise-valid user object that additionally contains a `password`
 *   field (with any value), the `Auth_Module` user schema (`UserSchema`) SHALL
 *   reject the object as invalid; and the same object without a `password`
 *   field validates successfully.
 *   **Validates: Requirements 26.1, 26.2**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { UserSchema } from '../auth';

/**
 * Generator for an otherwise-valid user object: it includes every required
 * field and a random subset of the optional fields, using only keys the schema
 * defines. This is the "otherwise-valid" baseline the property builds on.
 */
const validUserArb = fc
  .record(
    {
      id: fc.option(fc.oneof(fc.integer(), fc.string()), { nil: undefined }),
      username: fc.string(),
      name: fc.string(),
      email: fc.string(),
      department: fc.string(),
      job_title: fc.option(fc.string(), { nil: undefined }),
      role: fc.string(),
      profile_picture: fc.option(fc.string(), { nil: undefined }),
      status: fc.string(),
      last_login: fc.option(fc.string(), { nil: undefined }),
      theme: fc.option(fc.constantFrom('light', 'dark'), { nil: undefined }),
      permissions: fc.option(
        fc.array(
          fc.record({ module: fc.string(), action: fc.string() })
        ),
        { nil: undefined }
      ),
    },
    { requiredKeys: ['username', 'name', 'email', 'department', 'role', 'status'] }
  )
  // Drop optional keys whose generated value is `undefined` so the object only
  // carries keys the schema knows about (important under `.strict()`).
  .map((user) =>
    Object.fromEntries(
      Object.entries(user).filter(([, value]) => value !== undefined)
    )
  );

// Any value a `password` field might carry.
const passwordValueArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.object()
);

describe('Property 21: user schema rejects password fields', () => {
  it('rejects any otherwise-valid user object that also contains a password field', () => {
    fc.assert(
      fc.property(validUserArb, passwordValueArb, (user, password) => {
        const withPassword = { ...user, password };
        const result = UserSchema.safeParse(withPassword);
        expect(result.success).toBe(false);
      }),
      { numRuns: 200 }
    );
  });

  it('accepts the same otherwise-valid user object when it has no password field', () => {
    fc.assert(
      fc.property(validUserArb, (user) => {
        expect('password' in user).toBe(false);
        const result = UserSchema.safeParse(user);
        expect(result.success).toBe(true);
      }),
      { numRuns: 200 }
    );
  });
});
