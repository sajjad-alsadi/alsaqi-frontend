# Implementation Plan: API Isolation (عزل طبقة الـ API)

## Overview

This implementation plan migrates the ALSAQI project from a modular monolith (single `server.ts` serving both API and static frontend) to an isolated architecture with three packages: `packages/api` (independent API server), `packages/shared` (contracts and validators), and `apps/web/src/api/` (typed API client layer). The migration preserves full backward compatibility while enabling independent deployment.

## Tasks

- [x] 1. Set up workspace structure and shared package
  - [x] 1.1 Configure npm workspaces and create base TypeScript config
    - Add `workspaces` field to root `package.json` pointing to `packages/*` and `apps/*`
    - Create `tsconfig.base.json` with shared compiler options (`strict`, `moduleResolution`, `target`)
    - Create `packages/shared/package.json` with name `@alsaqi/shared`, dependencies (`zod`), and build scripts
    - Create `packages/shared/tsconfig.json` extending base with `composite: true` and `declarationMap: true`
    - Create `packages/shared/src/index.ts` entry point
    - _Requirements: 11.1, 11.2, 11.5_

  - [x] 1.2 Define shared types and enums in `packages/shared`
    - Create `packages/shared/src/types/api.ts` with `ApiResponse<T>`, `SuccessResponse`, `ErrorResponse`, `PaginationMeta` types and Zod schemas (`SuccessResponseSchema`, `ErrorResponseSchema`)
    - Create `packages/shared/src/types/models.ts` extracting shared model types (User, AuditPlan, Finding, Task, Department, etc.) from `src/types.ts` and `src/server/types.ts`
    - Create `packages/shared/src/types/enums.ts` with UserRole, Status, RiskLevel, and other enum definitions
    - Create `packages/shared/src/types/endpoints/` directory with endpoint contract interfaces for each module (findings, auth, tasks, etc.)
    - Export all types through `packages/shared/src/index.ts`
    - _Requirements: 2.1, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

  - [x] 1.3 Define shared validation schemas in `packages/shared`
    - Create `packages/shared/src/validators/auth.ts` with login, register, and password schemas
    - Create `packages/shared/src/validators/findings.ts` with `CreateFindingSchema`, `UpdateFindingSchema`
    - Create `packages/shared/src/validators/audit-plans.ts` with plan CRUD schemas
    - Create `packages/shared/src/validators/tasks.ts` with task CRUD schemas
    - Create `packages/shared/src/validators/users.ts` with user management schemas
    - Create `packages/shared/src/validators/correspondence.ts` with incoming/outgoing schemas
    - Create `packages/shared/src/validators/index.ts` re-exporting all validators
    - Ensure all string fields have `min(1)` and `max()` constraints, all enums use `z.enum()`
    - _Requirements: 2.2, 2.5, 10.1, 10.3, 10.4_

  - [x] 1.4 Define shared constants in `packages/shared`
    - Create `packages/shared/src/constants/index.ts` with error codes (VALIDATION_ERROR, UNAUTHORIZED, etc.), module names, and API version string
    - _Requirements: 2.3, 2.4_

  - [x] 1.5 Write property tests for shared validation schemas
    - **Property 3: Validation Symmetry** - verify schemas produce identical parse results in both environments
    - **Property 9: Schema Constraint Completeness** - verify all string fields have min/max, all enums have explicit values
    - **Validates: Requirements 2.5, 10.1, 10.2, 10.3, 10.4**

