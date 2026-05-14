# Permission Matrix Fix — Bugfix Design

## Overview

The permission system has a fundamental split-brain problem: the frontend reads from a hardcoded static matrix (`DEFAULT_PERMISSIONS`) while the backend stores dynamic permissions in the database. When admins modify permissions via the RolePermissions UI, changes are saved to the DB but never reach the frontend. Additionally, user management routes bypass the `checkPermission()` middleware entirely, using simple role-list checks (`authorize(ADMIN_ROLES)`). This design addresses all 7 defects with minimal, surgical changes that unify the permission system around the database as the single source of truth.

## Glossary

- **Bug_Condition (C)**: Any state where the permission system produces incorrect access decisions — either granting access that should be denied, denying access that should be granted, or allowing destructive self-operations
- **Property (P)**: The desired behavior — permissions are resolved from the database, access decisions respect the permission matrix, and destructive self-operations are blocked
- **Preservation**: Existing behaviors that must remain unchanged — Admin bypass, session validation, audit logging, cache invalidation, UI rendering
- **`usePermissions`**: Frontend hook in `src/hooks/usePermissions.ts` that resolves whether a user can perform an action on a module
- **`checkPermission()`**: Backend middleware in `src/server/middleware/auth.ts` that queries the DB for permission checks
- **`authorize()`**: Backend middleware that checks if `req.user.role` is in a static role list
- **`DEFAULT_PERMISSIONS`**: Static permission matrix in `src/permissions.ts` used as fallback
- **`ADMIN_ROLES`**: Array `['Admin', 'Administrator', 'Manager']` in `src/constants.ts`
- **`ModuleName`**: Backend enum in `constants.ts` with values: Audit, Finding, Risk, Recommendation, Correspondence, User, Setting
- **`MODULES`**: Frontend constant in `permissions.ts` with values: Dashboard, AuditPlans, AuditReports, etc.

## Bug Details

### Bug Condition

The bug manifests across 7 related defects that share a common root: the permission system has two parallel, disconnected implementations. The frontend always reads from a static object, the backend uses role-list checks instead of permission checks for user management, role definitions are inconsistent, the DB join uses a fragile string match, module names don't align, and there are no safety guards for self-destructive admin operations.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type PermissionCheckRequest { userId, module, action, targetUserId? }
  OUTPUT: boolean
  
  RETURN (
    // Defect 1: Frontend reads static matrix instead of DB
    (input.source == 'frontend' AND input.userRole != 'Admin'
      AND dbPermissions(input.userId, input.module, input.action) != staticPermissions(input.userRole, input.module, input.action))
    
    OR
    // Defect 2: Backend user routes use authorize() instead of checkPermission()
    (input.module == 'User' AND input.source == 'backend'
      AND input.userRole IN ADMIN_ROLES AND input.userRole != 'Admin'
      AND NOT hasDbPermission(input.userId, 'User', input.action))
    
    OR
    // Defect 3: Role not found in static matrix
    (input.userRole IN ['Administrator', 'Auditor', 'User', 'Compliance']
      AND input.source == 'frontend')
    
    OR
    // Defect 4: checkPermission() join fails due to role name mismatch
    (input.source == 'backend' AND users[input.userId].role != roles[users[input.userId].role_id].name)
    
    OR
    // Defect 5: Module name mismatch between frontend and backend
    (input.module IN frontendModules AND input.module NOT IN backendModules)
    
    OR
    // Defect 6: Self-deletion/suspension
    (input.targetUserId == input.userId AND input.action IN ['Delete', 'Suspend'])
    
    OR
    // Defect 7: Last admin removal
    (input.action IN ['Delete', 'Suspend', 'Archive'] AND isLastAdmin(input.targetUserId))
  )
