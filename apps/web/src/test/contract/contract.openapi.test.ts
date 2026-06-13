/**
 * @vitest-environment node
 *
 * Tests for task 2.2: OpenAPI parsing / reference resolution and orphaned-schema
 * detection.
 *
 * Covers Requirements 2.6 (orphaned schema name + source path reported) and 2.8
 * (parse / reference-resolution failure surfaced).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_OPENAPI_PATH,
  loadOpenApiContract,
  resetOpenApiContractCache,
  getOpenApiComponent,
  createContractCheck,
  findOrphanedSchemas,
  assertNoOrphanedSchemas,
  MODULE_SCHEMA_BINDINGS,
  type ModuleSchemaBinding,
} from './contract';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

describe('loadOpenApiContract / getOpenApiComponent (task 2.2)', () => {
  beforeAll(async () => {
    resetOpenApiContractCache();
    await loadOpenApiContract();
  });

  afterAll(() => {
    resetOpenApiContractCache();
  });

  it('resolves the real docs/openapi.yaml and returns reusable components', async () => {
    const components = await loadOpenApiContract();
    // Spot-check the entity components the design enumerates.
    expect(components).toHaveProperty('Finding');
    expect(components).toHaveProperty('User');
    expect(components).toHaveProperty('AuditPlan');
    expect(components).toHaveProperty('Correspondence');
  });

  it('resolves a single component synchronously via getOpenApiComponent', () => {
    const finding = getOpenApiComponent('Finding');
    expect(finding.type).toBe('object');
    expect(finding.properties).toBeDefined();
    expect(finding.properties).toHaveProperty('risk_level');
  });

  it('resolves $refs so referencing schemas inline the referenced shape', () => {
    // PaginatedResponse + the entity components prove components.schemas is present;
    // a resolved (dereferenced) doc has no leftover `$ref` keys in a component.
    const user = getOpenApiComponent('User');
    expect(JSON.stringify(user)).not.toContain('$ref');
  });

  it('exposes the resolver through ContractCheck.openapiSchema', () => {
    const check = createContractCheck();
    const recommendation = check.openapiSchema('Recommendation');
    expect(recommendation.type).toBe('object');
    expect(recommendation.properties).toHaveProperty('finding_id');
  });

  it('throws a descriptive error for an unknown component', () => {
    expect(() => getOpenApiComponent('NoSuchComponent')).toThrowError(
      /NoSuchComponent.*not found.*components\.schemas/s
    );
  });

  it('uses a module-resolved default path pointing at the repo contract', () => {
    expect(DEFAULT_OPENAPI_PATH.replace(/\\/g, '/')).toMatch(/\/docs\/openapi\.yaml$/);
  });
});

describe('parse / reference-resolution failure handling (Requirement 2.8)', () => {
  afterAll(() => {
    resetOpenApiContractCache();
  });

  it('surfaces an error identifying the failure when the document cannot be parsed', async () => {
    const missing = path.resolve(MODULE_DIR, 'definitely-not-a-real-openapi.yaml');
    await expect(loadOpenApiContract(missing)).rejects.toThrow(
      /Failed to parse or resolve references in OpenAPI document/
    );
  });
});

describe('orphaned-schema detection (Requirement 2.6)', () => {
  const available = new Set([
    'User',
    'AuditPlan',
    'Finding',
    'Recommendation',
    'RiskItem',
    'Correspondence',
  ]);

  it('reports the orphaned schema name and source path for a missing component', () => {
    const bindings: ModuleSchemaBinding[] = [
      { schemaName: 'FindingSchema', sourcePath: 'src/api/modules/findings.ts', componentName: 'Finding' },
      { schemaName: 'WidgetSchema', sourcePath: 'src/api/modules/widgets.ts', componentName: 'Widget' },
    ];
    const orphans = findOrphanedSchemas(bindings, available);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]).toEqual({
      schemaName: 'WidgetSchema',
      sourcePath: 'src/api/modules/widgets.ts',
      componentName: 'Widget',
    });
  });

  it('assertNoOrphanedSchemas throws listing the orphan name and path', () => {
    const bindings: ModuleSchemaBinding[] = [
      { schemaName: 'WidgetSchema', sourcePath: 'src/api/modules/widgets.ts', componentName: 'Widget' },
    ];
    expect(() => assertNoOrphanedSchemas(bindings, available)).toThrowError(
      /WidgetSchema.*src\/api\/modules\/widgets\.ts.*Widget/s
    );
  });

  it('does not flag schemas recorded as tracked exemptions', () => {
    const bindings: ModuleSchemaBinding[] = [
      {
        schemaName: 'TaskSchema',
        sourcePath: 'src/api/modules/tasks.ts',
        componentName: 'Task',
        exemptReason: 'known backend-side gap',
      },
    ];
    expect(findOrphanedSchemas(bindings, available)).toHaveLength(0);
  });

  it('considers a contract-backed schema non-orphaned', () => {
    const bindings: ModuleSchemaBinding[] = [
      { schemaName: 'FindingSchema', sourcePath: 'src/api/modules/findings.ts', componentName: 'Finding' },
    ];
    expect(findOrphanedSchemas(bindings, available)).toHaveLength(0);
  });
});

describe('default module-schema registry against the real contract', () => {
  beforeAll(async () => {
    resetOpenApiContractCache();
    await loadOpenApiContract();
  });

  afterAll(() => {
    resetOpenApiContractCache();
  });

  it('has no un-exempted orphans (known gaps are documented exemptions)', () => {
    expect(() => assertNoOrphanedSchemas()).not.toThrow();
  });

  it('every non-exempt binding resolves to a real components.schemas component', () => {
    for (const binding of MODULE_SCHEMA_BINDINGS) {
      if (binding.exemptReason !== undefined) continue;
      expect(() => getOpenApiComponent(binding.componentName)).not.toThrow();
    }
  });

  it('every exempt binding documents a reason', () => {
    for (const binding of MODULE_SCHEMA_BINDINGS) {
      if (binding.exemptReason !== undefined) {
        expect(binding.exemptReason.length).toBeGreaterThan(0);
      }
    }
  });
});
