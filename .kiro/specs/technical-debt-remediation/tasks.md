# Implementation Plan

## Overview

This plan implements 12 technical debt remediation requirements for the AL-SAQI internal audit system. Tasks are ordered to respect dependencies: migration versioning (Task 3) before role migration (Task 4), and debug removal (Task 1) and DROP TABLE elimination (Task 2) first as foundational safety changes. Property-based tests use fast-check v4.8.0 with Vitest.

## Tasks

- [x] 1. Remove Debug Logging from Production Code
  - [x] 1.1 Remove the `agentDebugLog` function definition and all `#region agent log` / `#endregion` blocks from `server.ts`
  - [x] 1.2 Remove all references to `debug-*.log` file writes and HTTP requests to `127.0.0.1:7867`
  - [x] 1.3 Remove any hardcoded session identifiers (e.g., `eece07`) from `server.ts`
  - [x] 1.4 Delete the `debug-eece07.log` file from the project root
  - [x] 1.5 Replace any remaining `console.log`/`console.error` calls in `server.ts` with the structured `logger` utility from `src/server/utils/logger.ts`
- [x] 2. Eliminate Destructive DROP TABLE Statements
  - [x] 2.1 Replace `DROP TABLE IF EXISTS app_settings` with `CREATE TABLE IF NOT EXISTS app_settings` in `src/server/db/migrations.ts`
  - [x] 2.2 Replace `DROP TABLE IF EXISTS pdf_settings` with `CREATE TABLE IF NOT EXISTS pdf_settings` in `src/server/db/migrations.ts`
  - [x] 2.3 Replace `DROP TABLE IF EXISTS user_management_settings` with `CREATE TABLE IF NOT EXISTS user_management_settings` in `src/server/db/migrations.ts`
  - [x] 2.4 Ensure all remaining table definitions use `CREATE TABLE IF NOT EXISTS` and the `outgoing_letters` table is defined exactly once
  - [x] 2.5 Write property test: Migration DDL uses IF NOT EXISTS (Property 1) [PBT]

    **Validates: Requirements 2.4**
    - Test file: `src/server/db/__tests__/migrations.property.test.ts`
    - Framework: Vitest + fast-check
    - Strategy: Parse migration SQL strings and verify all CREATE TABLE statements include IF NOT EXISTS; generate arbitrary table names and verify the migration builder produces correct DDL

  - [x] 2.6 Write property test: Migration idempotence preserves data (Property 2) [PBT]

    **Validates: Requirements 2.6**
    - Test file: `src/server/db/__tests__/migrations.property.test.ts`
    - Framework: Vitest + fast-check
    - Strategy: Generate valid settings data, insert into tables, run migration system again, verify data is unchanged

- [x] 3. Implement Migration Versioning System
  - [x] 3.1 Create `src/server/db/migrationRunner.ts` with `MigrationRunner` class implementing `initialize()`, `getApplied()`, `getPending()`, and `run()` methods
  - [x] 3.2 Create the `schema_migrations` table DDL (`version TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'schema', applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`)
  - [x] 3.3 Implement transaction-based migration execution: on success record version, on failure halt and leave table unchanged
  - [x] 3.4 Implement sequential version ordering for pending migrations
  - [x] 3.5 Integrate `MigrationRunner` into server startup in `server.ts`, replacing direct migration calls
  - [x] 3.6 Write property test: Migration versioning idempotence (Property 6) [PBT]

    **Validates: Requirements 5.2, 5.3**
    - Test file: `src/server/db/__tests__/migrationRunner.property.test.ts`
    - Framework: Vitest + fast-check
    - Strategy: Generate sets of migrations marked as applied, run the system again, verify zero executions and unchanged schema_migrations table

  - [x] 3.7 Write property test: Successful migration recording (Property 7) [PBT]

    **Validates: Requirements 5.4**
    - Test file: `src/server/db/__tests__/migrationRunner.property.test.ts`
    - Framework: Vitest + fast-check
    - Strategy: Generate migrations that succeed, verify each has a record in schema_migrations with valid timestamp

  - [x] 3.8 Write property test: Failed migration halts execution (Property 8) [PBT]

    **Validates: Requirements 5.5**
    - Test file: `src/server/db/__tests__/migrationRunner.property.test.ts`
    - Framework: Vitest + fast-check
    - Strategy: Generate a list of migrations where one throws an error; verify that version is not recorded and no subsequent migrations execute

  - [x] 3.9 Write property test: Migration sequential ordering (Property 9) [PBT]

    **Validates: Requirements 5.6**
    - Test file: `src/server/db/__tests__/migrationRunner.property.test.ts`
    - Framework: Vitest + fast-check
    - Strategy: Generate migrations in random order, verify execution order is strictly ascending by version string

