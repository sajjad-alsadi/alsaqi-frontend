# Implementation Plan: Frontend Production Readiness 10

## Overview

This plan implements the seven independent production-readiness work-streams for the `apps/web` (React 19 + Vite 7 + TypeScript 5.9) workspace: E2E verification, backend contract assurance, type-safety debt reduction, performance baselining, accessibility, observability & release hardening, and coverage robustness. Each stream contributes machine-verifiable gates to `.github/workflows/ci.yml` and the `apps/web` build chain. The existing `createApiClient` and `websocket-client` behaviors are **verified and locked**, not re-implemented. The `packages/shared` workspace is frozen and must not be modified. Implementation language is **TypeScript** (test tooling: Vitest + fast-check, Playwright, vitest-axe; build scripts in Node ESM `.mjs`).

## Tasks

- [x] 1. E2E Verification Harness (Stream 1)
  - [x] 1.1 Create deterministic backend fixture
    - Implement `apps/web/e2e/fixtures/backend.ts` with the `BackendFixture` interface (`mode: 'live' | 'mock'`, `forceStatus`, `socket.drop/send`, `seed`) and the `CriticalPath` union
    - Implement Playwright route interception for `mock` mode and a fast-fail guard for `live` mode when `:3000` is unreachable (terminate within 30s with an error identifying the unreachable backend)
    - Ensure `mock` mode issues no network request to `:3000`
    - _Requirements: 1.5, 1.6_

  - [x] 1.2 Configure Playwright webServer for built output
    - Enable the `webServer` block in `playwright.config.ts` to build and serve the production preview before tests
    - _Requirements: 1.5_

  - [x] 1.3 Implement 401 token-refresh critical-path specs
    - Extend `apps/web/e2e/login.spec.ts` to assert: a single 401 triggers exactly one `/auth/refresh` and exactly one retry with no further refresh; concurrent in-flight 401s share a single `/auth/refresh`; a failed `/auth/refresh` abandons the original request and transitions to unauthenticated
    - Use `backend.forceStatus` to drive each path deterministically
    - _Requirements: 1.1, 1.7, 1.8_

  - [x] 1.4 Write property test for single-refresh safety
    - **Property 1: Single-refresh safety**
    - **Validates: Requirements 1.1**
    - Generate random request sequences with injected 401s; assert exactly one refresh and bounded retries (no infinite loop, `__isRetryAfterRefresh` guard holds)

  - [x] 1.5 Implement WebSocket reconnect/fallback spec
    - Add a spec exercising `socket.drop()`; assert notification delivery resumes within 30s via reconnection or via HTTP polling fallback that begins only after all 10 backoff attempts fail, and the first post-drop notification is delivered exactly once
    - _Requirements: 1.2_

  - [x] 1.6 Write property test for reconnect convergence
    - **Property 5: Reconnect convergence**
    - **Validates: Requirements 1.2**
    - Generate random drop timings; assert convergence to reconnected-or-polling, never silent stop

  - [x] 1.7 Implement file upload/download spec
    - Exercise upload + download of a file up to 10 MB; assert the download is byte-for-byte identical to the upload
    - _Requirements: 1.3_

  - [x] 1.8 Implement language RTL/LTR switch spec
    - Switch between Arabic and English; assert rendered language updates and text direction is `rtl` for Arabic, `ltr` for English
    - _Requirements: 1.4_

- [x] 2. Backend Contract Assurance (Stream 2)
  - [x] 2.1 Add contract tooling and harness scaffolding
    - Add dev dependencies `msw` and an OpenAPI parser (e.g. `@apidevtools/swagger-parser`)
    - Create `apps/web/src/test/contract/contract.ts` exposing `ContractCheck` (`openapiSchema`, `assertZodMatchesOpenapi`, `assertEnvelope`) and the `ContractScenario` type
    - _Requirements: 2.8_

  - [x] 2.2 Parse OpenAPI and detect orphaned schemas
    - Parse `docs/openapi.yaml` (read-only), resolve `$ref`s, extract reusable components; surface a clear error if parsing or reference resolution fails
    - Fail and report the orphaned schema name and source path for any `src/api/modules` Zod schema with no matching `components.schemas` component
    - _Requirements: 2.6, 2.8_

  - [x] 2.3 Implement Zod-vs-OpenAPI assertion and bind fixtures
    - Implement `assertZodMatchesOpenapi`: every contract-valid example accepted, every contract-violating shape (missing required, wrong type, out-of-enum value) rejected
    - Create one `ContractFixture` per endpoint-backed Zod schema (User, AuditPlan, Finding, Recommendation, RiskItem, Correspondence)
    - _Requirements: 2.2_

  - [x] 2.4 Write property test for contract consistency
    - **Property 3: Contract consistency**
    - **Validates: Requirements 2.2**
    - Generate valid/invalid shapes from OpenAPI components; assert Zod accept/reject

  - [x] 2.5 Implement envelope fidelity and malformed handling
    - Assert that on `success: true`, `unwrapEnvelope` returns `data`, `readEnvelopeMeta` returns `meta`, and the value passed to the caller's Zod schema is deep-equal to `data` (no fields added/removed/reordered)
    - Assert a malformed Envelope is rejected without passing data to the caller's schema and leaves caller state unchanged
    - _Requirements: 2.1, 2.7_

  - [x] 2.6 Write property test for envelope fidelity
    - **Property 2: Envelope fidelity**
    - **Validates: Requirements 2.1**

  - [x] 2.7 Implement MSW contract scenarios through the real client
    - Exercise `createApiClient` for: `x-csrf-token` header equals `csrf-token` cookie on state-changing requests; exactly one `/auth/refresh` round-trip with credentials; WebSocket auth sends exactly one `{ type: 'auth', token }` after open with no token in the URL
    - _Requirements: 2.3, 2.4, 2.5_

