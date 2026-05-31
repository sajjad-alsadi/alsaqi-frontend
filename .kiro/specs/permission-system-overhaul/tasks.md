# Implementation Plan: Permission System Overhaul

## Overview

This plan implements the permission system overhaul by introducing a Module Registry as the single source of truth, unifying authorization under a single `checkPermission()` middleware, auto-seeding modules to the database, refactoring the frontend to fetch permissions from the API, and adding custom role management with full CRUD support. The implementation is incremental: core types and registry first, then backend services, middleware refactoring, frontend hook, admin API, and finally integration wiring.

## Tasks

- [x] 1. Define core types and Module Registry
  - [x] 1.1 Create permission types and interfaces
    - Create `src/permissions/types.ts` with `PermissionAction`, `ModuleDefinition`, `NavigationConfig`, `UserPermissionSet`, `RolePermissionSet`, `PermissionUpdate`, `SeedResult` interfaces
    - Export the `PermissionAction` type as a union: `'View' | 'Create' | 'Edit' | 'Delete' | 'Approve'`
    - Define `ModuleDefinition` interface with name, label (en/ar), actions, defaults, navigation, and fileScope fields
    - _Requirements: 1.1, 11.1_

  - [x] 1.2 Implement ModuleRegistry class
    - Create `src/permissions/registry.ts` with `ModuleRegistryImpl` class
    - Implement `register()` with validation: unique PascalCase name (1-50 chars), non-empty actions, valid PermissionAction values, valid role references, navigation path starting with `/`
    - Implement `getModule()`, `getAllModules()`, `getModuleNames()`, `getDefaultPermissions()`, `getNavigationConfig()` methods
    - Export singleton `ModuleRegistry` instance
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 1.3 Register all existing modules in the registry
    - Create `src/permissions/modules.ts` that registers all 19 existing modules (Dashboard, AuditCharter, AuditPlans, etc.) with their actions, bilingual labels, default role permissions, and navigation config
    - Migrate the existing `DEFAULT_PERMISSIONS` matrix from `src/permissions.ts` into registry format
    - Add `fileScope: true` for modules that own files (AuditPlans, AuditFindings, Policies, RiskRegister, etc.)
    - _Requirements: 1.1, 11.1, 11.4, 10.5_

  - [x] 1.4 Write property tests for ModuleRegistry
    - **Property 1: Registration Validation** - registration succeeds iff name is unique PascalCase, actions non-empty and valid, defaults reference valid roles
    - **Property 2: Registry Retrieval Consistency** - getAllModules returns exactly the registered set, getModule returns matching or undefined, getModuleNames returns registered names
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**

  - [x] 1.5 Write unit tests for ModuleRegistry
    - Test duplicate name rejection, invalid PascalCase rejection, empty actions rejection, invalid action rejection, invalid role reference rejection, invalid navigation path rejection
    - Test successful registration and retrieval of module definitions
    - Test `getDefaultPermissions()` returns empty object for unknown roles
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

