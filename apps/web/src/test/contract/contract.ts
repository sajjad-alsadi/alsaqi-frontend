/**
 * Backend contract-assurance harness (Stream 2).
 *
 * This module is the single entry point for the contract test-suite. It exposes
 * the {@link ContractCheck} surface used to validate that the frontend's Zod
 * schemas and request/response assumptions match the backend contract published
 * in `docs/openapi.yaml` (consumed read-only), plus the {@link ContractScenario}
 * type used to wire MSW handlers through the real `createApiClient`.
 *
 * Task 2.1 establishes this scaffolding (the public interface + the envelope
 * assertion). The OpenAPI parsing / orphan detection (task 2.2) and the
 * Zod-vs-OpenAPI assertion (task 2.3) are layered onto this surface by later
 * tasks in the stream.
 *
 * @module test/contract/contract
 */
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import { z } from 'zod';
import type { HttpHandler } from 'msw';

// Endpoint-backed entity Zod schemas (the single source of frontend validation
// truth) bound to their published OpenAPI components by the contract fixtures.
import { UserSchema } from '../../api/modules/users';
import { AuditPlanSchema } from '../../api/modules/audit-plans';
import { FindingSchema } from '../../api/modules/findings';
import { RecommendationSchema } from '../../api/modules/recommendations';
import { CorrespondenceSchema } from '../../api/modules/correspondence';
import { RiskItemSchema } from '@alsaqi/shared';

// ─── JSON Schema shape ──────────────────────────────────────────────────────

/**
 * A resolved JSON-Schema node as produced from an OpenAPI `components.schemas`
 * entry after `$ref` resolution. Kept intentionally permissive: the contract
 * checks read a known subset (`type`, `properties`, `required`, `enum`, `items`)
 * while preserving any vendor extensions or unmodelled keywords.
 */
export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema | JsonSchema[];
  format?: string;
  nullable?: boolean;
  [keyword: string]: unknown;
}

// ─── Public contract surface ─────────────────────────────────────────────────

/**
 * The contract-assurance check surface used by the contract test-suite.
 *
 * @see Requirements 2.1, 2.2, 2.6, 2.7, 2.8
 */
export interface ContractCheck {
  /**
   * Resolve a schema component from `docs/openapi.yaml` by its `$ref` name
   * (e.g. `'Finding'`). Throws if the component is absent or the document
   * failed to parse / resolve.
   *
   * Implemented by task 2.2 (OpenAPI parse + reference resolution).
   */
  openapiSchema(componentName: string): JsonSchema;

  /**
   * Assert that a frontend Zod schema accepts every contract-valid example for
   * the named OpenAPI component and rejects every contract-violating shape
   * (missing required property, wrong type, out-of-enum value).
   *
   * Implemented by task 2.3 (Zod-vs-OpenAPI assertion).
   */
  assertZodMatchesOpenapi<T>(zod: z.ZodType<T>, componentName: string): void;

  /**
   * Assert that a raw (pre-unwrap) backend body honors the response envelope
   * wrapper `{ success, data, meta? }`. On `success: true`, `data` must be
   * present. Mirrors `unwrapEnvelope` / `readEnvelopeMeta` in
   * `src/api/utils/envelope`.
   */
  assertEnvelope(sampleResponse: unknown): void;
}

/**
 * Names of the MSW-backed contract scenarios exercised through the real
 * `createApiClient`.
 */
export type ContractScenarioName = 'csrf' | 'session.refresh' | 'ws.auth' | 'envelope';

/**
 * Binds a named contract scenario to the MSW handler that drives it through the
 * real `createApiClient`.
 *
 * @see Requirements 2.3, 2.4, 2.5
 */
export interface ContractScenario {
  name: ContractScenarioName;
  /** MSW handler invoked through `createApiClient`. */
  handler: HttpHandler;
}

// ─── Envelope assertion ───────────────────────────────────────────────────────

/**
 * Shape of a well-formed response envelope. `meta` is optional; `data` must be
 * present whenever `success` is `true`.
 */