END FUNCTION
```

### Examples

- **Defect 1**: Admin grants "Internal Auditor" the Create permission on UserManagement via UI → saved to DB → frontend `usePermissions` still returns `false` because it reads `DEFAULT_PERMISSIONS` which has `[]` for UserManagement
- **Defect 2**: User with role "Manager" calls `DELETE /api/users/:id` → `authorize(ADMIN_ROLES)` passes because Manager is in the list → user is deleted even though Manager has no Delete permission on User module
- **Defect 3**: User with role "Administrator" (from `UserRole` enum) logs in → `usePermissions` looks up `DEFAULT_PERMISSIONS['Administrator']` → returns `undefined` → all permissions denied
- **Defect 4**: DB has role name "Internal Auditor" but user's `role` text field says "Auditor" → `JOIN roles r ... JOIN users u ON r.name = u.role` returns no rows → permission denied incorrectly
- **Defect 5**: Backend `checkPermission('User', 'Delete')` checks module "User" but frontend checks module "UserManagement" → admin configures "User" in DB but frontend enforces "UserManagement"
- **Defect 6**: Admin with ID `abc` calls `POST /api/users/abc/suspend` → no self-check → admin is suspended → cannot log back in
- **Defect 7**: Only one Admin exists → that admin calls `DELETE /api/users/{self}` or another admin deletes them → system has zero admins → locked out

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Admin role bypass: users with role "Admin" continue to have full access without individual permission checks (both frontend and backend)
- RolePermissions UI continues to display all roles with their permissions and allows toggling
- `authenticate` middleware continues to verify JWT tokens, check user status, and enforce password change requirements
- `clearPermissionCache()` continues to be called after role permission changes
- Non-admin users without proper permissions continue to receive 403 Forbidden
- Audit trail logging and n8n automation events continue to fire on user CRUD operations
- `useUserManagement` hook continues to provide paginated data through existing API endpoints
- The existing `authorize()` middleware function remains available for other routes that legitimately use role-list checks

**Scope:**
All inputs that do NOT involve the 7 defect conditions should be completely unaffected by this fix. This includes:
- Admin users performing any operation (bypass unchanged)
- Non-user-management routes that use `checkPermission()` correctly
- Authentication flow (login, logout, refresh, session validation)
- All CRUD operations on audits, findings, risks, recommendations, correspondence
- Frontend rendering of non-permission-gated UI elements

## Hypothesized Root Cause

Based on the bug analysis, the root causes are:

1. **Architectural Split-Brain (Defects 1, 5)**: The system was built with two parallel permission systems that were never unified. The frontend `permissions.ts` was the original system; the backend DB permissions were added later without updating the frontend to consume them. Module names diverged because they were defined independently.

2. **Expedient Role-List Authorization (Defect 2)**: The user management routes were written using `authorize(ADMIN_ROLES)` as a quick shortcut, likely before `checkPermission()` existed or was mature. This was never migrated.

3. **Organic Role Growth (Defects 3, 4)**: Roles were added to `constants.ts` (`UserRole` enum) and the DB without updating `permissions.ts`. The `checkPermission()` middleware was written to join on `r.name = u.role` (the text field) instead of the proper `role_id` FK, likely because `role_id` was added to the users table after the middleware was written.

4. **Missing Safety Guards (Defects 6, 7)**: Standard admin safety patterns (self-protection, last-admin guard) were never implemented — likely an oversight during initial development.

## Correctness Properties

Property 1: Bug Condition - Frontend Permission Resolution from DB

_For any_ user where the role is not "Admin" and the user has DB-stored permissions that differ from `DEFAULT_PERMISSIONS`, the fixed `usePermissions` hook SHALL resolve permissions from the API/database, returning the correct DB-stored permission state rather than the static default.

**Validates: Requirements 2.1, 2.3**

Property 2: Bug Condition - Backend User Route Permission Enforcement

_For any_ request to a user management route (create, update, delete, suspend, archive, unlock, reset-password) where the requesting user's role is in `ADMIN_ROLES` but does NOT have the corresponding DB permission for module "User" and the specified action, the fixed route SHALL reject the request with 403 Forbidden.

**Validates: Requirements 2.2, 2.4**

Property 3: Bug Condition - Self-Protection Guard

_For any_ request where `req.user.id == req.params.id` and the action is delete, suspend, or archive, the fixed route SHALL reject the operation with an appropriate error message.

**Validates: Requirements 2.6**

Property 4: Bug Condition - Last Admin Guard

_For any_ request that would result in zero remaining active Admin users (delete, suspend, or archive of the last Admin), the fixed route SHALL reject the operation with an appropriate error message.

**Validates: Requirements 2.7**

Property 5: Preservation - Admin Bypass Unchanged

_For any_ user with role "Admin", the fixed system SHALL continue to grant full access to all modules and actions without consulting the permission database, preserving the existing Admin bypass behavior in both frontend and backend.

**Validates: Requirements 3.1, 3.5**

Property 6: Preservation - Existing Non-User-Management Behavior

_For any_ request to non-user-management routes, and for any frontend permission check on modules other than UserManagement, the fixed system SHALL produce the same access decisions as the original system when the DB permissions match the static defaults.

**Validates: Requirements 3.2, 3.3, 3.4, 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/hooks/usePermissions.ts`

