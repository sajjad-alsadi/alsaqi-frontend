# Requirements Document

## Introduction

This document defines the requirements for overhauling the permission system in the audit/compliance management application. The current system suffers from fragmentation: a static matrix controls the frontend while the backend uses two competing authorization mechanisms, module names are mismatched, and adding a new module requires editing 4-5 files. This overhaul introduces a Module Registry as the single source of truth, unifies authorization under a single `checkPermission()` middleware, auto-seeds modules to the database, refactors the frontend to fetch permissions from the API, and adds custom role management with full CRUD support.

## Glossary

- **Module_Registry**: A centralized, in-memory registry that stores all permission module definitions and serves as the single source of truth for permission metadata across the application.
- **Module_Definition**: A declarative object describing a permission module including its name, bilingual labels, supported actions, default role assignments, and optional navigation/file-scope configuration.
- **Permission_Action**: One of the five supported actions a module can authorize: View, Create, Edit, Delete, or Approve.
- **Permission_Service**: The backend service responsible for querying, caching, and mutating permission data in the database.
- **CheckPermission_Middleware**: The unified Express middleware that enforces authorization on all protected routes by querying the Permission_Service.
- **UsePermissions_Hook**: The React hook that provides permission checks to frontend components by fetching from the API with static fallback.
- **Permission_Cache**: An in-memory LRU cache on the backend that stores permission check results with a configurable TTL.
- **Auto_Seeder**: The startup process that synchronizes Module_Registry definitions into the database, creating missing permission records and default role assignments.
- **Custom_Role**: A user-created role (as opposed to the 6 built-in roles) that starts with no permissions and can be configured via the admin API.
- **User_Override**: A per-user permission grant or denial that takes precedence over the user's role-level permissions.
- **Static_Matrix**: The hardcoded DEFAULT_PERMISSIONS object used as an offline fallback when the permissions API is unavailable.
- **Built_In_Role**: One of the 6 predefined system roles (Admin, Manager, Internal Auditor, Compliance Officer, Risk Officer, Viewer).
- **Permission_Admin_API**: The set of REST endpoints for managing roles, permissions, and user overrides.

## Requirements

### Requirement 1: Module Registry as Single Source of Truth

**User Story:** As a developer, I want a single registry file where I define all permission modules, so that adding a new module requires editing only one place.

#### Acceptance Criteria

1. THE Module_Registry SHALL store all module definitions including name, bilingual labels (each between 1 and 100 characters), supported actions, default role assignments, navigation configuration (icon, path, order, and optional parent), and file-scope flag.
2. WHEN a module is registered, THE Module_Registry SHALL validate that the module name is unique, matches the pattern `^[A-Z][a-zA-Z0-9]*$` (PascalCase), and is between 1 and 50 characters.
3. IF a module is registered with an empty actions array, THEN THE Module_Registry SHALL reject the registration with an error indicating the module name and that at least one action is required.
4. IF a module is registered with actions not in the set (View, Create, Edit, Delete, Approve), THEN THE Module_Registry SHALL reject the registration with an error indicating the module name and the invalid action values.
5. IF a duplicate module name is registered, THEN THE Module_Registry SHALL reject the registration with an error indicating the module name already exists.
6. THE Module_Registry SHALL provide retrieval methods for all modules, a single module by name (returning undefined if not found), all module names, default permissions by role (returning an empty object for unknown roles), and navigation configuration.
7. IF default permissions reference a role name not defined in the system, THEN THE Module_Registry SHALL reject the registration with an error indicating the invalid role name.
8. IF a module is registered with a navigation path that does not start with `/`, THEN THE Module_Registry SHALL reject the registration with an error indicating the invalid path.

### Requirement 2: Database Auto-Seeding

**User Story:** As a developer, I want new modules to be automatically available in the database upon registration, so that I do not need to write manual migration scripts for each new module.

#### Acceptance Criteria

