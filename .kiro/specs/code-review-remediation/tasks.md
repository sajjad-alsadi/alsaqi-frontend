# Implementation Plan: Code Review Remediation

## Overview

This plan converts the code-review remediation design into incremental, code-focused tasks for the `apps/web` React + TypeScript + Vite app (with `packages/shared`). Work is grouped by the same priority bands as the requirements — Critical (Req 1–5), Important (Req 6–19), Minor (Req 20–30) — and finishes with cross-cutting verification (Req 31).

The remediation is a refactor under invariants: remove harmful global overrides, keep the Backend authoritative, and harden genuinely client-owned logic. Each property test (fast-check, ≥100 runs, tagged `Feature: code-review-remediation, Property {n}`) is placed next to the implementation it validates so regressions surface early. The Critical group (tasks 1–4) touches disjoint modules and is independently shippable (Req 31.6).

## Tasks

- [x] 1. Remove network-layer monkey-patching and payload blocking (Req 1, 2)
  - [x] 1.1 Strip global interception from Secure_Network_Module
    - In `apps/web/src/utils/SecureNetwork.ts`, remove the `Object.defineProperty(window, 'fetch', …)` override and the `XMLHttpRequest.prototype.open/send` overrides
    - Remove origin allow-listing that throws `"Unauthorized request origin"`, request-body substring blocking (`<script`, `onerror=`, `javascript:`), and `response.clone().text()` integrity buffering that breaks streaming
    - Reduce `initSecureNetwork`/`initInterceptors` to no-op shims so existing import sites compile without behavioral interference
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3_

  - [x] 1.2 Write property test for unblocked payload transmission
    - **Property 1: Outgoing payloads are transmitted unchanged and never pattern-blocked**
    - **Validates: Requirements 2.1, 2.2**
    - Create `apps/web/src/utils/SecureNetwork.payload.property.test.ts` using fast-check string arbitraries that include previously-blocked substrings

  - [x] 1.3 Write smoke test that globals are not overridden
    - Assert `window.fetch` and `XMLHttpRequest.prototype.open/send` remain native after module init, and that cross-origin requests do not throw `"Unauthorized request origin"`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Confine secure storage to instance scope (Req 3)
  - [x] 2.1 Remove Storage.prototype overrides and stabilize key derivation
    - In `apps/web/src/utils/SecureStorage.ts`, remove `initProtection()` so `Storage.prototype.getItem/setItem/removeItem` are never overridden; expose secure behavior only via instance `get`/`set`/`clearSession`
    - On HMAC/decrypt failure, return `null` to the caller and do NOT call `clearSession()`; `onTamperDetected` no longer clears the session
    - Derive the encryption/HMAC key base from a stable source (e.g. `VITE_STORAGE_SECRET` + origin) that excludes `navigator.userAgent`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.2 Write property test for user-agent-independent key derivation
    - **Property 3: Secure storage key derivation is independent of the user agent**
    - **Validates: Requirements 3.4, 3.5**

  - [x] 2.3 Write property test for failure reporting without session clear
    - **Property 4: Decryption/HMAC failure is reported without clearing the session**
    - **Validates: Requirements 3.3**

  - [x] 2.4 Write smoke test that Storage.prototype is not overridden
    - Assert native `Storage.prototype` methods after init
    - _Requirements: 3.1, 3.2_

