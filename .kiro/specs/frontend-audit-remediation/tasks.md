# Implementation Plan: Frontend Audit Remediation

## Overview

This plan implements the 28 audit-remediation requirements in TypeScript (the existing
`apps/web` React stack), organized so each step builds on the previous and ends with wiring
into the running app. Foundational, single-purpose utilities (single retry/idempotency layer,
auth error mapping, CSV export, `useListPage`, mutation feedback) are built first, validated by
property-based tests, then adopted by contexts, hooks, and pages. The final epic consolidates
the duplicated HTTP/hook/auth infrastructure once all consumers have a single, correct target.

Property tests use `fast-check` + `vitest` (`{ numRuns: 100 }` minimum) and each references the
design's Correctness Properties. Test sub-tasks marked with `*` are optional.

## Tasks

- [x] 1. Single retry + idempotency layer (Req 1, 2)
  - [x] 1.1 Add correlated request config, idempotency keys, and retry eligibility in `client.ts`
    - Add `CorrelatedRequestConfig` (`__correlationId`, `__idempotencyKey`, `__retryCount`)
    - Generate `__correlationId` once and set `x-correlation-id` on every attempt
    - Generate a stable `Idempotency-Key` for mutations (optional `idempotent` flag on typed `post/put/patch/delete`) and reuse it across attempts
    - Implement `isRetryEligible(config)`: GET/HEAD always eligible; mutations only when a key is present
    - Gate `requestWithRetry` on `isRetryEligible` + `isRetriableError`, bound by `MAX_RETRY_ATTEMPTS`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2_

  - [x] 1.2 Write property tests for retry and idempotency
    - **Property 1: Stable identifiers across retries** (Validates: Requirements 1.3, 1.4, 1.5)
    - **Property 2: Mutations without an idempotency key are not retried** (Validates: Requirements 1.2)
    - **Property 3: Retriable GET requests retry up to the bound** (Validates: Requirements 1.1)
    - **Property 4: Bounded total attempts (no multiplicative stacking)** (Validates: Requirements 2.1, 2.2, 2.3)
    - File: `src/api/__tests__/retry-idempotency.property.test.ts`; stub Axios adapter to count attempts and capture headers

  - [x] 1.3 Remove the second retry interceptor from `httpClient.ts`
    - Delete the response interceptor retry block so only `requestWithRetry` retries
    - Keep base-URL resolution and structured `onError` reporting
    - _Requirements: 2.1, 2.3_

- [x] 2. Unified authentication and user schema hardening (Req 4, 26)
  - [x] 2.1 Add stable auth error-code mapping in `Auth_Module` (`auth.ts`)
    - Define `AuthErrorCode` and `mapAuthError(error)` using HTTP status + server `error.code` only
    - Never branch on server message text; map codes to localized messages via the i18n catalog in the UI
    - _Requirements: 4.4, 4.5_

  - [x] 2.2 Write property test for auth error mapping
    - **Property 5: Auth error mapping is total and message-independent** (Validates: Requirements 4.4, 4.5)
    - File: `src/api/modules/__tests__/auth-error-map.property.test.ts`

  - [x] 2.3 Route all login through `api.auth.login`
    - Remove raw `fetch('/api/auth/login')` paths in `Login.tsx` and any legacy hook
    - Ensure `Auth_Module` targets `/v1/auth/login` for all callers
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 2.4 Make `UserSchema` reject password fields (`auth.ts`)
    - Remove the optional `password` field and apply `.strict()` (or a refinement) so a user object containing `password` fails validation
    - _Requirements: 26.1, 26.2_

  - [x] 2.5 Write property test for user schema password rejection
    - **Property 21: User schema rejects password fields** (Validates: Requirements 26.1, 26.2)
    - File: `src/api/modules/__tests__/user-schema.property.test.ts`