**Change 1: Read permissions from user context (DB-sourced) with static fallback**

- Modify `usePermissions` to read from `user.permissions` (populated from the API response) instead of `DEFAULT_PERMISSIONS`
- Keep `DEFAULT_PERMISSIONS` as fallback when `user.permissions` is not yet loaded (initial load, API failure)
- The `user` object already gets permissions from `UserService.getUserById()` which queries the DB

**Specific Changes**:
1. Check if `user.permissions` array exists (already returned by the `/api/auth/session` or login response)
2. If yes, check if the requested `(module, action)` pair exists in that array
3. If `user.permissions` is not available, fall back to `DEFAULT_PERMISSIONS` lookup
4. Admin bypass remains first (unchanged)

---

**File**: `src/server/routes/users.ts`

**Change 2: Replace `authorize(ADMIN_ROLES)` with `checkPermission('User', action)`**

- Replace `authorize(ADMIN_ROLES)` on each route with the appropriate `checkPermission()` call
- Map routes to permission actions:
  - `GET /init`, `GET /`, `GET /summary`, `GET /:id` → `checkPermission('User', 'View')`
  - `POST /` → `checkPermission('User', 'Create')`
  - `PUT /:id` → `checkPermission('User', 'Edit')`
  - `DELETE /:id` → `checkPermission('User', 'Delete')`
  - `POST /:id/suspend`, `POST /:id/archive`, `POST /:id/activate` → `checkPermission('User', 'Edit')`
  - `POST /:id/unlock`, `POST /:id/reset-password` → `checkPermission('User', 'Edit')`