1. WHEN the application starts, THE Auto_Seeder SHALL compare Module_Registry definitions against existing database permission records by querying all (module, action) pairs from the permissions table.
2. WHEN a module-action pair exists in the Module_Registry but not in the database, THE Auto_Seeder SHALL insert the missing permission record into the permissions table.
3. WHEN a new permission record is inserted, THE Auto_Seeder SHALL create default role_permissions entries based on the module's defaults configuration for each role that has the action in its defaults array.
4. WHEN a module-action pair already exists in the database, THE Auto_Seeder SHALL skip it without modification.
5. WHEN the Auto_Seeder runs multiple times, THE Auto_Seeder SHALL produce the same database state as running it once (idempotent operation).
6. THE Auto_Seeder SHALL return a result indicating the count of added and skipped permission records.
7. IF the database connection fails during seeding, THEN THE Auto_Seeder SHALL log the error and allow the application to start with a warning that permissions may be incomplete.
8. IF a role referenced in a module's defaults configuration does not exist in the roles table, THEN THE Auto_Seeder SHALL skip the role_permissions entry for that role and log a warning.

### Requirement 3: Unified checkPermission Middleware

**User Story:** As a developer, I want a single authorization middleware that replaces both `authorize()` and the old `checkPermission()`, so that all routes use a consistent, DB-backed permission model.

#### Acceptance Criteria

1. WHEN a request reaches a protected route, THE CheckPermission_Middleware SHALL verify the user's permission for the module and action specified as arguments to the middleware factory function, by calling Permission_Service.hasPermission(userId, module, action).
2. WHEN the authenticated user has the Admin role, THE CheckPermission_Middleware SHALL call next() to proceed without querying the Permission_Service.
3. WHEN the user has the required permission (granted via role_permissions or via a user-level override with is_allowed=true), THE CheckPermission_Middleware SHALL call next() to proceed to the route handler.
4. IF the user lacks the required permission, THEN THE CheckPermission_Middleware SHALL return HTTP 403 with a JSON body containing an error message indicating the missing permission, code "PERMISSION_DENIED", the module name, and the action name.
5. IF the CheckPermission_Middleware is called with a module name not registered in the Module_Registry, THEN THE CheckPermission_Middleware SHALL throw an error at application startup during route registration in development mode, and SHALL return HTTP 500 in production mode.
6. IF req.user is not populated when the CheckPermission_Middleware executes (authenticate() middleware was not called or failed), THEN THE CheckPermission_Middleware SHALL return HTTP 401 with a JSON body containing an error message indicating missing authentication.
7. IF the Permission_Service throws an error during the permission check (e.g., database unavailable), THEN THE CheckPermission_Middleware SHALL return HTTP 500 with a JSON body containing an error message indicating an internal authorization failure, without exposing internal details.
8. THE CheckPermission_Middleware SHALL require that the authenticate() middleware has already populated req.user before execution.

### Requirement 4: Permission Resolution Logic

**User Story:** As a system administrator, I want permission checks to consider both role-level and user-level permissions with clear precedence rules, so that I can grant or deny specific permissions to individual users.

#### Acceptance Criteria

1. WHEN checking a user's permission for a given module and action, THE Permission_Service SHALL evaluate the user_permissions table for a user-level override first, then fall back to the role_permissions table, and return a single boolean result indicating whether access is granted.
2. WHEN a user has a user-level override with is_allowed=true for a module and action, THE Permission_Service SHALL grant the permission regardless of the role-level setting for that same module and action.
3. WHEN a user has a user-level override with is_allowed=false for a module and action, THE Permission_Service SHALL deny the permission regardless of the role-level setting for that same module and action.
4. WHEN no user-level override exists for the requested module and action, THE Permission_Service SHALL use the role-level permission as the effective permission, returning true if a matching role_permissions record exists and false otherwise.
5. IF the user has the Admin role, THEN THE Permission_Service SHALL return true for all permission checks regardless of role_permissions or user_permissions table contents.
6. IF the requested module or action is not registered in the ModuleRegistry, THEN THE Permission_Service SHALL deny the permission and return false.
7. IF the user has no role assigned and no user-level override exists for the requested module and action, THEN THE Permission_Service SHALL deny the permission and return false.

### Requirement 5: Permission Caching

**User Story:** As a system architect, I want permission check results to be cached, so that repeated permission checks do not cause excessive database queries.

#### Acceptance Criteria

