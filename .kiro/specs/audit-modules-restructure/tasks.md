# Implementation Plan: Audit Modules Restructure

## Overview

This plan restructures five core audit modules in the IAMS system: Audit Plans, Audit Tasks, Audit Program Library, Audit Findings, and Recommendations. Implementation uses TypeScript with Express.js backend, PostgreSQL database, and React frontend. Tasks are ordered to build foundational components first (migrations, numbering service), then core services, then API routes, and finally frontend translations and notifications.

## Tasks

- [x] 1. Database migrations and foundational infrastructure
  - [x] 1.1 Create database migration for audit modules restructure
    - Add columns to `audit_plans`: `year`, `quarter`, `is_archived`, `archived_at`, `archived_by`
    - Create `task_assignments` table with UNIQUE(task_id, user_id) constraint
    - Create `program_risk_links` and `program_compliance_links` tables
    - Add columns to `audit_findings`: `finding_type`, `created_by`, `title` (NOT NULL)
    - Add `plan_id` column to `recommendations`
    - Add `evidence_number` and `file_path` columns to `audit_evidence`
    - Add `approved_by` and `approved_at` columns to `audit_programs`
    - Create archive tables: `archived_plans`, `archived_tasks`, `archived_findings`, `archived_recommendations`, `archived_evidence`
    - Create `numbering_counters` table with PRIMARY KEY (scope_type, scope_id)
    - Create performance indexes
    - _Requirements: 1.3, 1.4, 2.1, 2.4, 3.6, 4.1, 5.1, 5.3, 5.4, 6.1, 6.3, 7.1, 8.1, 8.4_

  - [x] 1.2 Implement NumberingService for unified hierarchical numbering
    - Create `src/server/services/NumberingService.ts`
    - Implement `nextCounter()` with atomic UPSERT on `numbering_counters`
    - Implement `nextPlanCode(year)` → `IA-PL-{YY}-{NNN}`
    - Implement `nextTaskNumber(planId, planCode)` → `{planCode}-T{NN}`
    - Implement `nextFindingNumber(planId, planCode)` → `{planCode}-F{NN}`
    - Implement `nextRecommendationNumber(findingId, findingNumber)` → `{findingNumber}-R{NN}`
    - Implement `nextEvidenceNumber(findingId, findingNumber)` → `{findingNumber}-E{NN}`
    - Handle overflow errors (999 for plans, 99 for children)
    - Ensure counter rollback on transaction failure
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11_

  - [x] 1.3 Write property test for hierarchical numbering derivation
    - **Property 11: Hierarchical numbering derivation**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.7**

  - [x] 1.4 Update permission matrix in `src/permissions.ts`
    - Add `APPROVE` permission to `AUDIT_PROGRAM_LIBRARY` module
    - Update `Internal Auditor`: View only on `AUDIT_PLANS` and `AUDIT_TASKS`, remove Create from `RECOMMENDATIONS`
    - Update `Manager`: Add Create/Edit to `AUDIT_PLANS`, Add Create/Edit/Delete to `AUDIT_TASKS`, Add Approve to `AUDIT_PROGRAM_LIBRARY`
    - Update `Admin`: Add Approve to `AUDIT_PROGRAM_LIBRARY`, remove Create from `RECOMMENDATIONS`
    - Ensure Compliance Officer, Risk Officer, Viewer remain View-only on all five modules
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9_

  - [x] 1.5 Write property tests for permission matrix updates
    - **Property 16: Permission matrix updates do not affect other modules**
    - **Property 17: Recommendations cannot be created manually by any role**
    - **Validates: Requirements 11.8, 11.9, 11.10, 11.11**

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Audit Plan Service enhancements (fiscal year, plan creation, closure)
  - [x] 3.1 Implement fiscal year validation and plan creation logic in AuditPlanService
    - Add `canCreateNewPlan(year)` method checking: no existing plan for same year, previous year plan is archived
    - Add `fiscalYearBounds(year)` returning fixed Jan 1 - Dec 31 dates
    - Update `createPlan()` to validate year (2000-2100), set default dates, enforce single plan per year, generate plan_code via NumberingService
    - Enforce quarter values: Q1, Q2, Q3, Q4, Annual
    - Set initial status to 'Planned'
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.2 Write property tests for plan creation rules
    - **Property 2: New plan requires previous year archived**
    - **Property 13: Fixed fiscal year bounds**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.5**

  - [x] 3.3 Implement plan closure logic in AuditPlanService
    - Add `closePlan(planId, userId)` method
    - Validate user role is Manager or Admin
    - Check all related recommendations are 'Implemented' or 'Closed'
    - Set plan status to 'Closed' on success
    - Return error with details if open recommendations exist
    - _Requirements: 2.6, 2.7, 2.8_

  - [x] 3.4 Write property test for plan closure
    - **Property 6: Plan closure requires all recommendations closed**
    - **Validates: Requirements 2.6, 2.7**

