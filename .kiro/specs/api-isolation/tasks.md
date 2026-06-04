# Implementation Plan: API Isolation (عزل طبقة الـ API)

## Overview

This implementation plan migrates the ALSAQI project from a modular monolith (single `server.ts` serving both API and static frontend) to an isolated architecture with three packages: `packages/api` (independent API server), `packages/shared` (contracts and validators), and `apps/web/src/api/` (typed API client layer). The migration preserves full backward compatibility while enabling independent deployment. Tasks reflect the current state where foundational structure exists but integration, migration of remaining components, and hardening are still needed.

## Tasks

- [ ] 1. Complete and harden shared package contracts
  - [ ] 1.1 Audit and extend shared type definitions for full coverage
    - Review `packages/shared/src/types/models.ts` against all API route handlers in `packages/api/src/routes/` to ensure every model used by both API and frontend is defined in shared
    - Add missing endpoint contract interfaces in `packages/shared/src/types/endpoints/` for: analytics, compliance, fraud, integrity, policies, regulatory, roles, audit-programs, recommendations, risk-register, bulk, settings, archive, executive-reports, profile, org-entities, job-titles
    - Ensure all types exported through `packages/shared/src/index.ts`
    - _Requirements: 2.1, 2.4, 2.6_

  - [ ] 1.2 Extend shared validators for all API endpoints accepting user input
    - Add missing validators: `packages/shared/src/validators/audit-programs.ts`, `risk-register.ts`, `recommendations.ts`, `compliance.ts`, `regulatory.ts`, `policies.ts`, `roles.ts`, `departments.ts`, `notifications.ts`, `settings.ts`, `bulk.ts`
    - Ensure all string fields have `min(1)` and `max()` constraints
    - Ensure all enum fields use `z.enum()` with explicit allowed values
    - Update `packages/shared/src/validators/index.ts` to re-export all new validators
    - _Requirements: 2.2, 2.5, 10.3, 10.4_

  - [ ] 1.3 Verify shared constants completeness
    - Audit `packages/shared/src/constants/index.ts` to ensure all error codes used by API middleware and routes are defined (VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED, CSRF_INVALID, VERSION_MISMATCH, etc.)
    - Add module names and API version string constant
    - _Requirements: 2.3, 2.4_

  - [ ]* 1.4 Write property tests for shared validation schemas
    - **Property 3: Validation Symmetry** - verify schemas produce identical parse results in both Node.js and browser environments
    - **Property 9: Schema Constraint Completeness** - verify all string fields have min/max, all enums have explicit values
    - **Validates: Requirements 2.5, 10.1, 10.2, 10.3, 10.4**