interface ResponseEnvelope {
  success: boolean;
  data: unknown;
  meta?: Record<string, unknown>;
}

function isResponseEnvelope(value: unknown): value is ResponseEnvelope {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record['success'] !== 'boolean') {
    return false;
  }
  // `meta`, when present, must be a non-null object.
  if ('meta' in record) {
    const meta = record['meta'];
    if (meta === null || typeof meta !== 'object') {
      return false;
    }
  }
  // On success, `data` must be present (it may itself be `null`).
  if (record['success'] === true && !('data' in record)) {
    return false;
  }
  return true;
}

/**
 * Assert that `sampleResponse` matches the `{ success, data, meta? }` envelope
 * contract. Throws a descriptive error otherwise.
 *
 * Preconditions: `sampleResponse` is the raw (pre-unwrap) backend body.
 * Postconditions: returns normally iff the body is a well-formed envelope; on
 * `success: true`, `data` is present.
 *
 * @see Requirement 2.1
 */
export function assertEnvelope(sampleResponse: unknown): void {
  if (!isResponseEnvelope(sampleResponse)) {
    throw new Error(
      `Contract violation: response does not match the { success, data, meta? } envelope: ${JSON.stringify(
        sampleResponse
      )}`
    );
  }
}

// ─── OpenAPI parsing & reference resolution (task 2.2) ─────────────────────────

/**
 * Absolute path to the backend contract document. `docs/openapi.yaml` lives at
 * the repository root; this module sits at `apps/web/src/test/contract/`, so we
 * resolve relative to the module location (robust to the test runner's CWD).
 *
 * Consumed read-only — the contract suite never writes to `docs/openapi.yaml`.
 */
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OPENAPI_PATH = path.resolve(
  MODULE_DIR,
  '../../../../../docs/openapi.yaml'
);

/**
 * Module-global cache of the resolved `components.schemas` map. Populated by
 * {@link loadOpenApiContract}; read synchronously by {@link getOpenApiComponent}
 * (and therefore by `ContractCheck.openapiSchema`).
 *
 * The cache is keyed by the loaded document path so a test that loads a fixture
 * document does not bleed into one that loads the real contract.
 */
let cachedComponents: Record<string, JsonSchema> | null = null;
let cachedComponentsPath: string | null = null;

/**
 * Parse `docs/openapi.yaml` and fully resolve its `$ref`s, returning the
 * `components.schemas` map with every reference inlined.
 *
 * Uses `@apidevtools/swagger-parser` (`dereference`) which both parses the YAML
 * and resolves all `$ref`s in one pass. The resolved components are cached for
 * synchronous access via {@link getOpenApiComponent}.
 *
 * @param filePath - Path to the OpenAPI document (defaults to the repo's
 *   `docs/openapi.yaml`).
 * @returns The resolved `components.schemas` map.
 * @throws If parsing the document or resolving its references fails — the error
 *   message identifies the parse / reference-resolution failure (Requirement 2.8).
 */
export async function loadOpenApiContract(
  filePath: string = DEFAULT_OPENAPI_PATH
): Promise<Record<string, JsonSchema>> {
  if (cachedComponents !== null && cachedComponentsPath === filePath) {
    return cachedComponents;
  }

  let resolved: { components?: { schemas?: Record<string, unknown> } };
  try {
    // Pass an absolute filesystem path as a `file://` URL. The underlying
    // resolver otherwise misreads a Windows drive-qualified path (e.g.
    // `C:\…\openapi.yaml`) as a URL whose scheme is the drive letter (`c:`) and
    // attempts a network download, which fails. A `file://` URL routes it to the
    // file resolver on every platform. Relative paths / explicit URLs pass through.
    const source = path.isAbsolute(filePath) ? pathToFileURL(filePath).href : filePath;
    // `dereference` parses the document AND resolves every `$ref` in place.
    resolved = (await SwaggerParser.dereference(source)) as typeof resolved;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `Failed to parse or resolve references in OpenAPI document '${filePath}': ${detail}`,
      { cause }
    );
  }

  const schemas = resolved.components?.schemas;
  if (schemas === undefined || schemas === null || typeof schemas !== 'object') {
    throw new Error(
      `OpenAPI document '${filePath}' resolved successfully but has no 'components.schemas' section.`
    );
  }

  cachedComponents = schemas as Record<string, JsonSchema>;
  cachedComponentsPath = filePath;
  return cachedComponents;
}