- Accept `checkPermission` as a parameter in `createUserRoutes` (it's already available in `routes/index.ts`)

**Change 3: Add self-protection guard**

- Before delete, suspend, and archive operations, check if `req.user.id === req.params.id`
- If true, return 403 with message "Cannot perform this action on your own account"

**Change 4: Add last-admin guard**

- Before delete, suspend, and archive operations on a user with role "Admin":
  - Query `SELECT COUNT(*) FROM users WHERE role = 'Admin' AND status = 'Active' AND id != ?`
  - If count is 0, return 403 with message "Cannot remove the last admin user"

---

**File**: `src/server/middleware/auth.ts`

**Change 5: Fix `checkPermission()` JOIN to use `role_id` FK**

- Change the query from:
  ```sql
  JOIN roles r ON rp.role_id = r.id
  JOIN users u ON r.name = u.role
  WHERE u.id = ?
  ```
  To:
  ```sql
  JOIN users u ON rp.role_id = u.role_id
  WHERE u.id = ?
  ```
- This uses the proper FK relationship and eliminates the string-match fragility

---

**File**: `src/constants.ts`

**Change 6: Align `ModuleName` enum with frontend `MODULES`**

- Decision: Rename the backend `ModuleName` enum values to match what the DB `permissions` table actually stores. The DB modules (Audit, Finding, Risk, etc.) are the source of truth since they're in the `permissions` table.
- Update the frontend `MODULES` constant to include a mapping that bridges frontend module names to DB module names for permission checks
- Alternative (chosen): Add a `PERMISSION_MODULE_MAP` that maps frontend module identifiers to DB module names:
  ```typescript
  export const PERMISSION_MODULE_MAP: Record<string, string> = {
    'UserManagement': 'User',
    'Settings': 'Setting',
    'AuditPlans': 'Audit',
    'AuditReports': 'Audit',
    'AuditCharter': 'Audit',
    'AuditTasks': 'Audit',
    'AuditProgramLibrary': 'Audit',
    'RiskRegister': 'Risk',
    'Dashboard': 'Audit', // Dashboard is view-only, maps to Audit View
    // ... etc
  };
  ```
- The `usePermissions` hook will use this map when checking DB permissions

---

**File**: `src/types.ts`

**Change 7: Add `permissions` to User interface**

- Add `permissions?: Array<{ module: string; action: string }>` to the `User` interface
- This allows the frontend to carry DB permissions on the user object

---

**File**: `src/context/AuthContext.tsx` (or wherever session/login response is handled)

**Change 8: Ensure permissions are included in user session data**

- The login/session endpoint should return the user's permissions array
- `UserService.getUserById()` already queries permissions — ensure this data flows to the frontend user object

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that exercise each defect scenario against the unfixed code to observe failures and confirm root causes.

**Test Cases**:
1. **Static Matrix Test**: Mock a user with DB permissions different from `DEFAULT_PERMISSIONS`, call `usePermissions().hasPermission()` → will return static value, not DB value (confirms Defect 1)
2. **Authorize Bypass Test**: Send a request as "Manager" to `DELETE /api/users/:id` → will succeed even without DB Delete permission on User module (confirms Defect 2)
3. **Unknown Role Test**: Create a user with role "Administrator", call `usePermissions()` → will return false for all modules (confirms Defect 3)
4. **String Join Test**: Set user's `role` text to "Auditor" but `role_id` points to role named "Internal Auditor" → `checkPermission()` will fail (confirms Defect 4)
5. **Module Mismatch Test**: Call `checkPermission('UserManagement', 'View')` → will fail because DB has module "User" not "UserManagement" (confirms Defect 5)
6. **Self-Delete Test**: Admin calls `DELETE /api/users/{own-id}` → will succeed (confirms Defect 6)
7. **Last Admin Test**: With only one Admin, call `DELETE /api/users/{admin-id}` → will succeed (confirms Defect 7)

**Expected Counterexamples**:
- Frontend permission checks return incorrect results for non-Admin users with modified DB permissions
- Manager can delete users despite having no Delete permission in the matrix
- Users with roles not in `DEFAULT_PERMISSIONS` get no access at all
- Possible causes confirmed: static reads, role-list auth, missing FK join, no safety guards

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := permissionSystem_fixed(input)
  ASSERT expectedBehavior(result)
  // Specifically:
  // - Frontend returns DB permission state
  // - Backend rejects unauthorized user-management requests
  // - Self-operations are blocked
  // - Last-admin operations are blocked
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT permissionSystem_original(input) = permissionSystem_fixed(input)
  // Specifically:
  // - Admin bypass still works
  // - Non-user-management routes unchanged
  // - Auth flow unchanged
  // - Audit logging unchanged
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (random roles, modules, actions)
- It catches edge cases that manual unit tests might miss (unusual role/module combinations)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for Admin users and non-user-management routes, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Admin Bypass Preservation**: Verify Admin users can still perform all operations without permission checks after the fix
2. **Auth Flow Preservation**: Verify login, logout, token refresh, session validation work identically
3. **Audit Logging Preservation**: Verify user CRUD operations still log audit trail entries
4. **Cache Invalidation Preservation**: Verify `clearPermissionCache()` is still called after role permission updates
5. **Non-User Routes Preservation**: Verify audit, finding, risk, correspondence routes continue working with existing `checkPermission()` calls

### Unit Tests

- Test `usePermissions` returns DB permissions when available
- Test `usePermissions` falls back to `DEFAULT_PERMISSIONS` when DB permissions unavailable
- Test `checkPermission()` with `role_id` FK join resolves correctly
- Test self-protection guard blocks self-delete/suspend/archive
- Test last-admin guard blocks removal of final admin
- Test `PERMISSION_MODULE_MAP` correctly maps frontend modules to DB modules
- Test that "Administrator" role resolves permissions via DB (not static matrix)

### Property-Based Tests

- Generate random `(role, module, action)` tuples and verify:
  - For Admin: always returns true (preservation)
  - For non-Admin with DB permissions: returns DB state (fix)
  - For non-Admin without DB permissions: falls back to static (preservation)
- Generate random user IDs and verify self-protection:
  - When `userId == targetId` and action is destructive: blocked
  - When `userId != targetId`: unchanged behavior
- Generate random admin counts and verify last-admin guard:
  - When admin count > 1: operations proceed normally
  - When admin count == 1 and target is that admin: blocked

### Integration Tests

- Test full flow: Admin modifies permissions in RolePermissions UI → saves → affected user's frontend reflects new permissions
- Test full flow: Manager attempts user deletion → rejected by `checkPermission('User', 'Delete')`
- Test full flow: Admin tries to suspend self → rejected with clear error message
- Test full flow: Last admin deletion attempt → rejected with clear error message
- Test full flow: User with "Administrator" role logs in → permissions resolved from DB via `role_id` join
