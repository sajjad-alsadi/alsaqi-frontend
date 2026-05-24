// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { z } from 'zod';
import { validateBody, validate } from '../middleware/validate';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from './helpers/apiTestUtils';

/**
 * Property Test: Validation Layer Unknown Field Stripping (Property 13)
 *
 * Feature: api-audit-improvements
 * Property 13: Validation Layer Unknown Field Stripping
 *
 * **Validates: Requirements 6.2, 6.5**
 *
 * For any request body containing fields not defined in the endpoint's Zod schema,
 * those fields SHALL be removed before the request reaches the handler, and the
 * handler SHALL only receive schema-defined fields.
 */

// ─── Schemas Under Test ──────────────────────────────────────────────────────

/** Simple flat schema with required and optional fields */
const flatSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
});

/** Nested object schema */
const nestedSchema = z.object({
  title: z.string().min(1).max(200),
  metadata: z.object({
    priority: z.enum(['low', 'medium', 'high']),
    tags: z.array(z.string()).optional(),
  }),
  active: z.boolean().default(true),
});

/** Schema with various field types */
const mixedTypesSchema = z.object({
  id: z.number().int().positive(),
  label: z.string().min(1),
  enabled: z.boolean(),
  score: z.number().min(0).max(100).optional(),
  notes: z.string().nullable().optional(),
});

// ─── Reserved/Prototype property names to exclude from generated field names ─

const RESERVED_PROPERTIES = new Set([
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'constructor',
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/**
 * Generates safe field names: starts with a letter, alphanumeric + underscore,
 * excludes JS prototype properties and schema-defined fields.
 */
function safeFieldNameArb(schemaKeys: string[]): fc.Arbitrary<string> {
  return fc
    .stringMatching(/^[a-z][a-z0-9_]{0,20}$/)
    .filter((s) => !schemaKeys.includes(s) && !RESERVED_PROPERTIES.has(s) && s.length >= 2);
}

/** Generates arbitrary JSON-safe values for unknown fields */
const arbitraryValueArb = fc.oneof(
  fc.string({ maxLength: 50 }),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.string({ maxLength: 10 }), { maxLength: 3 })
);

/** Generates 1-5 unknown extra fields as a record for flat schema */
const extraFlatFieldsArb = fc
  .array(fc.tuple(safeFieldNameArb(['name', 'email', 'age']), arbitraryValueArb), {
    minLength: 1,
    maxLength: 5,
  })
  .map((pairs) => Object.fromEntries(pairs));

/** Generates extra fields for nested schema */
const extraNestedFieldsArb = fc
  .array(fc.tuple(safeFieldNameArb(['title', 'metadata', 'active']), arbitraryValueArb), {
    minLength: 1,
    maxLength: 5,
  })
  .map((pairs) => Object.fromEntries(pairs));

/** Generates extra fields for mixed types schema */
const extraMixedFieldsArb = fc
  .array(
    fc.tuple(safeFieldNameArb(['id', 'label', 'enabled', 'score', 'notes']), arbitraryValueArb),
    { minLength: 1, maxLength: 5 }
  )
  .map((pairs) => Object.fromEntries(pairs));

/**
 * Generates valid emails that pass Zod's email validation.
 * Uses a structured approach: localpart@domain.tld
 */
const validEmailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/),
    fc.stringMatching(/^[a-z]{2,6}$/),
    fc.constantFrom('com', 'org', 'net', 'io', 'dev')
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/** Generates valid data for the flat schema */
const validFlatDataArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length >= 1),
  email: validEmailArb,
  age: fc.option(fc.integer({ min: 1, max: 150 }), { nil: undefined }),
});

/** Generates valid data for the nested schema */
const validNestedDataArb = fc.record({
  title: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length >= 1),
  metadata: fc.record({
    priority: fc.constantFrom('low' as const, 'medium' as const, 'high' as const),
    tags: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 3 }), {
      nil: undefined,
    }),
  }),
  active: fc.option(fc.boolean(), { nil: undefined }),
});