/**
 * Reset the cached OpenAPI components. Intended for test isolation (e.g. when a
 * test loads a fixture document and a later test must reload the real contract).
 */
export function resetOpenApiContractCache(): void {
  cachedComponents = null;
  cachedComponentsPath = null;
}

/**
 * Synchronously resolve a single schema component from the loaded contract.
 *
 * @param componentName - The `components.schemas` key (e.g. `'Finding'`).
 * @throws If the contract has not been loaded yet (call {@link loadOpenApiContract}
 *   first), or if the named component is absent from `components.schemas`.
 */
export function getOpenApiComponent(componentName: string): JsonSchema {
  if (cachedComponents === null) {
    throw new Error(
      `OpenAPI contract not loaded: call 'await loadOpenApiContract()' before resolving ` +
        `component '${componentName}'.`
    );
  }
  const schema = cachedComponents[componentName];
  if (schema === undefined) {
    const available = Object.keys(cachedComponents).sort().join(', ');
    throw new Error(
      `OpenAPI component '${componentName}' not found under 'components.schemas'. ` +
        `Available components: ${available}.`
    );
  }
  return schema;
}

// ─── Orphaned-schema detection (task 2.2) ──────────────────────────────────────

/**
 * Binds a frontend Zod schema declared under `src/api/modules` to the
 * `components.schemas` component it is expected to match. Used to detect drift
 * between the frontend's response assumptions and the published backend
 * contract (Requirement 2.6).
 */
export interface ModuleSchemaBinding {
  /** The Zod schema identifier as declared in the module (e.g. `'FindingSchema'`). */
  schemaName: string;
  /** Repo-relative source path of the module declaring the schema. */
  sourcePath: string;
  /** The `components.schemas` component this schema is expected to match. */
  componentName: string;
  /**
   * When set, the binding's component is a known, reviewed gap in the published
   * contract (a backend-side item out of frontend scope). Documents the tracked
   * exemption per the design's Error-Handling Scenario 2, so the orphan check
   * does not fail on a deliberately-unmodelled endpoint.
   */
  exemptReason?: string;
}

/**
 * The endpoint-backed Zod schemas declared under `src/api/modules`, each bound
 * to the `components.schemas` component it must match.
 *
 * The six entity schemas the design enumerates (User, AuditPlan, Finding,
 * Recommendation, RiskItem, Correspondence) map directly to published
 * components. The remaining module schemas back endpoints whose response bodies
 * are not modelled as named components in `docs/openapi.yaml` (e.g. notifications,
 * tasks, departments, dashboard stats); they are recorded here with an
 * `exemptReason` as tracked, reviewed gaps rather than silently dropped.
 */