- [x] 4. Archive Service implementation
  - [x] 4.1 Create ArchiveService with full archive workflow
    - Create `src/server/services/ArchiveService.ts`
    - Implement `archivePlan(planId, userId)` within a single transaction
    - Validate user role (Manager/Admin), plan exists and not already archived
    - Check all tasks are 'completed', findings are 'Closed', recommendations are 'Implemented'/'Closed'
    - Copy plan, tasks, findings, recommendations, evidence to archive tables as JSONB
    - Verify copy completeness before deletion
    - Delete details from regular tables (evidence → recommendations → findings → tasks)
    - Mark plan as `is_archived = true`, status = 'Archived'
    - Send `audit_plan.archived` event to N8nService with retry (up to 3 attempts)
    - Return detailed error with count/type of open items on validation failure
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11_

  - [x] 4.2 Write property tests for archive service
    - **Property 1: Archived plans are immutable**
    - **Property 15: Archive separation (data moved to archive tables)**
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.8**

  - [x] 4.3 Create archive API routes
    - Add `POST /api/v1/audit-plans/:id/archive` route
    - Add `GET /api/v1/audit-plans/can-create` route
    - Add `GET /api/v1/archived-plans` and `GET /api/v1/archived-plans/:year` routes
    - Apply auth middleware and role validation
    - _Requirements: 1.1, 1.9, 1.10_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Audit Task Service enhancements (multi-assignee)
  - [x] 6.1 Implement multi-assignee task assignment in AuditTaskService
    - Add `assignUsers(taskId, userIds, assignedBy)` method
    - Validate: assignedBy role is Manager/Admin, task exists, userIds non-empty (max 50), all user IDs exist
    - Insert records into `task_assignments` within single transaction
    - Handle duplicate assignment with UNIQUE constraint error
    - Add `unassignUser(taskId, userId, removedBy)` method with role validation
    - Return appropriate errors for non-existent assignments
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 4.7_

  - [x] 6.2 Write property test for multiple task assignments
    - **Property 9: Multiple task assignments**
    - **Validates: Requirements 4.1, 4.2**

  - [x] 6.3 Create task assignment API routes
    - Add `POST /api/v1/audit-tasks/:id/assign` route
    - Add `DELETE /api/v1/audit-tasks/:id/assign/:userId` route
    - Apply auth middleware and role validation
    - Send notification to assigned users via NotificationService
    - _Requirements: 4.1, 4.3, 4.4, 4.5_

