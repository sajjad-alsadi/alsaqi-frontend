# Requirements Document

## Introduction

This specification organizes the prioritized remediation of issues identified during a full code review of the alsaqi frontend monorepo (React + TypeScript + Vite at `apps/web`, with shared code in `packages/shared`). The findings span correctness, security, accessibility, performance, and maintainability concerns.

The remediation is grouped by priority so that work can be shipped incrementally:

- **Critical** (Requirements 1–5): Defects that break core flows in development or production, cause data loss, or block legitimate user input. These are designed to be independently shippable.
- **Important** (Requirements 6–19): Defects that weaken security posture, cause silent failures, or create maintenance hazards.
- **Minor** (Requirements 20–30): Lower-impact correctness, accessibility, and tooling improvements.
- **Cross-cutting non-functional** (Requirement 31): Behavior-preservation and verification constraints that apply to all changes.

A guiding principle across all requirements: the backend remains the authoritative access-control and validation boundary. Client-side checks are advisory only and MUST NOT be relied upon for security. No remediation may weaken the authoritative backend access control.

## Glossary

- **Web_App**: The React + TypeScript + Vite single-page application located at `apps/web`.
- **Shared_Package**: The shared TypeScript code located at `packages/shared`.
- **Backend**: The server-side API that is the authoritative source for authentication, authorization, and input validation.
- **Secure_Network_Module**: The module at `apps/web/src/utils/SecureNetwork.ts`.
- **Secure_Storage_Module**: The module at `apps/web/src/utils/SecureStorage.ts`.
- **Object_Guard_Module**: The module at `apps/web/src/utils/ObjectGuard.ts`.
- **DOM_Guard_Module**: The module at `apps/web/src/utils/DOMGuard.ts`.
- **Api_Client**: The HTTP client defined in `apps/web/src/api/client.ts` and instantiated via `apps/web/src/api/index.ts` and `apps/web/src/api/httpClient.ts`.
- **Error_Reporter**: The module at `apps/web/src/utils/errorReporter.ts`.
- **Permission_Resolver**: The client-side permission logic in `apps/web/src/permissions/` (including `fallback.ts` and `modules.ts`) and `apps/web/src/permissions.ts`.
- **Logger**: The logging utilities at `apps/web/src/utils/logger.ts` and `apps/web/src/utils/SecurityLogger.ts`.
- **Notification_Context**: The React context at `apps/web/src/context/NotificationContext.tsx`.
- **Optimistic_Update_Hook**: The hook at `apps/web/src/hooks/useOptimisticUpdate.ts`.
- **Persisted_Filters_Hook**: The hook module at `apps/web/src/hooks/usePersistedFilters.ts`, including the `useScrollRestore` helper.
- **Formatting_Module**: The consolidated date/number formatting module that replaces `apps/web/src/utils/format.ts`, `apps/web/src/utils/formatService.ts`, and the formatting parts of `apps/web/src/utils/i18n.ts`.
- **Websocket_Client**: The client at `apps/web/src/api/ws/websocket-client.ts`.
- **Pdf_Viewer**: The component at `apps/web/src/components/PdfViewer.tsx`.
- **Csv_Exporter**: The module at `apps/web/src/utils/csvExport.ts`.
- **Coverage_Checker**: The script at `apps/web/scripts/check-coverage-thresholds.mjs`.
- **Lint_Config**: The ESLint configuration `apps/web/eslint.config.js` and the warning ceiling file `apps/web/.lint-ceiling.json`.
- **CSRF_Token**: The cross-site request forgery token read from a browser cookie and attached to mutating requests.
- **READ_ONLY_PERMISSION_SET**: The fallback permission set used when the permissions cache is unavailable.
- **Module_Registry**: The canonical module/action registry in `apps/web/src/permissions/modules.ts`.
- **Submit_Error_Feedback**: A user-visible error indication (e.g., a toast) shown when a form submission fails.

---

## Requirements

**Priority group: Critical (Requirements 1–5)** — Defects that break core flows, cause data loss, or block legitimate input. Independently shippable.

### Requirement 1: Remove network-layer monkey-patching

**User Story:** As a developer, I want cross-origin API calls and streaming responses to work in development and production, so that the SPA can communicate with the Backend without artificial client-side interference.

#### Acceptance Criteria

