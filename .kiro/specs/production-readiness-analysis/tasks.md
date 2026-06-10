# Implementation Plan: Production Readiness Analysis

## Overview

This plan transforms the AL-SAQI audit management system into a production-ready application by addressing security gaps, performance optimization, reliability improvements, build determinism, testing coverage, and monitoring. The implementation targets a React 19 + TypeScript + Vite SPA deployed in an air-gapped banking environment with Nginx in Docker.

## Tasks

- [x] 1. Strict TypeScript configuration and build hardening
  - [x] 1.1 Enable strict TypeScript compiler options
    - Add `noUncheckedIndexedAccess: true` and `exactOptionalPropertyTypes: true` to `apps/web/tsconfig.json`
    - Add `noPropertyAccessFromIndexSignature: true` for safer index access
    - Fix resulting type errors across the codebase (handle `T | undefined` from indexed access)
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 1.2 Create environment variable validation plugin for Vite
    - Create `apps/web/src/plugins/envValidator.ts` that checks for `VITE_API_URL`, `VITE_APP_VERSION`, `VITE_ERROR_REPORT_URL`, `VITE_WS_URL` at build time
    - Fail the build with a clear error naming each missing variable
    - Integrate plugin into `vite.config.ts`
    - _Requirements: 4.3_

  - [x] 1.3 Configure Terser to strip console statements and hidden source maps
    - Switch minifier to `terser` in `vite.config.ts`
    - Set `compress.drop_console: true` and `compress.drop_debugger: true` to strip all `console.*` calls including from `node_modules`
    - Set `build.sourcemap: 'hidden'` to produce source maps not referenced in output bundles
    - Ensure no inline source map references exist in final JS output
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [x] 1.4 Remove xlsx CDN dependency and replace with local package
    - Replace `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz"` with `exceljs` (MIT, no CDN)
    - Update all imports and usage in report generation modules
    - Verify build completes without network requests
    - _Requirements: 4.2, 4.4_

  - [x] 1.5 Add security-critical module lint rule for `any` and `@ts-ignore`
    - Create an ESLint rule or build-step script that scans `src/api/client.ts`, `src/api/hooks/useAuth.ts`, and files matching `*Security*Provider*` or `*Auth*Provider*` for explicit `any`, `@ts-ignore`, and `as any`
    - Fail the build if any violations are found, reporting the file and line number
    - _Requirements: 10.4, 10.5_

- [x] 2. Checkpoint — Verify strict build passes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Structured logger and error reporting infrastructure
  - [x] 3.1 Create structured logger utility
    - Create `apps/web/src/utils/logger.ts` implementing a `Structured_Logger`
    - In development: output to console with level, timestamp, and context
    - In production: suppress all console output; route errors to `/api/system-errors` endpoint via HTTP POST
    - Include fields: level, message, timestamp, module, correlationId, componentStack (when available)
    - _Requirements: 6.3, 6.4, 1.2_

  - [x] 3.2 Create error reporter service with retry logic
    - Create `apps/web/src/utils/errorReporter.ts`
    - Send structured error reports to `/api/system-errors` within 5 seconds of occurrence
    - On failure: retain in memory and retry up to 3 times with exponential backoff
    - Include module name, error message, component stack in the report payload
    - _Requirements: 1.2, 1.3_

  - [ ]* 3.3 Write unit tests for structured logger and error reporter
    - Test that production mode suppresses console output
    - Test retry logic with exponential backoff (1, 2, 4 second delays)
    - Test memory retention of failed reports
    - _Requirements: 1.2, 1.3, 6.3_