- [ ] 2. Checkpoint - Ensure shared package compiles and all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Harden API package middleware and response envelope
  - [ ] 3.1 Verify and complete CORS middleware enforcement
    - Audit `packages/api/src/middleware/cors.ts` to confirm it reads `CORS_ORIGIN` env var and rejects unlisted origins by omitting CORS headers (not just blocking)
    - Ensure wildcard `*` is NOT used when `NODE_ENV=production`
    - Write unit test confirming rejection behavior
    - _Requirements: 8.1_

  - [ ] 3.2 Verify and complete CSRF middleware enforcement
    - Audit `packages/api/src/middleware/csrf.ts` to confirm it validates `x-csrf-token` header against `csrf-token` cookie on POST/PUT/PATCH/DELETE
    - Confirm auth endpoints (login, token refresh) are explicitly exempt
    - Confirm rejection returns HTTP 403 with CSRF-specific error message
    - _Requirements: 8.2, 8.3_

  - [ ] 3.3 Verify and complete rate limiting middleware
    - Audit `packages/api/src/middleware/rateLimiter.ts` to confirm sliding window (100 req/60s authenticated by user ID, 50 req/60s unauthenticated by IP)
    - Ensure HTTP 429 response includes `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers
    - _Requirements: 8.5, 8.6_

  - [ ] 3.4 Verify response envelope conformance across all routes
    - Audit `packages/api/src/utils/responseEnvelope.ts` and `packages/api/src/middleware/responseWrapper.ts` to confirm all success responses include `success: true`, `data`, and `meta` with `requestId` (UUID v4), `timestamp` (ISO 8601), `version` (semver string)
    - Confirm paginated responses include `meta.pagination` with all required fields
    - Confirm error responses include `success: false`, `data: null`, `error` with `code`, `message`, `traceId`, optional `details` array
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 3.5 Verify version rewriting and backward compatibility
    - Audit `packages/api/src/middleware/versionRewrite.ts` to confirm requests to `/api/{resource}` (no version prefix) internally rewrite to `/api/v1/{resource}`
    - Confirm explicitly versioned paths (`/api/v1/findings`) serve directly without rewriting
    - Confirm `packages/api/src/middleware/notFoundHandler.ts` returns JSON 404 for unmatched `/api/` paths
    - _Requirements: 6.1, 6.4, 6.6_

  - [ ] 3.6 Implement file validation with Magika
    - Integrate `magika` library in file upload routes to verify file content-type matches declared extension
    - Return HTTP 400 with content mismatch error message on failure
    - _Requirements: 8.7, 8.8_

  - [ ]* 3.7 Write property tests for API response envelope
    - **Property 4: Response Envelope Conformance** - verify all success responses match `SuccessResponseSchema` and all error responses match `ErrorResponseSchema`
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]* 3.8 Write property tests for CORS and CSRF enforcement
    - **Property 7: CORS Origin Rejection** - verify requests from unlisted origins are rejected without CORS headers
    - **Property 8: CSRF Enforcement on State-Changing Requests** - verify POST/PUT/DELETE without valid CSRF token are rejected with 403
    - **Validates: Requirements 8.1, 8.2**

- [ ] 4. Checkpoint - Ensure API package builds and starts independently
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Complete and harden typed API client layer
  - [ ] 5.1 Verify API client infrastructure completeness
    - Audit `apps/web/src/api/client.ts` to confirm: CSRF token auto-attachment from `csrf-token` cookie, correlation ID (UUID v4) generation per request, Zod response validation against Shared_Package schemas
    - Confirm 401 interception with single token refresh retry logic (no retry on refresh request itself)
    - Confirm exponential backoff retry (1s, 2s, 4s) for network failures and 5xx errors (max 3 attempts)
    - Confirm `X-API-Version` mismatch detection triggers non-dismissible refresh notification
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 12.1, 12.2, 12.3_

  - [ ] 5.2 Extend module-specific API client methods for full coverage
    - Audit `apps/web/src/api/modules/` for missing modules; add any missing from: audit-programs, compliance, regulatory, policies, roles, fraud, integrity, executive-reports, bulk, settings, profile, org-entities, job-titles, archive, analytics
    - Ensure all methods use schemas from `@alsaqi/shared` for type inference and response validation
    - Create `apps/web/src/api/index.ts` composing all modules into the fully typed `ApiClient` object
    - _Requirements: 4.1, 4.2, 4.6_

  - [ ] 5.3 Extend React Query hooks for all API modules
    - Audit `apps/web/src/api/hooks/` for missing hook files matching new modules
    - Add hooks for: audit-programs, compliance, regulatory, risk-register, correspondence, recommendations, departments, roles, dashboard, analytics
    - Ensure automatic query key management and cache invalidation on successful mutations
    - _Requirements: 4.7_

  - [ ] 5.4 Verify WebSocket client with reconnection and fallback
    - Audit `apps/web/src/api/ws/websocket-client.ts` to confirm: exponential backoff reconnection (1s initial, 2x multiplier, 30s max, 5 attempts), HTTP polling fallback (30s interval) after 5 failed reconnections
    - Confirm missed notification sync via sequence ID on reconnection (max 100)
    - Confirm resume WebSocket and stop polling when connection re-established
    - Confirm degraded mode status indicator displayed to user
    - _Requirements: 9.2, 9.3, 9.4, 9.5_

  - [ ] 5.5 Verify validation error parsing for form display
    - Audit `apps/web/src/api/utils/error-parser.ts` to confirm it parses standard error response `details` array into field-keyed object
    - Confirm non-conformant 400 responses invoke `onError` with generic error
    - Confirm field-level errors are exposed for inline form display within 200ms
    - _Requirements: 12.4, 12.5, 10.6_

  - [ ]* 5.6 Write property tests for API client
    - **Property 6: Automatic Security Headers** - verify every request contains CSRF token and correlation ID without manual attachment
    - **Property 11: Client-Side Response Validation** - verify all responses are validated against Zod schemas before returning; invalid responses throw ZodError
    - **Validates: Requirements 4.5, 4.2**

  - [ ]* 5.7 Write property test for validation error round-trip
    - **Property 10: Validation Error Round-Trip** - verify invalid inputs produce 400 with field-level errors, and API_Client correctly parses/exposes them
    - **Validates: Requirements 10.5, 12.4**

- [ ] 6. Checkpoint - Ensure API client compiles and unit tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Migrate frontend to typed API client and enforce import isolation
  - [ ] 7.1 Migrate components using compat/auditService to typed hooks
    - Replace `auditService` imports in `apps/web/src/hooks/useAuditPlans.ts`, `apps/web/src/hooks/useAuditFindings.ts`, `apps/web/src/modules/AuditFindings.tsx`, `apps/web/src/modules/AuditPlan.tsx` with React Query hooks from `apps/web/src/api/hooks/`
    - Remove `apps/web/src/api/compat/auditService.ts` after migration
    - _Requirements: 4.7, 10.1, 10.2_

  - [ ] 7.2 Migrate components using compat/authService to typed hooks
    - Replace `loginUser` import in `apps/web/src/components/Login.tsx` with auth hook from `apps/web/src/api/hooks/useAuth.ts`
    - Remove `apps/web/src/api/compat/authService.ts` after migration
    - _Requirements: 4.7, 10.1, 10.2_

  - [ ] 7.3 Migrate components using compat/userService to typed hooks
    - Replace `userService` imports in `apps/web/src/hooks/useUserManagement.ts`, `apps/web/src/hooks/useLookups.ts`, `apps/web/src/modules/UserManagement/index.tsx` with hooks from `apps/web/src/api/hooks/useUsers.ts`
    - Remove `apps/web/src/api/compat/userService.ts` after migration
    - _Requirements: 4.7, 10.1, 10.2_

  - [ ] 7.4 Migrate components using compat/correspondenceService to typed hooks
    - Replace `correspondenceService` imports in `apps/web/src/hooks/useCorrespondence.ts`, `apps/web/src/modules/Correspondence/CorrespondenceSystem.tsx` with typed hooks
    - Remove `apps/web/src/api/compat/correspondenceService.ts` after migration
    - _Requirements: 4.7, 10.1, 10.2_

  - [ ] 7.5 Migrate components using compat/riskService and compat/dashboardService to typed hooks
    - Replace `riskService` imports in `apps/web/src/hooks/useRisks.ts`, `apps/web/src/modules/RiskRegister.tsx` with typed hooks
    - Replace `dashboardService` imports in `apps/web/src/hooks/useDashboardStats.ts` with typed hooks
    - Remove `apps/web/src/api/compat/riskService.ts` and `apps/web/src/api/compat/dashboardService.ts` after migration
    - _Requirements: 4.7, 10.1, 10.2_

  - [ ] 7.6 Migrate remaining compat services and remove compat layer
    - Replace any remaining imports from `apps/web/src/api/compat/departmentService.ts`, `regulatoryService.ts`
    - Remove direct `httpClient.ts` usage in components (replace with typed module methods)
    - Delete the entire `apps/web/src/api/compat/` directory
    - Update all form components to use shared Zod schemas from `@alsaqi/shared` for client-side validation
    - _Requirements: 10.1, 10.2, 5.2_

  - [ ] 7.7 Verify TypeScript project references enforce import boundaries
    - Confirm `apps/web/tsconfig.json` has `references` pointing only to `packages/shared`
    - Confirm `packages/api/tsconfig.json` has `references` pointing only to `packages/shared`
    - Run `tsc --build` at workspace root and verify it catches any boundary violation (no imports from `packages/api` in `apps/web` or vice versa)
    - _Requirements: 5.4, 5.5, 11.3_

  - [ ]* 7.8 Write property test for import isolation
    - **Property 1: Import Isolation** - verify no file in `packages/api/` imports from `apps/web/` and no file in `apps/web/` imports from `packages/api/`; all shared imports come from `packages/shared`
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ]* 7.9 Write property test for backward compatibility
    - **Property 5: Backward Compatibility** - verify all existing API paths return semantically equivalent responses with same status codes and auth requirements
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [ ] 8. Checkpoint - Ensure full build passes and integration works
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Clean up legacy monolith code
  - [ ] 9.1 Remove old `src/server/` directory
    - Verify all server code has been migrated to `packages/api/src/`
    - Remove `src/server/` directory from project root
    - Remove old `server.ts` from project root (replaced by `packages/api/src/main.ts`)
    - Remove old root `Dockerfile` (replaced by `packages/api/Dockerfile`)
    - Update root `package.json` scripts to remove monolith build commands (the `"build"` script referencing `esbuild server.ts`)
    - _Requirements: 1.1, 1.7, 1.8_

  - [ ] 9.2 Remove old `src/services/` directory
    - Verify all service logic consumed by the frontend has been replaced by the typed API client and hooks
    - Remove `src/services/` directory
    - _Requirements: 5.1, 5.2_

  - [ ] 9.3 Clean up duplicate type definitions
    - Remove `src/types.ts` from root (types now in `packages/shared/src/types/`)
    - Remove any leftover type definitions in `apps/web/` that duplicate `@alsaqi/shared` types
    - _Requirements: 2.1, 2.6_

- [ ] 10. Checkpoint - Ensure full build passes after cleanup
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Configure and verify independent deployment
  - [ ] 11.1 Verify API Dockerfile and health check
    - Audit `packages/api/Dockerfile` for standalone operation (no dependency on frontend files)
    - Ensure health check endpoint (`GET /api/health`) exists and responds correctly
    - Verify `docker build` and `docker run` results in health check passing within 30 seconds
    - _Requirements: 7.3, 11.4_

  - [ ] 11.2 Verify docker-compose separate services configuration
    - Audit `deploy/docker-compose.yml` for separate `api` and `web` services with independent `build` contexts, independent `healthcheck` definitions, and no `depends_on` between them
    - _Requirements: 7.4_

  - [ ] 11.3 Verify nginx routing configuration
    - Audit `deploy/nginx/nginx.conf.example` to confirm `/api` routes to API container and all other requests to web container
    - Confirm nginx returns 502 for non-API requests if web container is unreachable while continuing to route `/api` to API container
    - _Requirements: 7.5, 7.6, 7.7_

  - [ ] 11.4 Create separate environment files for each package
    - Ensure `packages/api/.env.example` contains database credentials, JWT keys, server secrets
    - Ensure `apps/web/.env` contains only `VITE_API_URL`
    - Ensure `packages/shared/` contains no secrets
    - _Requirements: 8.9_

  - [ ] 11.5 Verify workspace-level scripts and type checking
    - Confirm `build:all`, `typecheck:all`, `test:all` scripts work correctly in root `package.json`
    - Confirm `tsc --build` at root validates all packages including cross-boundary types
    - Confirm individual package build failure exits with non-zero code and reports which package failed
    - _Requirements: 11.3, 11.4, 11.6_

  - [ ]* 11.6 Write integration tests for independent deployment
    - Test API container starts and passes health check within 30 seconds without frontend
    - Test frontend serves application shell when API is unreachable (displays error indication within 5 seconds)
    - Test nginx routing with both containers
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at each phase
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The migration is designed to be incremental: each checkpoint represents a working state
- TypeScript is the implementation language for all packages (matching the existing project stack)
- `fast-check` is already available in the project for property-based testing
- `@tanstack/react-query`, `axios`, and `zod` are already project dependencies
- The compat layer (`apps/web/src/api/compat/`) still has active consumers that must be migrated before removal
- The old `src/server/` directory still exists and should be removed after full migration is verified

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "3.1", "3.2", "3.3"] },
    { "id": 2, "tasks": ["3.4", "3.5", "3.6"] },
    { "id": 3, "tasks": ["3.7", "3.8", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "5.5"] },
    { "id": 5, "tasks": ["5.6", "5.7"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5"] },
    { "id": 7, "tasks": ["7.6", "7.7"] },
    { "id": 8, "tasks": ["7.8", "7.9"] },
    { "id": 9, "tasks": ["9.1", "9.2", "9.3"] },
    { "id": 10, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5"] },
    { "id": 11, "tasks": ["11.6"] }
  ]
}
```