- [x] 4. Unify Role Naming Convention
  - [x] 4.1 Update `src/constants.ts` to define a `UserRole` enum with canonical identifiers and remove `'Administrator'` from all role arrays
  - [x] 4.2 Update `ADMIN_ROLES`, `COMPLIANCE_ROLES`, and `STAFF_ROLES` arrays to use only `UserRole` enum values without duplicates
  - [x] 4.3 Update the `User` type definition in `src/types.ts` or `src/server/types.ts` to reference the `UserRole` enum
  - [x] 4.4 Create a versioned data migration that updates existing users with `role = 'Administrator'` to `role = 'Admin'`
  - [x] 4.5 Update all role checks across the codebase to use the canonical `UserRole` enum
  - [x] 4.6 Write property test: Role arrays contain only canonical identifiers (Property 5) [PBT]

    **Validates: Requirements 4.1, 4.5**
    - Test file: `src/server/__tests__/roles.property.test.ts`
    - Framework: Vitest + fast-check
    - Strategy: Enumerate all role group arrays, verify every element is a value from UserRole enum and no duplicates exist

- [x] 5. Add CSRF Protection
  - [x] 5.1 Create `src/server/middleware/csrf.ts` with `generateCsrfToken()`, `csrfMiddleware()`, and `attachCsrfToken()` functions
  - [x] 5.2 Implement timing-safe token comparison using `crypto.timingSafeEqual`
  - [x] 5.3 Configure exempt paths (`/api/auth/login`, `/health`) that bypass CSRF validation
  - [x] 5.4 Integrate CSRF middleware into the Express app in `server.ts` after auth middleware
  - [x] 5.5 Update the auth login and token refresh handlers to call `attachCsrfToken()` on successful authentication
  - [x] 5.6 Write property test: CSRF token generation on authentication events (Property 3) [PBT]

    **Validates: Requirements 3.1, 3.6, 3.7**
    - Test file: `src/server/__tests__/csrf.property.test.ts`
    - Framework: Vitest + fast-check
    - Strategy: Generate authentication events, verify each produces a unique token with at least 32 bytes of entropy (64 hex chars)

  - [x] 5.7 Write property test: CSRF validation on state-changing requests (Property 4) [PBT]

    **Validates: Requirements 3.2, 3.3**
    - Test file: `src/server/__tests__/csrf.property.test.ts`
    - Framework: Vitest + fast-check
    - Strategy: Generate state-changing requests (POST/PUT/PATCH/DELETE) with and without valid tokens to non-exempt paths; verify rejection (403) without token and acceptance with valid token

- [x] 6. Fix RSA Key Persistence
  - [x] 6.1 Create `src/server/utils/keyStore.ts` with `KeyStore` class implementing `load()`, `save()`, and `getOrCreate()` methods
  - [x] 6.2 Implement AES-256-GCM encryption for keys at rest using key derived from `SHA-256(JWT_SECRET + '_rsa_enc')`
  - [x] 6.3 Implement storage path resolution: `DATA_DIR` env variable with fallback to `./data` directory; never use `/tmp`
  - [x] 6.4 Integrate `KeyStore` into server startup, replacing in-memory key generation in `server.ts`
  - [x] 6.5 Write property test: RSA key persistence round-trip (Property 10) [PBT]

    **Validates: Requirements 6.3**
    - Test file: `src/server/__tests__/keyStore.property.test.ts`
    - Framework: Vitest + fast-check
    - Strategy: Generate valid RSA key pairs or mock PEM strings, persist via KeyStore, load back, verify byte-for-byte PEM equality

  - [x] 6.6 Write property test: RSA keys encrypted at rest (Property 11) [PBT]

    **Validates: Requirements 6.5**
    - Test file: `src/server/__tests__/keyStore.property.test.ts`
    - Framework: Vitest + fast-check
    - Strategy: Generate key pairs, persist them, read raw file content, verify no PEM markers appear in the file; decrypt with correct secret and verify valid key material