- [x] 3. Handle submission failures in Legal and Regulatory forms (Req 4)
  - [x] 3.1 Add isSubmitting guard and error feedback to LegalForm
    - In `LegalForm.tsx`, adopt the `AuditTaskForm` pattern: local `isSubmitting` state disables the submit control, `try/catch/finally` wraps the save, failures surface `Submit_Error_Feedback`, and `finally` clears `isSubmitting`
    - _Requirements: 4.1, 4.3, 4.4, 4.5_

  - [x] 3.2 Add isSubmitting guard and error feedback to RegulatoryForm
    - Apply the same submission-error pattern in `RegulatoryForm.tsx`
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [x] 3.3 Write unit tests for form submission failure handling
    - Test error toast on failure, submit-control disabled while submitting, double-submit prevention, and `isSubmitting` cleared on failure for both forms
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 4. Restore focus to the trigger element on modal close (Req 5)
  - [x] 4.1 Restore focus inside FocusTrap effect cleanup
    - In `components/Modal.tsx`/FocusTrap, capture `document.activeElement` on trap mount and restore focus to it inside the effect cleanup (before the trapped subtree unmounts)
    - If the original trigger is no longer in the document, move focus to a defined fallback (e.g. `document.body`) without throwing
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 4.2 Write unit tests for focus restoration
    - Test focus returns to trigger on close and falls back safely when the trigger is removed
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 5. Checkpoint - Critical group
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Harden Api_Client: CSRF, refresh state, version compare (Req 6, 9, 20)
  - [x] 6.1 Fix CSRF token cookie parsing in Api_Client
    - In `api/client.ts`, parse the cookie via `row.slice(row.indexOf('=') + 1)` to preserve base64 `=` padding, then apply `decodeURIComponent`
    - _Requirements: 6.1, 6.3, 6.4_

  - [x] 6.2 Write property test for CSRF token parse round-trip
    - **Property 2: CSRF token parse preserves the full value and round-trips encoding**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [x] 6.3 Scope token-refresh state per client instance
    - Move `isRefreshing`, `refreshSubscribers`, and the version-mismatch indicator from module-global into the `createApiClient` closure; keep the `__isRetryAfterRefresh` marker preventing re-entry into the refresh branch
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 6.4 Write property test for per-instance refresh isolation
    - **Property 7: Token-refresh state is isolated per client instance**
    - **Validates: Requirements 9.1, 9.4**

  - [x] 6.5 Write property test for single-refresh safety
    - **Property 8: Single-refresh safety with no infinite loop**
    - **Validates: Requirements 9.2, 9.3**
    - Reuse patterns from the existing `client.single-refresh.property.test.ts`

  - [x] 6.6 Guard version comparison against malformed input
    - In `api/client.ts`, make `isMajorMinorMatch` return `true` (non-mismatch) when any parsed major/minor operand is `NaN`; report a match when valid major/minor are equal
    - _Requirements: 20.1, 20.2, 20.3_

  - [x] 6.7 Write property test for version comparison
    - **Property 13: Version comparison tolerates malformed input and matches equal major.minor**
    - **Validates: Requirements 20.1, 20.2, 20.3**

- [x] 7. Fix Error_Reporter CSRF parsing and redact forwarded logs (Req 6, 10)
  - [x] 7.1 Apply first-`=` preserving CSRF parse in Error_Reporter
    - In `utils/errorReporter.ts`, use the same first-`=` preserving parse with `decodeURIComponent`
    - _Requirements: 6.2_

  - [x] 7.2 Add allowlist redaction and query-string stripping to Logger
    - In `utils/logger.ts` and `utils/SecurityLogger.ts`, apply an allowlist/redaction policy to caller-supplied `context` before forwarding, and forward only `location.pathname` (strip the query string) so query-string tokens are never transmitted
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 7.3 Write property test for allowlisted log context
    - **Property 9: Forwarded log context contains only allowlisted keys**
    - **Validates: Requirements 10.1, 10.4**

  - [x] 7.4 Write property test for query-string-free location
    - **Property 10: Forwarded location never includes the query string**
    - **Validates: Requirements 10.2, 10.3**

- [x] 8. Establish single-source permissions and constrain fallback (Req 7, 8)
  - [x] 8.1 Derive default permissions from the Module_Registry
    - In `permissions.ts`/`permissions/modules.ts`, derive `DEFAULT_PERMISSIONS` from the registry `defaults` instead of a duplicated list; never grant an action a module's registry entry does not list; confirm Analytics and Policies are registered
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 8.2 Constrain the no-cache fallback permission set
    - In `permissions/fallback.ts`, compute the fallback as the intersection of `READ_ONLY_PERMISSION_SET` with the role's static defaults so it never widens beyond static defaults; low-privilege roles are denied `UserManagement`/`SystemLogs` during a cache outage
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 8.3 Write property test for fallback subset semantics
    - **Property 5: Fallback permissions never widen beyond static role defaults**
    - **Validates: Requirements 7.1, 7.2, 7.3**

  - [x] 8.4 Write property test for registry-consistent defaults
    - **Property 6: Default permissions are consistent with the module registry**
    - **Validates: Requirements 8.1, 8.2, 8.4**

