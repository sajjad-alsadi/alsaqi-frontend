# Correspondence Authorization Fix - Bugfix Design

## Overview

The Correspondence Module has two critical security vulnerabilities: (1) Missing route-level authorization on 12 endpoints that only use `authenticate` without `checkPermission`, allowing any authenticated user to perform operations they lack permission for; and (2) Missing service-layer row-level security (IDOR), allowing users to access or modify correspondence records belonging to other departments by manipulating IDs. The fix adds `checkPermission` middleware to all unprotected routes and implements department-scoped data filtering in the service layer based on user role and department assignment.

## Glossary

- **Bug_Condition (C)**: A request to a correspondence endpoint where EITHER the user lacks the required module permission (missing `checkPermission`) OR the user attempts to access/modify a record outside their authorized department scope (IDOR)
- **Property (P)**: The desired behavior — unauthorized requests receive HTTP 403, and data queries return only records within the user's authorized scope
- **Preservation**: Existing behavior for authorized users within their legitimate scope must remain unchanged — including Admin full access, pagination, search, audit logging, and N8n automation events
- **CorrespondenceService**: The static service class in `src/server/services/CorrespondenceService.ts` that handles all database operations for correspondence
- **checkPermission**: The middleware factory in `src/server/middleware/auth.ts` that validates module+action permissions against the PermissionService
- **authenticate**: The middleware that verifies JWT tokens and populates `req.user` with `{ id, role, username, name, email }`
- **IDOR**: Insecure Direct Object Reference — a vulnerability where manipulating resource identifiers in URLs bypasses authorization
- **Row-Level Security (RLS)**: Filtering database query results based on the requesting user's department and role to prevent cross-department data access

## Bug Details

### Bug Condition

The bug manifests in two distinct scenarios:

**Scenario 1 — Missing Route-Level Authorization:** 12 out of 17 correspondence routes only use `authenticate` middleware without `checkPermission`. Any authenticated user (regardless of their assigned permissions) can call these endpoints and the system processes the request successfully.

**Scenario 2 — IDOR / Missing Row-Level Security:** The `CorrespondenceService` methods (`getIncoming`, `getOutgoing`, `getDetails`, `getArchive`, `getStats`, `updateStatus`, `refer`) execute queries without filtering by the requesting user's department or verifying record ownership. A user from Department A can access and modify Department B's records by providing the correct record ID.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type CorrespondenceRequest { userId, userRole, userDepartmentId, userPermissions[], endpoint, method, targetRecordId }
  OUTPUT: boolean

  // Condition 1: Missing route-level permission enforcement
  requiredAction ← mapEndpointToAction(input.endpoint, input.method)
  missingRouteAuth ← input.endpoint IN [
    GET /incoming, POST /incoming, GET /outgoing,
    PUT /status/:type/:id, POST /refer, POST /link, PUT /archive/:type/:id,
    GET /archive, GET /attachments/:type/:id, POST /attachments,
    GET /stats, GET /details/:type/:id
  ] AND NOT hasPermission(input.userId, 'Correspondence', requiredAction)

  // Condition 2: IDOR - record access outside authorized scope
  idor ← (input.userRole != 'ADMIN')
    AND (input.targetRecordId IS NOT NULL OR input.endpoint IS listing_endpoint)
    AND NOT recordWithinUserScope(input.targetRecordId, input.userId, input.userDepartmentId, input.userRole)

  RETURN missingRouteAuth OR idor
END FUNCTION

FUNCTION mapEndpointToAction(endpoint, method)
  IF method = 'GET' THEN RETURN 'View'
  IF method = 'POST' AND endpoint = '/incoming' THEN RETURN 'Create'
  IF method IN ['PUT', 'POST'] AND endpoint NOT '/incoming' THEN RETURN 'Edit'
  RETURN 'View'
END FUNCTION

FUNCTION recordWithinUserScope(recordId, userId, userDeptId, userRole)
  IF userRole = 'ADMIN' THEN RETURN TRUE
  record ← getRecordById(recordId)
  IF userRole = 'Manager' THEN
    RETURN record.assigned_dept_id = userDeptId
  // Regular user
  RETURN record.assigned_dept_id = userDeptId
    OR record.assigned_user_id = userId
    OR record.created_by = userId