1. WHEN a permission check is performed, THE Permission_Cache SHALL store the result with key format `perm_{userId}_{module}_{action}` and a TTL of 5 minutes.
2. WHEN a cached result exists and has not expired, THE Permission_Service SHALL return the cached result without querying the database.
3. WHEN invalidateCache is called with a userId, THE Permission_Cache SHALL remove all cache entries matching the prefix `perm_{userId}_` for that specific user.
4. WHEN invalidateCache is called without a userId, THE Permission_Cache SHALL remove all permission cache entries matching the prefix `perm_`.
5. WHEN a permission mutation occurs (role permission change or user override change), THE Permission_Service SHALL call invalidateCache for all affected users before returning the mutation response, where affected users are all users currently assigned to the modified role (for role changes) or the specific user (for override changes).
6. THE Permission_Cache SHALL enforce a maximum of 1000 entries with LRU eviction.
7. IF a cache read or write operation fails, THEN THE Permission_Service SHALL fall back to querying the database directly and continue processing the permission check without interruption.

### Requirement 6: Frontend usePermissions Hook

**User Story:** As a frontend developer, I want a React hook that fetches permissions from the API with caching and offline fallback, so that the UI accurately reflects the user's effective permissions.

#### Acceptance Criteria

1. WHEN the hook initializes, THE UsePermissions_Hook SHALL check localStorage for cached permissions keyed by the authenticated user's ID with a valid timestamp (less than 5 minutes old).
2. WHEN a valid cache exists in localStorage for the current user, THE UsePermissions_Hook SHALL use the cached permissions without making an API call.
3. WHEN no valid cache exists, THE UsePermissions_Hook SHALL fetch permissions from the `/api/v1/permissions/me` endpoint with a request timeout of 10 seconds.
4. WHEN the API call succeeds with HTTP 200, THE UsePermissions_Hook SHALL store the response in localStorage keyed by the authenticated user's ID with the current timestamp.
5. WHEN the API call fails due to a network error, request timeout, or HTTP 5xx response, THE UsePermissions_Hook SHALL fall back to the Static_Matrix for the user's role and retain the previous permissions state if available.
6. IF the API call returns HTTP 401 or HTTP 403, THEN THE UsePermissions_Hook SHALL not fall back to the Static_Matrix and SHALL trigger the application's re-authentication flow.
7. THE UsePermissions_Hook SHALL expose an isLoading state that is true during the initial fetch and false once permissions are resolved from cache, API response, or Static_Matrix fallback.
8. THE UsePermissions_Hook SHALL provide helper methods: hasPermission(module, action), canView(module), canCreate(module), canEdit(module), canDelete(module), and canApprove(module), each returning false when the specified module is not found in the permissions data.
9. WHEN the user has the Admin role, THE UsePermissions_Hook SHALL return true for all permission checks regardless of the fetched data.
10. THE UsePermissions_Hook SHALL expose a refetch() method that forces a fresh API call, updates the cache on success, and retains the current permissions state on failure.
11. WHEN a different user authenticates on the same browser, THE UsePermissions_Hook SHALL discard any cached permissions that do not match the current user's ID before initialization.

### Requirement 7: Permission Admin API - Role Management

**User Story:** As a system administrator, I want to create, update, and delete custom roles with configurable permissions, so that I can define access levels beyond the 6 built-in roles.

#### Acceptance Criteria

1. WHEN a POST request is made to `/api/v1/roles` with a valid name (2-100 characters) and description (0-500 characters), THE Permission_Admin_API SHALL create a new Custom_Role with isCustom=true and no default permissions.
2. WHEN a custom role name conflicts with an existing role name (case-insensitive), THE Permission_Admin_API SHALL return HTTP 409 Conflict.
3. WHEN a custom role name is shorter than 2 characters or longer than 100 characters, THE Permission_Admin_API SHALL return HTTP 400 with a validation error.
4. WHEN a PUT request is made to `/api/v1/roles/:id` for a custom role with a valid name and description, THE Permission_Admin_API SHALL update the role's name and description, applying the same name uniqueness and length constraints as creation.
5. WHEN a PUT request is made to `/api/v1/roles/:id` for a built-in role, THE Permission_Admin_API SHALL return HTTP 403 indicating built-in roles cannot be modified.
6. WHEN a DELETE request is made to `/api/v1/roles/:id` for a custom role with no assigned users, THE Permission_Admin_API SHALL delete the role and its associated role_permissions.
7. WHEN a DELETE request is made to `/api/v1/roles/:id` for a custom role with assigned users, THE Permission_Admin_API SHALL return HTTP 409 Conflict with the list of affected user IDs (maximum 100 entries).
8. WHEN a DELETE request is made to `/api/v1/roles/:id` for a built-in role, THE Permission_Admin_API SHALL return HTTP 403 indicating built-in roles cannot be deleted.
9. WHEN a GET request is made to `/api/v1/roles`, THE Permission_Admin_API SHALL return all roles (built-in and custom) including each role's id, name, description, isCustom flag, and creation timestamp.
10. IF a request references a role ID that does not exist, THEN THE Permission_Admin_API SHALL return HTTP 404 indicating the role was not found.
11. WHEN a role description exceeds 500 characters, THE Permission_Admin_API SHALL return HTTP 400 with a validation error.

