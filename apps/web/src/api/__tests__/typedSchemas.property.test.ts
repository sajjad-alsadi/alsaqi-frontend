/**
 * Property Test: Typed schema validation round-trips valid data and rejects malformed data
 *
 * Feature: web-production-readiness-remediation
 * Property 4: Typed schema validation round-trips valid data and rejects malformed data
 *
 * **Validates: Requirements 8.4**
 *
 * For any object that conforms to the dashboard / user-management contract, the
 * corresponding typed Zod schema parses it successfully and preserves its values
 * (round-trip); and for any object missing a required field or carrying a
 * wrongly-typed field, the schema rejects it.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
// These schemas were relocated to `@alsaqi/shared` (FIX-FE-3); the API modules
// import them from the shared package and no longer re-export the values.
import {
  DashboardStatsSchema,
  RoleSchema,
  PermissionSchema,
  SessionSchema,
  SettingsSchema,
  JobTitleSchema,
} from '@alsaqi/shared';

// ─── Shared building-block arbitraries ─────────────────────────────────────────

/** Non-negative integer count (matches the numeric fields in the contracts). */
const countArb = fc.integer({ min: 0, max: 1_000_000 });

/** A finite number usable for any `z.number()` field. */
const numberArb = fc.integer({ min: -1_000_000, max: 1_000_000 });

/** An id field: `string | number`. */
const idArb = fc.oneof(fc.string(), fc.integer());

/** Wrong value for a `z.number()` field. */
const wrongNumberArb = fc.oneof(fc.string(), fc.boolean());

/** Wrong value for a `z.string()` field. */
const wrongStringArb = fc.oneof(fc.integer(), fc.boolean());

/** Wrong value for a `string | number` id field. */
const wrongIdArb = fc.oneof(fc.boolean(), fc.constant(null), fc.constant({}));

/** Wrong value for an object/array field (a primitive replaces the structure). */
const wrongStructureArb = fc.oneof(fc.string({ minLength: 1 }), fc.integer());

// ─── Malformation helper ────────────────────────────────────────────────────────

/**
 * Given a generator of valid objects, produce malformed variants that either:
 *   (a) drop a required field, or
 *   (b) replace a field with a wrongly-typed value.
 *
 * @param validArb       generator of valid, conforming objects
 * @param requiredKeys   keys whose removal must invalidate the object
 * @param wrongValueArbs map of key -> generator of a wrongly-typed value
 */
function malformedArb<T extends Record<string, unknown>>(
  validArb: fc.Arbitrary<T>,
  requiredKeys: string[],
  wrongValueArbs: Record<string, fc.Arbitrary<unknown>>
): fc.Arbitrary<Record<string, unknown>> {
  const wrongKeys = Object.keys(wrongValueArbs);

  const corruptions: Array<fc.Arbitrary<Record<string, unknown>>> = [];

  // (a) Drop a required field.
  if (requiredKeys.length > 0) {
    corruptions.push(
      validArb.chain((valid) =>
        fc.constantFrom(...requiredKeys).map((key) => {
          const copy = structuredClone(valid) as Record<string, unknown>;
          delete copy[key];
          return copy;
        })
      )
    );
  }

  // (b) Wrong-type a field.
  if (wrongKeys.length > 0) {
    corruptions.push(
      validArb.chain((valid) =>
        fc.constantFrom(...wrongKeys).chain((key) =>
          wrongValueArbs[key].map((wrong) => ({
            ...(structuredClone(valid) as Record<string, unknown>),
            [key]: wrong,
          }))
        )
      )
    );
  }

  return fc.oneof(...corruptions);
}

// ─── DashboardStats arbitraries ─────────────────────────────────────────────────

const auditProgressArb = fc.record({
  type: fc.string(),
  planned: countArb,
  completed: countArb,
});

const riskLevelArb = fc.record({
  level: fc.string(),
  count: countArb,
});

/** An activity item: a record of string keys to primitive (round-trip-safe) values. */
const activityItemArb = fc.dictionary(
  fc.string({ minLength: 1 }),
  fc.oneof(fc.string(), fc.integer(), fc.boolean()),
  { maxKeys: 5 }
);

const dashboardValidArb = fc.record(
  {
    audits: fc.record({
      total: countArb,
      completed: countArb,
      progress_by_type: fc.array(auditProgressArb, { maxLength: 5 }),
    }),
    findings: fc.record({
      summary: fc.record({
        open: countArb,
        high_risk_open: countArb,
      }),
    }),
    recommendations: fc.record({
      open: countArb,
      overdue: countArb,
    }),
    risks: fc.record(
      {
        summary: fc.record({
          total: countArb,
          high: countArb,
        }),
        byLevel: fc.array(riskLevelArb, { maxLength: 5 }),
      },
      { requiredKeys: ['summary'] }
    ),
    correspondence: fc.record({
      incoming_total: countArb,
      outgoing_total: countArb,
      pending_responses: countArb,
    }),
    compliance: fc.record({
      total: countArb,
    }),
    activity: fc.array(activityItemArb, { maxLength: 5 }),
  }
);

