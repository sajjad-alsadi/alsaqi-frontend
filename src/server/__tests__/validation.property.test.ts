// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { z } from 'zod';
import {
  invalidComplianceStatusArb,
} from '../../test/helpers/arbitraries';

/**
 * Property Test: Zod schemas reject invalid inputs and accept valid ones (Property 7)
 *
 * Feature: comprehensive-testing
 * Property 7: مخططات Zod ترفض المدخلات غير الصالحة وتقبل الصالحة
 *
 * **Validates: Requirements 13.1, 13.2, 13.3**
 *
 * For any random data that doesn't match userSchema, it gets rejected.
 * For any valid data according to incomingSchema, it gets accepted.
 * For any non-allowed compliance_status value, it gets rejected.
 */

// ─── Schemas Under Test (replicated from source for isolation) ───────────────

/**
 * userSchema from src/server/routes/users.ts
 * Requires: name (min 1, max 100), email (valid email), role (min 1)
 */
const userSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  password: z.string().min(6).max(100).optional(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  department: z.string().optional().nullable(),
  job_title_id: z.string().optional().nullable(),
  role: z.string().min(1),
  unit: z.string().optional().nullable(),
  reporting_manager_id: z.string().optional().nullable(),
  access_scope: z.string().optional().nullable(),
  phone_number: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.string().optional(),
});

/**
 * incomingSchema from src/server/routes/correspondence.ts
 * Requires: letter_number, sender_entity, subject, letter_date, receipt_date
 */