1. THE Secure_Network_Module SHALL NOT override the global `window.fetch` function.
2. THE Secure_Network_Module SHALL NOT override the global `XMLHttpRequest` behavior.
3. WHEN the Web_App running on the development origin issues a request to the Backend API on a different origin, THE Web_App SHALL send the request without raising an "Unauthorized request origin" error.
4. WHEN the Backend returns a streaming response body, THE Web_App SHALL deliver the response to the caller without buffering the full body for inspection.
5. THE Backend SHALL remain the authoritative enforcer of request origin and transport integrity through CORS and TLS controls.

### Requirement 2: Remove client-side payload pattern-blocking

**User Story:** As an auditor, I want to submit free-text audit, correspondence, and finding content containing arbitrary characters, so that legitimate content is not rejected before it reaches the Backend.

#### Acceptance Criteria

1. THE Secure_Network_Module SHALL NOT reject outgoing request bodies based on the presence of substrings such as `<script`, `onerror=`, or `javascript:`.
2. WHEN a user submits free-text content containing characters that previously matched a blocked substring, THE Web_App SHALL transmit the content unchanged to the Backend.
3. THE Backend SHALL remain the authoritative validator of request payloads, and THE Web_App SHALL rely on Backend validation and output encoding for protection against injection.

### Requirement 3: Confine secure storage to instance scope and decouple from logout

**User Story:** As an authenticated user, I want my session to persist across browser updates and storage errors, so that I am not unexpectedly logged out or lose data.

#### Acceptance Criteria

1. THE Secure_Storage_Module SHALL NOT override `Storage.prototype.getItem`, `Storage.prototype.setItem`, or `Storage.prototype.removeItem`.
2. THE Secure_Storage_Module SHALL expose secure read and write behavior through instance methods only.
3. IF an HMAC verification or decryption operation fails, THEN THE Secure_Storage_Module SHALL report the failure to the caller without invoking `clearSession()`.
4. THE Secure_Storage_Module SHALL derive its encryption key from a stable source that does not change when the browser's `navigator.userAgent` value changes.
5. WHEN the browser is updated and `navigator.userAgent` changes, THE Web_App SHALL retain the existing session.

### Requirement 4: Handle form submission failures in Legal and Regulatory forms

**User Story:** As a user filling out a Legal or Regulatory form, I want clear feedback when a save fails, so that I can retry and avoid duplicate submissions.

#### Acceptance Criteria

1. WHEN a save request initiated from `LegalForm.tsx` fails, THE Web_App SHALL display Submit_Error_Feedback to the user.
2. WHEN a save request initiated from `RegulatoryForm.tsx` fails, THE Web_App SHALL display Submit_Error_Feedback to the user.
3. WHILE a save request from `LegalForm.tsx` or `RegulatoryForm.tsx` is in progress, THE Web_App SHALL maintain an `isSubmitting` state that disables the submit control.
4. WHILE the `isSubmitting` state is active, THE Web_App SHALL prevent a second submission of the same form.
5. WHEN a save request from `LegalForm.tsx` or `RegulatoryForm.tsx` completes with failure, THE Web_App SHALL clear the `isSubmitting` state so the user can retry.

### Requirement 5: Restore focus to the trigger element on modal close

**User Story:** As a keyboard user, I want focus to return to the element that opened a modal when the modal closes, so that I can continue navigating without losing my place.

#### Acceptance Criteria

1. WHEN a modal rendered by `Modal.tsx` closes, THE Web_App SHALL restore keyboard focus to the element that triggered the modal.
2. THE FocusTrap component SHALL perform focus restoration within its effect cleanup so that restoration runs before the trapped element unmounts.
3. WHEN focus restoration runs and the original trigger element is no longer present in the document, THE Web_App SHALL move focus to a defined fallback element without raising an error.

---

**Priority group: Important (Requirements 6–19)** — Defects that weaken security posture, cause silent failures, or create maintenance hazards.

### Requirement 6: Parse CSRF tokens without truncation

**User Story:** As a user performing mutations, I want CSRF protection to work reliably, so that my create, update, and delete requests succeed.

#### Acceptance Criteria