- [x] 4. Module-level error boundaries
  - [x] 4.1 Implement ModuleErrorBoundary component
    - Create `apps/web/src/components/ModuleErrorBoundary.tsx`
    - Accept `moduleName` prop, display localized fallback UI with error message and retry button
    - On error: call errorReporter with module name, error message, and component stack
    - Retry action re-mounts the failed module without affecting sibling routes
    - _Requirements: 1.1, 1.2, 1.4, 1.5_

  - [x] 4.2 Wrap all feature module routes with ModuleErrorBoundary
    - Update route definitions in `App.tsx` to wrap each feature module (AuditPlan, AuditFindings, RiskRegister, Correspondence, ComplianceMatrix, Reports, FraudLog, UserManagement) with `<ModuleErrorBoundary moduleName="...">` 
    - Ensure navigation between modules works when one is in error state
    - _Requirements: 1.1, 1.4, 1.5_

  - [x] 4.3 Enhance global error boundary as ultimate fallback
    - Update the existing global error boundary to catch errors when ModuleErrorBoundary itself fails
    - Display a full-page fallback with error indication and page-reload action
    - _Requirements: 1.6_

  - [ ]* 4.4 Write property test for module error isolation
    - **Property 1: Module Error Isolation**
    - Verify that a thrown error in one module renders fallback only in that module, other modules remain functional, and error is reported to the error reporter
    - **Validates: Requirements 1.1, 1.2, 1.4, 1.5**

- [x] 5. Connection resilience and network monitoring
  - [x] 5.1 Create network connection monitor hook
    - Create `apps/web/src/hooks/useConnectionStatus.ts`
    - Monitor `navigator.onLine`, WebSocket connection state, and API latency
    - Expose status: `online`, `degraded` (API latency > 5s), `offline`
    - Update status within 2 seconds of connection state changes
    - _Requirements: 3.1, 3.6, 3.7_

  - [x] 5.2 Create ConnectionIndicator UI component
    - Create `apps/web/src/components/ConnectionIndicator.tsx`
    - Display persistent visual indicator: green (online), yellow (degraded), red (offline)
    - Show within 2 seconds of status change
    - Visually distinguish offline from degraded states
    - _Requirements: 3.1, 3.6, 3.7_

  - [x] 5.3 Enhance WebSocket reconnection with exponential backoff
    - Update `apps/web/src/api/ws/websocket-client.ts` to implement exponential backoff starting at 1s up to 30s max, for max 10 attempts
    - After all attempts exhausted: display error indicator with manual refresh message
    - On reconnect after disconnection (up to 30 min): synchronize up to 100 missed notifications
    - _Requirements: 3.2, 3.3, 3.4_

  - [x] 5.4 Implement form data preservation during offline state
    - Ensure all user-entered form data is preserved in memory during network loss
    - Prevent form submission while offline; queue or hold data until connection restores
    - _Requirements: 3.5_

  - [ ]* 5.5 Write property test for connection resilience
    - **Property 3: Connection Resilience**
    - Verify that temporary disconnection preserves form data, WebSocket reconnects with backoff, and status indicator updates within 2 seconds
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

- [x] 6. Checkpoint — Verify error handling and resilience
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Unified API layer (remove compat layer)
  - [x] 7.1 Audit and map compat layer functions to Typed API equivalents
    - For each function in `api/compat/*.ts` (auditService, authService, correspondenceService, dashboardService, departmentService, regulatoryService, riskService, userService), verify a typed equivalent exists in `api/modules/*.ts` or `api/hooks/*.ts`
    - Document any gaps and implement missing typed functions
    - _Requirements: 2.1_

  - [x] 7.2 Add deprecation warnings to compat layer
    - In each `api/compat/*.ts` file, add runtime deprecation warnings in development mode (`import.meta.env.MODE === 'development'`) that log the equivalent Typed API function name
    - _Requirements: 2.5_

  - [x] 7.3 Migrate all component imports from compat to Typed API/hooks
    - Update all components that import from `api/compat/*` to use React Query hooks or Typed API client
    - Ensure error handling behavior matches (ApiClientError with type, url, attempts, reason, status)
    - _Requirements: 2.1, 2.4, 2.6_

  - [x] 7.4 Remove compat layer files
    - Delete `apps/web/src/api/compat/` directory and all 8 service files
    - Remove the re-export file `apps/web/src/services/api.ts`
    - Update barrel exports in `api/index.ts`
    - _Requirements: 2.6_

  - [ ]* 7.5 Write property test for API layer consistency
    - **Property 2: API Layer Consistency**
    - Verify that for each former compat function, the Typed API Client produces equivalent results on success and structurally equivalent errors on failure
    - **Validates: Requirements 2.1, 2.3**