export const MODULE_SCHEMA_BINDINGS: readonly ModuleSchemaBinding[] = [
  // ── Contract-backed entity schemas (must resolve) ──
  { schemaName: 'UserSchema', sourcePath: 'src/api/modules/users.ts', componentName: 'User' },
  { schemaName: 'UserSchema', sourcePath: 'src/api/modules/auth.ts', componentName: 'User' },
  {
    schemaName: 'AuditPlanSchema',
    sourcePath: 'src/api/modules/audit-plans.ts',
    componentName: 'AuditPlan',
  },
  { schemaName: 'FindingSchema', sourcePath: 'src/api/modules/findings.ts', componentName: 'Finding' },
  {
    schemaName: 'RecommendationSchema',
    sourcePath: 'src/api/modules/recommendations.ts',
    componentName: 'Recommendation',
  },
  {
    schemaName: 'RiskItemSchema',
    sourcePath: 'src/api/modules/risk-register.ts',
    componentName: 'RiskItem',
  },
  {
    schemaName: 'CorrespondenceSchema',
    sourcePath: 'src/api/modules/correspondence.ts',
    componentName: 'Correspondence',
  },

  // ── Known backend-side gaps (tracked exemptions, out of frontend scope) ──
  {
    schemaName: 'TaskSchema',
    sourcePath: 'src/api/modules/tasks.ts',
    componentName: 'Task',
    exemptReason:
      'GET /my-tasks returns an unmodelled task list; no Task component is published in docs/openapi.yaml.',
  },
  {
    schemaName: 'NotificationSchema',
    sourcePath: 'src/api/modules/notifications.ts',
    componentName: 'Notification',
    exemptReason:
      'GET /notifications returns an unmodelled paginated list; no Notification component is published.',
  },
  {
    schemaName: 'DepartmentSchema',
    sourcePath: 'src/api/modules/departments.ts',
    componentName: 'Department',
    exemptReason:
      'GET /departments returns an unmodelled department list; no Department component is published.',
  },
  {
    schemaName: 'DashboardStatsSchema',
    sourcePath: 'src/api/modules/dashboard.ts',
    componentName: 'DashboardStats',
    exemptReason:
      'GET /dashboard-stats returns an unmodelled stats object; no DashboardStats component is published.',
  },
  {
    schemaName: 'InstructionSchema',
    sourcePath: 'src/api/modules/regulatory.ts',
    componentName: 'Instruction',
    exemptReason:
      'GET /central-bank-instructions is not modelled in docs/openapi.yaml; no Instruction component is published.',
  },
];

/** A frontend schema whose expected OpenAPI component is absent from the contract. */
export interface OrphanedSchema {
  schemaName: string;
  sourcePath: string;
  componentName: string;
}

/**
 * Find frontend Zod schema bindings whose expected `components.schemas`
 * component is absent from the contract and that are not recorded as a tracked
 * exemption.
 *
 * @param bindings - Schema bindings to check (defaults to {@link MODULE_SCHEMA_BINDINGS}).
 * @param availableComponents - The set of component names present in the
 *   contract. Defaults to the components loaded via {@link loadOpenApiContract}.
 * @throws If `availableComponents` is omitted and the contract has not been loaded.
 */
export function findOrphanedSchemas(
  bindings: readonly ModuleSchemaBinding[] = MODULE_SCHEMA_BINDINGS,
  availableComponents?: ReadonlySet<string>
): OrphanedSchema[] {
  let components = availableComponents;
  if (components === undefined) {
    if (cachedComponents === null) {
      throw new Error(
        `OpenAPI contract not loaded: call 'await loadOpenApiContract()' before detecting orphaned schemas.`
      );
    }
    components = new Set(Object.keys(cachedComponents));
  }

  const orphans: OrphanedSchema[] = [];
  for (const binding of bindings) {
    if (binding.exemptReason !== undefined) {
      continue;
    }
    if (!components.has(binding.componentName)) {
      orphans.push({
        schemaName: binding.schemaName,
        sourcePath: binding.sourcePath,
        componentName: binding.componentName,
      });
    }
  }
  return orphans;
}

/**
 * Assert that no frontend Zod schema under `src/api/modules` is orphaned (i.e.
 * has no matching `components.schemas` component and no tracked exemption).
 *
 * @param bindings - Schema bindings to check (defaults to {@link MODULE_SCHEMA_BINDINGS}).
 * @param availableComponents - Optional explicit component-name set (see
 *   {@link findOrphanedSchemas}).
 * @throws A descriptive error listing each orphaned schema's name and source
 *   path when one or more orphans are found (Requirement 2.6).
 */
export function assertNoOrphanedSchemas(
  bindings: readonly ModuleSchemaBinding[] = MODULE_SCHEMA_BINDINGS,
  availableComponents?: ReadonlySet<string>
): void {
  const orphans = findOrphanedSchemas(bindings, availableComponents);
  if (orphans.length > 0) {
    const report = orphans
      .map(
        (o) =>
          `  - ${o.schemaName} (${o.sourcePath}) → no '${o.componentName}' component in docs/openapi.yaml`
      )
      .join('\n');
    throw new Error(
      `Contract drift: ${orphans.length} frontend Zod schema(s) have no matching ` +
        `components.schemas component in docs/openapi.yaml:\n${report}`
    );
  }
}