- [x] 7. Audit Program Service enhancements (risk/compliance linking, approval)
  - [x] 7.1 Implement program creation with risk and compliance linking
    - Update `AuditProgramService.createProgram()` to restrict creation to Internal Auditor role
    - Set initial status to 'Draft', version_number to 1
    - Validate risk_ids exist in `risk_register` (max 200), compliance_item_ids exist in `compliance_items` (max 200)
    - Reject duplicates and non-existent references with full rollback
    - Create links in `program_risk_links` and `program_compliance_links`
    - Send notification to Manager/Admin for approval
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8_

  - [x] 7.2 Write property tests for program creation
    - **Property 7: Program creation restricted to auditors**
    - **Property 8: Program risks from registry**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [x] 7.3 Implement program approval workflow
    - Add `approveProgram(programId, userId, userRole)` method
    - Validate user has APPROVE permission on AUDIT_PROGRAM_LIBRARY
    - Validate program status is 'Draft' or 'Submitted'
    - Set status to 'Approved', record `approved_by` and `approved_at`
    - Reject if user lacks permission or program status is invalid
    - _Requirements: 5.6, 5.9_

  - [x] 7.4 Create program approval and lookup API routes
    - Add `POST /api/v1/audit-programs/:id/approve` route
    - Add `GET /api/v1/risk-register/lookup` route
    - Add `GET /api/v1/compliance-items/lookup` route
    - _Requirements: 5.6, 5.7_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Audit Finding Service enhancements (title, type, ownership, status transitions)
  - [x] 9.1 Implement finding creation with auto-recommendation derivation
    - Update finding creation to require `title` (non-empty, max 200 chars) and `finding_type` (control_design_deficiency | operational_design_deficiency)
    - Record `created_by` with creator's user ID
    - Set initial status to 'Open'
    - Generate `finding_number` via NumberingService
    - Auto-create one recommendation with same `risk_level`, status 'Open', and `rec_number` via NumberingService
    - Send notification to Manager/Admin
    - Block manual recommendation creation via POST /recommendations
    - _Requirements: 6.1, 6.2, 6.3, 6.10, 7.1, 7.2_

  - [x] 9.2 Write property tests for finding creation
    - **Property 4: Recommendations are derived only**
    - **Property 12: Finding title is required**
    - **Validates: Requirements 6.1, 6.2, 7.1, 7.2**

  - [x] 9.3 Implement finding edit ownership restriction
    - Add ownership check in `updateFinding()`: only `created_by` user can edit
    - Sync `risk_level` change to associated recommendation
    - Return ForbiddenError for non-owner edit attempts
    - _Requirements: 6.4, 7.4_

  - [x] 9.4 Write property test for finding edit ownership
    - **Property 5: Finding edit ownership**
    - **Validates: Requirements 6.4**

  - [x] 9.5 Implement finding status transitions with recommendation sync
    - Add `changeFindingStatus(findingId, newStatus, userId, userRole)` method
    - Enforce allowed transitions: Open→In Progress; In Progress→Closed/Pending Approval; Pending Approval→Closed/In Progress
    - Require APPROVE permission for Pending Approval→Closed transition
    - Sync recommendation status via `FINDING_TO_RECOMMENDATION_STATUS` map
    - Implement retry logic (up to 3 attempts) for sync failures
    - Send notification to Manager/Admin on status change
    - _Requirements: 6.5, 6.6, 6.7, 6.8, 7.3, 7.5, 7.7_

  - [x] 9.6 Write property test for finding-recommendation status sync
    - **Property 3: Finding-Recommendation status sync**
    - **Validates: Requirements 6.5, 7.3**

  - [x] 9.7 Implement finding query by plan and recommendation filtering
    - Add `getFindingsByPlan(planId)` returning only findings for that plan
    - Validate plan exists, return error for non-existent plan
    - Implement `RecommendationService.getRecommendations(filters)` with pagination (default 20, max 100)
    - Exclude archived plan recommendations from results
    - _Requirements: 6.9, 6.11, 7.6_

  - [x] 9.8 Create finding status and query API routes
    - Add `PATCH /api/v1/audit-findings/:id/status` route
    - Add `GET /api/v1/audit-findings/by-plan/:planId` route
    - Update `GET /api/v1/recommendations` with filter query params (department, plan_id, status, page, pageSize)
    - Block `POST /api/v1/recommendations` with ForbiddenError
    - _Requirements: 6.5, 6.9, 7.2, 7.6_

- [x] 10. Evidence Storage Service implementation
  - [x] 10.1 Create EvidenceStorageService with structured path storage
    - Create `src/server/services/EvidenceStorageService.ts`
    - Implement `buildEvidencePath(planId, findingId, evidenceNumber, fileName)` → `/uploads/findings/{plan_id}/{finding_id}/{evidence_number}_{file_name}`
    - Implement `sanitizeFileName()` removing path separators, `../` sequences, absolute path prefixes, truncating to 255 chars
    - Implement `attachEvidence(findingId, file, data, userId)` with NumberingService integration
    - Validate finding exists before upload
    - Rollback file write if DB insert fails; skip DB insert if file write fails
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 10.2 Write property test for evidence storage paths
    - **Property 14: Evidence stored under plan/finding namespace**
    - **Validates: Requirements 8.1, 8.3**

  - [x] 10.3 Create evidence API routes
    - Add `POST /api/v1/audit-findings/:findingId/evidence` route
    - Add `GET /api/v1/audit-findings/:findingId/evidence` route
    - _Requirements: 8.1, 8.4_

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Comment Service enhancements and Notification System
  - [x] 12.1 Enhance CommentService with targeted notifications
    - Update `createFindingComment(findingId, content, userId)` in CommentService
    - Validate content: non-empty after trim, max 2000 chars
    - Validate finding exists
    - Notification logic: if commenter ≠ finding creator → notify creator; if commenter = creator and previous commenter exists → notify last different commenter; if commenter = creator and no previous commenter → no notification
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 12.2 Write property test for comment notification targeting
    - **Property 10: Comment notification targeting**
    - **Validates: Requirements 9.2, 9.3, 9.4**

  - [x] 12.3 Implement enhanced notification cron job for deadlines
    - Update `src/server/cron/index.ts` with `checkUpcomingDeadlines()` function
    - Task due date notifications: 1 day before → notify all assigned users (via task_assignments)
    - Plan date notifications: 3 days before start/end → notify Manager/Admin + lead auditor
    - Year-end reminder: December 15 → notify Manager/Admin if unarchived plan exists
    - Ensure cron runs once per calendar day only
    - Handle missing lead auditor gracefully (notify Manager/Admin with indicator)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 12.4 Add notification for task assignment
    - Send notification to each assigned user within 60 seconds of assignment creation
    - Include task ID in notification payload
    - _Requirements: 4.3_