END FUNCTION
```

### Examples

- **Missing Auth Example 1**: User with role "Auditor" (no Correspondence.View permission) calls `GET /incoming` → currently returns HTTP 200 with all records; should return HTTP 403
- **Missing Auth Example 2**: User with role "Employee" (no Correspondence.Edit permission) calls `PUT /status/Incoming/abc-123` → currently updates status; should return HTTP 403
- **Missing Auth Example 3**: User with role "Employee" (no Correspondence.Create permission) calls `POST /incoming` → currently creates record; should return HTTP 403
- **IDOR Example 1**: Regular user from Department A calls `GET /incoming` → currently returns ALL records system-wide; should return only records where `assigned_dept_id` = user's dept OR `assigned_user_id` = user's ID
- **IDOR Example 2**: Regular user from Department A calls `GET /details/incoming/dept-b-record-id` → currently returns full details; should return HTTP 403 or 404
- **IDOR Example 3**: Manager from Department A calls `PUT /status/Incoming/dept-b-record-id` → currently modifies the record; should return HTTP 403

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Admin users with full permissions SHALL CONTINUE TO access all records and process all operations without restriction or row-level filtering
- Users with `Correspondence.View` permission accessing records within their authorized scope SHALL CONTINUE TO receive paginated results with search and filter capabilities working correctly
- Users with `Correspondence.Create` permission SHALL CONTINUE TO create correspondence records and receive sequence numbers
- Users with `Correspondence.Edit` permission modifying records within their scope SHALL CONTINUE TO have updates processed with audit log entries
- Users with `Correspondence.Delete` permission deleting records within their scope SHALL CONTINUE TO have cascading cleanup of attachments, referrals, links, and status history
- Audit logging via `AuthService.logAudit` SHALL CONTINUE TO fire for all successful operations
- Automation events via `N8nService.sendEvent` SHALL CONTINUE TO fire for all successful create/update/delete operations
- Routes that already have `checkPermission` middleware (`PUT /incoming/:id`, `DELETE /incoming/:id`, `POST /outgoing`, `PUT /outgoing/:id`, `DELETE /outgoing/:id`) SHALL CONTINUE TO function normally for authorized users

**Scope:**
All inputs that do NOT trigger the bug condition should be completely unaffected by this fix. This includes:
- Requests from Admin users (full system access preserved)
- Requests from users with correct permissions accessing records within their department scope
- All existing query parameters (search, status, priority, date filters, pagination)
- File attachment upload/download for authorized records
- Status history tracking and referral chains

## Hypothesized Root Cause

Based on the bug analysis and source code review:

1. **Inconsistent Middleware Application**: The route file `src/server/routes/correspondence.ts` applies `checkPermission('Correspondence', 'Edit')` or `checkPermission('Correspondence', 'Delete')` to only 5 routes (`PUT /incoming/:id`, `DELETE /incoming/:id`, `POST /outgoing`, `PUT /outgoing/:id`, `DELETE /outgoing/:id`). The remaining 12 routes use only `authenticate`, which verifies identity but not authorization.

2. **No User Context Passed to Service Layer**: The `CorrespondenceService.getIncoming(filters)` and `getOutgoing(page, pageSize)` methods do not receive `userId`, `userRole`, or `userDepartmentId` parameters. They cannot filter results because they have no knowledge of who is requesting the data.

3. **No Ownership Verification on Mutations**: Methods like `updateStatus`, `refer`, `link`, `archive` accept a record ID and process the operation without verifying that the requesting user has authority over that record (belongs to their department or is assigned to them).

4. **Missing Department Context on User Object**: The `authenticate` middleware populates `req.user` with `{ id, role, username, name, email }` but does NOT include `department_id`. Even if the service layer wanted to filter, the department information is not readily available on the request object.

## Correctness Properties

Property 1: Bug Condition - Route-Level Permission Enforcement

_For any_ request where the user lacks the required permission for the correspondence endpoint (i.e., `hasPermission(userId, 'Correspondence', requiredAction)` returns false), the fixed route handler SHALL return HTTP 403 with error code 'PERMISSION_DENIED' and SHALL NOT execute any database query or mutation.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Bug Condition - Row-Level Security Enforcement

_For any_ request from a non-Admin user where the target record does not belong to the user's authorized scope (department or assignment), the fixed service layer SHALL either exclude the record from listing results OR return HTTP 403/404 for single-record access, ensuring no unauthorized data is returned.

**Validates: Requirements 2.4, 2.5, 2.6, 2.7, 2.8**

Property 3: Preservation - Admin Full Access

_For any_ request from an Admin user with valid authentication, the fixed code SHALL produce exactly the same results as the original code — full system-wide access to all records without any row-level filtering applied.

**Validates: Requirements 2.9, 3.1**

Property 4: Preservation - Authorized Scoped Access

_For any_ request from a non-Admin user with the correct permission AND targeting records within their authorized department scope, the fixed code SHALL produce the same results as the original code — including correct pagination, search filtering, audit logging, and automation events.

**Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/server/middleware/auth.ts`