- [x] 8. Bundle splitting and performance optimization
  - [x] 8.1 Configure manual chunks in Vite rollup options
    - Add `manualChunks` to `vite.config.ts` splitting vendors by domain: `vendor-react`, `vendor-query`, `vendor-ui`, `vendor-pdf`, `vendor-excel`, `vendor-editor`, `vendor-i18n`, `vendor-forms`
    - Ensure each feature module is a separate lazy-loaded chunk
    - _Requirements: 8.1, 8.2, 8.4_

  - [x] 8.2 Verify and optimize initial bundle size
    - Run build and analyze output with `rollup-plugin-visualizer`
    - Ensure initial bundle (JS + CSS before first route render) is under 500KB gzipped
    - Remove unused imports and ensure tree-shaking works (named ES module imports only)
    - _Requirements: 4.5, 8.3, 8.4, 8.5_

  - [ ]* 8.3 Write unit test verifying build output bundle size
    - Script that runs `vite build` and asserts total initial chunk size < 500KB gzipped
    - _Requirements: 4.5, 8.5_

- [x] 9. Web Vitals monitoring
  - [x] 9.1 Implement Web Vitals monitor utility
    - Create `apps/web/src/utils/webVitalsMonitor.ts`
    - Use Performance Observer API to collect LCP, FID, CLS, FCP, TTFB metrics
    - Classify each metric as `good`, `needs-improvement`, or `poor` based on thresholds: LCP ≤2500ms/≥4000ms, FID ≤100ms/≥300ms, CLS ≤0.1/≥0.25, FCP ≤1800ms/≥3000ms, TTFB ≤800ms/≥1800ms
    - Include current route path and ISO 8601 UTC timestamp with each metric
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 9.2 Implement async metric reporting with retry buffer
    - Report metrics asynchronously to backend endpoint without adding >50ms blocking to main thread
    - On endpoint failure: retain up to 50 entries in memory, retry on next cycle
    - Never surface reporting errors to end user
    - _Requirements: 7.4, 7.5_

  - [ ]* 9.3 Write property test for Web Vitals threshold classification
    - **Property 8: Web Vitals Threshold Classification**
    - For any metric value, verify correct classification against thresholds and presence of route + timestamp
    - **Validates: Requirements 7.2, 7.3**

- [x] 10. File upload validation
  - [x] 10.1 Create file upload validator utility
    - Create `apps/web/src/utils/fileUploadValidator.ts`
    - Validate file size against configurable max (default 10MB, range 1-100MB)
    - Validate file extension and MIME type against configurable whitelist
    - Detect MIME type mismatch by reading file header (magic bytes) and comparing to extension
    - Return per-file validation results for multi-file uploads (reject only invalid files)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 10.2 Integrate file validator into upload components
    - Hook the validator into all file upload inputs across the application
    - Display localized error messages: show max permitted size + actual size for oversized files, show allowed types for disallowed files, show mismatch error for extension/MIME discrepancies
    - Prevent upload request from being sent for invalid files while allowing valid ones to proceed
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [ ]* 10.3 Write property test for file upload validation
    - **Property 7: File Upload Validation**
    - For any file exceeding max size or not in whitelist, verify rejection before upload and correct error message display
    - **Validates: Requirements 12.1, 12.2, 12.3**