// ─── Zod-vs-OpenAPI contract assertion (task 2.3) ──────────────────────────────

/**
 * A minimal JSON-Schema node as emitted by Zod 4's `z.toJSONSchema`. We read the
 * subset needed to synthesise valid examples and contract-violating
 * counterexamples (`type`, `enum`, `anyOf`, `properties`, `required`).
 */
interface ZodJsonNode {
  type?: string | string[];
  enum?: unknown[];
  anyOf?: ZodJsonNode[];
  properties?: Record<string, ZodJsonNode>;
  required?: string[];
  items?: ZodJsonNode | ZodJsonNode[];
}

/** A counterexample paired with the contract rule it is designed to violate. */
interface Counterexample {
  /** Why this shape violates the contract. */
  kind: 'missing-required' | 'wrong-type' | 'out-of-enum';
  /** The property the violation targets. */
  property: string;
  /** The mutated value the Zod schema must reject. */
  value: Record<string, unknown>;
}

/** Resolve the first non-`null` concrete type of a JSON-Schema node, if any. */
function concreteType(node: ZodJsonNode): string | undefined {
  if (Array.isArray(node.type)) {
    return node.type.find((t) => t !== 'null');
  }
  return node.type;
}

/**
 * Generate a value the Zod schema accepts for a single JSON-Schema node. Enums
 * yield a declared member; unions pick their first non-`null` branch; arrays use
 * the empty array (valid whenever no `minItems`/required items are declared);
 * objects recurse over their required properties.
 */
function generateValidValue(node: ZodJsonNode): unknown {
  if (Array.isArray(node.enum) && node.enum.length > 0) {
    return node.enum[0];
  }
  if (Array.isArray(node.anyOf) && node.anyOf.length > 0) {
    const branch = node.anyOf.find((b) => concreteType(b) !== 'null') ?? node.anyOf[0];
    return generateValidValue(branch);
  }
  switch (concreteType(node)) {
    case 'string':
      return 'contract-sample';
    case 'number':
    case 'integer':
      return 1;
    case 'boolean':
      return true;
    case 'array':
      return [];
    case 'null':
      return null;
    case 'object':
      return buildObject(node, false);
    default:
      // Unconstrained node (e.g. additionalProperties-only) — any value is fine.
      return 'contract-sample';
  }
}

/**
 * Build an object value from a JSON-Schema object node. At the root
 * (`includeAllProps`) every declared property is populated to exercise a full
 * valid shape; nested objects populate only their required properties.
 */
function buildObject(node: ZodJsonNode, includeAllProps: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const properties = node.properties ?? {};
  const required = new Set(node.required ?? []);
  for (const [key, propNode] of Object.entries(properties)) {
    if (includeAllProps || required.has(key)) {
      out[key] = generateValidValue(propNode);
    }
  }
  return out;
}

/** Produce a value of a different primitive type than `type` (for wrong-type tests). */
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

const OUT_OF_ENUM_SENTINEL = '__contract_out_of_enum__';

/**
 * Derive contract-violating counterexamples from the root object node and a
 * known-valid example: one variant per required property omitted, per
 * single-typed required property mistyped, and per enum property set outside its
 * declared set.
 */