1. WHEN the Api_Client reads the CSRF_Token from the cookie row, THE Api_Client SHALL extract the value using a method that preserves all characters following the first `=`, including base64 `=` padding.
2. WHEN the Error_Reporter reads the CSRF_Token from the cookie row, THE Error_Reporter SHALL extract the value using a method that preserves all characters following the first `=`.
3. WHEN a CSRF_Token value is URL-encoded in the cookie, THE Web_App SHALL apply `decodeURIComponent` to the extracted value before use.
4. WHEN a mutating request is sent with a CSRF_Token that contains `=` padding, THE Backend SHALL receive the complete, untruncated token value.

### Requirement 7: Constrain the no-cache fallback permission set

**User Story:** As a security owner, I want low-privilege roles to be denied admin routes even during a permissions cache outage, so that no client-side privilege escalation occurs.

#### Acceptance Criteria

1. WHEN the permissions cache is unavailable on first load, THE Permission_Resolver SHALL compute the fallback permission set as the intersection of READ_ONLY_PERMISSION_SET with the role's static default permissions.
2. WHILE operating with the fallback permission set, THE Permission_Resolver SHALL NOT grant View access to a module that the role's static defaults do not include.
3. IF a low-privilege role requests a UserManagement or SystemLogs route during a permissions cache outage, THEN THE Permission_Resolver SHALL deny client-side access.
4. THE Backend SHALL remain the authoritative authority for route access regardless of the client-side fallback result.

### Requirement 8: Establish a single source of truth for default permissions

**User Story:** As a maintainer, I want one authoritative definition of default permissions, so that module and action definitions do not diverge.

#### Acceptance Criteria

1. THE Permission_Resolver SHALL derive default permissions from a single source so that `permissions.ts` defaults and the Module_Registry remain consistent.
2. THE Permission_Resolver SHALL NOT grant an action on a module unless the Module_Registry lists that action as valid for that module.
3. THE single source of truth SHALL include the Analytics module and the Policies module.
4. WHEN a module or action is added or removed in the single source of truth, THE derived permission definitions SHALL reflect the change without requiring a separate manual edit to a second list.

### Requirement 9: Scope token-refresh state per API client instance

**User Story:** As a user, I want token refreshes to be coordinated correctly, so that concurrent requests do not trigger redundant or re-entrant refresh attempts.

#### Acceptance Criteria

1. THE Api_Client SHALL maintain its token-refresh state (refresh-in-progress flag, queued subscribers, and version-mismatch indicator) per client instance rather than as module-global state shared across instances.
2. WHEN a queued request is retried after a token refresh, THE Api_Client SHALL mark the retried request with the post-refresh retry indicator.
3. IF a retried request carries the post-refresh retry indicator, THEN THE Api_Client SHALL NOT re-enter the token-refresh branch for that request.
4. WHEN two Api_Client instances exist concurrently, THE refresh state of one instance SHALL NOT affect the refresh behavior of the other instance.

### Requirement 10: Redact sensitive data before forwarding logs

**User Story:** As a security owner, I want logs forwarded to the Backend to exclude tokens and unvetted context, so that sensitive data is not leaked.

#### Acceptance Criteria

1. WHEN the Logger forwards a log entry to the Backend, THE Logger SHALL apply an allowlist or redaction policy to caller-supplied context before transmission.
2. WHEN the Logger forwards the current location, THE Logger SHALL strip the query string from the URL before transmission.
3. THE Logger SHALL NOT transmit query-string tokens contained in `window.location.href` to the Backend.
4. WHEN context contains a field not present in the allowlist, THE Logger SHALL exclude or redact that field before transmission.

### Requirement 11: Remove or narrowly scope runtime guards

**User Story:** As a developer, I want third-party libraries and the application to run without interference from broad runtime guards, so that legitimate functionality and performance are preserved.

#### Acceptance Criteria

1. THE Object_Guard_Module SHALL NOT permanently override and freeze `Object.defineProperty` process-wide.
2. THE DOM_Guard_Module SHALL NOT run a document-wide MutationObserver for keylogger detection based on handler `toString()` inspection.
3. WHERE a guard behavior is retained, THE Web_App SHALL scope that behavior narrowly to a defined target rather than applying it globally.
4. WHEN the Web_App loads a third-party library that defines properties via `Object.defineProperty`, THE library SHALL initialize without error caused by the Object_Guard_Module.

### Requirement 12: Provide consistent error-boundary coverage for lazy routes

