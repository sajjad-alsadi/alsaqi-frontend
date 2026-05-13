# Bugfix Requirements Document

## Introduction

The permission matrix system has a fundamental inconsistency between two parallel permission systems: a static frontend matrix (`src/permissions.ts` with `usePermissions.ts`) and a dynamic database backend (`checkPermission()` middleware). When an admin modifies permissions via the RolePermissions UI, changes are saved to the database but the frontend ignores them entirely, always reading from the hardcoded `DEFAULT_PERMISSIONS` object. Additionally, the backend user management routes bypass the `checkPermission()` middleware altogether, using simple role-list authorization (`authorize(ADMIN_ROLES)`) instead. This means any user with a role in `ADMIN_ROLES` (Admin, Administrator, Manager) can perform all user management operations regardless of their actual permission matrix settings. The bug also includes role definition mismatches across files, module name mismatches between frontend and backend, fragile string-based role joins, and missing self-protection guards.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN an admin modifies role permissions via the RolePermissions UI and saves THEN the system persists changes to the database but `usePermissions.ts` continues to read from the hardcoded `DEFAULT_PERMISSIONS` object, making the saved changes have no effect on frontend access control

1.2 WHEN a user with role "Manager" attempts to delete, suspend, or modify another user via the API THEN the system allows the operation because `users.ts` routes use `authorize(ADMIN_ROLES)` which includes "Manager", even though the permission matrix does not grant Manager any UserManagement permissions beyond View

1.3 WHEN a user with role "Administrator" (from `constants.ts` UserRole enum) exists in the system THEN the system cannot resolve their permissions because `permissions.ts` defines roles as Admin, Internal Auditor, Compliance Officer, Risk Officer, Manager, Viewer — "Administrator" is not in the static matrix and has no fallback

1.4 WHEN the `checkPermission()` middleware queries the database for a user's permissions THEN the system joins `roles.name` to `users.role` as a text string match (`JOIN users u ON r.name = u.role`) instead of using the `role_id` foreign key, causing permission lookups to fail when role names have slight mismatches or casing differences

1.5 WHEN the RolePermissions UI displays the permission matrix THEN the system shows backend DB modules (Audit, Finding, Risk, Recommendation, Correspondence, User, Setting) which do not match the frontend `MODULES` constant (Dashboard, AuditPlans, AuditReports, AuditCharter, AuditTasks, RiskRegister, etc.), creating a disconnect between what admins configure and what the frontend enforces

1.6 WHEN an admin user deletes or suspends their own account via the API THEN the system allows the operation without any self-protection check, potentially locking out all administrators

1.7 WHEN an admin removes the last remaining Admin user from the system THEN the system allows the operation without checking if at least one Admin would remain, potentially leaving the system without any administrative access

### Expected Behavior (Correct)

2.1 WHEN an admin modifies role permissions via the RolePermissions UI and saves THEN the system SHALL persist changes to the database AND the frontend `usePermissions` hook SHALL read permissions from the API/database as the source of truth, with `DEFAULT_PERMISSIONS` used only as a fallback when the API is unavailable

2.2 WHEN a user attempts to perform a user management operation (create, update, delete, suspend, archive, unlock, reset-password) THEN the system SHALL check the user's actual permissions for the "User" module and the corresponding action via `checkPermission()` instead of checking role membership against `ADMIN_ROLES`

2.3 WHEN a user has a role defined in any part of the system (including "Administrator", "Compliance", "Auditor", "User") THEN the system SHALL resolve their permissions correctly by using a single unified role definition that is consistent across `types.ts`, `constants.ts`, `permissions.ts`, and the database `roles` table

2.4 WHEN the `checkPermission()` middleware queries the database for a user's permissions THEN the system SHALL join on `users.role_id = roles.id` (the foreign key relationship) instead of matching on the role name string

2.5 WHEN the RolePermissions UI displays the permission matrix THEN the system SHALL display module names that match the modules used in both frontend access control and backend `checkPermission()` calls, ensuring a single consistent set of module identifiers

2.6 WHEN an admin user attempts to delete or suspend their own account THEN the system SHALL reject the operation with an appropriate error message indicating that self-deletion/suspension is not allowed

2.7 WHEN an operation would result in zero remaining Admin users in the system THEN the system SHALL reject the operation with an appropriate error message indicating that at least one Admin must remain

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user with role "Admin" performs any operation THEN the system SHALL CONTINUE TO grant full access without requiring individual permission checks (Admin bypass)

3.2 WHEN the RolePermissions UI loads THEN the system SHALL CONTINUE TO display all roles with their current permissions and allow toggling individual module/action combinations

3.3 WHEN a user's session token is validated via the `authenticate` middleware THEN the system SHALL CONTINUE TO verify the token, check user status (Suspended/Disabled/Archived), and enforce password change requirements exactly as before

3.4 WHEN permission changes are saved via the roles API THEN the system SHALL CONTINUE TO clear the permission cache via `clearPermissionCache()` to ensure subsequent requests reflect the updated permissions

3.5 WHEN a non-admin user attempts to access user management routes without proper permissions THEN the system SHALL CONTINUE TO return a 403 Forbidden response

3.6 WHEN a user is created, updated, or deleted THEN the system SHALL CONTINUE TO log audit trail entries and send n8n automation events

3.7 WHEN the `useUserManagement` hook fetches data THEN the system SHALL CONTINUE TO provide paginated user lists, role data, permissions data, sessions, login history, and audit trail through the existing API endpoints
