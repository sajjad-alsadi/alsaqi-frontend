/**
 * @vitest-environment node
 *
 * Property Test — Property 3: Contract consistency
 *
 * Feature: frontend-production-readiness-10
 *
 * **Validates: Requirements 2.2**
 *
 * For every OpenAPI component with a frontend Zod schema, every contract-valid
 * shape is accepted and every contract-violating shape (a missing required
 * property, a value of the wrong type, or a value outside a declared
 * enumeration) is rejected.
 *
 * Generation strategy: the valid/invalid shapes are derived from the frontend
 * Zod schema's own declared structure (via Zod 4's `z.toJSONSchema`) — the same
 * introspection `assertZodMatchesOpenapi` uses. The frontend schemas are
 * intentionally stricter than the published OpenAPI strings in places (numeric
 * ids, narrow status/risk enums), so anchoring on the Zod structure guarantees
 * each generated "valid" shape is genuinely contract-consistent and each
 * "invalid" shape violates a rule the frontend actually enforces. fast-check
 * randomises which property is mutated, which enum member / value is used, and
 * which optional properties are present, exercising the accept/reject boundary
 * across the whole input space rather than a single fixed example.
 *
 * Each fixture component is first anchored to a real `components.schemas` entry
 * in `docs/openapi.yaml` (loaded read-only via `loadOpenApiContract`, with the
 * `file://` URL fix already in place) so the property is only asserted for
 * schemas that the contract actually publishes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import { z } from 'zod';
import {
  loadOpenApiContract,
  resetOpenApiContractCache,
  getOpenApiComponent,
  ENTITY_CONTRACT_FIXTURES,
  CONTRACT_ZOD_SCHEMAS,
} from './contract';

// ─── JSON-Schema introspection helpers ─────────────────────────────────────────

/**
 * The subset of a `z.toJSONSchema` node the generators read. Kept permissive to
 * tolerate vendor keywords and nullable/union encodings.
 */
interface JsonNode {
  type?: string | string[];
  enum?: unknown[];
  anyOf?: JsonNode[];
  properties?: Record<string, JsonNode>;
  required?: string[];
  items?: JsonNode | JsonNode[];
}

/** First non-`null` concrete type of a node (handles `type: ['string','null']`). */
function concreteType(node: JsonNode): string | undefined {
  if (Array.isArray(node.type)) {
    return node.type.find((t) => t !== 'null');
  }
  return node.type;
}

/** True when a node has exactly one concrete primitive type (no enum/union/nullable). */
function singlePrimitive(node: JsonNode): node is JsonNode & { type: string } {
  if (Array.isArray(node.enum) && node.enum.length > 0) return false;
  if (Array.isArray(node.anyOf)) return false;
  if (Array.isArray(node.type)) return false;
  return (
    node.type === 'string' ||
    node.type === 'number' ||
    node.type === 'integer' ||
    node.type === 'boolean'
  );
}

// ─── Valid-value arbitraries ────────────────────────────────────────────────────

/** A finite number — `z.number()` rejects NaN/Infinity, so we never generate them. */
const numberArb = fc.integer({ min: -1_000_000, max: 1_000_000 });

/** Build a fast-check arbitrary that yields values a node's schema accepts. */
function validValueArb(node: JsonNode): fc.Arbitrary<unknown> {
  if (Array.isArray(node.enum) && node.enum.length > 0) {
    return fc.constantFrom(...node.enum);
  }
  if (Array.isArray(node.anyOf) && node.anyOf.length > 0) {
    return fc.oneof(...node.anyOf.map(validValueArb));
  }
  switch (concreteType(node)) {
    case 'string':
      return fc.string();
    case 'number':
    case 'integer':
      return numberArb;
    case 'boolean':
      return fc.boolean();
    case 'array': {
      const items = Array.isArray(node.items) ? node.items[0] : node.items;
      return items ? fc.array(validValueArb(items), { maxLength: 3 }) : fc.constant([]);
    }
    case 'null':
      return fc.constant(null);
    case 'object':
      return validObjectArb(node, true);
    default:
      // Unconstrained node — any value is acceptable.
      return fc.constant('contract-sample');
  }
}

/**
 * Build a fast-check arbitrary for an object node. When `includeAllProps` is set,
 * every declared property is populated; otherwise optional properties are
 * randomly present/absent (both remain contract-valid).
 */