**User Story:** As a user, I want a render error in one feature to be contained, so that the rest of the application keeps working.

#### Acceptance Criteria

1. THE Web_App SHALL wrap every lazy-loaded route in `App.tsx` with a ModuleErrorBoundary.
2. WHEN a render error occurs within the Dashboard, AuditTasks, Recommendations, RiskRegister, OrgStructure, Notifications, Settings, AuditEvidence, AuditCharter, or AuditProgramLibrary route, THE ModuleErrorBoundary SHALL contain the error to that route.
3. WHEN a render error is contained by a ModuleErrorBoundary, THE Web_App SHALL keep the application shell and other routes operational.

### Requirement 13: Preserve concurrently arriving notifications

**User Story:** As a user, I want notifications that arrive while I am marking or deleting other notifications to be retained, so that I do not miss real-time updates.

#### Acceptance Criteria

1. WHEN `markAsRead` updates notification state in the Notification_Context, THE Notification_Context SHALL compute the next state using a functional updater that reads the latest previous state.
2. WHEN `deleteNotification` updates notification state in the Notification_Context, THE Notification_Context SHALL compute the next state using a functional updater that reads the latest previous state.
3. IF a WebSocket notification arrives during an awaited `markAsRead` or `deleteNotification` operation, THEN THE Notification_Context SHALL retain that arriving notification in the resulting state.

### Requirement 14: Make optimistic-update rollback concurrency-safe

**User Story:** As a user, I want a failed optimistic update to roll back only its own change, so that concurrent optimistic updates are not lost.

#### Acceptance Criteria

1. WHEN an optimistic update is rolled back, THE Optimistic_Update_Hook SHALL apply the revert against the live state using a functional setter.
2. IF a second optimistic update is applied before a first update's rollback executes, THEN the rollback of the first update SHALL preserve the second update's change.
3. THE Optimistic_Update_Hook SHALL NOT revert state from a snapshot captured before concurrent updates were applied.

### Requirement 15: Scope scroll-restoration observation to the target element

**User Story:** As a user, I want scroll restoration to work without degrading performance, so that the page remains responsive during DOM changes.

#### Acceptance Criteria

1. THE Persisted_Filters_Hook's `useScrollRestore` helper SHALL NOT register a document-wide MutationObserver with `subtree: true`.
2. THE `useScrollRestore` helper SHALL observe a defined target element or use a ResizeObserver tied to that element.
3. WHEN the component using `useScrollRestore` unmounts, THE helper SHALL remove its observers and listeners in effect cleanup.
4. THE `useScrollRestore` helper SHALL NOT accumulate duplicate scroll listeners across re-renders.

### Requirement 16: Translate form schemas and surface submit errors

**User Story:** As a non-English-speaking user, I want validation and submission errors shown in my language, so that I understand what to correct.

#### Acceptance Criteria

1. THE FindingForm component SHALL define its validation schema inside the component using translation function `t(...)` for messages.
2. THE RecommendationForm component SHALL define its validation schema inside the component using translation function `t(...)` for messages.
3. WHEN a submission fails in FindingForm or RecommendationForm, THE Web_App SHALL display Submit_Error_Feedback to the user in addition to any log entry.
4. THE FindingForm and RecommendationForm components SHALL follow the submission-error handling pattern established by AuditTaskForm.

### Requirement 17: Consolidate date and number formatting

**User Story:** As a user, I want dates and numbers displayed consistently, so that the application uses one canonical Arabic locale throughout.

#### Acceptance Criteria

1. THE Web_App SHALL provide a single Formatting_Module for date and number formatting.
2. THE Formatting_Module SHALL use one canonical Arabic locale for all date and number formatting.
3. THE Web_App SHALL NOT retain divergent formatting implementations in `format.ts`, `formatService.ts`, and `i18n.ts` that use different locales.
4. WHEN a date or number is formatted anywhere in the Web_App, THE result SHALL come from the Formatting_Module.

### Requirement 18: Make interactive elements keyboard-accessible

**User Story:** As a keyboard and assistive-technology user, I want notification and chatbot controls to be operable, so that I can use the application without a mouse.

#### Acceptance Criteria

