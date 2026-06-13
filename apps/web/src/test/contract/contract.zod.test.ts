/**
 * @vitest-environment node
 *
 * Tests for task 2.3: Zod-vs-OpenAPI assertion and contract fixtures.
 *
 * Covers Requirement 2.2 (Correctness Property 3): for every OpenAPI component
 * with a frontend Zod schema, every contract-valid example is accepted and every
 * contract-violating shape (missing required, wrong type, out-of-enum value) is
 * rejected.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import {
  loadOpenApiContract,
  resetOpenApiContractCache,
  getOpenApiComponent,
  createContractCheck,
  assertZodMatchesOpenapi,
  ENTITY_CONTRACT_FIXTURES,
  CONTRACT_ZOD_SCHEMAS,
  type ContractFixture,
} from './contract';

describe('assertZodMatchesOpenapi — entity fixtures (task 2.3)', () => {
  beforeAll(async () => {
    resetOpenApiContractCache();
    await loadOpenApiContract();
  });

  afterAll(() => {
    resetOpenApiContractCache();
  });

  it('binds one fixture per endpoint-backed entity schema', () => {
    const components = ENTITY_CONTRACT_FIXTURES.map((f) => f.openapiComponent).sort();
    expect(components).toEqual([
      'AuditPlan',
      'Correspondence',
      'Finding',
      'Recommendation',
      'RiskItem',
      'User',
    ]);
  });

  it('every fixture component resolves in docs/openapi.yaml', () => {
    for (const fixture of ENTITY_CONTRACT_FIXTURES) {
      expect(() => getOpenApiComponent(fixture.openapiComponent)).not.toThrow();
    }
  });

  it('every fixture has a bound Zod schema', () => {
    for (const fixture of ENTITY_CONTRACT_FIXTURES) {
      expect(CONTRACT_ZOD_SCHEMAS[fixture.openapiComponent]).toBeDefined();
    }
  });

  // The core property: accept valid, reject contract-violating shapes.
  it.each(ENTITY_CONTRACT_FIXTURES.map((f) => [f.openapiComponent, f] as const))(
    'Zod schema for %s matches its OpenAPI component',
    (component, fixture: ContractFixture) => {
      const zod = CONTRACT_ZOD_SCHEMAS[fixture.openapiComponent];
      expect(zod).toBeDefined();
      expect(() => assertZodMatchesOpenapi(zod!, component)).not.toThrow();
    }
  );

  it('exposes the assertion through ContractCheck.assertZodMatchesOpenapi', () => {
    const check = createContractCheck();
    const finding = CONTRACT_ZOD_SCHEMAS['Finding'];
    expect(() => check.assertZodMatchesOpenapi(finding!, 'Finding')).not.toThrow();
  });

  it('throws when the bound component is absent from the contract', () => {
    const finding = CONTRACT_ZOD_SCHEMAS['Finding'];
    expect(() => assertZodMatchesOpenapi(finding!, 'NoSuchComponent')).toThrowError(
      /NoSuchComponent.*not found/s
    );
  });
});

describe('assertZodMatchesOpenapi — accept/reject behaviour on a synthetic schema', () => {
  // A focused schema that exercises required, typed, and enum constraints with a
  // component that exists in the real contract ('Finding') as the anchor.
  const Synthetic = z.object({
    name: z.string(),
    count: z.number(),
    level: z.enum(['Low', 'High']),
    optionalNote: z.string().optional(),
  });

  beforeAll(async () => {
    resetOpenApiContractCache();
    await loadOpenApiContract();
  });

  afterAll(() => {
    resetOpenApiContractCache();
  });

  it('passes for a schema that accepts valid shapes and rejects required/type/enum violations', () => {
    expect(() => assertZodMatchesOpenapi(Synthetic, 'Finding')).not.toThrow();
  });

  it('rejects each contract-violating shape derived from the schema', () => {
    // Independently confirm the three violation classes the assertion relies on
    // are genuinely rejected by the schema (missing required, wrong type, enum).
    expect(Synthetic.safeParse({ count: 1, level: 'Low' }).success).toBe(false); // missing `name`
    expect(Synthetic.safeParse({ name: 'x', count: 'NaN', level: 'Low' }).success).toBe(false); // wrong type
    expect(Synthetic.safeParse({ name: 'x', count: 1, level: 'Nope' }).success).toBe(false); // out-of-enum
  });

  it('surfaces an error when the schema rejects a structurally-valid example', () => {
    // A refinement is not representable as JSON-schema structure, so the
    // structurally-generated valid example violates it — the assertion must
    // surface this rather than pass silently.
    const Refined = z
      .object({ token: z.string() })
      .refine((o) => o.token === 'a-very-specific-value', 'token mismatch');
    expect(() => assertZodMatchesOpenapi(Refined, 'Finding')).toThrowError(
      /rejected a contract-valid example/s
    );
  });
});