- [x] 11. Checkpoint — Verify core features complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Docker hardening and security headers
  - [x] 12.1 Harden Dockerfile with non-root user and read-only filesystem support
    - Add non-root user with UID ≥ 101, run Nginx as that user
    - Configure Nginx to write pid/cache/logs to tmpfs-mountable directories
    - Support `--read-only` Docker flag with only temp dirs writable
    - Disable `server_tokens` to hide Nginx version
    - _Requirements: 9.1, 9.2, 9.5_

  - [x] 12.2 Configure security headers in Nginx
    - Add `Content-Security-Policy`: `default-src 'self'`, `connect-src 'self' wss:`, `frame-ancestors 'none'`
    - Add `X-Content-Type-Options: nosniff`
    - Add `X-Frame-Options: DENY`
    - Add `Referrer-Policy: strict-origin-when-cross-origin`
    - Add `Permissions-Policy: camera=(), microphone=(), geolocation=()`
    - Add `Cross-Origin-Opener-Policy: same-origin`
    - Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` (conditional on HTTPS)
    - Apply headers to ALL responses including errors, redirects, and static assets using `always` directive
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 12.3 Configure gzip compression and immutable cache headers
    - Enable gzip for `text/html`, `text/css`, `application/javascript`, `application/json`, `image/svg+xml` with min size 256 bytes
    - Serve hashed static assets (`.js`, `.css`, `.png`, `.jpg`, `.svg`, `.woff2`) with `Cache-Control: public, max-age=31536000, immutable`
    - _Requirements: 9.3, 9.4_

  - [ ]* 12.4 Write integration test for security headers
    - **Property 5: Security Header Presence**
    - Build and run Docker container, verify all required headers present on HTML, JS, CSS, 404, and redirect responses
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8**

- [x] 13. Test coverage and E2E tests
  - [x] 13.1 Add unit tests for feature modules
    - Write unit tests for Reports, FraudLog, Correspondence, RiskRegister, and ComplianceMatrix modules
    - Achieve minimum 70% line coverage per module
    - _Requirements: 11.2, 11.5_

  - [x] 13.2 Set up Playwright and write E2E tests for critical flows
    - Install `@playwright/test` as devDependency
    - Write E2E tests for: login flow, audit plan creation, finding creation with recommendation, and correspondence sending
    - Each test asserts the final expected UI state renders without errors
    - _Requirements: 11.1_

  - [x] 13.3 Add automated accessibility tests
    - Install `eslint-plugin-jsx-a11y` and configure accessibility linting rules
    - Write accessibility tests verifying WCAG 2.1 AA compliance for all form components (text inputs, select, checkboxes, radio buttons, submit buttons)
    - _Requirements: 11.3_

  - [x] 13.4 Configure CI pipeline script
    - Create CI script/config that runs sequentially: `typecheck` → `lint` → `test`
    - Block merge if any command exits non-zero
    - Fail build if overall unit test line coverage falls below 70%, reporting current percentage
    - _Requirements: 11.4, 11.5_

- [x] 14. Build determinism verification
  - [ ]* 14.1 Write build determinism verification script
    - **Property 4: Build Determinism**
    - Create script that runs build twice from same commit, compares SHA-256 hashes of all output files
    - Verify no network requests during build (use network monitoring or `--prefer-offline`)
    - Verify build completes within 120 seconds on 4-core/8GB machine
    - **Validates: Requirements 4.1, 4.2, 4.6**

- [x] 15. Final checkpoint — Full production readiness verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses Vitest for unit tests and Playwright for E2E tests
- All code is TypeScript targeting React 19 + Vite in an air-gapped environment

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["3.1", "3.2"] },
    { "id": 2, "tasks": ["3.3", "4.1", "5.1", "8.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "5.2", "5.3", "5.4", "9.1", "10.1"] },
    { "id": 4, "tasks": ["4.4", "5.5", "7.1", "9.2", "10.2"] },
    { "id": 5, "tasks": ["7.2", "7.3", "8.2", "9.3", "10.3"] },
    { "id": 6, "tasks": ["7.4", "7.5", "8.3", "12.1"] },
    { "id": 7, "tasks": ["12.2", "12.3", "13.1"] },
    { "id": 8, "tasks": ["12.4", "13.2", "13.3"] },
    { "id": 9, "tasks": ["13.4", "14.1"] }
  ]
}
```
