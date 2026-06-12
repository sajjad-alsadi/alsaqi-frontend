# Implementation Plan: Web Production Readiness Remediation

## Overview

This plan converts the design into incremental, code-focused coding tasks for the `apps/web/`
frontend. Work is organized by the seven design work areas (A–H). A guiding principle is to wire up
well-engineered but currently dead/bypassed code (`WebSocketClient`, `webVitalsReporter`,
`SkeletonLoader`, `StructuredLogger`) rather than rewrite it. Each task builds on prior tasks, ending
with wiring everything into the running app. Property tests validate the eight universal correctness
properties from the design; unit/integration tests are marked optional with `*`.

Implementation language: **TypeScript** (matching the existing React 19 + Vite codebase).

## Tasks

- [x] 1. Build & dependency safety (Area A)
  - [x] 1.1 Pin frontend dependencies in `apps/web/package.json`
    - Replace `@alsaqi/shared` `"*"` with `workspace:*` (or explicit semver)
    - Pin `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `axios`, `zod` to exact versions (drop `^`)
    - Pin `typescript` in devDependencies to an exact version (drop `~`)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Disable production source maps in `apps/web/vite.config.ts`
    - Set `build.sourcemap` to `false` for the production build so `dist/` emits no `.map` files
    - _Requirements: 1.5, 1.6_

  - [x] 1.3 Add post-build `dist/` source map guard
    - Extend `scripts/check-security-types.mjs` (or add a sibling CI step) to fail the build if any `.map` files exist in `dist/` after build
    - _Requirements: 1.5_

  - [x] 1.4 Write smoke checks for build configuration
    - Assert package.json specifiers are pinned and vite production `sourcemap` is `false`
    - _Requirements: 1.2, 1.6_

- [x] 2. Frontend security hardening (Area B)
  - [x] 2.1 Refactor the version-update reload button in `apps/web/src/api/client.ts`
    - Replace `dialog.innerHTML` + inline `onclick` in `showVersionMismatchNotification` with `document.createElement` + `addEventListener('click', () => window.location.reload())`
    - Set heading/paragraph text via `textContent` on created elements
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 2.2 Expand the Content Security Policy in `apps/web/Dockerfile`
    - Add explicit `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`, `font-src 'self'` directives alongside existing `default-src`/`connect-src`/`frame-ancestors`
    - Ensure `script-src` uses no wildcard or `unsafe-inline`; add exactly one reporting directive (`report-uri /api/csp-report`)
    - _Requirements: 2.4, 2.5, 2.6_

  - [x] 2.3 Remove the Gemini key from build config and add a bundle secret guard
    - Delete `'process.env.GEMINI_API_KEY': JSON.stringify('')` from the `define` block in `apps/web/vite.config.ts`
    - Add a post-build scan (in `check-security-types.mjs` or new `scripts/check-bundle-secrets.mjs`) that fails the build if a non-empty `GEMINI_API_KEY` value is embedded in `dist/**/*.js`
    - _Requirements: 2.7, 2.8_

  - [x] 2.4 Write unit test for the reload button construction
    - Assert button is built via `createElement` + `addEventListener` (no inline `onclick`) and clicking triggers `window.location.reload`
    - _Requirements: 2.1, 2.2_

- [x] 3. Resilient real-time notifications and audio (Area C)
  - [x] 3.1 Refactor `apps/web/src/context/NotificationContext.tsx` to use `WebSocketClient`
    - Replace the raw `WebSocket` + fixed reconnect timer with a `createWebSocketClient` instance held in a ref
    - Map `onNotification`/`onStateChange`/`onReconnectionFailed` callbacks; resolve the ws-token once per connect cycle via `getToken`
    - Store callbacks (connect, fetch-notifications, fetch-unread-count) in refs to fix stale-closure effect deps
    - _Requirements: 3.1, 3.2, 3.4_

  - [x] 3.2 Add a shared `AudioContext` accessor for notification sounds
    - Create a module-level singleton (in `NotificationContext` or `utils/notificationSound.ts`) that reuses one `AudioContext`, recreating it only if closed, and resumes if suspended; wrap playback in try/catch
    - _Requirements: 3.3_

  - [x] 3.3 Write property test for reconnection backoff
    - **Property 1: Reconnection backoff is bounded, capped, and jittered**
    - **Validates: Requirements 3.2**
    - Target `calculateReconnectDelay`/`applyJitter` and attempt bound in `websocket-client.ts`; min 100 iterations

  - [x] 3.4 Write property test for AudioContext reuse
    - **Property 2: Notification sound reuses a single AudioContext**
    - **Validates: Requirements 3.3**
    - Generate N successive play calls; assert at most one live context (or each closed after completion)

  - [x] 3.5 Write unit test for NotificationContext wiring
    - Assert a `WebSocketClient` is instantiated and a user-state change re-establishes the connection with current callbacks (no stale closure)
    - _Requirements: 3.1, 3.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Bundle optimization and dead code removal (Area D)
  - [x] 5.1 Dynamically import ExcelJS in `apps/web/src/modules/RiskRegister.tsx`
    - Replace the top-level `import ExcelJS from 'exceljs'` with `const ExcelJS = (await import('exceljs')).default;` inside the import/export handlers
    - _Requirements: 4.1_

  - [x] 5.2 Add lazy `PdfViewer` boundaries
    - Replace static `import PdfViewer` with `React.lazy(() => import(...))` wrapped in `<Suspense fallback={<LoadingSpinner />}>` in `AuditEvidence.tsx`, `AuditTasks.tsx`, and `Correspondence/OutgoingRegister.tsx`, rendered only when a PDF is selected
    - _Requirements: 4.2_

  - [x] 5.3 Remove dead assets and optimize the logo
    - Delete `apps/web/public/ALSAQI Logo S Left.png` and `ALSAQI Logo S Under.png`
    - Add an optimized `logo.webp`, reference it, and set `decoding="async"` on the `<img>` in `Logo.tsx`
    - _Requirements: 4.3, 4.4_

  - [x] 5.4 Remove dead component code
    - Delete `apps/web/src/components/PdfTemplateEditor.tsx` (confirmed unreferenced)
    - _Requirements: 4.5_

  - [x] 5.5 Remove dead and duplicate types in `apps/web/src/types.ts`
    - Remove unused `LawBankItem` and `OrgPosition`; remove the duplicate `FraudCase`, consolidating consumers on `FraudLog/types.ts` or `@alsaqi/shared`
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 6. Loading/UX consistency and structured error reporting (Area E)
  - [x] 6.1 Replace inline spinners with the shared `LoadingSpinner`
    - Replace ad-hoc spinner markup in `Dashboard/index.tsx`, `ComplianceMatrixPage.tsx`, `SystemErrorLogs/index.tsx`, and `Notifications.tsx` with `<LoadingSpinner />`
    - _Requirements: 5.4_

  - [x] 6.2 Wire `SkeletonLoader` variants and the loading/error state machine
    - Adopt one `SkeletonLoader` variant (`TableSkeleton`/`CardSkeleton`/`StatsSkeleton`) per data view (Dashboard, ComplianceMatrix, SystemErrorLogs, Notifications); on success replace within 300ms; on failure remove skeleton/spinner and show an error; never show partial data; remove unused `SkeletonLoader` exports if any remain unreferenced
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [x] 6.3 Add retry + error reporting to the raw axios instance in `apps/web/src/api/httpClient.ts`
    - Add an idempotent, bounded response interceptor on `client.http` that retries network errors and 5xx with exponential backoff (1s/2s/4s, max 3), delegates 401 to the existing refresh flow, and does not retry other 4xx
    - Route final failures and the `onError` callback through `errorReporter.report()` instead of `console.error`
    - _Requirements: 6.1, 6.2_

  - [x] 6.4 Console replacement sweep
    - Replace error/warn/log failure reporting in `NotificationContext.tsx`, `httpClient.ts`, `client.ts`, `AuthContext.tsx`, `Reports/hooks/useReports.ts`, `Dashboard/index.tsx` with `errorReporter.report()`/`logger.error()`
    - Remove redundant console calls in `globalErrorHandlers.ts` and `errorService.ts`; gate dev-only logs in `useConnectionStatus.ts`, `websocket-client.ts`, `webVitalsReporter.ts` behind `import.meta.env.DEV`
    - _Requirements: 6.3, 6.4, 6.5_

  - [x] 6.5 Write property test for retriable-error classification and bounded retry
    - **Property 3: Retriable-error classification and bounded retry**
    - **Validates: Requirements 6.1**
    - Target `isRetriableError` + retry bound; generate random status codes and network flags; min 100 iterations

  - [x] 6.6 Write unit tests for loading states
    - Assert each data view shows one skeleton while loading, content within 300ms on success, and an error (no skeleton) on failure; assert listed files contain no inline spinner markup
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Type safety and tests (Area F)
  - [x] 8.1 Add shared entity types to `@alsaqi/shared`
    - Add `DashboardStats`, `CentralBankInstruction`, `Role`, `Permission`, `UserSession`, `JobTitle`, `UserManagementSettings` to the shared package
    - _Requirements: 8.5_

  - [x] 8.2 Define typed Zod schemas for dashboard and user-management responses
    - Replace `z.record(z.string(), z.unknown())` in `api/modules/dashboard.ts` and `api/modules/user-management.ts` with typed schemas backed by the shared types
    - _Requirements: 8.4_

  - [x] 8.3 Remove `as any`/`: any` and add explicit types across modules
    - Remove the listed `as any`/`: any` usages in API and feature modules; type form state in `AuditPlanForm.tsx`, `FindingForm.tsx`, `RiskForm.tsx` via `z.infer<typeof schema>`; use typed `jsPDF`/`docx` APIs in `utils/pdfExport.ts` and `utils/docxExport.ts`; ensure `tsc --build` is clean under `strict`
    - _Requirements: 8.1, 8.2, 8.3, 8.6_

  - [x] 8.4 Write property test for typed schema validation
    - **Property 4: Typed schema validation round-trips valid data and rejects malformed data**
    - **Validates: Requirements 8.4**
    - Generate valid + malformed dashboard/user-management objects; min 100 iterations

  - [x] 8.5 Add React Query hook tests
    - Add test files for `useAuth`, `useFindings`, `useAuditPlans`, `useTasks`, `useUsers`, `useNotifications` under `api/hooks/__tests__/`
    - _Requirements: 10.1_

  - [x] 8.6 Add `httpClient` backward-compatibility tests
    - Cover auth-token attachment and 401 redirect behavior on the backward-compatible `httpClient.ts` export path
    - _Requirements: 10.2_

  - [x] 8.7 Add `UserContext` test
    - Add `context/__tests__/UserContext.test.tsx` covering set-user, clear-user, and context-value stability
    - _Requirements: 10.3_

  - [x] 8.8 Add coverage thresholds in `apps/web/vitest.config.ts`
    - Keep the global 70% line threshold and add per-directory thresholds for `src/api/**`, `src/context/**`, `src/permissions/**`; the run fails if coverage falls below them
    - _Requirements: 10.4, 10.5_

- [x] 9. Observability and operability infrastructure (Area G)
  - [x] 9.1 Integrate Sentry and configure source map upload
    - Add `@sentry/react` and initialize it in `apps/web/src/main.tsx` (DSN/env gated, production only, guarded so a missing DSN never breaks startup); capture unhandled errors/rejections
    - Configure `@sentry/vite-plugin` in `apps/web/vite.config.ts` to upload source maps and delete them post-upload; keep `errorReporter` posting to `/api/system-errors`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 9.2 Implement the feature flag system in `apps/web/src/featureFlags/`
    - Add a `FeatureFlagProvider`, `useFeatureFlag(key)` hook, and `<FeatureGate flag="x">` component backed by a config object with registered safe defaults; `isEnabled(key)` returns the configured value or the safe default when missing/unretrievable
    - _Requirements: 15.1, 15.2, 15.3_

  - [x] 9.3 Add nginx rate limiting in `apps/web/Dockerfile`
    - Add `limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;` in the `http` block and `limit_req zone=api burst=20 nodelay;` in the `location /api/` proxy block; excess requests return 429/503
    - _Requirements: 16.1, 16.2, 16.3_

  - [x] 9.4 Activate Web Vitals reporting in `apps/web/src/main.tsx`
    - Call `webVitalsMonitor.init()` and `initWebVitalsReporter()` so captured metrics POST to `/api/metrics/web-vitals` with non-blocking buffered retry
    - _Requirements: 17.1, 17.2, 17.3_

  - [x] 9.5 Add a log forwarding hook in `apps/web/src/utils/logger.ts`
    - Add a configurable forwarding hook that, in production, forwards `error`-level (and `warn`-level when `forwardWarn` is enabled) structured entries to the configured destination, with `/api/system-errors` as fallback when the destination is unavailable
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

  - [x] 9.6 Write property test for feature flag fallback
    - **Property 6: Feature flag falls back to a safe default**
    - **Validates: Requirements 15.3**
    - Generate random configs with arbitrary missing keys; min 100 iterations

  - [x] 9.7 Write property test for the Web Vitals buffer
    - **Property 7: Web Vitals buffer is capped and retains the most recent metrics**
    - **Validates: Requirements 17.3**
    - Generate random metric sequences with a failing endpoint; assert buffer never exceeds 50 and most-recent retained; min 100 iterations

  - [x] 9.8 Write property test for log forwarding routing
    - **Property 8: Log forwarding routes by level and warn-configuration**
    - **Validates: Requirements 18.2, 18.3**
    - Generate random entries + `forwardWarn` flag; assert forward iff `error`, or `warn` with `forwardWarn`; min 100 iterations

  - [x] 9.9 Write unit tests for observability wiring
    - Assert Sentry `init` is invoked at startup (mocked), a Web Vital is POSTed to `/api/metrics/web-vitals`, a feature gate renders children only when enabled, and the log pipeline falls back to `/api/system-errors`
    - _Requirements: 7.1, 7.2, 17.1, 15.2, 18.4_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. RTL and Arabic correctness (Area H)
  - [x] 11.1 Set static RTL defaults and inline bootstrap in `apps/web/index.html`
    - Set `lang="ar" dir="rtl"` on `<html>`; add an inline `<head>` script (before module scripts) that reads `localStorage.getItem('i18nextLng')` and synchronously sets `documentElement.dir`/`lang`
    - _Requirements: 11.1, 11.2_

  - [x] 11.2 Make `i18n.ts` the single source of truth for direction
    - Keep direction-setting only in `i18n.ts`; remove the direction-setting `useEffect` from `PreferencesContext.tsx`; document the Arabic-first decision (`fallbackLng: 'ar'`) or enable `LanguageDetector`
    - _Requirements: 11.3, 11.4_

  - [x] 11.3 Apply logical CSS properties for RTL layout
    - `ChangePasswordModal.tsx` `right-3` → `end-3`; `ComplianceMatrixPage.tsx` `-mr-16` → `-me-16`; `index.css` `slideInRight`/`slideInLeft` use direction-aware `[dir="rtl"]` keyframes; `.skip-link` `left` → `inset-inline-start`
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 11.4 Mirror directional icons in RTL
    - Add `rtl:rotate-180` to `ArrowRight` in `Reports/components/TopRisksList.tsx` and `RiskRegister.tsx`, and to `ChevronRight` in `UserManagement/RolePermissions.tsx`; replace static `rotate-180` with `ltr:rotate-180` for the `ChevronRight` in `ComplianceMatrixPage.tsx`
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 11.5 Use `Intl.NumberFormat` for Arabic number formatting
    - Replace manual digit replacement in `utils/format.ts` and `utils/formatService.ts` with `Intl.NumberFormat(<arabic-locale>, { useGrouping: true })`; render the health percent in `SystemLogsManagement.tsx` via `Intl.NumberFormat('ar-IQ', { style: 'percent', maximumFractionDigits: 1 })`
    - _Requirements: 14.1, 14.2, 14.3_

  - [x] 11.6 Write property test for Arabic number formatting
    - **Property 5: Arabic number formatting matches Intl grouping output**
    - **Validates: Requirements 14.1, 14.2**
    - Generate random finite numbers; assert `formatNumber` matches `Intl.NumberFormat` output in both files; min 100 iterations

  - [x] 11.7 Write unit tests for RTL bootstrap and Arabic percent
    - Assert the inline `index.html` script sets `dir`/`lang` from `localStorage` before modules; assert the health percent renders Eastern Arabic numerals with a percent sign
    - _Requirements: 11.2, 14.3_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core implementation and the Requirement 10 deliverable tests are not optional.
- Each task references specific requirements (granular clause numbers) for traceability.
- Checkpoints ensure incremental validation at natural break points.
- Property tests (fast-check, min 100 iterations each, tagged `Feature: web-production-readiness-remediation, Property {n}: ...`) validate the eight universal correctness properties.
- Unit/integration tests validate concrete examples, wiring, and edge cases.
- Prefer wiring up existing dead code (`WebSocketClient`, `webVitalsReporter`, `SkeletonLoader`, `StructuredLogger`) over rewriting.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "8.1", "9.2", "11.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.2", "3.2", "8.2", "11.2", "11.3", "5.3"] },
    { "id": 2, "tasks": ["2.3", "3.1", "6.3", "8.3", "5.1", "6.1", "9.3", "5.5", "9.5"] },
    { "id": 3, "tasks": ["9.1", "6.4", "6.2", "5.4", "8.5", "8.6", "8.7"] },
    { "id": 4, "tasks": ["9.4", "11.4", "11.5", "8.8"] },
    { "id": 5, "tasks": ["1.4", "2.4", "3.3", "3.4", "3.5", "6.5", "6.6", "8.4", "9.6", "9.7", "9.8", "9.9", "11.6", "11.7"] }
  ]
}
```