- [x] 9. Remove or narrowly scope runtime guards (Req 11)
  - [x] 9.1 Remove ObjectGuard and DOMGuard global overrides
    - In `utils/ObjectGuard.ts`, stop permanently overriding/freezing `Object.defineProperty`; in `utils/DOMGuard.ts`, stop the document-wide keylogger `MutationObserver`. Reduce both to no-op shims or remove them from the init path; scope any retained behavior to a defined target
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 9.2 Write tests for third-party defineProperty and unscoped observers
    - Assert a third-party `Object.defineProperty` call initializes without error, `Object.defineProperty` stays writable/configurable, and no document-wide `MutationObserver.observe` is registered
    - _Requirements: 11.1, 11.2, 11.4_

- [x] 10. Provide error-boundary coverage for lazy routes (Req 12)
  - [x] 10.1 Wrap every lazy route in ModuleErrorBoundary
    - In `App.tsx`, wrap each lazy-loaded route (Dashboard, AuditTasks, Recommendations, RiskRegister, OrgStructure, Notifications, Settings, AuditEvidence, AuditCharter, AuditProgramLibrary) with a `ModuleErrorBoundary`
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 10.2 Write integration test for boundary containment
    - Render a route component that throws; assert the shell and a sibling route remain operational
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 11. Preserve concurrently arriving notifications (Req 13)
  - [x] 11.1 Use functional updaters in Notification_Context
    - In `context/NotificationContext.tsx`, compute next state in `markAsRead` and `deleteNotification` via `setNotifications(prev => …)` reading the latest state
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 11.2 Write property test for retained concurrent notifications
    - **Property 11: Concurrently-arriving notifications are retained**
    - **Validates: Requirements 13.1, 13.2, 13.3**

- [x] 12. Make optimistic-update rollback concurrency-safe (Req 14)
  - [x] 12.1 Ensure live-state functional revert in Optimistic_Update_Hook
    - Confirm `hooks/useOptimisticUpdate.ts` reverts against live state via a functional setter (per-item inverter), never restoring a pre-concurrency snapshot; update any callers passing stale snapshots
    - _Requirements: 14.1, 14.2, 14.3_

  - [x] 12.2 Write property test for concurrency-safe rollback
    - **Property 12: Optimistic rollback preserves concurrent updates**
    - **Validates: Requirements 14.1, 14.2, 14.3**

- [x] 13. Scope scroll-restoration observation to the target element (Req 15)
  - [x] 13.1 Replace document-wide observer in useScrollRestore
    - In `hooks/usePersistedFilters.ts`, replace the `MutationObserver({subtree:true})` with observation of a defined target element (or a `ResizeObserver` tied to it); remove all observers/listeners in cleanup and avoid duplicate scroll listeners across re-renders
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x] 13.2 Write unit tests for scoped observation and cleanup
    - Assert observation targets a specific element, cleanup removes observers/listeners, and no duplicate listeners accumulate
    - _Requirements: 15.2, 15.3, 15.4_

- [x] 14. Translate form schemas and surface submit errors (Req 16)
  - [x] 14.1 Localize FindingForm schema and surface submit errors
    - Define the FindingForm validation schema inside the component using `t(...)` for messages; surface `Submit_Error_Feedback` on failure following the `AuditTaskForm` pattern
    - _Requirements: 16.1, 16.3, 16.4_

  - [x] 14.2 Localize RecommendationForm schema and surface submit errors
    - Apply the same in-component `t(...)` schema and submit-error pattern to RecommendationForm
    - _Requirements: 16.2, 16.3, 16.4_

  - [x] 14.3 Write unit tests for localized schemas and submit feedback
    - Test translated validation messages and error feedback on submit failure
    - _Requirements: 16.1, 16.2, 16.3_

- [x] 15. Consolidate date and number formatting (Req 17)
  - [x] 15.1 Create the canonical Formatting_Module
    - Introduce a single Formatting_Module using one canonical Arabic locale for all date/number formatting
    - _Requirements: 17.1, 17.2_

  - [x] 15.2 Route all formatting through the module and remove divergent copies
    - Replace usages of `format.ts`, `formatService.ts`, and the formatting parts of `i18n.ts`; remove or re-export the old modules so no divergent locale remains
    - _Requirements: 17.3, 17.4_

  - [x] 15.3 Write property test for canonical-locale formatting
    - **Property 19: Date and number formatting uses one canonical locale**
    - **Validates: Requirements 17.2, 17.4**

