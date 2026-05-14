# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Permission Matrix Split-Brain and Missing Guards
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the 7 defects exist
  - **Scoped PBT Approach**: Scope the property to concrete failing cases for each defect:
    - Defect 1: Mock user with DB permissions `[{module:'User', action:'View'}]` but role "Internal Auditor" → `usePermissions().hasPermission('UserManagement', 'View')` returns `false` (reads static `DEFAULT_PERMISSIONS` which has `[]` for UserManagement)
    - Defect 2: Request as "Manager" to `DELETE /api/users/:id` → succeeds (authorize(ADMIN_ROLES) passes) even without DB Delete permission on User module
    - Defect 3: User with role "Administrator" → `usePermissions()` returns `false` for all modules (role not in `DEFAULT_PERMISSIONS`)
    - Defect 4: User with `role_id` pointing to "Internal Auditor" but `role` text field = "Auditor" → `checkPermission()` fails (string JOIN mismatch)
    - Defect 5: `checkPermission('UserManagement', 'View')` fails because DB has module "User" not "UserManagement"
    - Defect 6: Admin calls `POST /api/users/{own-id}/suspend` → succeeds (no self-protection)
    - Defect 7: Last admin calls `DELETE /api/users/{admin-id}` → succeeds (no last-admin guard)
  - Test file: `src/server/routes/__tests__/users.permission-bug.test.ts`
  - Test assertions should match Expected Behavior Properties from design (DB permissions respected, unauthorized rejected with 403, self-ops blocked, last-admin blocked)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Admin Bypass, Auth Flow, and Audit Logging Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Observe: Admin user can access all user management routes (GET, POST, PUT, DELETE) → returns 200
    - Observe: Admin user with role "Admin" bypasses `checkPermission()` → always allowed
    - Observe: Unauthenticated request → returns 401
    - Observe: User with status "Suspended" → returns 403
    - Observe: Non-admin user without any ADMIN_ROLES role → returns 403 on user routes
    - Observe: Audit trail entries are created on user CRUD operations
    - Observe: `clearPermissionCache()` is called after role permission updates
    - Observe: `invalidateUserCache()` is called after user modifications
  - Test file: `src/server/routes/__tests__/users.preservation.test.ts`
  - Write property-based tests: for all Admin users, all user management operations succeed; for all unauthenticated requests, 401 is returned; for all suspended users, 403 is returned
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix permission matrix split-brain and missing guards

  - [x] 3.1 Fix `checkPermission()` JOIN to use `role_id` FK
    - File: `src/server/middleware/auth.ts`
    - In the `checkPermission` function, change the SQL query from:
      ```sql
      JOIN roles r ON rp.role_id = r.id
      JOIN users u ON r.name = u.role
      WHERE u.id = ? AND p.module = ? AND p.action = ?
      ```
      To:
      ```sql
      JOIN users u ON rp.role_id = u.role_id
      WHERE u.id = ? AND p.module = ? AND p.action = ?
      ```
    - This eliminates the fragile string-based role name matching and uses the proper FK relationship
    - The `user_permissions` UNION part remains unchanged
    - _Bug_Condition: isBugCondition(input) where users[userId].role != roles[users[userId].role_id].name (Defect 4)_
    - _Expected_Behavior: checkPermission resolves correctly via role_id FK regardless of role name text_
    - _Preservation: Admin bypass (`if (user.role === 'Admin') return next()`) remains first check, unchanged_
    - _Requirements: 2.4_

  - [x] 3.2 Add `PERMISSION_MODULE_MAP` to bridge frontend/backend module names
    - File: `src/constants.ts`
    - Add a new exported constant after `ModuleName` enum:
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
        'FraudLog': 'Finding',
        'SystemErrorLogs': 'Setting',
        'ConflictOfInterest': 'Audit',
        'InternalPolicies': 'Audit',
        'ExecutiveReports': 'Audit',
        'OrgStructure': 'Setting',
        'AuditTrail': 'Setting',
        'Dashboard': 'Audit',
      };
      ```
    - This maps frontend `MODULES` values to backend DB `permissions.module` values
    - _Bug_Condition: isBugCondition(input) where input.module IN frontendModules AND input.module NOT IN backendModules (Defect 5)_
    - _Expected_Behavior: Frontend module names resolve to correct DB module names for permission checks_
    - _Preservation: Existing `MODULES` and `ModuleName` constants remain unchanged for backward compatibility_
    - _Requirements: 2.5_

  - [x] 3.3 Add `permissions` field to User interface in `types.ts`
    - File: `src/types.ts`
    - Add to the `User` interface:
      ```typescript
      permissions?: Array<{ module: string; action: string }>;
      ```
    - This allows the frontend to carry DB-sourced permissions on the user object
    - _Bug_Condition: isBugCondition(input) where user object lacks permissions array for DB-sourced checks (Defect 1, 3)_
    - _Expected_Behavior: User interface supports permissions array from API response_
    - _Preservation: Field is optional (`?`) so existing code that doesn't use it is unaffected_
    - _Requirements: 2.1, 2.3_

  - [x] 3.4 Ensure permissions are included in user session/login response
    - File: `src/server/routes/auth.ts` (login and session endpoints)
    - In the login response and `/api/auth/session` endpoint, ensure the user object includes the `permissions` array
    - `UserService.getUserById()` already queries permissions via `role_permissions` and `user_permissions` tables — verify this data is included in the response sent to the frontend
    - If the session endpoint uses a lightweight query (just `SELECT id, role, status...`), add a permissions fetch:
      ```typescript
      const permissions = await db.prepare(`
        SELECT p.module, p.action FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id = (SELECT role_id FROM users WHERE id = ?)
        UNION
        SELECT p.module, p.action FROM permissions p
        JOIN user_permissions up ON p.id = up.permission_id
        WHERE up.user_id = ? AND up.is_allowed = 1
      `).all(userId, userId);
      ```
    - Include `permissions` in the response object sent to the client
    - _Bug_Condition: isBugCondition(input) where frontend has no DB permissions to read (Defect 1)_
    - _Expected_Behavior: Login/session response includes permissions array for frontend consumption_
    - _Preservation: All other session response fields (id, role, status, name, email, token) remain unchanged_
    - _Requirements: 2.1, 2.3_

  - [x] 3.5 Change `usePermissions` to read from `user.permissions` (DB) with `DEFAULT_PERMISSIONS` fallback
    - File: `src/hooks/usePermissions.ts`
    - Modify the `hasPermission` function to:
      1. Keep Admin bypass first (unchanged)
      2. Check if `user.permissions` array exists and has entries
      3. If yes, import `PERMISSION_MODULE_MAP` from `../constants` and resolve the frontend module name to the DB module name
      4. Search `user.permissions` for a matching `{ module: dbModule, action }` entry
      5. If `user.permissions` is not available (undefined/null/empty), fall back to existing `DEFAULT_PERMISSIONS` lookup
    - Updated logic:
      ```typescript
      import { PERMISSION_MODULE_MAP } from '../constants';
      
      const hasPermission = (module: Module, permission: Permission): boolean => {
        if (!user) return false;
        if (user.role === 'Admin') return true;
        
        // DB-sourced permissions (primary source of truth)
        if (user.permissions && user.permissions.length > 0) {
          const dbModule = PERMISSION_MODULE_MAP[module] || module;
          return user.permissions.some(p => p.module === dbModule && p.action === permission);
        }
        
        // Fallback to static defaults when DB permissions unavailable
        const rolePermissions = DEFAULT_PERMISSIONS[user.role as Role];
        if (!rolePermissions) return false;
        const modulePermissions = rolePermissions[module];
        if (!modulePermissions) return false;
        return modulePermissions.includes(permission);
      };
      ```
    - _Bug_Condition: isBugCondition(input) where source=='frontend' AND dbPermissions != staticPermissions (Defect 1, 3, 5)_
    - _Expected_Behavior: Frontend resolves permissions from DB via user.permissions, with static fallback_
    - _Preservation: Admin bypass unchanged; fallback to DEFAULT_PERMISSIONS when API unavailable_
    - _Requirements: 2.1, 2.3, 2.5_

  - [x] 3.6 Replace `authorize(ADMIN_ROLES)` with `checkPermission('User', action)` in user routes
    - File: `src/server/routes/users.ts`
    - Update `createUserRoutes` signature to accept `checkPermission` parameter:
      ```typescript
      export const createUserRoutes = (
        db: any, authenticate: any, authorize: any, checkPermission: any, logError: any
      ) => {
      ```
    - Update `src/server/routes/index.ts` to pass `checkPermission` to `createUserRoutes`:
      ```typescript
      app.use("/api/users", createUserRoutes(db, authenticate, authorize, checkPermission, logError));
      ```
    - Replace middleware on each route:
      - `GET /init` → `checkPermission('User', 'View')`
      - `GET /` → `checkPermission('User', 'View')`
      - `GET /summary` → `checkPermission('User', 'View')`
      - `GET /:id` → `checkPermission('User', 'View')`
      - `POST /` → `checkPermission('User', 'Create')`
      - `PUT /:id` → `checkPermission('User', 'Edit')`
      - `DELETE /:id` → `checkPermission('User', 'Delete')`
      - `POST /:id/suspend` → `checkPermission('User', 'Edit')`
      - `POST /:id/archive` → `checkPermission('User', 'Edit')`
      - `POST /:id/activate` → `checkPermission('User', 'Edit')`
      - `POST /:id/unlock` → `checkPermission('User', 'Edit')`
      - `POST /:id/reset-password` → `checkPermission('User', 'Edit')`
    - Keep `GET /list` as `authenticate` only (no permission check — used for dropdowns)
    - _Bug_Condition: isBugCondition(input) where module=='User' AND userRole IN ADMIN_ROLES AND NOT hasDbPermission (Defect 2)_
    - _Expected_Behavior: User management routes enforce actual DB permissions via checkPermission_
    - _Preservation: Admin bypass in checkPermission (`if (user.role === 'Admin') return next()`) ensures Admin still has full access_
    - _Requirements: 2.2, 2.4_

  - [x] 3.7 Add self-protection guard (prevent admin from deleting/suspending self)
    - File: `src/server/routes/users.ts`
    - Add a guard at the top of the `DELETE /:id`, `POST /:id/suspend`, and `POST /:id/archive` route handlers:
      ```typescript
      if (req.user.id === req.params.id || req.user.id === id) {
        return res.status(403).json({ error: "Cannot perform this action on your own account" });
      }
      ```
    - Place this check AFTER authentication/permission middleware but BEFORE any business logic
    - _Bug_Condition: isBugCondition(input) where targetUserId == userId AND action IN ['Delete', 'Suspend', 'Archive'] (Defect 6)_
    - _Expected_Behavior: Self-destructive operations are rejected with 403 and clear error message_
    - _Preservation: Operations on OTHER users remain unaffected_
    - _Requirements: 2.6_

  - [x] 3.8 Add last-admin guard (prevent removing last admin)
    - File: `src/server/routes/users.ts`
    - Before delete, suspend, and archive operations, check if the target user is an Admin and if they are the last one:
      ```typescript
      const targetUser = await db.prepare("SELECT role FROM users WHERE id = ?").get(id) as any;
      if (targetUser && targetUser.role === 'Admin') {
        const adminCount = await db.prepare(
          "SELECT COUNT(*) as count FROM users WHERE role = 'Admin' AND status = 'Active' AND id != ?"
        ).get(id) as any;
        if (!adminCount || adminCount.count === 0) {
          return res.status(403).json({ error: "Cannot remove the last admin user" });
        }
      }
      ```
    - Place this check AFTER the self-protection guard and BEFORE the actual operation
    - _Bug_Condition: isBugCondition(input) where action IN ['Delete', 'Suspend', 'Archive'] AND isLastAdmin(targetUserId) (Defect 7)_
    - _Expected_Behavior: Operations that would leave zero active admins are rejected with 403_
    - _Preservation: Operations on non-admin users or when multiple admins exist remain unaffected_
    - _Requirements: 2.7_

  - [x] 3.9 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Permission Matrix Split-Brain and Missing Guards
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied:
      - Frontend returns DB permission state (not static)
      - Backend rejects unauthorized user-management requests with 403
      - Self-operations are blocked with 403
      - Last-admin operations are blocked with 403
      - `checkPermission()` resolves via `role_id` FK correctly
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.10 Verify preservation tests still pass
    - **Property 2: Preservation** - Admin Bypass, Auth Flow, and Audit Logging Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix:
      - Admin bypass still works (role "Admin" has full access)
      - Unauthenticated requests still return 401
      - Suspended users still return 403
      - Audit trail entries still created on user CRUD
      - Cache invalidation still works
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite to confirm no regressions
  - Verify bug condition test (task 1) passes after fix
  - Verify preservation tests (task 2) still pass after fix
  - Verify existing project tests still pass
  - Ensure all tests pass, ask the user if questions arise.