- [x] 7. Add ESLint and Prettier Configuration
  - [x] 7.1 Create `eslint.config.mjs` with flat config format supporting TypeScript, React 19, and React Hooks rules
  - [x] 7.2 Create `.prettierrc` with project formatting options and `.prettierignore` excluding dist, node_modules, coverage
  - [x] 7.3 Add `lint` and `format` scripts to `package.json`
  - [x] 7.4 Set pre-existing violations to `warn` level so the build is not blocked
  - [x] 7.5 Verify `npm run lint` executes without errors (warnings are acceptable)
- [x] 8. Fix Context Provider Re-renders
  - [x] 8.1 Refactor `src/context/AppContext.tsx` to remove re-aggregation of auth/user/preferences state; keep only orchestration logic (login/logout coordination) with memoized value
  - [x] 8.2 Memoize all context values in `AuthContext.tsx`, `UserContext.tsx`, and `PreferencesContext.tsx` using `useMemo`
  - [x] 8.3 Memoize all callback functions in context providers using `useCallback`
  - [x] 8.4 Update components that consume `AppContext` for combined state to import from domain-specific contexts directly
  - [x] 8.5 Write property test: Context cross-domain render isolation (Property 12) [PBT]

    **Validates: Requirements 9.4, 9.5**
    - Test file: `src/context/__tests__/context.property.test.tsx`
    - Framework: Vitest + fast-check + React Testing Library
    - Strategy: Generate preference state changes and auth state changes; use render counters to verify cross-domain isolation (preference changes don't re-render auth-only consumers and vice versa)

- [x] 9. Accessibility Improvements
  - [x] 9.1 Create `src/components/SkipToContent.tsx` component and render as first focusable element in `src/App.tsx`
  - [x] 9.2 Create `src/components/LiveRegion.tsx` component with `polite` and `assertive` politeness levels
  - [x] 9.3 Integrate `LiveRegion` with route changes (polite) and toast notifications (assertive)
  - [x] 9.4 Create `src/components/FocusTrap.tsx` component with Escape-to-close support and integrate with `Modal` component
  - [x] 9.5 Verify `<html>` element `dir` and `lang` attributes update on language switch (existing `PreferencesContext` logic)
  - [x] 9.6 Write property test: Dynamic content accessibility announcements (Property 14) [PBT]

    **Validates: Requirements 12.3, 12.4**
    - Test file: `src/components/__tests__/accessibility.property.test.tsx`
    - Framework: Vitest + fast-check + React Testing Library
    - Strategy: Generate form submission results and toast messages; verify content appears in appropriate aria-live regions (polite for forms, assertive for toasts)

  - [x] 9.7 Write property test: Modal keyboard navigation (Property 15) [PBT]

    **Validates: Requirements 12.6**
    - Test file: `src/components/__tests__/accessibility.property.test.tsx`
    - Framework: Vitest + fast-check + React Testing Library
    - Strategy: Generate modal open/close sequences; verify focus is trapped within modal when open and Escape closes it returning focus to trigger

  - [x] 9.8 Write property test: Language direction synchronization (Property 16) [PBT]

    **Validates: Requirements 12.7**
    - Test file: `src/components/__tests__/accessibility.property.test.tsx`
    - Framework: Vitest + fast-check + React Testing Library
    - Strategy: Generate language switches between LTR (en) and RTL (ar) languages; verify html dir and lang attributes immediately reflect the new direction

- [x] 10. Add OpenAPI Specification
  - [x] 10.1 Create `docs/openapi.yaml` with OpenAPI 3.1 info, servers, and security scheme definitions (Bearer JWT + CSRF)
  - [x] 10.2 Document all API endpoints from `src/server/routes/` with paths, methods, request/response schemas, and auth requirements
  - [x] 10.3 Define reusable schema components for shared data models (User, AuditPlan, AuditProgram, Finding, Recommendation, RiskItem, Correspondence)
  - [x] 10.4 Add a `/api/docs` endpoint in the Express app to serve the OpenAPI spec
  - [x] 10.5 Write property test: OpenAPI specification completeness (Property 13) [PBT]

    **Validates: Requirements 10.2, 10.3**
    - Test file: `src/server/__tests__/openapi.property.test.ts`
    - Framework: Vitest + fast-check
    - Strategy: Parse the Express route registry and the OpenAPI YAML; for each registered route/method pair, verify a corresponding path entry exists in the spec with request/response schemas and security requirements

- [x] 11. Add Dockerfile for Containerization
  - [x] 11.1 Create `Dockerfile` with multi-stage build (builder stage with `node:20-alpine`, runtime stage with production deps only)
  - [x] 11.2 Configure non-root user (`appuser`), `VOLUME ["/app/data"]`, `EXPOSE 3000`, and `NODE_ENV=production`
  - [x] 11.3 Create `.dockerignore` excluding `node_modules`, `.git`, `src`, `*.md`, `*.log`, `*.map`, `**/*.test.*`
  - [x] 11.4 Verify Dockerfile builds successfully with `docker build .` (if Docker is available)
- [x] 12. Increase Test Coverage
  - [x] 12.1 Write unit tests for authentication flows (login, token refresh, logout, session invalidation) in `src/server/__tests__/auth.test.ts`
  - [x] 12.2 Write unit tests for permission middleware (`checkPermission`, `authorize`) in `src/server/__tests__/permissions.test.ts`
  - [x] 12.3 Write unit tests for the migration versioning system in `src/server/db/__tests__/migrations.test.ts`
  - [x] 12.4 Write integration tests for at least 5 critical API routes in `src/server/routes/__tests__/` (auth, audit plans, findings, recommendations, users)
  - [x] 12.5 Write component tests for at least 3 complex React components (FindingCard, AuditPlanForm, Layout)
  - [x] 12.6 Configure Vitest coverage with v8 provider, reporters (text, lcov, html), and threshold of 40% for `src/server/`
  - [x] 12.7 Verify `npm run test` produces a coverage report meeting the 40% threshold for `src/server/`

## Task Dependency Graph

```json
{
  "waves": [
    {
      "name": "Wave 1 - Foundation & Safety",
      "tasks": [1, 2, 3],
      "description": "Debug removal, DROP TABLE elimination, and migration versioning system"
    },
    {
      "name": "Wave 2 - Core Security & Data",
      "tasks": [4, 5, 6],
      "description": "Role unification (depends on Task 3), CSRF protection, and key persistence",
      "dependencies": {
        "4": [3]
      }
    },
    {
      "name": "Wave 3 - Developer Experience & Frontend",
      "tasks": [7, 8, 9],
      "description": "Linting, context optimization, and accessibility improvements"
    },
    {
      "name": "Wave 4 - Documentation & Deployment",
      "tasks": [10, 11],
      "description": "OpenAPI specification and Dockerfile"
    },
    {
      "name": "Wave 5 - Test Coverage",
      "tasks": [12],
      "description": "Comprehensive unit and integration tests for modules built in prior waves",
      "dependencies": {
        "12": [3, 4, 5, 6]
      }
    }
  ]
}
```

## Notes

- All property-based tests use fast-check v4.8.0 (already installed) with Vitest
- Minimum 100 iterations per property test as specified in the design document
- Tasks 1 and 2 are purely subtractive/corrective and have no dependencies
- The migration versioning system (Task 3) must be in place before the role data migration (Task 4.4)
- ESLint configuration (Task 7) uses warn-level for pre-existing violations to avoid blocking the build
- Context optimization (Task 8) requires careful component-by-component migration to avoid breaking existing consumers
- OpenAPI spec (Task 10) should be written after CSRF middleware (Task 5) is in place so security schemes are accurate