- [x] 16. Make NotificationBell and Chatbot keyboard-accessible (Req 18)
  - [x] 16.1 Make NotificationBell rows operable and Escape-dismissable
    - Render notification rows as elements with a button role, keyboard focusability, and keyboard activation; close an open list/popover on Escape
    - _Requirements: 18.1, 18.2, 18.4_

  - [x] 16.2 Add accessible labels to Chatbot icon-only buttons
    - Provide an accessible label for each icon-only Chatbot button
    - _Requirements: 18.3, 18.4_

  - [x] 16.3 Write accessibility tests with vitest-axe
    - Assert no axe violations and correct role/label exposure for NotificationBell rows and Chatbot buttons
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

- [x] 17. Establish a lint-debt ratchet (Req 19)
  - [x] 17.1 Enforce a maximum warning ceiling in lint
    - Configure `npm run lint` (via `eslint.config.js` / lint script and `.lint-ceiling.json`) to exit non-zero when warnings exceed the configured ceiling
    - _Requirements: 19.1, 19.2_

  - [x] 17.2 Reduce warnings and lower the ceiling below 497
    - Reduce lint warnings and lower `.lint-ceiling.json` to the new count to prevent regression
    - _Requirements: 19.3, 19.4_

  - [x] 17.3 Write integration test for the lint ratchet
    - Run the ratchet script with warning counts above and below the ceiling and assert exit codes
    - _Requirements: 19.1, 19.2_

- [x] 18. Checkpoint - Important group
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Maintain notification connectivity on transient token failure (Req 21)
  - [x] 19.1 Schedule reconnect on null token and fix docs
    - In `api/ws/websocket-client.ts`, when `getToken()` returns null during connect, schedule a reconnect/fallback instead of staying disconnected; re-establish the connection once the token resolves; update docs to describe the cookie/ws-token model
    - _Requirements: 21.1, 21.2, 21.3_

  - [x] 19.2 Write unit tests for reconnect and recovery
    - Test reconnect scheduling on null token and connection recovery once the token is available
    - _Requirements: 21.1, 21.2_

- [x] 20. Correct the Dashboard KPI route target (Req 22)
  - [x] 20.1 Point the KPI card at a registered route
    - Change the KPI card that linked to unregistered `/regulatory` to a registered route; ensure no card falls through to `/dashboard` due to an undefined target
    - _Requirements: 22.1, 22.2, 22.3_

  - [x] 20.2 Write unit test for registered KPI route target
    - Assert the KPI card target resolves to a route registered in the router
    - _Requirements: 22.1, 22.2, 22.3_

- [x] 21. Bound list rendering on large collections (Req 23)
  - [x] 21.1 Virtualize large lists and cap animation stagger
    - Virtualize rendering for RiskRegister, Recommendations, and ComplianceMatrix; cap the cumulative animation stagger delay so it does not scale unbounded with list length
    - _Requirements: 23.1, 23.2, 23.3_

  - [x] 21.2 Write property test for bounded stagger delay
    - **Property 14: Animation stagger delay is bounded**
    - **Validates: Requirements 23.2, 23.3**

- [x] 22. Handle bulk import failures with progress and summary (Req 24)
  - [x] 22.1 Use Promise.allSettled with progress and summary for bulk imports
    - For the RiskRegister Excel import and AuditPlanForm procedure import, use a batch endpoint or `Promise.allSettled`, display progress, present a succeeded/failed summary, and continue past individual failures
    - _Requirements: 24.1, 24.2, 24.3, 24.4_

  - [x] 22.2 Write property test for outcome partitioning
    - **Property 15: Bulk import partitions outcomes and processes every record**
    - **Validates: Requirements 24.3, 24.4**

- [x] 23. Prevent object-URL leaks in the PDF viewer (Req 25)
  - [x] 23.1 Track and revoke object URLs in Pdf_Viewer
    - In `components/PdfViewer.tsx`, store the created object URL in a ref and revoke the previous URL on `url` prop change or unmount-before-load; revoke defensively
    - _Requirements: 25.1, 25.2, 25.3_

  - [x] 23.2 Write property test for object-URL lifecycle balance
    - **Property 16: PDF viewer never leaks object URLs**
    - **Validates: Requirements 25.2, 25.3**

- [x] 24. Align RolePermissions with the registry and translations (Req 26)
  - [x] 24.1 Use registry identifiers and a translated preview label
    - In RolePermissions, replace legacy `fallbackModules` identifiers with `Module_Registry` identifiers and render the preview-mode label from a translation key
    - _Requirements: 26.1, 26.2, 26.3_

  - [x] 24.2 Write unit test for registry-matching identifiers
    - Assert listed module identifiers match the Module_Registry
    - _Requirements: 26.1, 26.3_