- [x] 2. Implement PermissionService and DB Auto-Seeder
  - [x] 2.1 Create PermissionService
    - Create `src/server/services/PermissionService.ts` implementing the `PermissionService` interface
    - Implement `hasPermission(userId, module, action)` with user-override precedence logic: check user_permissions first (is_allowed=true grants, is_allowed=false denies), then fall back to role_permissions
    - Implement `getUserPermissions(userId)` returning the full `UserPermissionSet` with effective permissions and overrides
    - Implement `getRolePermissions(roleId)` returning the role's permission matrix
    - Implement `updateRolePermissions(roleId, permissions)` with cache invalidation for all affected users
    - Implement `setUserPermissionOverride(userId, module, action, allowed)` with cache invalidation
    - Implement `invalidateCache(userId?)` using the existing cache pattern (prefix `perm_` for user-specific, all `perm_` entries for global)
    - Admin role always returns true without DB query
    - Deny permission if module/action not registered in ModuleRegistry
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 2.2 Implement Permission Cache with LRU eviction
    - Create `src/server/services/PermissionCache.ts` with LRU cache (max 1000 entries, 5-minute TTL)
    - Implement `get(key)`, `set(key, value)`, `invalidateUser(userId)`, `invalidateAll()` methods
    - Cache key format: `perm_{userId}_{module}_{action}`
    - Graceful fallback to DB on cache read/write failure
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7_

  - [x] 2.3 Implement DB Auto-Seeder
    - Create `src/permissions/seeder.ts` implementing the `seedModules()` function
    - Compare ModuleRegistry definitions against existing DB permission records
    - Insert missing (module, action) pairs into permissions table
    - Create default role_permissions entries for new permissions based on module defaults
    - Skip existing permissions without modification (idempotent)
    - Return `SeedResult` with added/skipped counts
    - Log warning if referenced role doesn't exist in DB
    - Handle DB connection failures gracefully (log error, allow app to start)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 2.4 Write property tests for PermissionService
    - **Property 5: Admin Supremacy** - Admin role always returns true for any module/action
    - **Property 6: Permission Resolution with Override Precedence** - user override takes precedence over role permissions in both directions
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5**

  - [x] 2.5 Write property tests for DB Auto-Seeder
    - **Property 3: Seeding Idempotency** - running seed N times produces same DB state as running once
    - **Property 4: Seeding Completeness** - after seeding, all registry module-action pairs exist in DB
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6**

  - [x] 2.6 Write unit tests for PermissionService and Cache
    - Test hasPermission with role-based grant, role-based denial, user override grant, user override denial
    - Test cache hit returns without DB query, cache miss queries DB
    - Test invalidateCache removes correct entries
    - Test LRU eviction at 1000 entries
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.6_

- [x] 3. Checkpoint - Core backend services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Refactor checkPermission middleware and replace authorize()
  - [x] 4.1 Refactor unified checkPermission middleware
    - Update `src/server/middleware/auth.ts` to use the new `PermissionService` for permission checks
    - Implement structured 403 response with `{ error, code: "PERMISSION_DENIED", module, action }`
    - Add Admin bypass (Admin role always passes without DB query)
    - Add validation: return 401 if `req.user` not populated, throw at startup if module not registered (dev mode), return 500 in production
    - Handle PermissionService errors: return 500 without exposing internal details
    - Remove the `authorize()` function export (deprecated)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 13.1, 13.6_

  - [x] 4.2 Replace all authorize() calls with checkPermission() in route files
    - Update `src/server/routes/analytics.ts` to use `checkPermission('Analytics', 'View')`
    - Update `src/server/routes/policies.ts` to use `checkPermission('Policies', action)`
    - Update `src/server/routes/auditPrograms.ts`, `auditTasks.ts`, `compliance.ts`, `correspondence.ts`, `departments.ts`, `fraud.ts`, `integrity.ts`, `recommendations.ts`, `regulatory.ts`, `roles.ts`, `users.ts`, `logs.ts`, `orgEntities.ts`, `settings.ts`, `executiveReports.ts`
    - Replace all `authorize(ADMIN_ROLES)`, `authorize(COMPLIANCE_ROLES)`, etc. with appropriate `checkPermission(module, action)` calls
    - _Requirements: 3.1, 3.3_

  - [x] 4.3 Implement file-level permission scoping
    - Update `src/server/middleware/secureFile.ts` to read the `module` field from file records
    - Check user's View permission for the file's owning module via `checkPermission(file.module, 'View')`
    - Deny access if file has no module field, empty module, unregistered module, or module with `fileScope: false`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 4.4 Write property tests for checkPermission middleware
    - **Property 7: Permission Enforcement Correctness** - non-Admin user allowed iff PermissionService returns true, denied with structured 403 otherwise
    - **Validates: Requirements 3.3, 3.4, 13.1**

  - [x] 4.5 Write unit tests for middleware and file-level scoping
    - Test Admin bypass, permission granted, permission denied with structured error
    - Test missing req.user returns 401, unregistered module handling
    - Test file-level scoping: correct module lookup, missing module denial, unregistered module denial
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 10.1, 10.2, 10.3, 10.4_