**Change**: Extend `authenticate` middleware to include `department_id` on `req.user`

**Specific Changes**:
1. **Add department_id to user query**: Modify the SQL in `authenticate` to also select the user's `department_id` (or join with an assignment table)
2. **Populate req.user.department_id**: Include `department_id` in the `req.user` object so downstream handlers and services have access to it

---

**File**: `src/server/routes/correspondence.ts`

**Function**: `createCorrespondenceRoutes`

**Specific Changes**:
1. **Add checkPermission to GET /incoming**: Change from `authenticate` only to `authenticate, checkPermission('Correspondence', 'View')`
2. **Add checkPermission to POST /incoming**: Change from `authenticate` only to `authenticate, checkPermission('Correspondence', 'Create')`
3. **Add checkPermission to GET /outgoing**: Change from `authenticate` only to `authenticate, checkPermission('Correspondence', 'View')`
4. **Add checkPermission to PUT /status/:type/:id**: Change from `authenticate` only to `authenticate, checkPermission('Correspondence', 'Edit')`
5. **Add checkPermission to POST /refer**: Change from `authenticate` only to `authenticate, checkPermission('Correspondence', 'Edit')`
6. **Add checkPermission to POST /link**: Change from `authenticate` only to `authenticate, checkPermission('Correspondence', 'Edit')`
7. **Add checkPermission to PUT /archive/:type/:id**: Change from `authenticate` only to `authenticate, checkPermission('Correspondence', 'Edit')`
8. **Add checkPermission to GET /archive**: Change from `authenticate` only to `authenticate, checkPermission('Correspondence', 'View')`
9. **Add checkPermission to GET /attachments/:type/:id**: Change from `authenticate` only to `authenticate, checkPermission('Correspondence', 'View')`
10. **Add checkPermission to POST /attachments**: Change from `authenticate` only to `authenticate, checkPermission('Correspondence', 'Edit')`
11. **Add checkPermission to GET /stats**: Change from `authenticate` only to `authenticate, checkPermission('Correspondence', 'View')`
12. **Add checkPermission to GET /details/:type/:id**: Change from `authenticate` only to `authenticate, checkPermission('Correspondence', 'View')`
13. **Pass user context to service methods**: Pass `req.user` (with `id`, `role`, `department_id`) to all service method calls so the service layer can apply row-level filtering

---

**File**: `src/server/services/CorrespondenceService.ts`

**Specific Changes**:
1. **Add `userContext` parameter to `getIncoming`**: Accept `{ userId, userRole, userDepartmentId }` and add WHERE clauses to filter by `assigned_dept_id` or `assigned_user_id` when the role is not Admin
2. **Add `userContext` parameter to `getOutgoing`**: Filter by `created_by = userId` or originating department for non-Admin users
3. **Add `userContext` parameter to `getDetails`**: After fetching the record, verify it belongs to the user's scope; throw 403/404 if not
4. **Add `userContext` parameter to `getArchive`**: Apply same department-scoped filtering as `getIncoming`/`getOutgoing`
5. **Add `userContext` parameter to `getStats`**: Scope statistics to the user's department for non-Admin users
6. **Add ownership verification to `updateStatus`**: Before modifying, verify the record belongs to the user's scope
7. **Add ownership verification to `refer`**: Verify the incoming_id record is within the user's scope before creating the referral
8. **Add ownership verification to `link`**: Verify both incoming_id and outgoing_id are within scope
9. **Add ownership verification to `archive`**: Verify the record is within scope before archiving
10. **Add ownership verification to `addAttachment`**: Verify the target correspondence record is within scope
11. **Add scope helper method**: Create a private static method `isWithinScope(record, userContext)` to centralize scope-checking logic

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write integration tests that make HTTP requests to correspondence endpoints with users lacking the required permissions and with users targeting records outside their department. Run these tests on the UNFIXED code to observe failures (i.e., the requests succeed when they should fail).