- [x] 3. Secure, resilient WebSocket notifications (Req 5, 6, 7)
  - [x] 3.1 Secure WS authentication in `websocket-client.ts`
    - Open `new WebSocket(wsUrl)` without `?token=`; send `{ type: 'auth', token }` as first post-connect message (or rely on cookie session)
    - On `auth_error`/auth-coded close, invoke `onAuthFailure`, close the socket, and report the failure
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 3.2 Fetch a fresh token per connection attempt
    - Change `getToken` to async, awaited per `attemptConnection`
    - Remove the `wsTokenRef` cache in `NotificationContext`; call `api.notifications.wsToken()` each attempt
    - _Requirements: 7.1, 7.2_

  - [x] 3.3 Write property tests for WS token URL safety and freshness
    - **Property 6: WebSocket token never appears in the connection URL** (Validates: Requirements 5.1)
    - **Property 7: Fresh token fetched per connection attempt** (Validates: Requirements 7.1, 7.2)
    - File: `src/api/ws/__tests__/ws-auth.property.test.ts`

  - [x] 3.4 Polling fallback on reconnect exhaustion (`websocket-client.ts` + `NotificationContext`)
    - Start `startPollingFallback` when reconnect attempts are exhausted (`failed` state) so the Notification_Store keeps receiving updates
    - Stop polling when a WebSocket connection is successfully re-established
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 3.5 Write unit tests for WS auth-failure and polling transitions
    - Auth message sent on open, auth-failure close path, polling start/continue/stop transitions
    - _Requirements: 5.2, 5.3, 6.1, 6.2, 6.3_

- [x] 4. Notification unread-counter purity (Req 8)
  - [x] 4.1 Make unread-counter updates pure in `NotificationContext`
    - Add pure `unreadDelta(prev, next)` and authoritative `recomputeUnread(list)` helpers
    - `markAsRead`: decrement only when the target was actually unread; compute delta outside the `setNotifications` updater path
    - `deleteNotification`: compute the delta before calling the state updater (StrictMode-safe)
    - Maintain invariant `unreadCount === notifications.filter(n => !n.is_read).length`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 4.2 Write property tests for unread counter accuracy and purity
    - **Property 8: Unread-count accuracy** (Validates: Requirements 8.1, 8.2, 8.5)
    - **Property 9: Updater purity under double invocation** (Validates: Requirements 8.3, 8.4)
    - File: `src/context/__tests__/notification-unread.property.test.ts`

- [x] 5. Permissions single source of truth and safe fallback (Req 9, 11)
  - [x] 5.1 Implement narrowing permission fallback
    - Add `READ_ONLY_PERMISSION_SET`, `intersect(a, b)`, and `computeFallback(confirmed, staticDefaults)`
    - On failure with confirmed permissions: intersect; with no confirmed: read-only
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 5.2 Write property test for no privilege escalation
    - **Property 10: No privilege escalation in fallback** (Validates: Requirements 9.1, 9.2, 9.3, 9.4)
    - File: `src/permissions/__tests__/fallback.property.test.ts`

  - [x] 5.3 Introduce `Permissions_Provider` as the single source of truth
    - One React Query entry `['permissions', userId]` backing a context provider
    - Make `usePermissions()` a thin selector over the provider; remove per-component fetches
    - Wire the provider near the app root so all consumers share one fetch
    - _Requirements: 9.5, 11.1, 11.2, 11.3_

  - [x] 5.4 Write unit test for single shared permission fetch
    - Multiple consumers resolve from one fetch (no independent per-component fetch)
    - _Requirements: 11.2, 11.3_

- [x] 6. Complete logout cleanup (Req 10)
  - [x] 6.1 Implement `clearAppStorage` and `APP_PREFIXES`
    - Clear React Query cache; iterate `localStorage`/`sessionStorage` and remove any key matching an application prefix (`user_permissions_`, `filters_`, `draft_`, `scroll_`, `audit_`, `alsaqi_`, ...)
    - Wrap storage access in try/catch; invoke from the logout flow
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 6.2 Write property test for logout storage cleanup
    - **Property 11: Logout clears all application-prefixed storage** (Validates: Requirements 10.2, 10.3, 10.4, 10.5)
    - File: `src/context/__tests__/logout-cleanup.property.test.ts`

- [x] 7. Checkpoint - core consolidation and security fixes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Session lifecycle and permission-gated routing (Req 12, 13)
  - [x] 8.1 Make session-check retry leak-free in `AuthContext`
    - Store the 503 retry timer in `retryTimerRef`; clear it on unmount
    - Guard state updates with `isMountedRef` so no update occurs after unmount
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 8.2 Write unit test for retry-timer cleanup and post-unmount guard
    - Use `vi.useFakeTimers()` to assert timer cleared on unmount and no post-unmount state update
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 8.3 Add `RequirePermission` wrapper and gate routes in `App.tsx`
    - Render a loading state while permissions load (do not redirect); evaluate access only after load; redirect to `/dashboard` when not permitted
    - Wrap gated `<Route>` elements with `RequirePermission`
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 8.4 Write unit test for permission-gated routing
    - Renders loading vs. redirect vs. allowed for loading/denied/permitted states
    - _Requirements: 13.1, 13.2, 13.3_

