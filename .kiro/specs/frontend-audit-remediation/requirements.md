# Requirements Document

## Introduction

This document specifies the requirements for remediating findings from a comprehensive
frontend code audit of the web application (`apps/web`). The audit identified 24 issues
(5 critical, 13 warnings, 6 notes). The core systemic problem is duplicated infrastructure:
two HTTP clients, two hook layers, and two authentication flows. Most critical defects live
in the seams between these duplicated layers, where behavior diverges.

The remediation is organized around the audit's "Related Issue Groups (fix together)" so that
coupled defects are corrected as cohesive units rather than in isolation:

- **Group 1 — HTTP stack consolidation** (RUNTIME-001, RUNTIME-002, ARCH-001, ARCH-003)
- **Group 2 — Real-time notifications** (SECURITY-001, RUNTIME-003, RUNTIME-004, STATE-002)
- **Group 3 — Session and permissions lifecycle** (SECURITY-002, SECURITY-003, STATE-001, RUNTIME-005, RUNTIME-006)
- **Group 4 — List pages and the shared `useListPage` hook** (SECURITY-004, RUNTIME-007, RUNTIME-008, UX-003)
- **Group 5 — Silent failures and unified mutation feedback** (UX-002, STATE-005, SECURITY-007)
- **Standalone state and architecture issues** (STATE-003, STATE-004)
- **Lower-priority notes** (ARCH-002, ARCH-004, UX-001, SECURITY-006, PERF-002, blob URL revocation)

The 5 critical issues (RUNTIME-001, RUNTIME-002, SECURITY-001, SECURITY-002, SECURITY-004)
are prioritized for data integrity and security. Several requirements establish correctness
properties suitable for property-based testing, which the project already uses.

## Glossary

- **Web_App**: The frontend application located in `apps/web`.
- **Typed_Client**: The validated HTTP client in `apps/web/src/api/client.ts` (axios-based, schema-validated).
- **Raw_Client**: The unvalidated HTTP client in `apps/web/src/api/httpClient.ts`.
- **HTTP_Client**: The single consolidated HTTP client that the remediation converges on.
- **Query_Hooks**: The React Query hook layer in `apps/web/src/api/hooks/*`.
- **Legacy_Hooks**: The direct-API hook layer in `apps/web/src/hooks/*`.
- **Auth_Module**: The consolidated authentication module (`apps/web/src/api/modules/auth.ts`) targeting `/v1/auth/login`.
- **Retry_Layer**: A component that re-issues a failed HTTP request one or more times.
- **Idempotency_Key**: A stable identifier sent with a request so the server can deduplicate retried mutations; the remediation reuses the request correlation ID across attempts.
- **WS_Client**: The WebSocket client in `apps/web/src/api/ws/websocket-client.ts`.
- **WS_Token**: The short-lived authentication token used to establish a WebSocket connection.
- **Polling_Fallback**: The HTTP polling mechanism (`startPollingFallback()`) used to deliver notifications when the WebSocket connection cannot be sustained.
- **Notification_Store**: The state managed by `NotificationContext`, including the notification list and the unread counter.
- **Permissions_Provider**: The single source of truth for the current user's permissions (a React context provider or a React Query entry keyed on `['permissions', userId]`).
- **Default_Permissions**: The static per-role permission set (`DEFAULT_PERMISSIONS`) in `usePermissions.ts`.
- **Confirmed_Permissions**: The most recent permission set successfully returned by the permissions API for the current user.
- **Auth_Context**: The authentication context (`AuthContext`) that performs session checks.
- **List_Page_Hook**: The shared `useListPage` hook used by register and list pages.
- **Register_Page**: A list page such as `IncomingRegister`, `OutgoingRegister`, or `CorrespondenceArchive` under `apps/web/src/.../Correspondence`.
- **CSV_Exporter**: The component that serializes list data into CSV for download.
- **Mutation_Feedback_Policy**: The unified policy governing how the Web_App surfaces success and failure of data mutations to the user.
- **Error_Reporter**: The client error reporting component (`errorReporter`) that POSTs error reports to a backend endpoint.
- **Preferences_Context**: The context (`PreferencesContext`) managing user theme, language, layout, and notification preferences.
- **Optimistic_Update**: The mechanism in `useOptimisticUpdate.ts` that applies a local change before server confirmation.
- **Response_Envelope**: The standard server response wrapper containing data and pagination metadata.

## Requirements

### Group 1 — HTTP Stack Consolidation