function validObjectArb(
  node: JsonNode,
  includeAllProps: boolean
): fc.Arbitrary<Record<string, unknown>> {
  const properties = node.properties ?? {};
  const required = node.required ?? [];
  const model: Record<string, fc.Arbitrary<unknown>> = {};
  for (const [key, propNode] of Object.entries(properties)) {
    model[key] = validValueArb(propNode);
  }
  const requiredKeys = includeAllProps ? Object.keys(properties) : required;
  return fc.record(model, { requiredKeys: requiredKeys as (keyof typeof model)[] });
}

// ─── Contract-violation arbitraries ─────────────────────────────────────────────

const OUT_OF_ENUM_SENTINEL = '__contract_out_of_enum__';

/** A value of a different primitive type than `type` (for wrong-type violations). */
function wrongTypeValue(type: string): unknown {
  switch (type) {
    case 'string':
      return 12345; // a number where a string is required
    case 'number':
    case 'integer':
      return 'not-a-number'; // a string where a number is required
    case 'boolean':
      return 'not-a-boolean';
    default:
      return null;
  }
}

/**
 * Build a fast-check arbitrary that yields contract-violating root objects: a
 * fully-populated valid base mutated by exactly one violation — a dropped
 * required property, a mistyped single-primitive required property, or an
 * enum property set outside its declared set.
 */
function violationArb(node: JsonNode): fc.Arbitrary<Record<string, unknown>> {
  const properties = node.properties ?? {};
  const required = node.required ?? [];

  const requiredWithSinglePrimitive = required.filter((k) => {
    const p = properties[k];
    return p !== undefined && singlePrimitive(p);
  });
  const enumKeys = Object.keys(properties).filter(
    (k) => Array.isArray(properties[k].enum) && properties[k].enum!.length > 0
  );

  return validObjectArb(node, true).chain((base) => {
    const variants: fc.Arbitrary<Record<string, unknown>>[] = [];

    // (a) Omit a required property.
    if (required.length > 0) {
      variants.push(
        fc.constantFrom(...required).map((key) => {
          const copy = { ...base };
          delete copy[key];
          return copy;
        })
      );
    }

    // (b) Mistype a single-primitive required property.
    if (requiredWithSinglePrimitive.length > 0) {
      variants.push(
        fc.constantFrom(...requiredWithSinglePrimitive).map((key) => ({
          ...base,
          [key]: wrongTypeValue(properties[key].type as string),
        }))
      );
    }

    // (c) Use a value outside a declared enumeration.
    if (enumKeys.length > 0) {
      variants.push(
        fc.constantFrom(...enumKeys).map((key) => ({
          ...base,
          [key]: OUT_OF_ENUM_SENTINEL,
        }))
      );
    }

    return fc.oneof(...variants);
  });
}

// ─── Property test ──────────────────────────────────────────────────────────────

describe('Property 3: Contract consistency (Requirement 2.2)', () => {
  beforeAll(async () => {
    resetOpenApiContractCache();
    await loadOpenApiContract();
  });

  afterAll(() => {
    resetOpenApiContractCache();
  });

  for (const fixture of ENTITY_CONTRACT_FIXTURES) {
    const component = fixture.openapiComponent;
    const zod = CONTRACT_ZOD_SCHEMAS[component] as z.ZodType<unknown>;

    describe(component, () => {
      it('is anchored to a published components.schemas component', () => {
        expect(() => getOpenApiComponent(component)).not.toThrow();
        expect(zod).toBeDefined();
      });

      it('accepts every contract-valid shape', () => {
        const root = z.toJSONSchema(zod, { unrepresentable: 'any' }) as JsonNode;
        fc.assert(
          fc.property(validObjectArb(root, false), (shape) => {
            const result = zod.safeParse(shape);
            expect(result.success).toBe(true);
          }),
          { numRuns: 100 }
        );
      });

      it('rejects every contract-violating shape', () => {
        const root = z.toJSONSchema(zod, { unrepresentable: 'any' }) as JsonNode;
        fc.assert(
          fc.property(violationArb(root), (shape) => {
            const result = zod.safeParse(shape);
            expect(result.success).toBe(false);
          }),
          { numRuns: 100 }
        );
      });
    });
  }
});