- [x] 9. Injection-safe shared CSV export (Req 14, 28)
  - [x] 9.1 Create shared `csvExport` util (`src/utils/csvExport.ts`)
    - `neutralizeCell` (prefix `'` for leading `= + - @`, double embedded quotes), `toCsvField`, `buildCsv(headers, rows)`
    - `downloadCsv(filename, csv)` creates a blob URL and revokes it via `URL.revokeObjectURL` in a `finally` block
    - Add a test-only `parseCsv` helper to support the round-trip property
    - _Requirements: 14.1, 14.2, 14.3, 14.5, 28.1, 28.2_

  - [x] 9.2 Write property tests for CSV escaping and neutralization
    - **Property 12: CSV export round-trip** (Validates: Requirements 14.1, 14.3, 14.4)
    - **Property 13: CSV formula neutralization** (Validates: Requirements 14.2, 14.5)
    - File: `src/utils/__tests__/csvExport.property.test.ts`

  - [x] 9.3 Write property test for blob URL revocation
    - **Property 23: No leaked export blob URLs** (Validates: Requirements 28.1, 28.2)
    - File: `src/utils/__tests__/csvExport-blob.property.test.ts`; spy on `URL.createObjectURL`/`revokeObjectURL`

  - [x] 9.4 Adopt `csvExport` in register pages
    - Replace ad-hoc CSV logic in `IncomingRegister`, `OutgoingRegister`, and `CorrespondenceArchive` with the shared util so all apply identical rules
    - _Requirements: 14.3_

- [x] 10. Shared list-page hook (Req 15, 16, 17)
  - [x] 10.1 Implement `useListPage` (`src/hooks/useListPage.ts`)
    - Last-issued-wins via a monotonic request-id ref: apply a response only if its id is the latest
    - `setFilter` resets `page` to 1 and requests the first filtered page
    - Pure `paginationView(total, page, pageSize)` derives `"0 of 0"` when empty and disables Next/Last when empty or on the last page
    - Surface `total`/`totalPages` from `Response_Envelope` meta
    - _Requirements: 15.1, 15.2, 15.3, 16.1, 16.2, 17.1, 17.2, 17.3_

  - [x] 10.2 Write property tests for list-page behavior
    - **Property 14: Last-issued request wins** (Validates: Requirements 15.1, 15.2, 15.3, 15.4)
    - **Property 15: Page reset on filter change** (Validates: Requirements 16.1, 16.2)
    - **Property 16: Correct pagination view for empty and last pages** (Validates: Requirements 17.1, 17.2, 17.3)
    - File: `src/hooks/__tests__/useListPage.property.test.ts`

- [x] 11. Mutation feedback and preference preservation (Req 18, 19)
  - [x] 11.1 Implement `withMutationFeedback` policy
    - Wrap mutations: success toast on success; visible failure (toast/inline) on error with the form kept open; never swallow errors
    - Route Query_Hook `onError`/`onSuccess` through the policy
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

  - [x] 11.2 Write unit tests for mutation feedback
    - Success toast, failure keeps form open, no silent catch
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

  - [x] 11.3 Preserve `notifications_enabled` in `PreferencesContext`
    - Track the stored value in a ref and send it on every `/preferences` PUT instead of a hardcoded `true`
    - _Requirements: 19.1, 19.2, 19.3_

  - [x] 11.4 Write property test for preference preservation
    - **Property 17: Preferences preserve notifications_enabled** (Validates: Requirements 19.1, 19.2, 19.3)
    - File: `src/context/__tests__/preferences.property.test.ts`

- [x] 12. Server-driven data fetching and safe optimistic rollback (Req 21, 22, 24)
  - [x] 12.1 Surface server pagination metadata in `useAuditPlans`
    - Read `total`/`totalPages` from `Response_Envelope` meta (never `data.length`); send page/pageSize params to the server
    - _Requirements: 21.1, 21.2, 21.3_

  - [x] 12.2 Write property test for server-driven pagination metadata
    - **Property 18: Server-driven pagination metadata** (Validates: Requirements 21.1, 21.2, 21.3)
    - File: `src/api/hooks/__tests__/auditPlans-pagination.property.test.ts`

  - [x] 12.3 Server-side findings filtering in `useFindings`
    - Forward filter criteria as query params; stop downloading the full set and filtering on the client
    - _Requirements: 24.1, 24.2_

  - [x] 12.4 Write property test for server-side findings filtering
    - **Property 20: Server-side findings filtering** (Validates: Requirements 24.1, 24.2)
    - File: `src/api/hooks/__tests__/findings-filter.property.test.ts`

  - [x] 12.5 Lost-update-safe optimistic rollback in `useOptimisticUpdate`
    - Change contract to `revertItem` (invert only the affected item; return null when imprecise) with `refetch` fallback; never restore a full pre-action snapshot
    - _Requirements: 22.1, 22.2, 22.3_

  - [x] 12.6 Write property test for optimistic rollback
    - **Property 19: Lost-update-safe optimistic rollback** (Validates: Requirements 22.1, 22.2, 22.3)
    - File: `src/hooks/__tests__/useOptimisticUpdate.property.test.ts`

