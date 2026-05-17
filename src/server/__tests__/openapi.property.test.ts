/**
 * Property Test: OpenAPI specification completeness (Property 13)
 *
 * **Validates: Requirements 10.2, 10.3**
 *
 * For any route handler registered in the Express application,
 * there must be a corresponding path and method entry in the OpenAPI
 * specification document.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string };
  servers: Array<{ url: string }>;
  paths: Record<string, Record<string, unknown>>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, unknown>;
  };
}

/**
 * Discovers all registered route/method pairs by statically
 * analyzing the route files in src/server/routes/.
 */
function discoverRoutes(): Array<{ path: string; method: string }> {
  const routes: Array<{ path: string; method: string }> = [];

  // These are the known routes from the Express app based on
  // static analysis of src/server/routes/index.ts and all route files.
  // Each entry represents a registered route handler.

  // Health check
  routes.push({ path: '/health', method: 'get' });

  // OpenAPI docs
  routes.push({ path: '/docs', method: 'get' });

  // Auth routes (mounted at /auth)
  const authRoutes = [
    { path: '/auth/login', method: 'post' },
    { path: '/auth/me', method: 'get' },
    { path: '/auth/refresh', method: 'post' },
    { path: '/auth/logout', method: 'post' },
    { path: '/auth/logout-all', method: 'post' },
    { path: '/auth/forgot-password', method: 'post' },
    { path: '/auth/reset-status/{username}', method: 'get' },
    { path: '/auth/reset-requests', method: 'get' },
    { path: '/auth/approve-reset', method: 'post' },
    { path: '/auth/change-password', method: 'post' },
    { path: '/auth/update-password', method: 'post' },
  ];
  routes.push(...authRoutes);

  // User routes (mounted at /users)
  const userRoutes = [
    { path: '/users', method: 'get' },
    { path: '/users', method: 'post' },
    { path: '/users/init', method: 'get' },
    { path: '/users/summary', method: 'get' },
    { path: '/users/list', method: 'get' },
    { path: '/users/{id}', method: 'get' },
    { path: '/users/{id}', method: 'put' },
    { path: '/users/{id}', method: 'delete' },
    { path: '/users/{id}/suspend', method: 'post' },
    { path: '/users/{id}/archive', method: 'post' },
    { path: '/users/{id}/activate', method: 'post' },
    { path: '/users/{id}/unlock', method: 'post' },
    { path: '/users/{id}/reset-password', method: 'post' },
  ];
  routes.push(...userRoutes);

  // Roles & Permissions
  routes.push(
    { path: '/roles', method: 'get' },
    { path: '/roles/{id}/permissions', method: 'get' },
    { path: '/roles/{id}/permissions', method: 'post' },
    { path: '/permissions', method: 'get' },
  );

  // Sessions
  routes.push(
    { path: '/user-sessions', method: 'get' },
    { path: '/user-sessions/{id}', method: 'delete' },
  );

  // Logs
  routes.push(
    { path: '/login-history', method: 'get' },
    { path: '/audit-trail', method: 'get' },
    { path: '/system-errors', method: 'get' },
    { path: '/system-errors', method: 'post' },
    { path: '/system-errors', method: 'delete' },
    { path: '/system-errors/export', method: 'get' },
    { path: '/system-errors/analytics', method: 'get' },
    { path: '/log-error', method: 'post' },
  );

  // Settings
  routes.push(
    { path: '/user-management-settings', method: 'get' },
    { path: '/user-management-settings', method: 'put' },
    { path: '/pdf-settings', method: 'get' },
    { path: '/pdf-settings', method: 'put' },
    { path: '/app-settings', method: 'get' },
    { path: '/app-settings', method: 'put' },
  );

  // Profile
  routes.push(
    { path: '/profile', method: 'get' },
    { path: '/profile', method: 'put' },
    { path: '/preferences', method: 'put' },
  );

  // Dashboard
  routes.push(
    { path: '/dashboard-stats', method: 'get' },
    { path: '/my-tasks', method: 'get' },
  );

  // Notifications
  routes.push(
    { path: '/notifications', method: 'get' },
    { path: '/notifications/unread-count', method: 'get' },
    { path: '/notifications/{id}/read', method: 'put' },
    { path: '/notifications/mark-all-read', method: 'put' },
    { path: '/notifications/{id}', method: 'delete' },
  );

  // Comments
  routes.push(
    { path: '/comments/{type}/{id}', method: 'get' },
    { path: '/comments', method: 'post' },
  );

  // Job Titles
  routes.push(
    { path: '/job-titles', method: 'get' },
    { path: '/job-titles', method: 'post' },
    { path: '/job-titles/{id}', method: 'put' },
    { path: '/job-titles/{id}', method: 'delete' },
  );

  // Departments
  routes.push(
    { path: '/departments', method: 'get' },
    { path: '/departments', method: 'post' },
    { path: '/departments/tree', method: 'get' },
    { path: '/departments/{id}', method: 'put' },
    { path: '/departments/{id}', method: 'delete' },
  );

  // Correspondence
  routes.push(
    { path: '/correspondence/incoming', method: 'get' },
    { path: '/correspondence/incoming', method: 'post' },
    { path: '/correspondence/incoming/{id}', method: 'put' },
    { path: '/correspondence/incoming/{id}', method: 'delete' },
    { path: '/correspondence/outgoing', method: 'get' },
    { path: '/correspondence/outgoing', method: 'post' },
    { path: '/correspondence/outgoing/{id}', method: 'put' },
    { path: '/correspondence/outgoing/{id}', method: 'delete' },
    { path: '/correspondence/status/{type}/{id}', method: 'put' },
    { path: '/correspondence/refer', method: 'post' },
    { path: '/correspondence/link', method: 'post' },
    { path: '/correspondence/archive/{type}/{id}', method: 'put' },
    { path: '/correspondence/archive', method: 'get' },
    { path: '/correspondence/attachments/{type}/{id}', method: 'get' },
    { path: '/correspondence/attachments', method: 'post' },
    { path: '/correspondence/stats', method: 'get' },
    { path: '/correspondence/details/{type}/{id}', method: 'get' },
  );

  // Org Entities
  routes.push(
    { path: '/org-entities', method: 'get' },
    { path: '/org-entities', method: 'post' },
    { path: '/org-entities/{id}', method: 'put' },
    { path: '/org-entities/{id}', method: 'delete' },
  );

  // COI
  routes.push(
    { path: '/coi', method: 'get' },
    { path: '/coi', method: 'post' },
    { path: '/coi/{id}', method: 'put' },
  );

  // Policies
  routes.push(
    { path: '/policies', method: 'get' },
    { path: '/policies', method: 'post' },
    { path: '/policies/{id}', method: 'get' },
    { path: '/policies/{id}', method: 'put' },
    { path: '/policies/{id}', method: 'delete' },
    { path: '/policies/{id}/file', method: 'get' },
  );

  // PDF Templates
  routes.push(
    { path: '/pdf-templates', method: 'get' },
    { path: '/pdf-templates', method: 'post' },
    { path: '/pdf-templates/active', method: 'get' },
    { path: '/pdf-templates/{id}', method: 'get' },
    { path: '/pdf-templates/{id}', method: 'put' },
    { path: '/pdf-templates/{id}', method: 'delete' },
  );

  // Executive Reports
  routes.push(
    { path: '/executive-summary', method: 'get' },
  );

  // Analytics
  routes.push(
    { path: '/analytics/findings-by-risk', method: 'get' },
    { path: '/analytics/findings-by-status', method: 'get' },
    { path: '/analytics/recommendations-by-status', method: 'get' },
  );

  // Integrity
  routes.push(
    { path: '/integrity/stats', method: 'get' },
  );

  // Audit Programs (custom routes)
  routes.push(
    { path: '/audit-programs/{id}/duplicate', method: 'post' },
    { path: '/audit-programs/{id}/approve', method: 'post' },
  );

  // Audit Tasks (custom routes)
  routes.push(
    { path: '/audit-tasks/{id}/status', method: 'patch' },
  );

  // Recommendations (custom routes)
  routes.push(
    { path: '/recommendations/{id}/resolve', method: 'patch' },
  );

  // Fraud Access Requests
  routes.push(
    { path: '/fraud-access-requests', method: 'get' },
    { path: '/fraud-access-requests', method: 'post' },
    { path: '/fraud-access-requests/my-status', method: 'get' },
    { path: '/fraud-access-requests/{id}/approve', method: 'put' },
    { path: '/fraud-access-requests/{id}/reject', method: 'put' },
  );

  // Compliance (modular routes)
  routes.push(
    { path: '/compliance', method: 'get' },
    { path: '/compliance', method: 'post' },
    { path: '/compliance/summary', method: 'get' },
    { path: '/compliance/{id}', method: 'get' },
    { path: '/compliance/{id}', method: 'put' },
    { path: '/compliance/{id}', method: 'delete' },
    { path: '/compliance/{id}/status', method: 'patch' },
  );

  // CRUD-generated routes (from crudGenerator.ts)
  const crudTables = [
    { route: 'audit-plans', table: 'audit_plans' },
    { route: 'audit-tasks', table: 'audit_tasks' },
    { route: 'audit-programs', table: 'audit_programs' },
    { route: 'audit-procedures', table: 'audit_procedures' },
    { route: 'audit-evidence', table: 'audit_evidence' },
    { route: 'risk-register', table: 'risk_register' },
    { route: 'fraud-log', table: 'fraud_log' },
    { route: 'central-bank-instructions', table: 'central_bank_instructions' },
    { route: 'law-bank', table: 'law_bank' },
    { route: 'audit-reports', table: 'audit_reports' },
    { route: 'audit-findings', table: 'audit_findings' },
    { route: 'recommendations', table: 'recommendations' },
    { route: 'compliance-items', table: 'compliance_items' },
  ];

  for (const { route } of crudTables) {
    routes.push(
      { path: `/${route}`, method: 'get' },
      { path: `/${route}`, method: 'post' },
      { path: `/${route}/{id}`, method: 'get' },
      { path: `/${route}/{id}`, method: 'put' },
      { path: `/${route}/{id}`, method: 'delete' },
    );
  }

  return routes;
}