- [x] 25. Add the missing Analytics i18n key (Req 27)
  - [x] 25.1 Define modules.Analytics in en.json and ar.json
    - Add the `modules.Analytics` key to both `en.json` and `ar.json`
    - _Requirements: 27.1, 27.2, 27.3_

  - [x] 25.2 Write unit test for Analytics label localization
    - Assert the label renders from the active language resource
    - _Requirements: 27.1, 27.2, 27.3_

- [x] 26. Close CSV formula-injection vectors (Req 28)
  - [x] 26.1 Expand FORMULA_TRIGGERS in Csv_Exporter
    - In `utils/csvExport.ts`, add leading tab (`\t`) and carriage return (`\r`) to `FORMULA_TRIGGERS`; keep neutralizing trigger-prefixed values and quoting fields
    - _Requirements: 28.1, 28.2, 28.3_

  - [x] 26.2 Write property test for cell neutralization
    - **Property 17: CSV cells beginning with a formula trigger are neutralized**
    - **Validates: Requirements 28.1, 28.2**

  - [x] 26.3 Write property test for CSV round-trip serialization
    - **Property 18: CSV serialization round-trips**
    - **Validates: Requirements 28.3**

- [x] 27. Replace pervasive `any` typing in identified modules (Req 29)
  - [x] 27.1 Add explicit types in NotificationBell, AuditTaskForm, RiskRegister import-mapping, and Chatbot
    - Replace `any` with explicit types across these modules without introducing new type errors
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5_

  - [x] 27.2 Verify typecheck passes with no remaining `any`
    - Run `tsc --noEmit` and assert no new type errors and no `any` in the identified modules
    - _Requirements: 29.5_

- [x] 28. Elevate export files to the per-file coverage tier (Req 30)
  - [x] 28.1 Add export files to PER_FILE_TARGETS at the 90% tier
    - In `scripts/check-coverage-thresholds.mjs`, add `csvExport.ts` and the PDF and DOCX export files to `PER_FILE_TARGETS` at 90%, failing the check when any falls below target
    - _Requirements: 30.1, 30.2, 30.3_

  - [x] 28.2 Write integration test for the coverage checker
    - Feed coverage below the 90% per-file tier for an export file and assert a non-zero exit
    - _Requirements: 30.1, 30.2, 30.3_

- [x] 29. Final checkpoint - cross-cutting verification (Req 31)
  - Ensure all tests pass, ask the user if questions arise.
  - Confirm `tsc --noEmit` typecheck passes, `npm run lint` passes within the ceiling, and `vitest --run` (including existing property tests) passes
  - Confirm no client check is the sole enforcement of an access control and the Backend remains authoritative; confirm Critical-group changes (tasks 1–4) touch disjoint modules and remain independently shippable
  - _Requirements: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6_

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP.
- Each task references specific requirements (granular sub-requirement clauses) for traceability.
- Property tests implement the 19 correctness properties from the design with fast-check at ≥100 runs, tagged `Feature: code-review-remediation, Property {n}`.
- Example, accessibility, integration, and smoke tests cover the non-universal behaviors (UI composition, accessibility, routing, lazy boundaries, virtualization, tooling, and "stop overriding a global").
- The Backend remains the authoritative enforcer everywhere a client-side check is removed or relaxed (Req 31.4, 31.5).
- Checkpoints at tasks 5, 18, and 29 ensure incremental validation between priority groups.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "3.2", "4.1", "6.1", "7.1", "7.2", "8.1", "8.2", "9.1", "10.1", "11.1", "12.1", "13.1", "14.1", "14.2", "15.1", "16.1", "16.2", "17.1", "19.1", "20.1", "21.1", "23.1", "24.1", "25.1", "26.1", "28.1"] },
    { "id": 1, "tasks": ["6.3", "15.2", "17.2", "22.1"] },
    { "id": 2, "tasks": ["6.6", "27.1"] },
    { "id": 3, "tasks": ["1.2", "1.3", "2.2", "2.3", "2.4", "3.3", "4.2", "6.2", "6.4", "6.5", "6.7", "7.3", "7.4", "8.3", "8.4", "9.2", "10.2", "11.2", "12.2", "13.2", "14.3", "15.3", "16.3", "17.3", "19.2", "20.2", "21.2", "22.2", "23.2", "24.2", "25.2", "26.2", "26.3", "27.2", "28.2"] }
  ]
}
```