### Requirement 1: Idempotency-Safe Retry (RUNTIME-001, CRITICAL)

**User Story:** As a user submitting data over an unreliable network, I want failed requests retried safely, so that I never create duplicate records.

#### Acceptance Criteria

1. WHEN an HTTP GET request fails with a retriable error, THE HTTP_Client SHALL retry the request.
2. WHERE a request method is POST, PUT, PATCH, or DELETE and no Idempotency_Key is attached, THE HTTP_Client SHALL NOT retry the request.
3. WHERE a mutation request carries an Idempotency_Key, THE HTTP_Client SHALL reuse the same Idempotency_Key value on every retry attempt for that request.
4. WHEN the HTTP_Client retries a request, THE HTTP_Client SHALL preserve the request correlation ID across all attempts.
5. FOR ALL retried mutation requests, the Idempotency_Key sent on the first attempt SHALL equal the Idempotency_Key sent on every subsequent attempt (idempotency-stability property).

### Requirement 2: Single Retry Layer (RUNTIME-002, CRITICAL)

**User Story:** As a user, I want a predictable number of retries per request, so that a single failed action does not trigger a storm of duplicate requests.

#### Acceptance Criteria

1. THE HTTP_Client SHALL apply exactly one Retry_Layer to any outbound request.
2. WHEN a single logical request fails repeatedly, THE HTTP_Client SHALL issue no more than the configured maximum number of attempts in total.
3. FOR ALL requests, the total number of network attempts SHALL be less than or equal to the configured maximum attempt count (no multiplicative stacking of Retry_Layers).

### Requirement 3: HTTP Infrastructure Consolidation (ARCH-001, WARNING)

**User Story:** As a developer, I want a single HTTP client and hook layer, so that all callers share validated, consistent behavior.

#### Acceptance Criteria

1. THE Web_App SHALL route all application HTTP requests through a single HTTP_Client.
2. THE Web_App SHALL use Query_Hooks as the single hook layer for data access.
3. WHILE a Legacy_Hook still has active consumers, THE Web_App SHALL migrate those consumers to the equivalent Query_Hook before removing the Legacy_Hook.
4. WHEN no consumer references a Legacy_Hook, THE Web_App SHALL remove that Legacy_Hook.
5. WHEN no consumer references the Raw_Client, THE Web_App SHALL remove the Raw_Client.
6. THE Web_App SHALL expose at most one hook per data operation name (no two same-named hooks with divergent behavior).

### Requirement 4: Unified Authentication Flow (ARCH-003, WARNING)

**User Story:** As a user logging in, I want one consistent authentication flow, so that login behaves the same everywhere and error messages remain reliable across releases.

#### Acceptance Criteria

1. THE Web_App SHALL perform authentication exclusively through the Auth_Module.
2. THE Auth_Module SHALL target the `/v1/auth/login` endpoint for login.
3. THE Web_App SHALL NOT issue raw fetch calls to `/api/auth/login`.
4. WHEN the Auth_Module receives an authentication error, THE Auth_Module SHALL map the error to a user-facing message using a stable error code.
5. THE Auth_Module SHALL NOT determine authentication error handling by comparing server message text.

### Group 2 — Real-Time Notifications

### Requirement 5: Secure WebSocket Authentication (SECURITY-001, CRITICAL)

**User Story:** As a security-conscious user, I want my authentication token kept out of URLs, so that it is not exposed in logs or browser history.

#### Acceptance Criteria

1. THE WS_Client SHALL NOT include the WS_Token in the WebSocket connection URL or its query string.
2. WHEN a WebSocket connection is established, THE WS_Client SHALL authenticate by sending the WS_Token as the first post-connect message or by relying on the cookie session.
3. IF authentication after connection fails, THEN THE WS_Client SHALL close the connection and report an authentication failure.

### Requirement 6: Notification Delivery Continuity (RUNTIME-003, WARNING)

**User Story:** As a user, I want to keep receiving notifications even when the WebSocket connection cannot be sustained, so that I never silently stop getting updates.

#### Acceptance Criteria

1. WHEN the WS_Client exhausts its configured reconnect attempts, THE WS_Client SHALL start the Polling_Fallback.
2. WHILE the Polling_Fallback is active, THE Notification_Store SHALL continue to receive new notifications.
3. WHEN a WebSocket connection is successfully re-established, THE WS_Client SHALL stop the Polling_Fallback.

### Requirement 7: Fresh WebSocket Token Per Connection (RUNTIME-004, WARNING)