1. THE NotificationBell component SHALL render interactive notification rows as elements with an accessible button role, keyboard focusability, and activation via keyboard.
2. WHEN a notification list or popover in the NotificationBell component is open and the user presses Escape, THE Web_App SHALL close it.
3. THE Chatbot component SHALL provide an accessible label for each icon-only button.
4. WHEN a user navigates the NotificationBell rows and Chatbot buttons using the keyboard, THE Web_App SHALL expose them to assistive technology with their role and label.

### Requirement 19: Establish a lint-debt ratchet

**User Story:** As a maintainer, I want lint warnings to trend down and not regress, so that lint debt is controlled over time.

#### Acceptance Criteria

1. THE Lint_Config SHALL enforce a maximum warning count during `npm run lint` so that exceeding the configured ceiling fails the command.
2. WHEN the number of lint warnings exceeds the configured ceiling in `.lint-ceiling.json`, THE lint command SHALL exit with a non-zero status.
3. THE remediation SHALL reduce the warning ceiling below the current value of 497.
4. WHEN lint warnings are reduced below the current ceiling, THE ceiling SHALL be lowered to the new count to prevent regression.

---

**Priority group: Minor (Requirements 20–30)** — Lower-impact correctness, accessibility, and tooling improvements.

### Requirement 20: Guard version comparison against malformed input

**User Story:** As a user, I want the version-mismatch reload overlay to appear only on a genuine mismatch, so that I am not interrupted by spurious reloads.

#### Acceptance Criteria

1. WHEN the Api_Client compares versions in `isMajorMinorMatch` and either operand parses to NaN, THE Api_Client SHALL treat the comparison as a non-mismatch.
2. IF a version string is malformed, THEN THE Api_Client SHALL NOT force the version-mismatch reload overlay solely because parsed values are NaN.
3. WHEN both version operands are valid and their major and minor components are equal, THE Api_Client SHALL report a match.

### Requirement 21: Maintain notification connectivity on transient token failure

**User Story:** As a user, I want notifications to resume after a transient token-fetch failure, so that I do not silently stop receiving updates.

#### Acceptance Criteria

1. IF `getToken()` returns null while the Websocket_Client is connecting, THEN THE Websocket_Client SHALL schedule a reconnect or fallback attempt rather than remaining permanently disconnected.
2. WHEN a transient token-fetch failure is resolved, THE Websocket_Client SHALL re-establish the notification connection.
3. THE Websocket_Client documentation SHALL describe token acquisition using the cookie/ws-token model rather than a `localStorage` token example.

### Requirement 22: Correct the Dashboard KPI route target

**User Story:** As a user, I want the Dashboard KPI card link to lead to a real destination, so that I am not silently redirected to the dashboard.

#### Acceptance Criteria

1. THE Dashboard KPI card SHALL link to a route that is registered in the Web_App router.
2. WHEN a user activates the KPI card that previously linked to `/regulatory`, THE Web_App SHALL navigate to a defined, registered route.
3. THE Web_App SHALL NOT contain a KPI card link that falls through to `/dashboard` because its target route is undefined.

### Requirement 23: Bound list rendering on large collections

**User Story:** As a user with large datasets, I want long lists to render efficiently, so that the interface remains responsive.

#### Acceptance Criteria

1. THE RiskRegister, Recommendations, and ComplianceMatrix lists SHALL virtualize rendering of large collections.
2. THE Web_App SHALL cap the cumulative animation stagger delay applied to list items so that the delay does not scale unbounded with list length.
3. WHEN a list contains a large number of items, THE Web_App SHALL render the list without applying an index-scaled animation delay that grows without bound.

### Requirement 24: Handle bulk import failures with progress and summary

**User Story:** As a user importing data, I want progress and a clear summary of partial failures, so that I know which records succeeded and which failed.

#### Acceptance Criteria

1. WHEN the RiskRegister Excel import or AuditPlanForm procedure import writes multiple records, THE Web_App SHALL use a batch endpoint or process the writes with `Promise.allSettled`.
2. WHILE a bulk import is in progress, THE Web_App SHALL display progress to the user.
3. WHEN a bulk import completes with some records failing, THE Web_App SHALL present a summary identifying succeeded and failed records.
4. IF one record in a bulk import fails, THEN THE Web_App SHALL continue processing the remaining records.

### Requirement 25: Prevent object-URL leaks in the PDF viewer

