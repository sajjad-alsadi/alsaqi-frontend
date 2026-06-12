// Feature: frontend-consistency-fixes, Property 1: Schema relocation and de-suppression preserve validation behavior
/**
 * Property Test: Schema relocation and de-suppression preserve validation behavior
 *
 * Feature: frontend-consistency-fixes
 * Property 1: Schema relocation and de-suppression preserve validation behavior
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 4.6**
 *
 * For every schema that was relocated to `@alsaqi/shared` and/or de-suppressed
 * (FIX-FE-3 / FIX-FE-4), the CURRENT schema must behave identically to a frozen
 * BASELINE copy captured before relocation. Concretely, for any input — valid
 * shapes, field-mutated variants, and fully arbitrary values — the two schemas
 * must agree on `safeParse(input).success` (parity), and whenever both succeed
 * their parsed outputs must be deeply equal.
 *
 * The baseline definitions live in
 * `apps/web/src/api/__tests__/fixtures/relocated-schemas.baseline.ts` (task 6.1).
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { z } from 'zod';

// Current (relocated / de-suppressed) schemas — single source of truth.
import {
  RiskItemSchema,
  InstructionSchema,
  AuditProgressByTypeSchema,
  RiskLevelBreakdownSchema,
  DashboardStatsSchema,
  RoleSchema,
  PermissionSchema,
  SessionSchema,
  SettingsSchema,
  JobTitleSchema,
} from '@alsaqi/shared';

// Frozen baseline copies captured before relocation.
import { relocatedSchemaBaselines } from './fixtures/relocated-schemas.baseline';

// ─── Building-block arbitraries ─────────────────────────────────────────────────

/** A finite number usable for any `z.number()` field (no NaN/Infinity). */
const numberArb = fc.oneof(
  fc.integer({ min: -1_000_000, max: 1_000_000 }),
  fc.double({ noNaN: true, noDefaultInfinity: true })
);

/** A plain string. */
const stringArb = fc.string();

/** An id-style field: `string | number`. */
const idArb = fc.oneof(fc.string(), fc.integer());

// ─── Valid-shape arbitraries (mirror the baseline definitions) ──────────────────

const riskItemValidArb = fc.record(
  {
    id: stringArb,
    risk_id: stringArb,
    description: stringArb,
    owner: stringArb,
    source: stringArb,
    early_warning: stringArb,
    type: stringArb,
    likelihood: stringArb,
    impact: stringArb,
    score: numberArb,
    rating: stringArb,
    controls: stringArb,
    control_assessment: stringArb,
    mitigation: stringArb,
    treatment_option: stringArb,
    residual_likelihood: stringArb,
    residual_impact: stringArb,
    residual_score: numberArb,
    residual_rating: stringArb,
    status: stringArb,
    target_date: stringArb,
    review_date: stringArb,
    notes: stringArb,
    entry_date: stringArb,
    entered_by: stringArb,
  },
  // `id` is `.optional()`; everything else is required.
  { requiredKeys: [
    'risk_id', 'description', 'owner', 'source', 'early_warning', 'type',
    'likelihood', 'impact', 'score', 'rating', 'controls', 'control_assessment',
    'mitigation', 'treatment_option', 'residual_likelihood', 'residual_impact',
    'residual_score', 'residual_rating', 'status', 'target_date', 'review_date',
    'notes', 'entry_date', 'entered_by',
  ] }
);

const instructionValidArb = fc.record(
  {
    id: stringArb,
    title: stringArb,
    issue_date: stringArb,
    reference_number: stringArb,
    category: stringArb,
    description: stringArb,
    related_department: stringArb,
    attachment: stringArb,
    status: stringArb,
  },
  // `id` and `attachment` are `.optional()`.
  { requiredKeys: [
    'title', 'issue_date', 'reference_number', 'category', 'description',
    'related_department', 'status',
  ] }
);

const auditProgressByTypeValidArb = fc.record({
  type: stringArb,
  planned: numberArb,
  completed: numberArb,
});

const riskLevelBreakdownValidArb = fc.record({
  level: stringArb,
  count: numberArb,
});

const activityItemArb = fc.dictionary(
  fc.string({ minLength: 1 }),
  fc.oneof(stringArb, fc.integer(), fc.boolean(), fc.constant(null)),
  { maxKeys: 4 }
);

const dashboardStatsValidArb = fc.record(
  {
    audits: fc.record({
      total: numberArb,
      completed: numberArb,
      progress_by_type: fc.array(auditProgressByTypeValidArb, { maxLength: 4 }),
    }),
    findings: fc.record({
      summary: fc.record({
        open: numberArb,
        high_risk_open: numberArb,
      }),
    }),
    recommendations: fc.record({
      open: numberArb,
      overdue: numberArb,
    }),
    risks: fc.record(
      {
        summary: fc.record({
          total: numberArb,
          high: numberArb,
        }),
        byLevel: fc.array(riskLevelBreakdownValidArb, { maxLength: 4 }),
      },
      // `byLevel` is `.optional()`.
      { requiredKeys: ['summary'] }
    ),
    correspondence: fc.record({
      incoming_total: numberArb,
      outgoing_total: numberArb,
      pending_responses: numberArb,
    }),
    compliance: fc.record({
      total: numberArb,
    }),
    activity: fc.array(activityItemArb, { maxLength: 4 }),
  }
);