**User Story:** As a user with a long session, I want each reconnect to use a valid token, so that reconnection does not fail because of an expired token.

#### Acceptance Criteria

1. WHEN the WS_Client initiates a connection attempt, THE WS_Client SHALL fetch a fresh WS_Token for that attempt.
2. THE WS_Client SHALL NOT reuse a cached WS_Token across separate connection attempts.

### Requirement 8: Accurate Unread Counter (STATE-002, WARNING)

**User Story:** As a user, I want the unread notification count to be accurate, so that the badge reflects the real number of unread notifications.

#### Acceptance Criteria

1. WHEN a notification is marked as read, IF that notification's `is_read` value is `false`, THEN THE Notification_Store SHALL decrement the unread counter by one.
2. WHEN a notification is marked as read, IF that notification's `is_read` value is already `true`, THEN THE Notification_Store SHALL leave the unread counter unchanged.
3. WHEN a notification is deleted, THE Notification_Store SHALL compute the unread-counter delta outside of any state-updater function before applying the change.
4. THE Notification_Store SHALL produce identical final state when an update is applied once and when the same update is applied twice under React StrictMode (updater-purity property).
5. FOR ALL sequences of mark-as-read and delete operations, the unread counter SHALL equal the count of notifications whose `is_read` value is `false` (unread-count-accuracy property).

### Group 3 — Session and Permissions Lifecycle

### Requirement 9: Safe Permission Fallback (SECURITY-002, CRITICAL)

**User Story:** As a security administrator, I want permission fallbacks to never widen access, so that a permissions-API failure cannot grant a restricted role broader access.

#### Acceptance Criteria

1. IF the permissions API fails for the current user, THEN THE Permissions_Provider SHALL compute the effective permission set as the intersection of Default_Permissions and Confirmed_Permissions.
2. IF the permissions API fails and no Confirmed_Permissions exist for the current user, THEN THE Permissions_Provider SHALL apply a read-only permission set.
3. THE Permissions_Provider SHALL NOT grant a permission that is absent from Confirmed_Permissions when operating in fallback mode.
4. FOR ALL roles and all Confirmed_Permissions sets, the effective fallback permission set SHALL be a subset of Confirmed_Permissions (no-privilege-escalation property).
5. THE Web_App SHALL rely on backend authorization enforcement as the authoritative access control, independent of client-side permission state.

### Requirement 10: Complete Logout Cleanup (SECURITY-003, WARNING)

**User Story:** As a user on a shared device, I want logout to clear all my data, so that the next user cannot access my cached or drafted content.

#### Acceptance Criteria

1. WHEN the user logs out, THE Web_App SHALL clear the React Query cache.
2. WHEN the user logs out, THE Web_App SHALL remove all `user_permissions_*` entries from localStorage.
3. WHEN the user logs out, THE Web_App SHALL remove all `filters_*` entries from sessionStorage.
4. WHEN the user logs out, THE Web_App SHALL remove all `draft_*` entries from localStorage.
5. WHEN the user logs out, THE Web_App SHALL remove all application-prefixed storage entries, leaving no application-prefixed key in localStorage or sessionStorage.

### Requirement 11: Single Permissions Source of Truth (STATE-001, WARNING)

**User Story:** As a user, I want consistent permissions across the whole UI, so that different parts of the app never disagree about what I can do.

#### Acceptance Criteria

1. THE Web_App SHALL maintain a single Permissions_Provider for the current user.
2. WHILE multiple components consume permissions, THE Permissions_Provider SHALL serve all consumers from one shared permission state.
3. THE Web_App SHALL NOT instantiate independent permission fetches per consuming component.

### Requirement 12: Leak-Free Session-Check Retry (RUNTIME-005, WARNING)

**User Story:** As a user navigating quickly, I want session-check retries cleaned up, so that the app does not update state on unmounted components or leak timers.

#### Acceptance Criteria

1. WHEN the Auth_Context schedules a session-check retry after a 503 response, THE Auth_Context SHALL store the retry timer in a ref.
2. WHEN the Auth_Context unmounts, THE Auth_Context SHALL clear any pending retry timer.
3. IF the Auth_Context has unmounted, THEN THE Auth_Context SHALL NOT update state from a pending session-check retry.

### Requirement 13: Permission-Gated Routing During Load (RUNTIME-006, WARNING)

**User Story:** As a user with valid permissions, I want routes to wait for permissions to load, so that I am not wrongly redirected while permissions are still loading.

