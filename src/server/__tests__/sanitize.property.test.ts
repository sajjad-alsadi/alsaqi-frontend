// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property Test: BaseService.sanitizeBody converts empty strings for UUID fields to null (Property 9)
 *
 * Feature: comprehensive-testing
 * Property 9: sanitizeBody يحول السلاسل الفارغة لحقول UUID إلى null
 *
 * **Validates: Requirements 5.5**
 *
 * For any object with fields ending in '_id', equal to 'id', or containing 'uuid'
 * that have empty string values, sanitizeBody must convert them to null.
 * All other fields must remain unchanged.
 *
 * The actual implementation from BaseService:
 *   protected static sanitizeBody(body: any) {
 *     const sanitized = { ...body };
 *     Object.keys(sanitized).forEach(key => {
 *       if (sanitized[key] === "" && (key.endsWith('_id') || key === 'id' || key.includes('uuid'))) {
 *         sanitized[key] = null;
 *       }
 *     });
 *     return sanitized;
 *   }
 */

// ─── Implementation Under Test ───────────────────────────────────────────────

/**
 * Standalone version of BaseService.sanitizeBody for testing.
 * Matches the exact logic from src/server/services/BaseService.ts.
 */
function sanitizeBody(body: any): any {
  const sanitized = { ...body };
  Object.keys(sanitized).forEach((key) => {
    if (sanitized[key] === '' && (key.endsWith('_id') || key === 'id' || key.includes('uuid'))) {
      sanitized[key] = null;
    }
  });
  return sanitized;
}

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates field names that end with '_id' (UUID/foreign key fields) */
const idFieldNameArb = fc
  .stringMatching(/^[a-z][a-z0-9_]{1,15}$/)
  .map((prefix) => `${prefix}_id`);

/** Generates field names containing 'uuid' */
const uuidFieldNameArb = fc
  .stringMatching(/^[a-z][a-z0-9_]{0,10}$/)
  .map((prefix) => `${prefix}_uuid_field`);

/** Generates non-UUID field names (don't end with _id, aren't 'id', don't contain 'uuid') */
const nonIdFieldNameArb = fc
  .stringMatching(/^[a-z][a-z0-9_]{1,15}$/)
  .filter((name) => !name.endsWith('_id') && name !== 'id' && !name.includes('uuid'));

/** Generates non-empty string values (to ensure they aren't converted) */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 100 });

/** Generates arbitrary non-string values */
const nonStringValueArb = fc.oneof(
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.double({ noNaN: true }),
  fc.array(fc.integer(), { maxLength: 3 })
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 9: sanitizeBody converts empty strings for UUID fields to null', () => {
  it('converts empty string _id fields to null', () => {
    fc.assert(
      fc.property(idFieldNameArb, (fieldName) => {
        const body = { [fieldName]: '' };
        const result = sanitizeBody(body);
        expect(result[fieldName]).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('converts empty string "id" field to null', () => {
    const body = { id: '' };
    const result = sanitizeBody(body);
    expect(result.id).toBeNull();
  });

  it('converts empty string uuid-containing fields to null', () => {
    fc.assert(
      fc.property(uuidFieldNameArb, (fieldName) => {
        const body = { [fieldName]: '' };
        const result = sanitizeBody(body);
        expect(result[fieldName]).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('does not modify non-id fields with empty strings', () => {
    fc.assert(
      fc.property(nonIdFieldNameArb, (fieldName) => {
        const body = { [fieldName]: '' };
        const result = sanitizeBody(body);
        expect(result[fieldName]).toBe('');
      }),
      { numRuns: 100 }
    );
  });

  it('does not modify _id fields with non-empty string values', () => {
    fc.assert(
      fc.property(idFieldNameArb, nonEmptyStringArb, (fieldName, value) => {
        const body = { [fieldName]: value };
        const result = sanitizeBody(body);
        expect(result[fieldName]).toBe(value);
      }),
      { numRuns: 100 }
    );
  });

  it('does not modify _id fields with non-string values', () => {
    fc.assert(
      fc.property(idFieldNameArb, nonStringValueArb, (fieldName, value) => {
        const body = { [fieldName]: value };
        const result = sanitizeBody(body);
        expect(result[fieldName]).toBe(value);
      }),
      { numRuns: 100 }
    );
  });

  it('preserves all other fields unchanged in mixed objects', () => {
    fc.assert(
      fc.property(
        fc.record({
          department_id: fc.constant(''),
          plan_id: fc.constant(''),
          title: fc.string({ minLength: 1, maxLength: 50 }),
          status: fc.constantFrom('draft', 'active', 'completed'),
          count: fc.integer({ min: 0, max: 1000 }),
        }),
        (body) => {
          const result = sanitizeBody(body);

          // _id fields with empty strings become null
          expect(result.department_id).toBeNull();
          expect(result.plan_id).toBeNull();

          // Other fields remain unchanged
          expect(result.title).toBe(body.title);
          expect(result.status).toBe(body.status);
          expect(result.count).toBe(body.count);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('handles objects with multiple _id fields, some empty and some not', () => {
    fc.assert(
      fc.property(
        fc.record({
          user_id: fc.constant(''),
          department_id: fc.uuid(),
          plan_id: fc.constant(''),
          assigned_to_id: fc.uuid(),
        }),
        (body) => {
          const result = sanitizeBody(body);

          // Empty _id fields become null
          expect(result.user_id).toBeNull();
          expect(result.plan_id).toBeNull();

          // Non-empty _id fields remain unchanged
          expect(result.department_id).toBe(body.department_id);
          expect(result.assigned_to_id).toBe(body.assigned_to_id);
        }
      ),
      { numRuns: 100 }
    );
  });
});