- [x] 5. Checkpoint - Backend middleware refactoring
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Permission Admin API
  - [x] 6.1 Create role management endpoints
    - Create `src/server/routes/permissionAdmin.ts` with role CRUD endpoints
    - `GET /api/v1/roles` - list all roles (built-in + custom) with id, name, description, isCustom, createdAt
    - `POST /api/v1/roles` - create custom role (name 2-100 chars, description 0-500 chars, isCustom=true, no default permissions)
    - `PUT /api/v1/roles/:id` - update custom role name/description (reject built-in roles with 403)
    - `DELETE /api/v1/roles/:id` - delete custom role (reject if users assigned with 409, reject built-in with 403)
    - Return 404 for non-existent role IDs, 409 for duplicate names (case-insensitive)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11_

  - [x] 6.2 Create permission matrix endpoints
    - `GET /api/v1/roles/:id/permissions` - return complete permission matrix for a role (all registered modules with boolean grant per action)
    - `PUT /api/v1/roles/:id/permissions` - update custom role permissions (reject built-in with 403), invalidate cache for all users with that role
    - `GET /api/v1/permissions/modules` - return all registered modules with metadata (name, labels, supported actions)
    - `GET /api/v1/permissions/me` - return authenticated user's effective permissions (role, isCustomRole, permissions map, overrides)
    - Validate module names and actions against ModuleRegistry (400 for invalid)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 6.3 Create user-level permission override endpoints
    - `GET /api/v1/users/:id/permissions` - return user's permission overrides list
    - `PUT /api/v1/users/:id/permissions` - replace all overrides for user, invalidate cache
    - Validate module names against ModuleRegistry (400 for unrecognized module)
    - Validate actions against module's supported actions (400 for unsupported action)
    - Return 404 for non-existent user IDs
    - Empty overrides array removes all overrides
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 6.4 Implement audit logging for permission changes
    - Create audit log entries for: role permission changes, user override changes, custom role creation/deletion
    - Each entry contains: actor user ID, target (role/user), old state, new state, ISO 8601 UTC timestamp
    - `GET /api/v1/audit-logs/permissions` - paginated (max 50/page), filterable by actor, target role, target user, event type, date range
    - Audit logs are append-only (no modify/delete via API)
    - Roll back permission change if audit log write fails (return 500)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 6.5 Add rate limiting to permission admin endpoints
    - Apply rate limit of 100 requests per 15-minute sliding window per authenticated user on all permission management endpoints
    - Return HTTP 429 with error message and Retry-After header when exceeded
    - _Requirements: 13.4, 13.5_

  - [x] 6.6 Write property tests for Permission Admin API
    - **Property 14: Custom Role Lifecycle Safety** - deletion succeeds only with zero assigned users; built-in roles cannot be deleted or modified
    - **Property 15: Role Name Validation** - name accepted iff 2-100 chars and no case-insensitive conflict
    - **Property 16: Permission Matrix Update with Cache Invalidation** - update persists and invalidates cache for all affected users
    - **Property 18: Override Validation** - override accepted iff action is in module's supported actions
    - **Validates: Requirements 7.2, 7.3, 7.5, 7.6, 7.7, 7.8, 8.2, 9.2, 9.3**

  - [x] 6.7 Write unit tests for Permission Admin API
    - Test role CRUD: create, update, delete, list, conflict detection
    - Test permission matrix: get, update, validation, built-in role protection
    - Test user overrides: get, set, clear, validation
    - Test audit logging: entries created, rollback on failure
    - Test rate limiting: 429 response after threshold
    - _Requirements: 7.1-7.11, 8.1-8.7, 9.1-9.6, 12.1-12.6, 13.4, 13.5_