#### Acceptance Criteria

1. WHILE permissions are loading, THE Web_App SHALL NOT evaluate permission-gated route access.
2. WHEN permission loading has completed, THE Web_App SHALL evaluate permission-gated route access.
3. IF permissions are loading, THEN THE Web_App SHALL render a loading state instead of redirecting.

### Group 4 — List Pages and the Shared `useListPage` Hook

### Requirement 14: CSV Injection-Safe Export (SECURITY-004, CRITICAL)

**User Story:** As a user exporting data to CSV, I want exported cells neutralized, so that opening the file cannot execute injected formulas or corrupt fields.

#### Acceptance Criteria

1. WHEN the CSV_Exporter serializes a cell value containing a double-quote character, THE CSV_Exporter SHALL escape each double-quote by doubling it.
2. WHEN the CSV_Exporter serializes a cell value whose first character is `=`, `+`, `-`, or `@`, THE CSV_Exporter SHALL prefix the cell value with a single-quote character.
3. THE CSV_Exporter in IncomingRegister, OutgoingRegister, and CorrespondenceArchive SHALL apply identical escaping and neutralization rules.
4. FOR ALL cell values, parsing the exported CSV SHALL yield the original cell text after removing any neutralizing prefix (round-trip property).
5. FOR ALL cell values whose first character is `=`, `+`, `-`, or `@`, the exported cell SHALL begin with a single-quote character (formula-neutralization property).

### Requirement 15: Stale-Response Race Protection (RUNTIME-007, WARNING)

**User Story:** As a user changing filters rapidly, I want only the latest results shown, so that an earlier slow response cannot overwrite newer data.

#### Acceptance Criteria

1. WHEN the List_Page_Hook issues a new data request, THE List_Page_Hook SHALL invalidate any in-flight prior request for the same list.
2. IF a response arrives that does not correspond to the most recent request, THEN THE List_Page_Hook SHALL discard that response.
3. THE List_Page_Hook SHALL apply only the most recently issued request's result to the displayed list.
4. FOR ALL interleavings of overlapping requests, the displayed list SHALL reflect the result of the most recently issued request (last-issued-wins property).

### Requirement 16: Page Reset On Filter Change (RUNTIME-008, WARNING)

**User Story:** As a user applying a filter, I want to return to page one, so that I see results from the beginning of the filtered set.

#### Acceptance Criteria

1. WHEN a filter value changes, THE List_Page_Hook SHALL reset the current page to one.
2. WHEN the current page is reset to one, THE List_Page_Hook SHALL request the first page of the filtered results.

### Requirement 17: Correct Empty-Result Pagination (UX-003, NOTE)

**User Story:** As a user viewing an empty list, I want accurate pagination controls, so that I am not shown invalid pages or misleading navigation.

#### Acceptance Criteria

1. WHILE the result set is empty, THE Web_App SHALL display a page indicator of "0 of 0".
2. WHILE the result set is empty, THE Web_App SHALL disable the Next and Last pagination controls.
3. WHILE the current page is the last page, THE Web_App SHALL disable the Next and Last pagination controls.

### Group 5 — Silent Failures and Unified Mutation Feedback

### Requirement 18: Visible Mutation Failure Feedback (UX-002, NOTE)

**User Story:** As a user submitting a form, I want to be told when a save fails, so that I never believe data was saved when it was not.

#### Acceptance Criteria

1. WHEN a data mutation fails, THE Web_App SHALL surface a user-visible failure indication according to the Mutation_Feedback_Policy.
2. IF a form submission fails, THEN THE Web_App SHALL keep the form open and present the failure to the user.
3. THE Web_App SHALL NOT discard a mutation error without surfacing it to the user (no silent catch).
4. WHEN a data mutation succeeds, THE Web_App SHALL surface a success indication according to the Mutation_Feedback_Policy.

### Requirement 19: Preserve Unrelated Preferences (STATE-005, WARNING)

**User Story:** As a user changing my theme or language, I want my notification preference preserved, so that an unrelated setting is not overwritten.

#### Acceptance Criteria

1. WHEN the user changes theme, language, or layout, THE Preferences_Context SHALL send the user's current `notifications_enabled` value.
2. THE Preferences_Context SHALL NOT send a hardcoded `notifications_enabled` value on a preference update.
3. WHERE a preference update does not concern notification settings, THE Preferences_Context SHALL preserve the stored `notifications_enabled` value.

### Requirement 20: Authenticated Error Reporting (SECURITY-007, NOTE)