- [x] 3. Type-Safety Debt Reduction (Stream 3)
  - [x] 3.1 Implement lint ratchet script and seed ceiling
    - Create `scripts/lint-ratchet.mjs` plus a committed ceiling file seeded at exactly 522; fail when measured warnings exceed the ceiling; fail (requesting an explicit lower-to-count update) when measured warnings are below the ceiling; never allow the ceiling to increase
    - _Requirements: 3.1, 3.3, 3.4_

  - [x] 3.2 Write property test for lint monotonicity
    - **Property 7: Lint monotonicity**
    - **Validates: Requirements 3.1**
    - Generate counts around the ceiling; assert pass/fail boundary and non-increasing ceiling

  - [x] 3.3 Eliminate explicit `any` in API and security-critical modules
    - Replace `any` with precise types or `unknown` + narrowing across `src/api`, `src/api/hooks`, and `client.ts`, `auth`, `websocket-client.ts`, `sentry.ts`, `logger.ts`
    - _Requirements: 3.2_

  - [x] 3.4 Remove unused imports/vars and resolve exhaustive-deps
    - In modified modules, drive unused-import/unused-variable warnings to zero and resolve every `react-hooks/exhaustive-deps` warning by adding deps or recording a documented disable justification
    - _Requirements: 3.5, 3.6_

  - [x] 3.5 Wire lint ratchet into CI
    - Add the `eslint src/ --max-warnings <ceiling>` ratchet step to `.github/workflows/ci.yml`
    - _Requirements: 3.1_

- [x] 4. Performance Baseline (Stream 4)
  - [x] 4.1 Implement bundle-size budget script and ceilings
    - Create `scripts/check-bundle-budget.mjs` plus committed per-`manualChunks` gzip ceilings (KB); exit non-zero listing each violating group with measured and committed sizes; enforce eager chunks (`vendor-react`, `vendor-ui`, `vendor-query`) ceilings ≤ every lazy group ceiling; fail and identify any budgeted group whose output file cannot be resolved in `dist/`
    - _Requirements: 4.1, 4.5, 4.6_

  - [x] 4.2 Write property test for bundle budget
    - **Property 8: Bundle budget**
    - **Validates: Requirements 4.1**
    - Generate sizes around ceilings; assert pass/fail boundary

  - [x] 4.3 Write unit tests for bundle budget edge cases
    - Test missing chunk file, exactly-at-ceiling, and empty `dist/`
    - _Requirements: 4.6_

  - [x] 4.4 Add load-test scripts
    - Add k6 (preferred) or Artillery scripts modeling login → audit-plan list → finding in order, accepting the backend base URL as an external parameter with no source edits to retarget
    - _Requirements: 4.2_

  - [x] 4.5 Publish PERFORMANCE.md baseline
    - Create `PERFORMANCE.md` with a bundle composition section, a per-chunk gzip baseline covering every `manualChunks` group, and Core Web Vitals targets (LCP ≤ 2500 ms, INP ≤ 200 ms, CLS ≤ 0.1)
    - _Requirements: 4.3, 4.4_

  - [x] 4.6 Wire bundle budget into CI
    - Add the `check-bundle-budget` step to `.github/workflows/ci.yml` after `vite build`
    - _Requirements: 4.1_