const roleValidArb = fc.record(
  { id: idArb, name: stringArb, description: stringArb },
  { requiredKeys: ['id', 'name'] }
);

const permissionValidArb = fc.record({
  id: idArb,
  module: stringArb,
  action: stringArb,
});

const sessionValidArb = fc.record(
  {
    id: idArb,
    user_id: idArb,
    ip_address: stringArb,
    user_agent: stringArb,
    created_at: stringArb,
    expires_at: stringArb,
  },
  { requiredKeys: ['id', 'user_id'] }
);

const settingsKeys = [
  'failed_login_threshold',
  'inactive_account_threshold_days',
  'password_min_length',
  'password_require_uppercase',
  'password_require_lowercase',
  'password_require_numbers',
  'password_require_symbols',
  'password_expiry_days',
  'enforce_single_session',
  'session_timeout_minutes',
] as const;

const settingsValidArb = fc.record(
  Object.fromEntries(settingsKeys.map((k) => [k, numberArb])) as Record<
    (typeof settingsKeys)[number],
    typeof numberArb
  >,
  // Every field is `.optional()`.
  { requiredKeys: [] }
);

const jobTitleValidArb = fc.record(
  { id: idArb, name: stringArb, name_ar: stringArb, name_en: stringArb },
  { requiredKeys: ['id', 'name'] }
);

// ─── Field-mutation arbitrary ───────────────────────────────────────────────────

/**
 * Given a generator of valid objects, produce malformed/mutated variants by
 * picking a key and either deleting it or replacing its value with an arbitrary
 * (possibly wrong-typed) value. Together with `fc.anything()` this exercises the
 * rejection paths of both schemas, so parity is checked across success AND
 * failure outcomes.
 */
function fieldMutatedArb(
  validArb: fc.Arbitrary<Record<string, unknown>>
): fc.Arbitrary<unknown> {
  return validArb.chain((valid) => {
    const keys = Object.keys(valid);
    if (keys.length === 0) {
      return fc.anything().map((v) => ({ ...valid, mutated: v }));
    }
    return fc.constantFrom(...keys).chain((key) =>
      fc.oneof(
        // (a) Drop the field.
        fc.constant(
          (() => {
            const copy = structuredClone(valid);
            delete copy[key];
            return copy;
          })()
        ),
        // (b) Replace the field with an arbitrary value.
        fc.anything().map((wrong) => ({ ...structuredClone(valid), [key]: wrong }))
      )
    );
  });
}

// ─── Test matrix ────────────────────────────────────────────────────────────────

type AnySchema = z.ZodType<unknown>;

const cases: Array<{
  name: keyof typeof relocatedSchemaBaselines;
  current: AnySchema;
  valid: fc.Arbitrary<Record<string, unknown>>;
}> = [
  { name: 'RiskItemSchema', current: RiskItemSchema as AnySchema, valid: riskItemValidArb },
  { name: 'InstructionSchema', current: InstructionSchema as AnySchema, valid: instructionValidArb },
  { name: 'AuditProgressByTypeSchema', current: AuditProgressByTypeSchema as AnySchema, valid: auditProgressByTypeValidArb },
  { name: 'RiskLevelBreakdownSchema', current: RiskLevelBreakdownSchema as AnySchema, valid: riskLevelBreakdownValidArb },
  { name: 'DashboardStatsSchema', current: DashboardStatsSchema as AnySchema, valid: dashboardStatsValidArb },
  { name: 'RoleSchema', current: RoleSchema as AnySchema, valid: roleValidArb },
  { name: 'PermissionSchema', current: PermissionSchema as AnySchema, valid: permissionValidArb },
  { name: 'SessionSchema', current: SessionSchema as AnySchema, valid: sessionValidArb },
  { name: 'SettingsSchema', current: SettingsSchema as AnySchema, valid: settingsValidArb },
  { name: 'JobTitleSchema', current: JobTitleSchema as AnySchema, valid: jobTitleValidArb },
];

describe('Property 1: Schema relocation and de-suppression preserve validation behavior', () => {
  for (const { name, current, valid } of cases) {
    const baseline = relocatedSchemaBaselines[name] as AnySchema;

    // Input space: valid shapes, field-mutated variants, and fully arbitrary values.
    const inputArb = fc.oneof(
      valid,
      fieldMutatedArb(valid),
      fc.anything()
    );

    describe(name, () => {
      it('agrees with the baseline on safeParse success and on parsed output', () => {
        fc.assert(
          fc.property(inputArb, (input) => {
            const currentResult = current.safeParse(input);
            const baselineResult = baseline.safeParse(input);

            // (1) Parity: both schemas accept/reject identically.
            expect(currentResult.success).toBe(baselineResult.success);

            // (2) On success, the parsed outputs are deeply equal.
            if (currentResult.success && baselineResult.success) {
              expect(currentResult.data).toStrictEqual(baselineResult.data);
            }
          }),
          { numRuns: 200 }
        );
      });
    });
  }
});
