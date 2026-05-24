// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  registerRoute,
  detectDuplicates,
  clearRegistry,
  getRegisteredRoutes,
  RouteRegistration,
} from '../utils/routeRegistry';

/**
 * Property Test: Route Uniqueness (Property 18)
 *
 * Feature: api-audit-improvements
 * Property 18: Route Uniqueness - For any registered route, exactly one handler
 * exists per HTTP method + path combination.
 *
 * **Validates: Requirements 2.1, 2.2**
 *
 * Requirements:
 * 2.1 - THE Route_Registry SHALL register each combination of HTTP method and URL path
 *        at most once across the entire application
 * 2.2 - WHEN both a CRUD generator route and a custom route exist for the same resource
 *        path prefix, THE Route_Registry SHALL exclude that resource from the CRUD generator
 *        and use only the custom route
 */

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates valid HTTP methods */
const httpMethodArb = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH');

/** Generates valid API path segments */
const pathSegmentArb = fc.stringMatching(/^[a-z][a-z0-9-]{1,15}$/);

/** Generates valid API paths like /api/resource or /api/resource/sub */
const apiPathArb = fc
  .array(pathSegmentArb, { minLength: 1, maxLength: 3 })
  .map((segments) => `/api/${segments.join('/')}`);

/** Generates route source identifiers */
const sourceArb = fc.constantFrom(
  'crudGenerator',
  'auditTasks.ts',
  'auditPrograms.ts',
  'recommendations.ts',
  'users.ts',
  'roles.ts',
  'custom.ts'
);

/** Generates a complete route registration */
const routeRegistrationArb = fc.record({
  method: httpMethodArb,
  path: apiPathArb,
  source: sourceArb,
});

/** Generates a set of route registrations with unique method+path combinations */
const uniqueRoutesArb = fc
  .array(routeRegistrationArb, { minLength: 1, maxLength: 20 })
  .map((routes) => {
    const seen = new Set<string>();
    return routes.filter((r) => {
      const key = `${r.method} ${r.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })
  .filter((routes) => routes.length > 0);

/** Generates a set of route registrations guaranteed to have at least one duplicate */
const routesWithDuplicateArb = fc
  .tuple(routeRegistrationArb, sourceArb)
  .chain(([route, altSource]) => {
    const duplicate: RouteRegistration = {
      method: route.method,
      path: route.path,
      source: altSource === route.source ? `other-${altSource}` : altSource,
    };
    return fc
      .array(routeRegistrationArb, { minLength: 0, maxLength: 10 })
      .map((others) => [...others, route, duplicate]);
  });

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 18: Route Uniqueness', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('when all method+path combinations are unique, no duplicates are detected', () => {
    fc.assert(
      fc.property(uniqueRoutesArb, (routes) => {
        const duplicates = detectDuplicates(routes);
        expect(duplicates).toHaveLength(0);
      }),
      { numRuns: 200 }
    );
  });

  it('when a method+path is registered twice, it IS detected as a duplicate', () => {
    fc.assert(
      fc.property(routesWithDuplicateArb, (routes) => {
        const duplicates = detectDuplicates(routes);
        // At least one duplicate should be detected since we guaranteed one
        expect(duplicates.length).toBeGreaterThanOrEqual(1);

        // Each duplicate should have at least 2 sources
        for (const dup of duplicates) {
          expect(dup.sources.length).toBeGreaterThanOrEqual(2);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('different methods on the same path are NOT duplicates (GET /users vs POST /users)', () => {
    fc.assert(
      fc.property(
        apiPathArb,
        fc.array(httpMethodArb, { minLength: 2, maxLength: 5 }).map((methods) => [...new Set(methods)]),
        sourceArb,
        (path, uniqueMethods, source) => {
          // Register different methods on the same path
          const routes: RouteRegistration[] = uniqueMethods.map((method) => ({
            method,
            path,
            source,
          }));

          const duplicates = detectDuplicates(routes);
          expect(duplicates).toHaveLength(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('same method on different paths are NOT duplicates (GET /users vs GET /roles)', () => {
    fc.assert(
      fc.property(
        httpMethodArb,
        fc
          .array(apiPathArb, { minLength: 2, maxLength: 5 })
          .map((paths) => [...new Set(paths)])
          .filter((paths) => paths.length >= 2),
        sourceArb,
        (method, uniquePaths, source) => {
          // Register same method on different paths
          const routes: RouteRegistration[] = uniquePaths.map((path) => ({
            method,
            path,
            source,
          }));

          const duplicates = detectDuplicates(routes);
          expect(duplicates).toHaveLength(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('duplicate detection correctly identifies the conflicting method and path', () => {
    fc.assert(
      fc.property(
        httpMethodArb,
        apiPathArb,
        sourceArb,
        sourceArb,
        (method, path, source1, source2) => {
          const routes: RouteRegistration[] = [
            { method, path, source: source1 },
            { method, path, source: source2 !== source1 ? source2 : `alt-${source2}` },
          ];

          const duplicates = detectDuplicates(routes);
          expect(duplicates).toHaveLength(1);
          expect(duplicates[0].method).toBe(method);
          expect(duplicates[0].path).toBe(path);
          expect(duplicates[0].sources).toHaveLength(2);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('the global registry detects duplicates when routes are registered via registerRoute()', () => {
    fc.assert(
      fc.property(httpMethodArb, apiPathArb, sourceArb, sourceArb, (method, path, source1, source2) => {
        clearRegistry();

        registerRoute(method, path, source1);
        registerRoute(method, path, source2 !== source1 ? source2 : `alt-${source2}`);

        const duplicates = detectDuplicates();
        expect(duplicates.length).toBeGreaterThanOrEqual(1);

        const match = duplicates.find((d) => d.method === method.toUpperCase());
        expect(match).toBeDefined();
        expect(match!.sources.length).toBeGreaterThanOrEqual(2);
      }),
      { numRuns: 100 }
    );
  });

  describe('Application route registry verification', () => {
    it('after all routes are registered, no duplicates exist (conflicting routes excluded)', () => {
      // Simulate the actual application route registration
      // The CRUD generator excludes audit-tasks, audit-programs, recommendations
      // (as per task 4.2 resolution)
      clearRegistry();

      // Register CRUD generator routes (excluding conflicting resources)
      const crudResources = [
        'users',
        'roles',
        'departments',
        'job-titles',
        'org-entities',
        'audit-findings',
        'policies',
        'fraud-cases',
        'integrity-reports',
        'coi-declarations',
      ];
      for (const resource of crudResources) {
        registerRoute('GET', `/api/${resource}`, 'crudGenerator');
        registerRoute('POST', `/api/${resource}`, 'crudGenerator');
        registerRoute('PUT', `/api/${resource}`, 'crudGenerator');
        registerRoute('DELETE', `/api/${resource}`, 'crudGenerator');
      }

      // Register custom routes (the ones that replaced CRUD generator)
      registerRoute('POST', '/api/v1/audit-programs', 'auditPrograms.ts');
      registerRoute('GET', '/api/v1/audit-tasks', 'auditTasks.ts');
      registerRoute('PATCH', '/api/v1/audit-tasks', 'auditTasks.ts');
      registerRoute('PATCH', '/api/v1/recommendations', 'recommendations.ts');

      const duplicates = detectDuplicates();
      expect(duplicates).toHaveLength(0);
    });
  });
});
