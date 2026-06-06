# Implementation Plan

## Overview

This plan fixes two critical security vulnerabilities in the Correspondence Module: (1) missing route-level authorization (`checkPermission` middleware) on 12 out of 17 endpoints, and (2) missing row-level security (IDOR) allowing cross-department data access. The fix follows the exploratory bugfix workflow: write tests first to confirm the bug, then implement the fix, then verify.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Missing Route-Level Authorization and IDOR on Correspondence Endpoints
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate both vulnerabilities exist
  - **Scoped PBT Approach**: Scope the property to concrete failing cases:
    - Route-level: User without `Correspondence.View` permission calling GET /incoming returns 200 instead of 403
    - Route-level: User without `Correspondence.Create` permission calling POST /incoming succeeds instead of 403
    - Route-level: User without `Correspondence.Edit` permission calling PUT /status/:type/:id succeeds instead of 403
    - IDOR: Regular user from Department A calling GET /incoming receives records from Department B
    - IDOR: Regular user from Department A calling GET /details/incoming/:dept-b-id receives full details instead of 403/404
    - IDOR: Regular user from Department A calling PUT /status/Incoming/:dept-b-id modifies the record instead of 403
  - Test that for any request where `isBugCondition(input)` holds (user lacks required permission OR targets out-of-scope record), the response is HTTP 403 with code 'PERMISSION_DENIED'
  - Test that listing endpoints never return records outside the user's authorized scope
  - Run test on UNFIXED code - expect FAILURE (this confirms the bug exists)
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found:
    - All 12 unprotected endpoints return HTTP 200 for users without permissions
    - Listing endpoints return records from all departments regardless of user's department
    - Single-record endpoints return full details for out-of-scope records
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Authorized Access and Admin Full Access Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Step 1 - Observe on UNFIXED code**:
    - Observe: Admin user calling GET /incoming returns all records system-wide with pagination
    - Observe: Admin user calling GET /outgoing returns all outgoing records with pagination
    - Observe: Admin user calling GET /stats returns system-wide statistics
    - Observe: User with `Correspondence.View` permission calling GET /incoming for own-department records returns those records with correct pagination metadata
    - Observe: User with `Correspondence.Create` permission calling POST /incoming with valid data creates record and returns sequence number
    - Observe: User with `Correspondence.Edit` permission calling PUT /incoming/:id for own-scope record updates successfully with audit log entry
    - Observe: User with `Correspondence.Delete` permission calling DELETE /incoming/:id cascades cleanup of attachments, referrals, links, and status history
    - Observe: Routes already having `checkPermission` (PUT /incoming/:id, DELETE /incoming/:id, POST /outgoing, PUT /outgoing/:id, DELETE /outgoing/:id) continue to function normally
    - Observe: `AuthService.logAudit` is called for all successful operations
    - Observe: `N8nService.sendEvent` fires for successful create/update/delete operations
  - **Step 2 - Write property-based tests capturing observed behavior**:
    - Property: For all Admin requests across all endpoints, results include all records without row-level filtering
    - Property: For all authorized users with correct permissions accessing records within their department scope, pagination metadata, record counts, and data content are correct
    - Property: For all successful create operations by authorized users, sequence numbers are generated and N8n events fire
    - Property: For all successful mutations by authorized users within scope, audit log entries are created
    - Property: For routes already protected by `checkPermission`, authorized users continue to receive successful responses
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 3. Fix for missing route-level authorization and row-level security (IDOR) in Correspondence Module

  - [x] 3.1 Extend authenticate middleware to include department_id on req.user
    - Modify the SQL query in `authenticate` middleware to also select the user's `department_id` (join with user-department assignment)
    - Include `department_id` in the `req.user` object: `{ id, role, username, name, email, department_id }`
    - _Bug_Condition: isBugCondition(input) where authenticate does not provide department context for downstream scoping_
    - _Expected_Behavior: req.user always contains department_id for use by service layer_
    - _Preservation: Existing req.user fields (id, role, username, name, email) remain unchanged_
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 3.2 Add checkPermission middleware to 12 unprotected correspondence routes
    - Add `checkPermission('Correspondence', 'View')` to: GET /incoming, GET /outgoing, GET /archive, GET /stats, GET /details/:type/:id, GET /attachments/:type/:id
    - Add `checkPermission('Correspondence', 'Create')` to: POST /incoming
    - Add `checkPermission('Correspondence', 'Edit')` to: PUT /status/:type/:id, POST /refer, POST /link, PUT /archive/:type/:id, POST /attachments
    - Ensure middleware order is: `authenticate` → `checkPermission` → route handler
    - _Bug_Condition: isBugCondition(input) where user lacks required permission AND endpoint is in unprotected list_
    - _Expected_Behavior: HTTP 403 with code 'PERMISSION_DENIED' for unauthorized users_
    - _Preservation: Routes already protected (PUT /incoming/:id, DELETE /incoming/:id, POST /outgoing, PUT /outgoing/:id, DELETE /outgoing/:id) remain unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 3.8_

  - [x] 3.3 Create isWithinScope helper method in CorrespondenceService
    - Create private static method `isWithinScope(record, userContext)` that centralizes scope-checking logic
    - Logic: If `userRole === 'ADMIN'` → return true (full access)
    - Logic: If `userRole === 'Manager'` → return `record.assigned_dept_id === userContext.departmentId`
    - Logic: For regular users → return `record.assigned_dept_id === userContext.departmentId OR record.assigned_user_id === userContext.userId OR record.created_by === userContext.userId`
    - _Bug_Condition: No ownership/scope verification exists in current code_
    - _Expected_Behavior: Centralized scope check correctly identifies authorized vs unauthorized access_
    - _Preservation: Admin users always pass scope check (full access preserved)_
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [x] 3.4 Add userContext parameter and department-scoped filtering to listing methods
    - Modify `getIncoming(filters, userContext)` to add WHERE clause: `assigned_dept_id = userContext.departmentId OR assigned_user_id = userContext.userId` for non-Admin users
    - Modify `getOutgoing(page, pageSize, userContext)` to filter by `created_by = userContext.userId OR originating department = userContext.departmentId` for non-Admin users
    - Modify `getArchive(filters, userContext)` to apply same department-scoped filtering
    - Modify `getStats(userContext)` to scope statistics to user's department for non-Admin users
    - Pass `req.user` (with id, role, department_id) from route handlers to all service method calls
    - Admin users bypass all filtering (no WHERE clause added)
    - _Bug_Condition: isBugCondition(input) where userRole != 'ADMIN' AND listing returns records outside scope_
    - _Expected_Behavior: Every record in listing results satisfies recordWithinUserScope_
    - _Preservation: Pagination, search, and filter capabilities continue to work correctly within scoped results_
    - _Requirements: 2.4, 2.5, 2.8, 2.9, 3.1, 3.2_

  - [x] 3.5 Add ownership verification to single-record access and mutation methods
    - Modify `getDetails(type, id, userContext)` to verify record is within user's scope after fetching; return 403/404 if not
    - Modify `updateStatus(type, id, status, userContext)` to verify record ownership before modifying
    - Modify `refer(incomingId, ..., userContext)` to verify the incoming record is within user's scope
    - Modify `link(incomingId, outgoingId, ..., userContext)` to verify both records are within scope
    - Modify `archive(type, id, userContext)` to verify record is within scope before archiving
    - Modify `addAttachment(recordId, ..., userContext)` to verify target correspondence record is within scope
    - Use `isWithinScope` helper for all verification checks
    - Throw 403 Forbidden when verification fails
    - _Bug_Condition: isBugCondition(input) where user attempts to access/modify record outside their scope_
    - _Expected_Behavior: HTTP 403 or 404 for out-of-scope single-record access; no unauthorized data returned_
    - _Preservation: Authorized users within scope continue to access and modify records normally_
    - _Requirements: 2.6, 2.7, 3.4, 3.5_

  - [x] 3.6 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Route-Level Permission Enforcement and IDOR Prevention
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (HTTP 403 for unauthorized, scoped results for listings)
    - When this test passes, it confirms both vulnerabilities are fixed:
      - All 12 previously unprotected endpoints now return 403 for unauthorized users
      - Listing endpoints return only department-scoped records for non-Admin users
      - Single-record endpoints return 403/404 for out-of-scope access
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [x] 3.7 Verify preservation tests still pass
    - **Property 2: Preservation** - Authorized Access and Admin Full Access Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix:
      - Admin users still have full system-wide access
      - Authorized users with correct permissions still access records within their scope
      - Pagination, search, and filters still work correctly
      - Audit logging still fires for all successful operations
      - N8n automation events still fire for create/update/delete
      - Already-protected routes continue to function normally

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite to confirm no regressions
  - Verify bug condition exploration test passes (confirms fix works)
  - Verify preservation property tests pass (confirms no behavioral changes for authorized users)
  - Verify existing unit and integration tests pass
  - Ensure all tests pass, ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2"],
      "description": "Write exploration and preservation tests BEFORE implementing fix"
    },
    {
      "wave": 2,
      "tasks": ["3.1"],
      "description": "Extend authenticate middleware to include department_id"
    },
    {
      "wave": 3,
      "tasks": ["3.2", "3.3"],
      "description": "Add checkPermission to routes and create isWithinScope helper"
    },
    {
      "wave": 4,
      "tasks": ["3.4", "3.5"],
      "description": "Add userContext filtering to service methods and ownership verification"
    },
    {
      "wave": 5,
      "tasks": ["3.6"],
      "description": "Verify bug condition exploration test now passes"
    },
    {
      "wave": 6,
      "tasks": ["3.7"],
      "description": "Verify preservation tests still pass"
    },
    {
      "wave": 7,
      "tasks": ["4"],
      "description": "Final checkpoint - ensure all tests pass"
    }
  ]
}
```

## Notes

- Tasks 1 and 2 are independent and can run in parallel before any implementation begins
- Task 1 is expected to FAIL on unfixed code (this confirms the bug exists)
- Task 2 is expected to PASS on unfixed code (this captures baseline behavior)
- Tasks 3.1, 3.2, and 3.3 can be implemented in parallel after tests are written
- Tasks 3.4 and 3.5 depend on 3.3 (isWithinScope helper)
- Files affected: `src/server/middleware/auth.ts`, `src/server/routes/correspondence.ts`, `src/server/services/CorrespondenceService.ts`
- Admin users must always bypass all scope filtering (regression risk if not handled)