**User Story:** As an operator, I want client error reports delivered reliably, so that production errors are not silently dropped.

#### Acceptance Criteria

1. WHEN the Error_Reporter sends an error report, THE Error_Reporter SHALL include session credentials with the request.
2. WHERE the reporting endpoint requires CSRF protection, THE Error_Reporter SHALL include the required CSRF token.
3. IF an error report fails to send, THEN THE Error_Reporter SHALL surface the delivery failure to a diagnostic channel.

### Standalone State and Architecture Issues

### Requirement 21: Server-Driven Pagination Metadata (STATE-003, WARNING)

**User Story:** As a user paging through audit plans, I want accurate totals, so that pagination reflects the real number of records on the server.

#### Acceptance Criteria

1. WHEN audit plans are fetched, THE Query_Hooks SHALL read total count and total pages from the Response_Envelope pagination metadata.
2. THE Query_Hooks SHALL NOT compute total or total-pages from the length of the current page's array.
3. WHEN a fetch is requested with page and page-size parameters, THE Query_Hooks SHALL send those parameters to the server.

### Requirement 22: Lost-Update-Safe Optimistic Rollback (STATE-004, WARNING)

**User Story:** As a user making concurrent edits, I want a failed optimistic update rolled back precisely, so that other concurrent updates are not wiped out.

#### Acceptance Criteria

1. WHEN an Optimistic_Update fails, THE Web_App SHALL revert only the affected item rather than restoring a full pre-action snapshot.
2. WHERE precise inverse reversion is not possible, THE Web_App SHALL refetch the affected data from the server on failure.
3. THE Web_App SHALL NOT restore stale concurrent updates when rolling back a failed Optimistic_Update (lost-update-prevention property).

### Lower-Priority Notes

### Requirement 23: Reachable Login Route and Unauthorized Handling (ARCH-002, NOTE)

**User Story:** As an unauthenticated user, I want the login route reachable without a full page reload, so that navigation stays within the single-page app.

#### Acceptance Criteria

1. THE Web_App SHALL keep the `/login` route reachable.
2. WHEN an unauthorized response triggers redirection, THE Web_App SHALL navigate within the single-page app rather than reloading the document via `window.location.href`.

### Requirement 24: Server-Side Findings Filtering (ARCH-004, NOTE)

**User Story:** As a user viewing audit findings, I want findings filtered on the server, so that the app does not over-fetch all records.

#### Acceptance Criteria

1. WHEN audit findings are requested with filter criteria, THE Web_App SHALL send the filter criteria to the server.
2. THE Web_App SHALL NOT download the full findings set and filter on the client.

### Requirement 25: Non-Destructive Version-Mismatch Overlay (UX-001, NOTE)

**User Story:** As a user filling a form, I want the version-mismatch overlay to avoid losing my work, so that an update notice does not discard unsaved data.

#### Acceptance Criteria

1. WHEN the version-mismatch overlay appears, THE Web_App SHALL provide a "later" option that dismisses the overlay.
2. WHERE unsaved form data exists when the overlay appears, THE Web_App SHALL persist a draft of that data before any reload.

### Requirement 26: Reject Password In User Schema (SECURITY-006, NOTE)

**User Story:** As a developer, I want the user schema to reject password fields, so that credential data is never carried on user objects.

#### Acceptance Criteria

1. WHEN the Auth_Module validates a user object containing a password field, THE Auth_Module SHALL reject the object as invalid.
2. THE Auth_Module user schema SHALL NOT define an optional password field.

### Requirement 27: Throttled Idle-Timeout Timer (PERF-002, NOTE)

**User Story:** As a user, I want the idle-timeout timer throttled, so that mouse movement does not cause excessive timer re-arming.

#### Acceptance Criteria

1. WHILE the user generates continuous mousemove events, THE Web_App SHALL re-arm the idle-timeout timer at most once per throttle interval.
2. WHEN the throttle interval elapses after activity, THE Web_App SHALL re-arm the idle-timeout timer.

### Requirement 28: Revoke Exported Blob URLs (NOTE)

**User Story:** As a user exporting files, I want temporary blob URLs released, so that repeated exports do not leak memory.

#### Acceptance Criteria

1. WHEN a CSV export blob URL has been used to trigger a download, THE Web_App SHALL revoke the blob URL via `URL.revokeObjectURL`.
2. FOR ALL completed export operations, THE Web_App SHALL leave no un-revoked export blob URL (no-leak property).
