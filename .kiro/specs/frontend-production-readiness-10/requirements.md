# Requirements Document

## Introduction

This feature raises the AL-SAQI **frontend** repository (React 19 + Vite 7 + TypeScript 5.9, the `apps/web` workspace) from an assessed 8/10 production readiness toward 10/10. The work is organized into seven independent work-streams, each derived directly from the approved design: end-to-end verification, backend contract assurance from the frontend side, type-safety debt reduction, performance baselining, accessibility, observability & release hardening, and coverage robustness.

Each work-stream contributes one or more machine-verifiable gates to the existing GitHub Actions pipeline (`.github/workflows/ci.yml`) and the `apps/web` build chain (`check-security-types` → `vite build` → `check-dist-sourcemaps` → `check-bundle-secrets`). No existing gate is loosened; every change either adds a new gate or tightens an existing threshold via a one-way ratchet.

**Scope boundary (explicit):** This is the **FRONTEND-ONLY** repository. The backend service (REST + WebSocket on dev port `:3000`) lives in a separate repository and is **out of scope**; its contract document `docs/openapi.yaml` is **consumed read-only** for frontend-side contract assurance. Backend implementation, backend test coverage, and backend deployment remain the backend repository's responsibility. The `packages/shared` workspace is **frozen** (guarded by `check-shared-freeze.mjs`) and **must not be modified** by any work-stream. This spec delivers everything achievable inside the frontend repo plus frontend-side integration and contract verification against a live or faithfully mocked backend.

## Glossary

- **Frontend_App**: The React application in the `apps/web` workspace (`@alsaqi/web`).
- **API_Client**: The `createApiClient` factory in `apps/web/src/api/client.ts` that issues REST requests, attaches CSRF and correlation headers, and performs the 401→refresh→retry flow.
- **WebSocket_Client**: The client in `apps/web/src/api/ws/websocket-client.ts` that maintains the notification socket, performs backoff reconnection with jitter, and falls back to HTTP polling.
- **E2E_Harness**: The Playwright test setup in `apps/web/e2e` (specs and backend fixtures) that exercises critical user paths against a live or mocked backend.
- **Contract_Suite**: The MSW-based contract tests in `apps/web/src/test/contract` that exercise the real `API_Client` and compare frontend Zod schemas against `docs/openapi.yaml`.
- **Envelope**: The backend response wrapper shape `{ success, data, meta }` consumed by `unwrapEnvelope` and `readEnvelopeMeta`.
- **Lint_Ratchet**: The CI step plus committed ceiling file that enforces a one-way, monotonically non-increasing ESLint `--max-warnings` limit, seeded at the current count (522).
- **Bundle_Budget_Check**: The CI script that measures per-chunk gzip sizes of the production `dist/` against committed per-`manualChunks`-group ceilings.
- **A11y_Audit**: The `vitest-axe` based accessibility suite that renders key screens in both text directions and asserts zero violations.
- **Observability_System**: The combination of `apps/web/src/utils/sentry.ts`, `apps/web/src/utils/logger.ts`, and the build-time source-map upload/delete configuration.
- **Coverage_Gate**: The `vitest --coverage` step enforcing a global floor plus tightened per-file thresholds.
- **CI_Pipeline**: The GitHub Actions workflow `.github/workflows/ci.yml`.
- **Correlation_Id**: The per-request `x-correlation-id` (UUID v4) attached by `API_Client`, stable across retries.
- **Core_Web_Vitals**: The metrics Largest Contentful Paint (LCP), Interaction to Next Paint (INP), and Cumulative Layout Shift (CLS).

## Requirements

### Requirement 1: End-to-End Verification

**User Story:** As a frontend engineer, I want Playwright end-to-end specs that exercise the critical user paths against a deterministic backend, so that I can prove the application's core flows work before release.

#### Acceptance Criteria

1. WHEN a request issued by the API_Client receives a 401 response and the subsequent `/auth/refresh` call succeeds, THE E2E_Harness SHALL verify that the API_Client issues exactly one `/auth/refresh` call for that 401, retries the original request exactly once using the refreshed credentials, and triggers no further `/auth/refresh` call from the retried request.
2. WHEN the WebSocket_Client connection is dropped during an E2E_Harness run, THE E2E_Harness SHALL verify that notification delivery resumes within 30 seconds either through reconnection or through HTTP polling fallback that starts only after all 10 backoff attempts fail, and that the first post-drop notification is delivered exactly once.
3. WHEN an E2E_Harness run exercises the file upload and download path with a file of up to 10 megabytes, THE E2E_Harness SHALL verify that the uploaded file is accepted and that the corresponding download returns content that is byte-for-byte identical to the uploaded file.
4. WHEN an E2E_Harness run switches the application language between Arabic and English, THE E2E_Harness SHALL verify that the rendered interface updates to the selected language and that the text direction is right-to-left for Arabic and left-to-right for English.
5. WHERE the E2E_Harness runs in the CI_Pipeline, THE E2E_Harness SHALL execute in mock backend mode and issue no network request to the backend service on `:3000`.
6. IF the E2E_Harness is configured for live backend mode and the backend service on `:3000` is unavailable, THEN THE E2E_Harness SHALL terminate within 30 seconds with no further test steps and report an error indication identifying the unreachable backend.
7. WHEN multiple requests issued by the API_Client are in flight and each receives a 401 response, THE E2E_Harness SHALL verify that the API_Client triggers a single shared `/auth/refresh` call covering the concurrent 401 responses.
8. IF a `/auth/refresh` call issued by the API_Client fails after a 401 response, THEN THE E2E_Harness SHALL verify that the API_Client abandons the original request without retrying and transitions to the unauthenticated state.