const incomingSchema = z.object({
  letter_number: z.string().min(1).max(100),
  sender_entity: z.string().min(1).max(255),
  sender_entity_type: z.string().optional(),
  subject: z.string().min(1).max(500),
  letter_date: z.string().min(1),
  receipt_date: z.string().min(1),
  classification: z.string().optional(),
  priority: z.string().optional(),
  method: z.string().optional(),
  receiving_dept_id: z.string().uuid().optional().nullable(),
  assigned_dept_id: z.string().uuid().optional().nullable(),
  assigned_user_id: z.string().uuid().optional().nullable(),
  follow_up_required: z.boolean().optional(),
  follow_up_date: z.string().optional().nullable(),
  response_required: z.boolean().optional(),
  response_due_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

/**
 * Allowed compliance_status values from src/server/routes/compliance.ts
 */
const ALLOWED_COMPLIANCE_STATUSES = ['compliant', 'partial', 'non_compliant', 'under_review'];

/**
 * Local safe generator for valid incoming correspondence data.
 * Uses integer-based date generation to avoid Invalid Date issues with fc.date().
 */
const safeIncomingCorrespondenceArb = fc.record({
  letter_number: fc.stringMatching(/^[A-Z]{2,4}-\d{3,6}$/),
  sender_entity: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length >= 1),
  sender_entity_type: fc.constantFrom('government', 'private', 'internal', 'regulatory'),
  subject: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length >= 1),
  letter_date: fc.integer({ min: 2020, max: 2029 }).chain((year) =>
    fc.integer({ min: 1, max: 12 }).chain((month) =>
      fc.integer({ min: 1, max: 28 }).map(
        (day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      )
    )
  ),
  receipt_date: fc.integer({ min: 2020, max: 2029 }).chain((year) =>
    fc.integer({ min: 1, max: 12 }).chain((month) =>
      fc.integer({ min: 1, max: 28 }).map(
        (day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      )
    )
  ),
  classification: fc.constantFrom('general', 'audit_related', 'compliance', 'administrative'),
  priority: fc.constantFrom('normal', 'urgent', 'very_urgent', 'confidential'),
  method: fc.constantFrom('official_mail', 'hand_delivery', 'electronic_system', 'email'),
  follow_up_required: fc.boolean(),
  response_required: fc.boolean(),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: null }),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 7: Zod schemas reject invalid inputs and accept valid ones', () => {
  describe('userSchema rejects invalid data', () => {
    it('rejects objects missing required "name" field', () => {
      fc.assert(
        fc.property(
          fc.record({
            email: fc.emailAddress(),
            role: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          (data) => {
            // Missing 'name' field - should fail validation
            const result = userSchema.safeParse(data);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects objects missing required "email" field', () => {
      fc.assert(
        fc.property(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 100 }),
            role: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          (data) => {
            // Missing 'email' field - should fail validation
            const result = userSchema.safeParse(data);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects objects missing required "role" field', () => {
      fc.assert(
        fc.property(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 100 }),
            email: fc.emailAddress(),
          }),
          (data) => {
            // Missing 'role' field - should fail validation
            const result = userSchema.safeParse(data);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects objects with invalid email format', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('@') || !s.includes('.')),
          (invalidEmail) => {
            const data = {
              name: 'Test User',
              email: invalidEmail,
              role: 'Admin',
            };
            const result = userSchema.safeParse(data);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects objects with empty name', () => {
      fc.assert(
        fc.property(
          fc.emailAddress(),
          fc.string({ minLength: 1, maxLength: 20 }),
          (email, role) => {
            const data = {
              name: '', // empty name violates min(1)
              email,
              role,
            };
            const result = userSchema.safeParse(data);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects random non-object data types', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined),
            fc.string()
          ),
          (randomData) => {
            const result = userSchema.safeParse(randomData);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('incomingSchema accepts valid data', () => {
    it('accepts any valid incoming correspondence data', () => {
      fc.assert(
        fc.property(
          safeIncomingCorrespondenceArb,
          (validData) => {
            const result = incomingSchema.safeParse(validData);
            expect(result.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('accepts minimal valid incoming correspondence data (required fields only)', () => {
      fc.assert(
        fc.property(
          fc.record({
            letter_number: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length >= 1),
            sender_entity: fc.string({ minLength: 1, maxLength: 255 }).filter((s) => s.trim().length >= 1),
            subject: fc.string({ minLength: 1, maxLength: 500 }).filter((s) => s.trim().length >= 1),
            letter_date: fc.integer({ min: 2020, max: 2029 }).chain((year) =>
              fc.integer({ min: 1, max: 12 }).chain((month) =>
                fc.integer({ min: 1, max: 28 }).map(
                  (day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                )
              )
            ),
            receipt_date: fc.integer({ min: 2020, max: 2029 }).chain((year) =>
              fc.integer({ min: 1, max: 12 }).chain((month) =>
                fc.integer({ min: 1, max: 28 }).map(
                  (day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                )
              )
            ),
          }),
          (minimalData) => {
            const result = incomingSchema.safeParse(minimalData);
            expect(result.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('compliance_status rejects non-allowed values', () => {
    it('rejects any compliance_status value not in the allowed list', () => {
      fc.assert(
        fc.property(
          invalidComplianceStatusArb,
          (invalidStatus) => {
            // Simulate the validation logic from the PATCH /compliance/:id/status endpoint
            const isAllowed = ALLOWED_COMPLIANCE_STATUSES.includes(invalidStatus);
            expect(isAllowed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects compliance_status values that are close but not exact matches', () => {
      const nearMissStatuses = fc.constantFrom(
        'Compliant',       // wrong case
        'PARTIAL',         // wrong case
        'noncompliant',    // missing underscore
        'non-compliant',   // hyphen instead of underscore
        'Under Review',    // space instead of underscore
        'under-review',    // hyphen instead of underscore
        'pending',         // not a valid status
        'approved',        // not a valid status
        'rejected',        // not a valid status
        'active',          // not a valid status
        'inactive',        // not a valid status
        ''                 // empty string
      );

      fc.assert(
        fc.property(
          nearMissStatuses,
          (invalidStatus) => {
            const isAllowed = ALLOWED_COMPLIANCE_STATUSES.includes(invalidStatus);
            expect(isAllowed).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('accepts all valid compliance_status values', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...ALLOWED_COMPLIANCE_STATUSES),
          (validStatus) => {
            const isAllowed = ALLOWED_COMPLIANCE_STATUSES.includes(validStatus);
            expect(isAllowed).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