- [x] 13. Translation keys (Arabic and English)
  - [x] 13.1 Add all new translation keys to Arabic and English locale files
    - Add finding fields: `findings.title`, `findings.type.control_design_deficiency`, `findings.type.operational_design_deficiency`, `findings.findingNumber`
    - Add quarter labels: `plans.quarter.Q1` through `plans.quarter.Annual`, `plans.fiscalYear`, `plans.year`
    - Add archive actions: `archive.action`, `archive.viewArchived`, `archive.success`, `archive.confirmTitle`, `archive.openItemsError`, `archive.cannotCreateUntilArchived`
    - Add status labels: `status.pendingApproval`, `status.archived`, `status.planned`, `status.fieldwork`, `status.reporting`, `status.closed`
    - Add notification messages: `notifications.yearEndArchiveReminder`, `notifications.findingAdded`, `notifications.findingStatusChanged`, `notifications.taskDueTomorrow`, `notifications.planDateApproaching`, `notifications.programPendingApproval`, `notifications.commentOnYourFinding`, `notifications.replyToYourComment`
    - Ensure every key has non-empty values in both `ar` and `en` files (max 1000 chars)
    - Implement fallback: show other language value or key ID with visual indicator if translation missing
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 14. Integration wiring and final validation
  - [x] 14.1 Wire all new routes into Express router
    - Register archive routes in `src/server/routes/index.ts`
    - Register task assignment routes
    - Register program approval and lookup routes
    - Register finding status and evidence routes
    - Ensure all routes use auth middleware and permission checks
    - _Requirements: 11.10, 11.11_

  - [x] 14.2 Write integration tests for end-to-end workflows
    - Test full cycle: create plan → create tasks → assign users → create findings → auto-recommendations → change status → close plan → archive
    - Test permission enforcement across all roles
    - Test notification delivery for all event types
    - _Requirements: 1.1-1.11, 2.1-2.8, 4.1-4.7, 6.1-6.11, 7.1-7.7_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (17 properties total)
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout (Express.js backend, React/TypeScript frontend)
- All new services follow existing patterns in `src/server/services/`
- Database migrations use the existing versioned migration system in `src/server/db/`
- Translation files are located in `src/locales/`
- Permission matrix updates are localized patches on `DEFAULT_PERMISSIONS` in `src/permissions.ts`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4"] },
    { "id": 2, "tasks": ["1.3", "1.5", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.1", "6.1", "7.1"] },
    { "id": 4, "tasks": ["3.4", "4.2", "4.3", "6.2", "6.3", "7.2", "7.3"] },
    { "id": 5, "tasks": ["7.4", "9.1"] },
    { "id": 6, "tasks": ["9.2", "9.3", "9.5"] },
    { "id": 7, "tasks": ["9.4", "9.6", "9.7", "10.1"] },
    { "id": 8, "tasks": ["9.8", "10.2", "10.3"] },
    { "id": 9, "tasks": ["12.1", "12.3", "12.4"] },
    { "id": 10, "tasks": ["12.2", "13.1"] },
    { "id": 11, "tasks": ["14.1"] },
    { "id": 12, "tasks": ["14.2"] }
  ]
}
```