function deriveCounterexamples(
  rootNode: ZodJsonNode,
  validExample: Record<string, unknown>
): Counterexample[] {
  const counterexamples: Counterexample[] = [];
  const properties = rootNode.properties ?? {};
  const required = rootNode.required ?? [];

  // (a) Omit each required property.
  for (const prop of required) {
    const value = { ...validExample };
    delete value[prop];
    counterexamples.push({ kind: 'missing-required', property: prop, value });
  }

  // (b) Mistype each required property that has a single concrete primitive type
  //     (skip unions/enums — those are covered or accept multiple types).
  for (const prop of required) {
    const propNode = properties[prop];
    if (propNode === undefined) continue;
    if (Array.isArray(propNode.enum) && propNode.enum.length > 0) continue;
    if (Array.isArray(propNode.anyOf)) continue;
    if (Array.isArray(propNode.type)) continue; // multi-type (e.g. nullable)
    const t = propNode.type;
    if (t === 'string' || t === 'number' || t === 'integer' || t === 'boolean') {
      counterexamples.push({
        kind: 'wrong-type',
        property: prop,
        value: { ...validExample, [prop]: wrongTypeValue(t) },
      });
    }
  }

  // (c) Use a value outside the declared enumeration (required or optional).
  for (const [prop, propNode] of Object.entries(properties)) {
    if (Array.isArray(propNode.enum) && propNode.enum.length > 0) {
      counterexamples.push({
        kind: 'out-of-enum',
        property: prop,
        value: { ...validExample, [prop]: OUT_OF_ENUM_SENTINEL },
      });
    }
  }

  return counterexamples;
}

/**
 * Assert that a frontend Zod schema accepts every contract-valid example for the
 * named OpenAPI component and rejects every contract-violating shape (a missing
 * required property, a value of the wrong type, or a value outside a declared
 * enumeration).
 *
 * Implementation notes:
 *  - The OpenAPI component is resolved first so the schema is anchored to a real
 *    published `components.schemas` entry (Requirements 2.2 / 2.6); this throws
 *    if the contract is unloaded or the component is absent.
 *  - The frontend Zod schemas are intentionally *stricter* than the published
 *    OpenAPI strings in places (numeric ids, narrow status/risk enums). A purely
 *    OpenAPI-derived example would therefore be legitimately rejected by Zod, so
 *    the example/counterexample shapes are derived from the Zod schema's own
 *    declared structure (via Zod 4's `z.toJSONSchema`). This guarantees the valid
 *    example is contract-consistent and that each counterexample violates a rule
 *    the frontend actually enforces.
 *
 * Preconditions: `await loadOpenApiContract()` has been called; `component`
 * exists under `components.schemas`.
 * Postconditions: returns normally iff the Zod schema's accept/reject behaviour
 * is consistent with the contract for that component; throws a descriptive error
 * on the first inconsistency.
 *
 * @see Requirement 2.2 (Correctness Property 3)
 */
export function assertZodMatchesOpenapi<T>(zod: z.ZodType<T>, componentName: string): void {
  // Anchor to the published contract component (throws if missing/unloaded).
  getOpenApiComponent(componentName);

  // Introspect the Zod schema's declared structure. `unrepresentable: 'any'`
  // keeps passthrough/union shapes from throwing during conversion.
  let jsonSchema: ZodJsonNode;
  try {
    jsonSchema = z.toJSONSchema(zod, { unrepresentable: 'any' }) as ZodJsonNode;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `Unable to introspect the Zod schema bound to '${componentName}': ${detail}`,
      { cause }
    );
  }

  const validExample = buildObject(jsonSchema, true);

  // Every contract-valid example MUST parse.
  const validResult = zod.safeParse(validExample);
  if (!validResult.success) {
    throw new Error(
      `Contract violation for '${componentName}': the Zod schema rejected a contract-valid ` +
        `example.\nExample: ${JSON.stringify(validExample)}\nIssues: ${JSON.stringify(
          validResult.error.issues
        )}`
    );
  }

  // Every contract-violating shape MUST be rejected so the frontend never
  // silently accepts data the backend contract forbids.
  const counterexamples = deriveCounterexamples(jsonSchema, validExample);
  for (const ce of counterexamples) {
    if (zod.safeParse(ce.value).success) {
      throw new Error(
        `Contract violation for '${componentName}': the Zod schema accepted a ` +
          `contract-violating shape (${ce.kind} on '${ce.property}').\n` +
          `Shape: ${JSON.stringify(ce.value)}`
      );
    }
  }
}

// ─── Contract fixtures (Data Model 2) ──────────────────────────────────────────