- [x] 2. Checkpoint - Ensure shared package compiles
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Set up API package structure and entry point
  - [x] 3.1 Create API package configuration and entry point
    - Create `packages/api/package.json` with name `@alsaqi/api`, dependency on `@alsaqi/shared`, and all server dependencies moved from root `package.json`
    - Create `packages/api/tsconfig.json` extending base with `composite: true`, reference to `packages/shared`, and path aliases
    - Create `packages/api/src/index.ts` implementing `createApiServer()` function that returns `ApiServer` with `start()`, `stop()`, `getApp()`, `getHttpServer()` methods
    - Implement graceful shutdown in `stop()` with 10-second timeout for in-flight requests
    - Create `packages/api/src/main.ts` as standalone entry point that reads config from environment variables and calls `createApiServer`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 3.2 Migrate middleware stack to API package
    - Move `src/server/middleware/` to `packages/api/src/middleware/`
    - Update CORS middleware to read `CORS_ORIGIN` environment variable and reject unlisted origins (no wildcard in production)
    - Ensure CSRF validation middleware validates `x-csrf-token` header against `csrf-token` cookie on POST/PUT/PATCH/DELETE (exempt auth endpoints)
    - Ensure rate limiting middleware uses sliding window (100 req/60s authenticated, 50 req/60s unauthenticated) with `Retry-After` and `X-RateLimit-*` headers
    - Add `X-API-Version` response header middleware to all `/api/` responses
    - Update imports to use `@alsaqi/shared` for validators and types
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 6.7_

  - [x] 3.3 Migrate routes to API package with versioned prefix
    - Move `src/server/routes/` to `packages/api/src/routes/`
    - Create `packages/api/src/routes/v1/index.ts` registering all routes under `/api/v1/`
    - Implement path rewriting: requests to `/api/{resource}` (no version prefix) internally rewrite to `/api/v1/{resource}`
    - Add `notFoundHandler` for unmatched `/api/` paths returning JSON 404
    - Update route handlers to use validation schemas from `@alsaqi/shared`
    - Wrap all route responses in the standard `ApiResponse` envelope with `requestId`, `timestamp`, `version`, and optional `pagination`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 3.1, 3.2, 3.3, 10.5_

  - [x] 3.4 Migrate services and database layer to API package
    - Move `src/server/services/` to `packages/api/src/services/`
    - Move `src/server/db/` to `packages/api/src/db/`
    - Move `src/server/cron/` to `packages/api/src/cron/`
    - Move `src/server/utils/` to `packages/api/src/utils/`
    - Move `src/server/schemas/` to `packages/api/src/schemas/` (server-only schemas that complement shared validators)
    - Update all imports to reference `@alsaqi/shared` for shared types/validators
    - Ensure database migrations are triggered on `ApiServer.start()`
    - _Requirements: 1.1, 1.7_

  - [x] 3.5 Migrate WebSocket server to API package
    - Move WebSocket handling from `server.ts` to `packages/api/src/ws/`
    - Support WebSocket connections with JWT authentication via `?token=` query parameter
    - Maintain server-initiated ping every 30 seconds with 10-second pong timeout
    - Ensure notifications are delivered within 2 seconds of triggering event
    - _Requirements: 9.1, 6.5_

  - [x] 3.6 Write property tests for API response envelope
    - **Property 4: Response Envelope Conformance** - verify all success responses match `SuccessResponseSchema` and all error responses match `ErrorResponseSchema`
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [x] 3.7 Write property tests for CORS and CSRF enforcement
    - **Property 7: CORS Origin Rejection** - verify requests from unlisted origins are rejected without CORS headers
    - **Property 8: CSRF Enforcement on State-Changing Requests** - verify POST/PUT/DELETE without valid CSRF token are rejected with 403
    - **Validates: Requirements 8.1, 8.2**