### Requirement 8: Permission Admin API - Permission Matrix

**User Story:** As a system administrator, I want to view and edit the permission matrix for any role, so that I can control exactly which modules and actions each role can access.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/v1/roles/:id/permissions` with a valid role ID, THE Permission_Admin_API SHALL return the complete permission matrix for that role containing every module registered in the Module_Registry with a boolean grant status for each of its supported actions.
2. WHEN a PUT request is made to `/api/v1/roles/:id/permissions` for a custom role with a valid permission matrix payload, THE Permission_Admin_API SHALL update the role's permission matrix and invalidate the cache for all users with that role.
3. WHEN a PUT request is made to `/api/v1/roles/:id/permissions` for any Built_In_Role, THE Permission_Admin_API SHALL return HTTP 403 indicating built-in role permissions cannot be modified.
4. WHEN a GET request is made to `/api/v1/permissions/modules`, THE Permission_Admin_API SHALL return all registered modules with their metadata (name, labels, supported actions).
5. WHEN a GET request is made to `/api/v1/permissions/me`, THE Permission_Admin_API SHALL return the authenticated user's effective permissions including role, isCustomRole flag, permissions map, and overrides.
6. IF a GET or PUT request to `/api/v1/roles/:id/permissions` references a role ID that does not exist in the database, THEN THE Permission_Admin_API SHALL return HTTP 404 with an error message indicating the role was not found.
7. IF a PUT request to `/api/v1/roles/:id/permissions` contains a module name not registered in the Module_Registry or an action not in the module's supported actions, THEN THE Permission_Admin_API SHALL return HTTP 400 with a validation error identifying the invalid module or action.

### Requirement 9: User-Level Permission Overrides

**User Story:** As a system administrator, I want to grant or deny specific permissions to individual users beyond their role, so that I can handle exceptional access requirements without creating new roles.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/v1/users/:id/permissions`, THE Permission_Admin_API SHALL return the user's permission overrides as a list of objects each containing the module name, action, and is_allowed flag.
2. WHEN a PUT request is made to `/api/v1/users/:id/permissions` with an array of override objects (each specifying module, action, and is_allowed), THE Permission_Admin_API SHALL replace all existing overrides for that user with the provided set and invalidate the cache for that user.
3. WHEN an override references an action not supported by the target module, THE Permission_Admin_API SHALL return HTTP 400 with a validation error indicating the unsupported module-action combination.
4. IF the user ID in the request path does not correspond to an existing user, THEN THE Permission_Admin_API SHALL return HTTP 404 with an error indicating the user was not found.
5. WHEN an override references a module name not registered in the Module_Registry, THE Permission_Admin_API SHALL return HTTP 400 with a validation error indicating the unrecognized module.
6. WHEN a PUT request provides an empty overrides array, THE Permission_Admin_API SHALL remove all existing overrides for that user and invalidate the cache for that user.

### Requirement 10: File-Level Permission Scoping

**User Story:** As a system architect, I want file access permissions to be scoped to the module that owns the file, so that users can only access files belonging to modules they have permission to view.

#### Acceptance Criteria