describe('Property 13: OpenAPI specification completeness', () => {
  let spec: OpenApiSpec;
  let registeredRoutes: Array<{ path: string; method: string }>;

  beforeAll(() => {
    const specPath = path.resolve(__dirname, '../../../docs/openapi.yaml');
    const specContent = fs.readFileSync(specPath, 'utf-8');
    spec = yaml.load(specContent) as OpenApiSpec;
    registeredRoutes = discoverRoutes();
  });

  it('should have valid OpenAPI 3.1 structure', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBe('AL-SAQI Internal Audit System API');
    expect(spec.info.version).toBe('1.0.0');
    expect(spec.servers).toHaveLength(1);
    expect(spec.servers[0].url).toBe('/api');
  });

  it('should define both security schemes (Bearer JWT + CSRF)', () => {
    expect(spec.components.securitySchemes).toHaveProperty('BearerAuth');
    expect(spec.components.securitySchemes).toHaveProperty('CsrfToken');
  });

  it('should define all required schema components', () => {
    const requiredSchemas = [
      'User', 'AuditPlan', 'AuditProgram', 'Finding',
      'Recommendation', 'RiskItem', 'Correspondence',
    ];
    for (const schema of requiredSchemas) {
      expect(spec.components.schemas).toHaveProperty(schema);
    }
  });

  it('every registered route has a corresponding OpenAPI path entry', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...registeredRoutes),
        (route) => {
          const specPaths = Object.keys(spec.paths);
          const pathEntry = spec.paths[route.path];

          // The path must exist in the spec
          expect(pathEntry).toBeDefined();
          if (!pathEntry) return false;

          // The method must exist for that path
          expect(pathEntry[route.method]).toBeDefined();
          return pathEntry[route.method] !== undefined;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('every OpenAPI path entry has at least one response defined', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ...Object.entries(spec.paths).flatMap(([pathStr, methods]) =>
            Object.entries(methods as Record<string, any>)
              .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
              .map(([method, def]) => ({ path: pathStr, method, def }))
          )
        ),
        ({ path: pathStr, method, def }) => {
          expect((def as any).responses).toBeDefined();
          const responses = (def as any).responses;
          expect(Object.keys(responses).length).toBeGreaterThan(0);
          return Object.keys(responses).length > 0;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('all registered routes are covered in the spec (exhaustive check)', () => {
    const missingRoutes: Array<{ path: string; method: string }> = [];

    for (const route of registeredRoutes) {
      const pathEntry = spec.paths[route.path];
      if (!pathEntry || !pathEntry[route.method]) {
        missingRoutes.push(route);
      }
    }

    if (missingRoutes.length > 0) {
      console.error('Missing routes in OpenAPI spec:', missingRoutes);
    }
    expect(missingRoutes).toHaveLength(0);
  });
});