**Test Cases**:
1. **Missing View Permission Test**: Authenticate as a user without `Correspondence.View` permission, call `GET /incoming` — expect 200 on unfixed code (will fail assertion that it should be 403)
2. **Missing Create Permission Test**: Authenticate as a user without `Correspondence.Create` permission, call `POST /incoming` with valid data — expect record created on unfixed code (will fail)
3. **Missing Edit Permission Test**: Authenticate as a user without `Correspondence.Edit` permission, call `PUT /status/Incoming/:id` — expect status updated on unfixed code (will fail)
4. **Cross-Department Listing Test**: Authenticate as a regular user from Dept A, call `GET /incoming` — expect ALL records returned including Dept B records on unfixed code (will fail)
5. **Cross-Department Detail Access Test**: Authenticate as a regular user from Dept A, call `GET /details/incoming/:dept-b-id` — expect full details returned on unfixed code (will fail)
6. **Cross-Department Mutation Test**: Authenticate as a regular user from Dept A, call `PUT /status/Incoming/:dept-b-id` — expect modification succeeds on unfixed code (will fail)

**Expected Counterexamples**:
- All 12 unprotected endpoints return HTTP 200 for users without permissions
- Listing endpoints return records from all departments regardless of user's department
- Possible causes confirmed: missing `checkPermission` middleware, no `userContext` passed to service layer

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
// Route-level authorization fix checking
FOR ALL input WHERE missingRouteAuth(input) DO
  result := handleRequest_fixed(input)
  ASSERT result.statusCode = 403
  ASSERT result.body.code = 'PERMISSION_DENIED'
  ASSERT no database mutation occurred
END FOR

// Row-level security fix checking
FOR ALL input WHERE idor(input) AND input.endpoint IS listing_endpoint DO
  result := handleRequest_fixed(input)
  ASSERT every record in result.data satisfies recordWithinUserScope(record, input.userId, input.userDeptId, input.userRole)
END FOR

FOR ALL input WHERE idor(input) AND input.endpoint IS single_record_endpoint DO
  result := handleRequest_fixed(input)
  ASSERT result.statusCode IN {403, 404}
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleRequest_original(input) = handleRequest_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many combinations of user roles, departments, and record ownership patterns
- It catches edge cases in scope-checking logic that manual tests might miss
- It provides strong guarantees that Admin behavior and authorized scoped access are unchanged

**Test Plan**: Observe behavior on UNFIXED code first for Admin users and authorized scoped users, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Admin Full Access Preservation**: Verify Admin users still receive all records with full pagination, search, and filter support after the fix
2. **Authorized View Preservation**: Verify users with `Correspondence.View` permission can still see records within their department scope with correct pagination metadata
3. **Authorized Create Preservation**: Verify users with `Correspondence.Create` permission can still create records, get sequence numbers, and trigger N8n events
4. **Authorized Edit Preservation**: Verify users with `Correspondence.Edit` permission can still update status, refer, link, and archive records within their scope
5. **Authorized Delete Preservation**: Verify users with `Correspondence.Delete` permission can still delete records with cascading cleanup
6. **Audit Logging Preservation**: Verify `AuthService.logAudit` continues to be called for all successful operations
7. **Already-Protected Route Preservation**: Verify routes that already had `checkPermission` (`PUT /incoming/:id`, `DELETE /incoming/:id`, `POST /outgoing`, `PUT /outgoing/:id`, `DELETE /outgoing/:id`) continue to function identically

### Unit Tests

- Test `checkPermission('Correspondence', 'View')` returns 403 for users without the permission
- Test `checkPermission('Correspondence', 'Create')` returns 403 for users without the permission
- Test `checkPermission('Correspondence', 'Edit')` returns 403 for users without the permission
- Test `isWithinScope` helper correctly identifies records within/outside a user's department
- Test that Manager role sees only their department's records
- Test that Admin role bypasses all scope filters
- Test `getIncoming` with `userContext` returns only scoped records
- Test `getDetails` with `userContext` throws for out-of-scope records
- Test `updateStatus` with `userContext` throws for out-of-scope records

### Property-Based Tests

- Generate random user contexts (varying role, department, permissions) and random correspondence records; verify that `isBugCondition` correctly identifies unauthorized access attempts
- Generate random Admin requests across all endpoints; verify results are identical before and after the fix (preservation)
- Generate random authorized user requests within their scope; verify pagination metadata, record counts, and data content match the original behavior
- Generate random record ownership patterns (assigned_dept_id, assigned_user_id, created_by); verify scope-checking logic correctly includes/excludes records based on user context

### Integration Tests

- Test full request flow: authenticate → checkPermission → service layer scoping → response for each endpoint
- Test that a user from Department A making 10 sequential requests to `GET /incoming` with various filters never sees Department B records
- Test referral chain: user refers a record to another department, then the recipient can see it but the original user's scope doesn't lose access
- Test that `GET /stats` returns department-scoped statistics for non-Admin users and system-wide statistics for Admin users
- Test concurrent access: two users from different departments accessing the same endpoints simultaneously get correctly scoped results
