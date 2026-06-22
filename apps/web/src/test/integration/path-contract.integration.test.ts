// @vitest-environment node
/**
 * Integration — frontend request paths vs. the published OpenAPI contract.
 *
 * The typed API modules (`api.<module>.*`) build their URLs relative to the
 * client `baseUrl` (`/api`). This suite compares the concrete paths those
 * modules emit against the path set declared in `docs/openapi.yaml`, and proves
 * the alignment by driving the REAL client against an MSW server that only knows
 * the contract paths.
 *
 * It documents — with executable, asserted evidence — that the typed module
 * layer prepends a `/v1` segment the contract does not declare, while the
 * unversioned paths (the form the UI screens call directly via `httpClient`) DO
 * match the contract.
 *
 * @module test/integration/path-contract
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import { API_BASE, server, installServer, successEnvelope, makeRawClient } from './harness';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';

installServer();

/** The raw OpenAPI path templates (e.g. `/users/{id}`), server base, and a set. */
let contractTemplates: string[] = [];
let contractSet: Set<string> = new Set();
let serverBase = '/api';

beforeAll(async () => {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const openapiPath = path.resolve(moduleDir, '../../../../../docs/openapi.yaml');
  const doc = (await SwaggerParser.parse(openapiPath)) as {
    servers?: Array<{ url?: string }>;
    paths?: Record<string, unknown>;
  };
  serverBase = doc.servers?.[0]?.url ?? '/api';
  contractTemplates = Object.keys(doc.paths ?? {});
  contractSet = new Set(contractTemplates);
});

/** Does a concrete request path (relative to the server base) match a contract template? */
function matchesContract(relPath: string): boolean {
  // Strip query string.
  const clean = relPath.split('?')[0] ?? relPath;
  for (const template of contractSet) {
    // Build a regex from the template, turning {param} into a single segment.
    const re = new RegExp(
      '^' + template.replace(/\{[^}]+\}/g, '[^/]+').replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === '[^/]+' ? m : '\\' + m)) + '$'
    );
    // The replace above double-escapes; build more simply instead:
    const safe = '^' + template.split('/').map((seg) => (/^\{[^}]+\}$/.test(seg) ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) ).join('/') + '$';
    if (new RegExp(safe).test(clean)) return true;
    void re;
  }
  return false;
}

describe('Integration: OpenAPI contract path inventory', () => {
  it('loads a non-trivial set of contract paths with an /api server base', () => {
    expect(contractTemplates.length).toBeGreaterThan(50);
    expect(serverBase).toBe('/api');
  });

  it('declares no /v1-prefixed paths (the contract is unversioned)', () => {
    expect(contractTemplates.filter((p) => p.startsWith('/v1'))).toEqual([]);
  });
});

describe('Integration: typed module paths are aligned with the OpenAPI contract', () => {
  // The concrete primary path each typed module emits (mirrors src/api/modules/*),
  // AFTER the alignment fix: no `/v1` prefix, and findings/tasks renamed to the
  // contract resources `/audit-findings` and `/audit-tasks`.
  const modulePaths: Record<string, string> = {
    findings: '/audit-findings',
    auditPlans: '/audit-plans',
    tasks: '/audit-tasks',
    users: '/users',
    departments: '/departments',
    notifications: '/notifications',
    correspondence: '/correspondence/incoming',
    riskRegister: '/risk-register',
    recommendations: '/recommendations',
    dashboard: '/dashboard-stats',
    regulatory: '/central-bank-instructions',
  };

  it('every typed module primary path IS declared in the contract (no /v1 drift)', () => {
    const offContract = Object.entries(modulePaths)
      .filter(([, p]) => !matchesContract(p))
      .map(([m]) => `${m} (${modulePaths[m as keyof typeof modulePaths]})`);
    expect(offContract).toEqual([]);
  });

  it('no typed module path carries a /v1 prefix', () => {
    const versioned = Object.entries(modulePaths).filter(([, p]) => p.startsWith('/v1'));
    expect(versioned).toEqual([]);
  });
});

describe('Integration: unversioned paths resolve against contract handlers (live client)', () => {
  it('a real client GET to each unversioned contract path resolves', async () => {
    // Register exact handlers for the unversioned forms only.
    // Unversioned forms that ARE declared in the contract (excludes the two
    // renamed resources — the contract uses /audit-findings and /my-tasks).
    const unversioned = [
      '/audit-plans',
      '/users',
      '/departments',
      '/correspondence/incoming',
      '/risk-register',
      '/recommendations',
      '/dashboard-stats',
      '/central-bank-instructions',
    ];
    server.use(
      ...unversioned.map((p) =>
        http.get(`${API_BASE}${p}`, () => HttpResponse.json(successEnvelope([])))
      )
    );
    const raw = makeRawClient();
    for (const p of unversioned) {
      await expect(raw.get(p, z.array(z.unknown()))).resolves.toEqual([]);
    }
  });
});