### Requirement 2: Backend Contract Assurance (Frontend Side)

**User Story:** As a frontend engineer, I want the frontend's Zod schemas and request/response assumptions validated against `docs/openapi.yaml`, so that the frontend never silently accepts data the backend contract forbids.

#### Acceptance Criteria

1. WHEN the API_Client receives a backend response whose Envelope `success` field equals true, THE API_Client SHALL return the `data` field through `unwrapEnvelope`, return the `meta` field through `readEnvelopeMeta`, and pass a value to the caller's Zod schema that is deep-equal to the Envelope `data` with no fields added, removed, or reordered.
2. WHEN the Contract_Suite evaluates a frontend Zod schema against its corresponding `docs/openapi.yaml` component, THE Contract_Suite SHALL accept every contract-valid example—one whose required properties are present, whose values match their declared types, and whose enumerated values are members of the declared enumeration—and reject every contract-violating shape that omits a required property, violates a declared type, or uses a value outside the declared enumeration.
3. WHEN the Contract_Suite exercises a state-changing request through the API_Client, THE Contract_Suite SHALL verify that the `x-csrf-token` header is attached with a value equal to the `csrf-token` cookie value.
4. WHEN the Contract_Suite exercises the session-refresh scenario through the API_Client, THE Contract_Suite SHALL verify that exactly one `/auth/refresh` round-trip is performed with credentials included.
5. WHEN the Contract_Suite exercises the WebSocket authentication scenario, THE Contract_Suite SHALL verify that the WebSocket_Client sends exactly one `{ type: 'auth', token }` message after the connection reaches the open state and places no token in the connection URL.
6. IF a Zod schema bound to an endpoint in `src/api/modules` has no matching component under `components.schemas` in `docs/openapi.yaml`, THEN THE Contract_Suite SHALL fail and report the orphaned schema name and its source path.
7. IF the API_Client receives a malformed Envelope, THEN THE API_Client SHALL reject the response without passing any data to the caller's Zod schema and SHALL leave the caller state unchanged.
8. IF parsing `docs/openapi.yaml` or resolving its references fails, THEN THE Contract_Suite SHALL surface an error identifying the parse or reference-resolution failure.

### Requirement 3: Type-Safety Debt Reduction

**User Story:** As a maintainer, I want explicit `any` usage eliminated and lint warnings driven down under a one-way ratchet, so that type-safety debt can only decrease over time.

#### Acceptance Criteria

1. WHEN the Lint_Ratchet runs in the CI_Pipeline, THE Lint_Ratchet SHALL fail the build if the measured ESLint warning count is greater than the committed ceiling, and the committed ceiling SHALL never increase across commits.
2. THE Frontend_App SHALL contain zero explicit `any` type annotations in the modules under `src/api` and `src/api/hooks` and in the security-critical modules (`client.ts`, `auth`, `websocket-client.ts`, `sentry.ts`, `logger.ts`).
3. WHEN the Lint_Ratchet is seeded, THE Lint_Ratchet SHALL set the committed ceiling to exactly 522.
4. IF the measured ESLint warning count is below the committed ceiling, THEN THE Lint_Ratchet SHALL fail the build until the committed ceiling is updated to equal the lower measured count.
5. THE Frontend_App SHALL contain zero unused-import and unused-variable ESLint warnings in the modified modules, enforced by the CI_Pipeline.
6. THE Frontend_App SHALL resolve every `react-hooks/exhaustive-deps` warning in the modified modules by adding the missing dependencies or recording a documented justification for each disable, and the CI_Pipeline SHALL fail if any such warning remains unresolved.

### Requirement 4: Performance Baseline

**User Story:** As a performance owner, I want load-test scripts, a published baseline, and enforced bundle-size budgets, so that performance regressions are caught before they ship.

#### Acceptance Criteria