- [x] 7. Checkpoint - Admin API complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Refactor frontend usePermissions hook
  - [x] 8.1 Refactor usePermissions hook to fetch from API
    - Update `src/hooks/usePermissions.ts` to fetch from `/api/v1/permissions/me` on mount
    - Implement localStorage cache with 5-minute TTL keyed by user ID
    - Implement fallback to `DEFAULT_PERMISSIONS` static matrix on network error or 5xx
    - Trigger re-authentication flow on 401/403 (do NOT fall back to static matrix)
    - Expose `isLoading` state (true during initial fetch, false once resolved)
    - Expose `refetch()` method for forced refresh
    - Discard cached permissions if user ID doesn't match current user
    - Admin role returns true for all permission checks regardless of fetched data
    - Add 10-second request timeout
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11_

  - [x] 8.2 Implement stale permissions indicator
    - Display a persistent non-modal visual indicator when permissions API is unavailable and static fallback is in use
    - Indicator visible in application header or permission-dependent area
    - _Requirements: 13.2_

  - [x] 8.3 Write property tests for usePermissions hook
    - **Property 11: Frontend Fallback Correctness** - when API unavailable, permissions match Static_Matrix for user's role
    - **Property 12: Frontend Helper Method Equivalence** - canView(M) equals hasPermission(M, 'View'), etc.
    - **Property 13: Frontend Cache Validity** - cache < 5min old is used without API call
    - **Validates: Requirements 6.2, 6.5, 6.7**

  - [x] 8.4 Write unit tests for usePermissions hook
    - Test API fetch success stores in localStorage
    - Test cache hit avoids API call
    - Test expired cache triggers new fetch
    - Test network error falls back to static matrix
    - Test 401/403 triggers re-auth (no fallback)
    - Test Admin role always returns true
    - Test different user discards stale cache
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11_

- [x] 9. Integration wiring and seeder startup
  - [x] 9.1 Wire Module Registry into application startup
    - Import `src/permissions/modules.ts` at application startup to register all modules
    - Call `seedModules()` after DB connection is established in `server.ts`
    - Log seed results (added/skipped counts)
    - Ensure seeder runs before route registration
    - _Requirements: 2.1, 2.7_

  - [x] 9.2 Register permission admin routes
    - Mount `permissionAdmin` routes in `src/server/routes/index.ts`
    - Apply `authenticate` middleware to all permission admin routes
    - Apply `checkPermission('UserManagement', 'Edit')` or Admin-only guard to admin endpoints
    - _Requirements: 7.1, 8.1, 9.1_

  - [x] 9.3 Update frontend navigation to use ModuleRegistry
    - Refactor sidebar/navigation component to derive menu items from the `/api/v1/permissions/modules` endpoint or registry-based navigation config
    - Filter navigation items based on user's effective permissions (canView)
    - Support bilingual labels from module definitions
    - _Requirements: 1.1, 11.3, 11.4_

  - [x] 9.4 Write integration tests for end-to-end permission flow
    - Test full request flow: authenticate → checkPermission → handler (allowed and denied)
    - Test permission change propagation: admin changes permission → cache invalidated → next request uses new permission
    - Test seeder idempotency on repeated startup
    - Test `/permissions/me` response matches middleware behavior
    - **Property 17: Effective Permissions API Consistency** - `/permissions/me` matches what hasPermission() returns for every module/action
    - **Validates: Requirements 3.1, 5.5, 8.5**

- [x] 10. Final checkpoint - Full integration
  - All permission system tasks implemented. Pre-existing integration tests for fraud, compliance, and correspondence routes need mock updates to work with the new checkPermission middleware (they still mock the old authorize() pattern).

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout; all implementation uses TypeScript
- Testing framework: vitest (unit tests) + fast-check (property-based tests)
- The existing `authorize()` function is deprecated and removed as part of task 4.1
- The existing `src/permissions.ts` static matrix is preserved as the offline fallback but is no longer the primary permission source

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5"] },
    { "id": 3, "tasks": ["2.1", "2.2"] },
    { "id": 4, "tasks": ["2.3", "2.4", "2.5", "2.6"] },
    { "id": 5, "tasks": ["4.1"] },
    { "id": 6, "tasks": ["4.2", "4.3", "4.4", "4.5"] },
    { "id": 7, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 8, "tasks": ["6.4", "6.5", "6.6", "6.7"] },
    { "id": 9, "tasks": ["8.1"] },
    { "id": 10, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 11, "tasks": ["9.1", "9.2", "9.3"] },
    { "id": 12, "tasks": ["9.4"] }
  ]
}
```