- [x] 13. Checkpoint - data, list, and feedback layers
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Hygiene hardening notes (Req 20, 23, 25, 27)
  - [x] 14.1 Authenticate error reporting in `errorReporter`
    - Send credentials with the request, include the CSRF token where required, and surface delivery failures to a diagnostic channel
    - _Requirements: 20.1, 20.2, 20.3_

  - [x] 14.2 Write unit test for authenticated error reporting
    - Credentialed + CSRF header included; delivery failure surfaced to diagnostics
    - _Requirements: 20.1, 20.2, 20.3_

  - [x] 14.3 Non-destructive version-mismatch overlay in `client.ts`
    - Add a "later" button that dismisses the overlay and persists a `draft_*` snapshot (via `useFormAutosave`) before any reload
    - _Requirements: 25.1, 25.2_

  - [x] 14.4 Throttle the idle-timeout timer in `useIdleTimeout`
    - Wrap `handleActivity` in a leading-edge throttle so continuous `mousemove` re-arms at most once per interval, and re-arms again after the interval elapses
    - _Requirements: 27.1, 27.2_

  - [x] 14.5 Write property test for idle timer throttling
    - **Property 22: Idle timer throttling** (Validates: Requirements 27.1)
    - File: `src/hooks/__tests__/useIdleTimeout.property.test.ts`; use `vi.useFakeTimers()`

  - [x] 14.6 SPA-internal unauthorized redirect
    - Refactor `onUnauthorized` in `httpClient.ts`/`index.ts` to dispatch an in-app navigation event consumed by a top-level listener calling `navigate('/login')`; keep `/login` reachable and avoid `window.location.href`
    - _Requirements: 23.1, 23.2_

- [x] 15. HTTP/hook/auth infrastructure consolidation (Req 3)
  - [x] 15.1 Migrate Legacy_Hook and Raw_Client consumers to Query_Hooks
    - Inventory consumers of `src/hooks/*` data hooks and the `httpClient` default export
    - Migrate each to the equivalent `src/api/hooks/*` Query_Hook, adding thin Query_Hooks where missing
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 15.2 Remove orphaned Legacy_Hooks and the Raw_Client
    - Remove each Legacy_Hook with zero consumers and the `httpClient.ts` default export once unreferenced
    - _Requirements: 3.4, 3.5_

  - [x] 15.3 Write guard test for consolidation invariants
    - Assert no imports of removed Legacy_Hooks or Raw_Client, no two same-named hooks with divergent behavior, and no remaining `fetch('/api/auth/login')`
    - File extends `src/api/modules/__tests__/import-standardization.guard.test.ts`
    - _Requirements: 3.1, 3.2, 3.6, 4.1, 4.2, 4.3_

- [x] 16. Final checkpoint - full remediation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (property, unit, integration, and guard tests) and can be skipped for a faster MVP.
- Each task references specific granular requirement clauses for traceability.
- Property-based tests use `fast-check` with `{ numRuns: 100 }` minimum and a comment header `// Feature: frontend-audit-remediation, Property {n}: {text}`.
- Consolidation (Epic 15) runs last so all consumers have a single, correct migration target.
- Checkpoints provide incremental validation between layers.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "5.1", "6.1", "9.1", "10.1", "11.1", "11.3", "12.1", "12.3", "12.5", "14.1", "14.4"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "2.4", "3.2", "5.2", "5.3", "6.2", "9.2", "9.3", "9.4", "10.2", "11.2", "11.4", "12.2", "12.4", "12.6", "14.2", "14.3", "14.5"] },
    { "id": 2, "tasks": ["2.3", "2.5", "3.3", "3.4", "5.4", "8.1", "8.3", "14.6"] },
    { "id": 3, "tasks": ["3.5", "4.1", "8.2", "8.4"] },
    { "id": 4, "tasks": ["4.2", "15.1"] },
    { "id": 5, "tasks": ["15.2"] },
    { "id": 6, "tasks": ["15.3"] }
  ]
}
```