- [x] 4. Checkpoint - Ensure API package builds and starts independently
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create typed API client layer
  - [x] 5.1 Create API client infrastructure in `apps/web/src/api/`
    - Create `apps/web/src/api/client.ts` implementing `createApiClient()` with Axios instance, CSRF token auto-attachment, correlation ID generation, and response unwrapping
    - Implement 401 interception with single token refresh retry logic
    - Implement exponential backoff retry (1s, 2s, 4s) for network failures and 5xx errors (max 3 attempts)
    - Implement `X-API-Version` mismatch detection with non-dismissible refresh notification
    - Implement Zod response validation on all API responses before returning to caller
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 12.1, 12.2, 12.3_

  - [x] 5.2 Create module-specific API client methods
    - Create `apps/web/src/api/modules/auth.ts` with login, logout, refresh, register methods
    - Create `apps/web/src/api/modules/findings.ts` with list, create, update, delete methods
    - Create `apps/web/src/api/modules/audit-plans.ts` with CRUD methods
    - Create `apps/web/src/api/modules/tasks.ts` with CRUD methods
    - Create `apps/web/src/api/modules/users.ts` with management methods
    - Create `apps/web/src/api/modules/departments.ts` with CRUD methods
    - Create `apps/web/src/api/modules/notifications.ts` with list and mark-read methods
    - Create `apps/web/src/api/modules/correspondence.ts` with incoming/outgoing methods
    - Create `apps/web/src/api/modules/risk-register.ts` with CRUD methods
    - Create `apps/web/src/api/modules/recommendations.ts` with CRUD methods
    - Create `apps/web/src/api/index.ts` composing all modules into the typed `ApiClient` object
    - All methods use schemas from `@alsaqi/shared` for type inference and response validation
    - _Requirements: 4.1, 4.2, 4.6_

  - [x] 5.3 Create React Query hooks for each API module
    - Create `apps/web/src/api/hooks/useFindings.ts` with `useFindings`, `useCreateFinding`, `useUpdateFinding`, `useDeleteFinding`
    - Create `apps/web/src/api/hooks/useAuditPlans.ts` with plan query/mutation hooks
    - Create `apps/web/src/api/hooks/useTasks.ts` with task query/mutation hooks
    - Create `apps/web/src/api/hooks/useUsers.ts` with user query/mutation hooks
    - Create `apps/web/src/api/hooks/useAuth.ts` with auth mutation hooks
    - Create `apps/web/src/api/hooks/useNotifications.ts` with notification hooks
    - Implement automatic query key management and cache invalidation on successful mutations
    - _Requirements: 4.7_

  - [x] 5.4 Implement WebSocket client with reconnection and fallback
    - Create `apps/web/src/api/ws/websocket-client.ts` with automatic reconnection (exponential backoff: 1s initial, 2x multiplier, 30s max, 5 attempts)
    - Implement HTTP polling fallback (30s interval) when WebSocket reconnection fails
    - Implement missed notification sync via sequence ID on reconnection (max 100)
    - Resume WebSocket and stop polling when connection is re-established
    - Display degraded mode status indicator to the user
    - _Requirements: 9.2, 9.3, 9.4, 9.5_

  - [x] 5.5 Implement validation error parsing for form display
    - Create `apps/web/src/api/utils/error-parser.ts` that parses standard error response `details` array into field-keyed object for inline form display
    - Handle non-conformant 400 responses by invoking `onError` with generic error
    - Ensure field-level errors are displayed within 200ms without server round-trip (client-side validation first)
    - _Requirements: 12.4, 12.5, 10.6_

  - [x] 5.6 Write property tests for API client
    - **Property 6: Automatic Security Headers** - verify every request contains CSRF token and correlation ID without manual attachment
    - **Property 11: Client-Side Response Validation** - verify all responses are validated against Zod schemas before returning; invalid responses throw ZodError
    - **Validates: Requirements 4.5, 4.2**

  - [x] 5.7 Write property test for validation error round-trip
    - **Property 10: Validation Error Round-Trip** - verify invalid inputs produce 400 with field-level errors, and API_Client correctly parses/exposes them
    - **Validates: Requirements 10.5, 12.4**