const dashboardMalformedArb = malformedArb(
  dashboardValidArb,
  ['audits', 'findings', 'recommendations', 'risks', 'correspondence', 'compliance', 'activity'],
  {
    audits: wrongStructureArb,
    findings: wrongStructureArb,
    recommendations: wrongStructureArb,
    risks: wrongStructureArb,
    correspondence: wrongStructureArb,
    compliance: wrongStructureArb,
    activity: wrongStructureArb,
  }
);

// ─── User-management arbitraries ────────────────────────────────────────────────

const roleValidArb = fc.record(
  { id: idArb, name: fc.string(), description: fc.string() },
  { requiredKeys: ['id', 'name'] }
);
const roleMalformedArb = malformedArb(roleValidArb, ['id', 'name'], {
  id: wrongIdArb,
  name: wrongStringArb,
});

const permissionValidArb = fc.record({
  id: idArb,
  module: fc.string(),
  action: fc.string(),
});
const permissionMalformedArb = malformedArb(
  permissionValidArb,
  ['id', 'module', 'action'],
  { id: wrongIdArb, module: wrongStringArb, action: wrongStringArb }
);

const sessionValidArb = fc.record(
  {
    id: idArb,
    user_id: idArb,
    ip_address: fc.string(),
    user_agent: fc.string(),
    created_at: fc.string(),
    expires_at: fc.string(),
  },
  { requiredKeys: ['id', 'user_id'] }
);
const sessionMalformedArb = malformedArb(sessionValidArb, ['id', 'user_id'], {
  id: wrongIdArb,
  user_id: wrongIdArb,
  ip_address: wrongStringArb,
  user_agent: wrongStringArb,
});

const jobTitleValidArb = fc.record(
  { id: idArb, name: fc.string(), name_ar: fc.string(), name_en: fc.string() },
  { requiredKeys: ['id', 'name'] }
);
const jobTitleMalformedArb = malformedArb(jobTitleValidArb, ['id', 'name'], {
  id: wrongIdArb,
  name: wrongStringArb,
  name_ar: wrongStringArb,
});

// SettingsSchema has no required fields, so malformation is wrong-typing only.
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
  { requiredKeys: [] }
);
const settingsMalformedArb = malformedArb(
  settingsValidArb,
  [],
  Object.fromEntries(settingsKeys.map((k) => [k, wrongNumberArb]))
);

// ─── Test matrix ────────────────────────────────────────────────────────────────

const schemaCases: Array<{
  name: string;
  schema: { parse: (v: unknown) => unknown; safeParse: (v: unknown) => { success: boolean } };
  valid: fc.Arbitrary<Record<string, unknown>>;
  malformed: fc.Arbitrary<Record<string, unknown>>;
}> = [
  { name: 'DashboardStatsSchema', schema: DashboardStatsSchema, valid: dashboardValidArb, malformed: dashboardMalformedArb },
  { name: 'RoleSchema', schema: RoleSchema, valid: roleValidArb, malformed: roleMalformedArb },
  { name: 'PermissionSchema', schema: PermissionSchema, valid: permissionValidArb, malformed: permissionMalformedArb },
  { name: 'SessionSchema', schema: SessionSchema, valid: sessionValidArb, malformed: sessionMalformedArb },
  { name: 'JobTitleSchema', schema: JobTitleSchema, valid: jobTitleValidArb, malformed: jobTitleMalformedArb },
  { name: 'SettingsSchema', schema: SettingsSchema, valid: settingsValidArb, malformed: settingsMalformedArb },
];

describe('Property 4: Typed schema validation round-trips valid data and rejects malformed data', () => {
  for (const { name, schema, valid, malformed } of schemaCases) {
    describe(name, () => {
      it('parses valid data and preserves its values (round-trip)', () => {
        fc.assert(
          fc.property(valid, (obj) => {
            const parsed = schema.parse(obj);
            expect(parsed).toEqual(obj);
          }),
          { numRuns: 100 }
        );
      });

      it('rejects malformed data (missing required field or wrong-typed field)', () => {
        fc.assert(
          fc.property(malformed, (obj) => {
            expect(schema.safeParse(obj).success).toBe(false);
          }),
          { numRuns: 100 }
        );
      });
    });
  }
});