1. WHEN a file access request is made, THE CheckPermission_Middleware SHALL read the module field from the file record to determine the owning module.
2. WHEN the owning module is determined, THE CheckPermission_Middleware SHALL check the user's View permission for that specific module and return HTTP 403 with code "PERMISSION_DENIED" if the user lacks View permission.
3. IF the file record has no module field or the module field is empty, THEN THE CheckPermission_Middleware SHALL deny access and return HTTP 403 with code "PERMISSION_DENIED".
4. IF the file record's module field references a module not registered in the Module_Registry, THEN THE CheckPermission_Middleware SHALL deny access and return HTTP 403 with code "PERMISSION_DENIED".
5. WHEN a Module_Definition has fileScope set to true, THE Module_Registry SHALL include that module in the list returned by a file-scope query method, enabling files to be tagged with that module for permission scoping.
6. IF a file is tagged with a module whose fileScope is set to false, THEN THE CheckPermission_Middleware SHALL deny access and return HTTP 403 with code "PERMISSION_DENIED".

### Requirement 11: Bilingual Label Support

**User Story:** As a user of the bilingual (English/Arabic) application, I want permission module labels to be available in both languages, so that the UI displays correctly in my preferred language.

#### Acceptance Criteria

1. THE Module_Definition SHALL include a label object with both `en` (English) and `ar` (Arabic) string properties, each between 1 and 100 characters in length.
2. WHEN a module is registered with a missing or empty label for either language, THE Module_Registry SHALL reject the registration with a descriptive error indicating which language label is missing.
3. WHEN the `/api/v1/permissions/modules` endpoint returns module metadata, THE Permission_Admin_API SHALL include both English and Arabic labels for each module in the response.
4. WHEN the navigation configuration is generated from the Module_Registry, THE Module_Registry SHALL provide bilingual labels for sidebar items.

### Requirement 12: Audit Logging for Permission Changes

**User Story:** As a compliance officer, I want all permission changes to be logged, so that I can audit who changed what permissions and when.

#### Acceptance Criteria

1. WHEN a role's permissions are modified, THE Permission_Admin_API SHALL create an audit log entry containing the actor's user ID, target role ID, the previous permission matrix, the new permission matrix, and an ISO 8601 UTC timestamp.
2. WHEN a user-level override is created, modified, or deleted, THE Permission_Admin_API SHALL create an audit log entry containing the actor's user ID, target user ID, module name, action name, old value (null if newly created), new value (null if deleted), and an ISO 8601 UTC timestamp.
3. WHEN a custom role is created or deleted, THE Permission_Admin_API SHALL create an audit log entry containing the actor's user ID, event type (created or deleted), role name, role description, and an ISO 8601 UTC timestamp.
4. WHEN a GET request is made to `/api/v1/audit-logs/permissions`, THE Permission_Admin_API SHALL return audit log entries filtered by optional query parameters: actor user ID, target role ID, target user ID, event type, and date range, with results paginated at a maximum of 50 entries per page.
5. THE Permission_Admin_API SHALL persist audit log entries as append-only records that cannot be modified or deleted through the API.
6. WHEN a permission change operation succeeds but the audit log write fails, THE Permission_Admin_API SHALL roll back the permission change and return HTTP 500 with an error message indicating the operation could not be completed.

### Requirement 13: Error Handling and Security

**User Story:** As a security engineer, I want the permission system to fail securely and provide clear error responses, so that unauthorized access is prevented and issues are diagnosable.

#### Acceptance Criteria

1. WHEN a permission check fails, THE CheckPermission_Middleware SHALL return HTTP 403 with a JSON body containing an error message, code "PERMISSION_DENIED", the module name, and the action name.
2. IF the permissions API is unavailable, THEN THE UsePermissions_Hook SHALL use the Static_Matrix fallback and display a persistent non-modal visual indicator (visible in the application header or permission-dependent area) stating that permissions may be stale.
3. WHEN an admin attempts to delete a role with assigned users, THE Permission_Admin_API SHALL return HTTP 409 with a JSON body containing the list of affected user IDs (maximum 100 IDs; if more exist, include a total count).
4. THE Permission_Admin_API SHALL enforce rate limiting of 100 requests per 15-minute sliding window per authenticated user on all permission management endpoints.
5. IF a user exceeds the rate limit on a permission management endpoint, THEN THE Permission_Admin_API SHALL return HTTP 429 with a JSON body containing an error message indicating rate limit exceeded and a Retry-After header specifying the number of seconds until the window resets.
6. WHEN a request arrives at a protected route, THE CheckPermission_Middleware SHALL enforce authorization regardless of any frontend permission state, denying access if the backend permission check fails even if the frontend permitted the action.