- [x] 6. Checkpoint - Ensure API client compiles and unit tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Wire frontend to API client and enforce import isolation
  - [x] 7.1 Restructure frontend as `apps/web` package
    - Create `apps/web/package.json` with dependency on `@alsaqi/shared` (NOT `@alsaqi/api`)
    - Create `apps/web/tsconfig.json` extending base with reference to `packages/shared` only
    - Move existing frontend source files (`src/components/`, `src/modules/`, `src/context/`, `src/hooks/`, `src/locales/`, etc.) to `apps/web/src/`
    - Update `vite.config.ts` to configure proxy: `/api` → `http://localhost:3000` for development
    - Create separate `.env` file for frontend (only `VITE_API_URL`)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 8.9_

  - [x] 7.2 Replace direct service imports with API client calls
    - Replace imports from `src/services/api.ts` with the new typed API client from `apps/web/src/api/`
    - Replace direct axios calls in components with React Query hooks
    - Remove `src/services/` directory (functionality moved to `apps/web/src/api/modules/`)
    - Update all form components to use shared Zod schemas from `@alsaqi/shared` for client-side validation
    - _Requirements: 10.1, 10.2, 4.7_

  - [x] 7.3 Configure TypeScript project references for import boundary enforcement
    - Add `references` to `apps/web/tsconfig.json` pointing only to `packages/shared`
    - Add `references` to `packages/api/tsconfig.json` pointing only to `packages/shared`
    - Configure `paths` in each package to prevent cross-boundary imports
    - Verify `tsc --build` at workspace root catches any boundary violation
    - _Requirements: 5.4, 5.5, 11.3_

  - [x] 7.4 Write property test for import isolation
    - **Property 1: Import Isolation** - verify no file in `packages/api/` imports from `apps/web/` and no file in `apps/web/` imports from `packages/api/`; all shared imports come from `packages/shared`
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [x] 7.5 Write property test for backward compatibility
    - **Property 5: Backward Compatibility** - verify all existing API paths return semantically equivalent responses with same status codes and auth requirements
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 8. Checkpoint - Ensure full build passes and integration works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Configure independent deployment
  - [x] 9.1 Create Dockerfile and build scripts for API package
    - Create `packages/api/Dockerfile` for standalone API container
    - Update root `package.json` build scripts for workspace-level builds (`npm run build --workspace=@alsaqi/api`, `npm run build --workspace=apps/web`)
    - Configure `esbuild` to bundle `packages/api` into a standalone `dist/server.js`
    - Add health check endpoint (`GET /api/health`) to API package
    - _Requirements: 7.3, 11.4_

  - [x] 9.2 Update deployment configuration for independent services
    - Update `deploy/docker-compose.yml` to define separate `api` and `web` services with independent `build` contexts, `healthcheck` definitions, and no `depends_on`
    - Update `deploy/nginx/nginx.conf.example` to route `/api` to API container and all other requests to web container
    - Ensure nginx returns 502 for non-API requests if web container is unreachable while continuing to route `/api` to API container
    - _Requirements: 7.4, 7.5, 7.6, 7.7_

  - [x] 9.3 Configure workspace-level scripts and type checking
    - Add workspace-level scripts: `build:all`, `typecheck:all`, `test:all`, `dev` (concurrently runs API and web dev servers)
    - Ensure `tsc --build` at root validates all packages including cross-boundary types
    - Ensure individual package build failure exits with non-zero code and reports which package failed
    - _Requirements: 11.3, 11.4, 11.6_

  - [x] 9.4 Write integration tests for independent deployment
    - Test API container starts and passes health check within 30 seconds without frontend
    - Test frontend serves application shell when API is unreachable
    - Test nginx routing with both containers
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 10. Final checkpoint - Ensure all tests pass
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

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5"] },
    { "id": 4, "tasks": ["3.6", "3.7", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.4", "5.5"] },
    { "id": 6, "tasks": ["5.6", "5.7", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3"] },
    { "id": 8, "tasks": ["7.4", "7.5"] },
    { "id": 9, "tasks": ["9.1", "9.2", "9.3"] },
    { "id": 10, "tasks": ["9.4"] }
  ]
}
```