1. WHEN the Bundle_Budget_Check runs against a production `dist/`, THE Bundle_Budget_Check SHALL exit with a non-zero status if any `manualChunks` group exceeds its committed gzip ceiling expressed in kilobytes, and SHALL identify each violating group with its measured gzip size and its committed ceiling.
2. THE Frontend_App SHALL provide load-test scripts that are executable with k6 or Artillery, that accept the backend base URL as an external parameter, and that exercise the login → audit-plan list → finding workflow steps in order without source edits to retarget the backend.
3. THE Frontend_App SHALL publish a `PERFORMANCE.md` document containing a bundle composition section, a per-chunk gzip baseline section that includes every `manualChunks` group, and a Core_Web_Vitals targets section.
4. THE Frontend_App SHALL record Core_Web_Vitals targets of LCP ≤ 2500 ms, INP ≤ 200 ms, and CLS ≤ 0.1 in `PERFORMANCE.md`.
5. WHERE a chunk is eagerly loaded (`vendor-react`, `vendor-ui`, `vendor-query`), THE Bundle_Budget_Check SHALL enforce a committed gzip ceiling for that chunk that is less than or equal to the committed ceiling of every lazy-loaded group.
6. IF the Bundle_Budget_Check cannot resolve the output file for a budgeted `manualChunks` group in `dist/`, THEN THE Bundle_Budget_Check SHALL fail and identify the unresolved group.

### Requirement 5: Accessibility

**User Story:** As a user relying on assistive technology, I want the key screens to be free of accessibility violations in both text directions, so that I can use the application regardless of language.

#### Acceptance Criteria

1. WHEN the application language is switched, THE Frontend_App SHALL set `document.dir` and `document.lang` to reflect the selected language (`rtl`/`ar` or `ltr`/`en`), and the A11y_Audit SHALL report zero violations of WCAG 2.1 Level A and Level AA rules across all impact levels for each covered key screen in that direction.
2. THE Frontend_App SHALL contain zero ESLint `jsx-a11y` rule violations across the components of the login, dashboard, audit-plan, finding, and correspondence screens.
3. THE A11y_Audit SHALL assert zero axe violations for the login, dashboard, audit-plan, finding, and correspondence screens in both `dir="ltr"` and `dir="rtl"`.
4. WHILE the application is rendered in `dir="rtl"`, THE A11y_Audit SHALL verify that focus order matches the visual reading order (right-to-left, top-to-bottom), that no element uses a positive `tabindex`, and that no keyboard trap is present.
5. IF the A11y_Audit detects an axe violation or a focus-order failure on a covered screen, THEN THE A11y_Audit SHALL fail and report the affected screen, the text direction, and the violated rule identifier.

### Requirement 6: Observability & Release Hardening

**User Story:** As an operator, I want Sentry initialized only in production, correlation IDs propagated end to end, and no source maps shipped, so that production errors are traceable and no debug artifacts leak.

#### Acceptance Criteria

1. WHEN a request is issued through the API_Client carrying a non-empty Correlation_Id, THE Observability_System SHALL include that Correlation_Id, byte-for-byte unchanged, in the corresponding structured log entry.
2. WHEN a production build completes, THE Frontend_App SHALL ship zero files whose name ends in `.map` in `dist/`, regardless of whether the Sentry source-map upload ran.
3. WHILE the build environment is production and a Sentry DSN is present, THE Observability_System SHALL initialize Sentry before the first API_Client request.
4. WHEN a production build runs in the CI_Pipeline with `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` all present and non-empty, THE Observability_System SHALL upload source maps and then delete them before the build step exits so that `check-dist-sourcemaps.mjs` completes with a success status confirming `dist/` ships none.
5. IF a production build runs with any of `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, or `SENTRY_PROJECT` absent or empty, THEN THE Observability_System SHALL skip source-map upload, complete the build successfully, and emit zero `.map` files in `dist/`.
6. IF a frontend error is reported while a request carrying a non-empty Correlation_Id is in scope, THEN THE Observability_System SHALL attach that Correlation_Id as a Sentry tag or context.
7. IF the build environment is not production or a Sentry DSN is absent, THEN THE Observability_System SHALL skip Sentry initialization.

### Requirement 7: Coverage Robustness

**User Story:** As a maintainer, I want tightened coverage thresholds on the security- and observability-critical modules, so that regressions on the most sensitive code paths fail CI.

#### Acceptance Criteria

1. WHEN the Coverage_Gate runs, THE Coverage_Gate SHALL pass each of `src/api/client.ts`, `src/api/ws/websocket-client.ts`, and `src/utils/sentry.ts` whose per-file line coverage is greater than or equal to 90.00 percent, fail the build for any such file whose per-file line coverage is below 90.00 percent, and report the offending file paths with their measured coverage percentages.
2. IF the global coverage for lines, functions, branches, or statements falls below 70.00 percent, THEN THE Coverage_Gate SHALL fail the build.
3. THE Coverage_Gate SHALL apply the tightened per-file thresholds in addition to, and without lowering, the global 70.00 percent floor.
4. IF a per-file coverage target file is missing or absent from the coverage report, THEN THE Coverage_Gate SHALL fail so that per-file thresholds cannot be silently skipped.