/** Generates valid data for the mixed types schema */
const validMixedDataArb = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  label: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length >= 1),
  enabled: fc.boolean(),
  score: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
  notes: fc.option(fc.oneof(fc.string({ maxLength: 100 }), fc.constant(null)), {
    nil: undefined,
  }),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 13: Validation Layer Unknown Field Stripping', () => {
  describe('validateBody strips unknown fields from flat schemas', () => {
    it('strips all unknown fields while preserving schema-defined fields', () => {
      fc.assert(
        fc.property(validFlatDataArb, extraFlatFieldsArb, (validData, extraFields) => {
          // Combine valid data with extra unknown fields
          const bodyWithExtras = { ...validData, ...extraFields };

          const req = createMockRequest({
            method: 'POST',
            body: bodyWithExtras,
          });
          const res = createMockResponse();
          const next = createMockNext();

          validateBody(flatSchema)(req, res as any, next);

          // Handler should have been called (validation passed)
          expect(next).toHaveBeenCalled();

          // Verify only schema-defined keys remain
          const resultKeys = Object.keys(req.body);
          const schemaKeys = ['name', 'email', 'age'];
          for (const key of resultKeys) {
            expect(schemaKeys).toContain(key);
          }

          // Verify no extra field keys are present (check own properties only)
          for (const extraKey of Object.keys(extraFields)) {
            expect(Object.prototype.hasOwnProperty.call(req.body, extraKey)).toBe(false);
          }

          // Verify schema-defined fields are preserved
          expect(req.body.name).toBe(validData.name);
          expect(req.body.email).toBe(validData.email);
        }),
        { numRuns: 200 }
      );
    });

    it('handler receives only schema-defined keys regardless of extra field count', () => {
      fc.assert(
        fc.property(
          validFlatDataArb,
          fc.integer({ min: 1, max: 15 }),
          (validData, extraCount) => {
            // Generate N extra fields dynamically with safe names
            const extraFields: Record<string, unknown> = {};
            for (let i = 0; i < extraCount; i++) {
              extraFields[`xtra_field_${i}`] = `value_${i}`;
            }

            const bodyWithExtras = { ...validData, ...extraFields };

            const req = createMockRequest({
              method: 'POST',
              body: bodyWithExtras,
            });
            const res = createMockResponse();
            const next = createMockNext();

            validateBody(flatSchema)(req, res as any, next);

            expect(next).toHaveBeenCalled();

            // Result should have at most the schema-defined keys
            const resultKeys = Object.keys(req.body);
            expect(resultKeys.length).toBeLessThanOrEqual(3); // name, email, age
            expect(resultKeys.every((k) => ['name', 'email', 'age'].includes(k))).toBe(true);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('validateBody strips unknown fields from nested schemas', () => {
    it('strips top-level unknown fields from nested schema bodies', () => {
      fc.assert(
        fc.property(validNestedDataArb, extraNestedFieldsArb, (validData, extraFields) => {
          const bodyWithExtras = { ...validData, ...extraFields };

          const req = createMockRequest({
            method: 'POST',
            body: bodyWithExtras,
          });
          const res = createMockResponse();
          const next = createMockNext();

          validateBody(nestedSchema)(req, res as any, next);

          expect(next).toHaveBeenCalled();

          // Verify only schema-defined top-level keys remain
          const resultKeys = Object.keys(req.body);
          const schemaKeys = ['title', 'metadata', 'active'];
          for (const key of resultKeys) {
            expect(schemaKeys).toContain(key);
          }

          // Verify extra fields are stripped (check own properties only)
          for (const extraKey of Object.keys(extraFields)) {
            expect(Object.prototype.hasOwnProperty.call(req.body, extraKey)).toBe(false);
          }

          // Verify schema-defined fields are preserved
          expect(req.body.title).toBe(validData.title);
          expect(req.body.metadata.priority).toBe(validData.metadata.priority);
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('validate() combined middleware strips unknown fields from body', () => {
    it('strips unknown fields when using combined validate with body schema', () => {
      const querySchema = z.object({
        format: z.enum(['json', 'csv']).default('json'),
      });

      fc.assert(
        fc.property(validMixedDataArb, extraMixedFieldsArb, (validData, extraFields) => {
          const bodyWithExtras = { ...validData, ...extraFields };

          const req = createMockRequest({
            method: 'POST',
            body: bodyWithExtras,
            query: { format: 'json' },
          });
          const res = createMockResponse();
          const next = createMockNext();

          validate({ body: mixedTypesSchema, query: querySchema })(req, res as any, next);

          expect(next).toHaveBeenCalled();

          // Verify only schema-defined keys remain in body
          const resultKeys = Object.keys(req.body);
          const schemaKeys = ['id', 'label', 'enabled', 'score', 'notes'];
          for (const key of resultKeys) {
            expect(schemaKeys).toContain(key);
          }

          // Verify extra fields are stripped (check own properties only)
          for (const extraKey of Object.keys(extraFields)) {
            expect(Object.prototype.hasOwnProperty.call(req.body, extraKey)).toBe(false);
          }
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('stripping preserves data integrity of schema-defined fields', () => {
    it('schema-defined field values are unchanged after stripping', () => {
      fc.assert(
        fc.property(validFlatDataArb, extraFlatFieldsArb, (validData, extraFields) => {
          const bodyWithExtras = { ...validData, ...extraFields };

          const req = createMockRequest({
            method: 'POST',
            body: bodyWithExtras,
          });
          const res = createMockResponse();
          const next = createMockNext();

          validateBody(flatSchema)(req, res as any, next);

          expect(next).toHaveBeenCalled();

          // Values of schema-defined fields must be identical
          expect(req.body.name).toBe(validData.name);
          expect(req.body.email).toBe(validData.email);
          if (validData.age !== undefined) {
            expect(req.body.age).toBe(validData.age);
          }
        }),
        { numRuns: 200 }
      );
    });
  });
});