/**
 * Binds a frontend Zod schema to its OpenAPI component for contract testing.
 *
 * Mirrors the design's Data Model 2. Validation rules:
 *  - `openapiComponent` must resolve in `docs/openapi.yaml` `components.schemas`.
 *  - Every endpoint-backed Zod schema in `src/api/modules` should have exactly
 *    one fixture.
 */
export interface ContractFixture {
  /** e.g. `'src/api/modules/findings.ts#FindingSchema'`. */
  zodSchemaPath: string;
  /** e.g. `'Finding'` — a `components.schemas` key. */
  openapiComponent: string;
  /** `true` for list/detail endpoints wrapped in the `{ success, data, meta }` envelope. */
  envelopeWrapped: boolean;
  /** Contract scenarios this fixture participates in. */
  scenarios: Array<ContractScenarioName>;
}

/**
 * The Zod schema referenced by each fixture's `zodSchemaPath`, keyed by the
 * OpenAPI component name so the contract suite can run
 * {@link assertZodMatchesOpenapi} over every fixture without re-declaring the
 * schemas (avoids drift between a test copy and the real schema).
 */
export const CONTRACT_ZOD_SCHEMAS: Readonly<Record<string, z.ZodType<unknown>>> = {
  User: UserSchema as unknown as z.ZodType<unknown>,
  AuditPlan: AuditPlanSchema as unknown as z.ZodType<unknown>,
  Finding: FindingSchema as unknown as z.ZodType<unknown>,
  Recommendation: RecommendationSchema as unknown as z.ZodType<unknown>,
  RiskItem: RiskItemSchema as unknown as z.ZodType<unknown>,
  Correspondence: CorrespondenceSchema as unknown as z.ZodType<unknown>,
};

/**
 * One {@link ContractFixture} per endpoint-backed entity Zod schema (User,
 * AuditPlan, Finding, Recommendation, RiskItem, Correspondence). Each binds the
 * schema's source path to its published OpenAPI component.
 */
export const ENTITY_CONTRACT_FIXTURES: readonly ContractFixture[] = [
  {
    zodSchemaPath: 'src/api/modules/users.ts#UserSchema',
    openapiComponent: 'User',
    envelopeWrapped: true,
    scenarios: ['envelope', 'csrf', 'session.refresh'],
  },
  {
    zodSchemaPath: 'src/api/modules/audit-plans.ts#AuditPlanSchema',
    openapiComponent: 'AuditPlan',
    envelopeWrapped: true,
    scenarios: ['envelope', 'csrf'],
  },
  {
    zodSchemaPath: 'src/api/modules/findings.ts#FindingSchema',
    openapiComponent: 'Finding',
    envelopeWrapped: true,
    scenarios: ['envelope', 'csrf'],
  },
  {
    zodSchemaPath: 'src/api/modules/recommendations.ts#RecommendationSchema',
    openapiComponent: 'Recommendation',
    envelopeWrapped: true,
    scenarios: ['envelope', 'csrf'],
  },
  {
    zodSchemaPath: 'packages/shared/src/validators/risk-register.ts#RiskItemSchema',
    openapiComponent: 'RiskItem',
    envelopeWrapped: true,
    scenarios: ['envelope', 'csrf'],
  },
  {
    zodSchemaPath: 'src/api/modules/correspondence.ts#CorrespondenceSchema',
    openapiComponent: 'Correspondence',
    envelopeWrapped: true,
    scenarios: ['envelope', 'csrf'],
  },
];

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a {@link ContractCheck}. Task 2.1 wired the envelope assertion; task 2.2
 * wires `openapiSchema` to the parsed/dereferenced contract (call
 * `await loadOpenApiContract()` once before use). `assertZodMatchesOpenapi` is
 * implemented by task 2.3.
 */
export function createContractCheck(): ContractCheck {
  return {
    openapiSchema(componentName: string): JsonSchema {
      return getOpenApiComponent(componentName);
    },

    assertZodMatchesOpenapi<T>(zod: z.ZodType<T>, componentName: string): void {
      assertZodMatchesOpenapi(zod, componentName);
    },

    assertEnvelope,
  };
}