- [x] 5. Accessibility (Stream 5)
  - [x] 5.1 Create A11y audit harness
    - Implement `apps/web/src/test/a11y/axe.ts` exposing `A11yAudit` (`audit(screen, { dir })` and the `coveredScreens` list)
    - _Requirements: 5.3_

  - [x] 5.2 Fix jsx-a11y violations on key screens
    - Drive `jsx-a11y` violations to zero across login, dashboard, audit-plan, finding, and correspondence components (keyboard handlers, accessible labels/text, autofocus misuse)
    - _Requirements: 5.2_

  - [x] 5.3 Assert zero axe violations in both directions
    - Add vitest-axe assertions for login, dashboard, audit-plan, finding, and correspondence in both `dir="ltr"` and `dir="rtl"`; on failure report screen, direction, and violated rule id
    - _Requirements: 5.3, 5.5_

  - [x] 5.4 Verify direction flip and RTL focus order
    - Assert `document.dir`/`document.lang` flip to (`rtl`/`ar`) or (`ltr`/`en`) on language switch; verify RTL focus order matches visual reading order, no positive `tabindex`, no keyboard trap
    - _Requirements: 5.1, 5.4_

  - [x] 5.5 Write property test for direction correctness
    - **Property 6: Direction correctness**
    - **Validates: Requirements 5.1**

- [x] 6. Observability & Release Hardening (Stream 6)
  - [x] 6.1 Implement correlation-propagation verification surface
    - Add `apps/web/src/utils/observability.ts` (`shouldInitSentry`, `correlationIdPropagates`, `noSourceMapsInDist`); verify a request's non-empty `x-correlation-id` appears byte-for-byte in the structured log entry and, on error, as a Sentry tag/context
    - _Requirements: 6.1, 6.6_

  - [x] 6.2 Write property test for correlation propagation
    - **Property 4: Correlation propagation**
    - **Validates: Requirements 6.1**

  - [x] 6.3 Test Sentry production-init guard
    - Assert Sentry initializes before the first API_Client request iff `PROD && DSN present`, and is skipped otherwise
    - _Requirements: 6.3, 6.7_

  - [x] 6.4 Verify source-map upload/delete in CI
    - Verify a production build with `SENTRY_AUTH_TOKEN`/`ORG`/`PROJECT` uploads then deletes maps so `check-dist-sourcemaps.mjs` confirms `dist/` ships none; verify that with any credential absent/empty the upload is skipped, the build succeeds, and zero `.map` files remain; add the verification step to `.github/workflows/ci.yml`
    - _Requirements: 6.2, 6.4, 6.5_

  - [x] 6.5 Write test for no source maps shipped
    - **Property 9: No source maps shipped**
    - **Validates: Requirements 6.2**

- [x] 7. Coverage Robustness (Stream 7)
  - [x] 7.1 Add per-file coverage thresholds
    - Configure vitest `coverage.thresholds` keeping the global 70% floor and adding per-file thresholds: `src/api/client.ts`, `src/api/ws/websocket-client.ts`, `src/utils/sentry.ts` ≥ 90% lines; fail (reporting paths + measured percentages) when a target file is below threshold, missing, or absent from the report
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 7.2 Raise coverage on critical modules
    - Add tests to bring `client.ts`, `websocket-client.ts`, and `sentry.ts` per-file line coverage to ≥ 90%
    - _Requirements: 7.1_

  - [x] 7.3 Write unit test for coverage-gate missing file
    - Assert the gate fails when a per-file target is missing or absent from the report
    - _Requirements: 7.4_

  - [x] 7.4 Write property test for critical-path coverage
    - **Property 10: Critical-path coverage**
    - **Validates: Requirements 7.1**

- [x] 8. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (property/unit/integration tests) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirements clauses for traceability.
- Property tests use fast-check (already in use) and map directly to the design's Correctness Properties (Properties 1–10).
- The seven streams are independent; the dependency graph below parallelizes them while keeping tasks that touch shared files (`.github/workflows/ci.yml`) in separate waves.
- `packages/shared` is frozen and must not be modified by any task; `docs/openapi.yaml` is consumed read-only.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "3.1", "4.1", "5.1", "6.1", "7.1"] },
    { "id": 1, "tasks": ["1.3", "1.5", "1.7", "1.8", "2.2", "3.3", "4.4", "5.2", "6.3", "7.2"] },
    { "id": 2, "tasks": ["2.3", "2.5", "2.7", "3.4", "4.5", "5.3", "5.4", "6.4"] },
    { "id": 3, "tasks": ["1.4", "1.6", "2.4", "2.6", "3.2", "3.5", "4.2", "4.3", "5.5", "6.2", "6.5", "7.3", "7.4"] },
    { "id": 4, "tasks": ["4.6"] }
  ]
}
```