**User Story:** As a user viewing PDFs, I want object URLs released reliably, so that memory is not leaked when navigation occurs.

#### Acceptance Criteria

1. WHEN the Pdf_Viewer creates an object URL on the fetch path, THE Pdf_Viewer SHALL store the created URL in a ref.
2. WHEN the `url` prop changes or the Pdf_Viewer unmounts before a load completes, THE Pdf_Viewer SHALL revoke the previously created object URL.
3. THE Pdf_Viewer SHALL revoke a tracked object URL defensively to avoid leaking URLs across loads.

### Requirement 26: Align RolePermissions with the registry and translations

**User Story:** As an administrator managing roles, I want role permission identifiers and labels to match the registry and be translated, so that the interface is accurate and localized.

#### Acceptance Criteria

1. THE RolePermissions component SHALL use Module_Registry identifiers rather than legacy `fallbackModules` identifiers that do not match the registry.
2. THE RolePermissions component SHALL render the preview-mode label using a translation key rather than the hardcoded string "(Preview Mode)".
3. WHEN the RolePermissions component lists modules, THE listed identifiers SHALL match the identifiers defined in the Module_Registry.

### Requirement 27: Add the missing Analytics i18n key

**User Story:** As a user, I want the Analytics module label to display correctly in both languages, so that the interface has no missing translations.

#### Acceptance Criteria

1. THE Web_App SHALL define the `modules.Analytics` key in `en.json`.
2. THE Web_App SHALL define the `modules.Analytics` key in `ar.json`.
3. WHEN the Web_App renders the Analytics module label, THE displayed text SHALL come from the localized translation resource for the active language.

### Requirement 28: Close CSV formula-injection vectors

**User Story:** As a security owner, I want CSV exports to neutralize spreadsheet-injection vectors, so that exported files cannot trigger formula execution.

#### Acceptance Criteria

1. THE Csv_Exporter SHALL include leading tab (`\t`) and carriage return (`\r`) among its formula-trigger characters.
2. WHEN a field value begins with a formula-trigger character, THE Csv_Exporter SHALL neutralize the value before writing it.
3. THE Csv_Exporter SHALL continue to quote exported fields.

### Requirement 29: Replace pervasive `any` typing in identified modules

**User Story:** As a maintainer, I want strong typing in high-traffic modules, so that type errors are caught at compile time.

#### Acceptance Criteria

1. THE NotificationBell component SHALL replace `any` typing with explicit types.
2. THE AuditTaskForm component SHALL replace `any` typing with explicit types.
3. THE RiskRegister import-mapping logic SHALL replace `any` typing with explicit types.
4. THE Chatbot component SHALL replace `any` typing with explicit types.
5. WHEN the project typecheck runs, THE identified modules SHALL pass without introducing new type errors.

### Requirement 30: Elevate export files to the per-file coverage tier

**User Story:** As a maintainer, I want export utilities held to the higher coverage tier, so that critical export logic is well tested.

#### Acceptance Criteria

1. THE Coverage_Checker SHALL include `csvExport.ts` in `PER_FILE_TARGETS` at the 90% per-file tier.
2. THE Coverage_Checker SHALL include the PDF and DOCX export files in `PER_FILE_TARGETS` at the 90% per-file tier.
3. IF an export file listed in `PER_FILE_TARGETS` falls below its 90% per-file target, THEN THE Coverage_Checker SHALL fail the coverage check.

---

**Cross-cutting non-functional (Requirement 31)** — Behavior-preservation and verification constraints that apply to all changes.

### Requirement 31: Preserve existing behavior and authoritative access control

**User Story:** As a maintainer, I want every remediation change to preserve existing behavior and not weaken backend access control, so that the remediation is safe to ship incrementally.

#### Acceptance Criteria

1. THE remediation SHALL keep the project typecheck passing after changes.
2. THE remediation SHALL keep the lint command passing within the configured warning ceiling after changes.
3. THE remediation SHALL keep the vitest suites, including the existing property-based tests, passing after changes.
4. THE remediation SHALL NOT weaken the authoritative Backend access control.
5. WHERE a client-side check is removed or relaxed, THE Backend SHALL remain the authoritative enforcer of the corresponding control.
6. THE Critical requirements (Requirements 1 through 5) SHALL be implementable and shippable independently of one another and of the Important and Minor requirements.
