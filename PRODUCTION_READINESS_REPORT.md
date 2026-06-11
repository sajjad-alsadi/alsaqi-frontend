# Production Readiness Report — Al-Saqi Web Frontend

**Generated**: 2025-07-16
**Files Inspected**: 300

## Executive Summary

### Readiness Score
🔴 **0%** Production Ready

### Findings Summary
| Severity | Count |
|----------|-------|
| 🔴 Critical | 4 |
| 🟡 Warning | 50 |
| 🟢 Improvement | 20 |

**Total Findings: 74**

### Blockers

- **`apps/web/package.json`** — Wildcard `*` version for `@alsaqi/shared` allows silent breaking changes → [See Finding BUILD-001](#build-001)
- **`apps/web/src/api/client.ts`** — Inline `onclick` handler blocked by CSP, version update button non-functional → [See Finding SEC-001](#sec-001)
- **`apps/web/Dockerfile`** — CSP missing `script-src` and `style-src` directives, no violation reporting → [See Finding SEC-002](#sec-002)
- **`apps/web/vite.config.ts`** — `process.env.GEMINI_API_KEY` in Vite `define` exposes key in client bundle → [See Finding SEC-003](#sec-003)

---

## Build Settings

### BUILD-001

| Field | Detail |
|-------|--------|
| **Severity** | 🔴 Critical |
| **File** | `apps/web/package.json` |
| **Line(s)** | 14 |
| **Problem** | Workspace dependency `@alsaqi/shared` uses wildcard version `"*"` — an open range that accepts any version without constraint. |
| **Impact** | A breaking change in the shared package could silently propagate to the web app during CI installs or monorepo updates, causing runtime crashes with no version lock to pin a known-good state. |
| **Fix** | Pin to `"workspace:*"` (if using pnpm/yarn workspaces with lockfile enforcement) or an explicit semver version like `"1.0.0"`. Ensure the lockfile is committed and used in CI (`npm ci` / `pnpm install --frozen-lockfile`). |

---

### BUILD-002

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/package.json` |
| **Line(s)** | 15–44 |
| **Problem** | All 34 production dependencies use caret (`^`) version ranges (e.g., `"^19.2.7"`, `"^5.90.21"`, `"^1.13.6"`). Caret ranges allow automatic minor/patch upgrades that may introduce regressions. |
| **Impact** | A non-deterministic build if the lockfile is not enforced in CI. Even with a lockfile, `npm install` (without `--frozen-lockfile`) or a lockfile regeneration can silently pull newer versions that break functionality. |
| **Fix** | Pin critical dependencies to exact versions (remove `^`), especially for: `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `axios`, `zod`. At minimum, ensure CI uses `npm ci` or equivalent to enforce lockfile. |

---

### BUILD-003

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `tsconfig.base.json` |
| **Line(s)** | 13 |
| **Problem** | Base TypeScript config enables `sourceMap: true` globally. While Vite's build config ultimately controls production sourcemap output, this setting means TypeScript generates `.map` files during compilation, and any misconfiguration in the build pipeline could ship full source maps to production. |
| **Impact** | If source maps accidentally reach production (e.g., via a build pipeline change), they expose original TypeScript source code, file structure, and variable names to end users — aiding reverse-engineering and vulnerability discovery. |
| **Fix** | Verify that `apps/web/vite.config.ts` sets `build.sourcemap` to `'hidden'` or `false` for production builds. Optionally, override `sourceMap: false` in `apps/web/tsconfig.json` since `noEmit: true` means TS-generated maps aren't used anyway. Add a CI check to ensure no `.map` files appear in the final `dist/` output. |

---

## Security

### SEC-001

| Field | Detail |
|-------|--------|
| **Severity** | 🔴 Critical |
| **File** | `apps/web/src/api/client.ts` |
| **Line(s)** | 175–188 |
| **Problem** | The version-update dialog uses `dialog.innerHTML` with an inline `onclick="window.location.reload()"` event handler. The deployed CSP (`default-src 'self'`) blocks inline scripts, causing this button to be non-functional in production. Additionally, using `innerHTML` bypasses React's virtual DOM and sanitization. |
| **Impact** | The "Update Page" button will silently fail in production because the CSP blocks inline event handlers. Users cannot trigger the app refresh, leaving them stuck on a stale version. |
| **Fix** | Replace `innerHTML` + `onclick` with DOM API: create the button element programmatically and attach an event listener via `button.addEventListener('click', () => window.location.reload())`. |

---

### SEC-002

| Field | Detail |
|-------|--------|
| **Severity** | 🔴 Critical |
| **File** | `apps/web/Dockerfile` |
| **Line(s)** | 78 |
| **Problem** | The Content Security Policy is `default-src 'self'; connect-src 'self' wss:; frame-ancestors 'none'`. There are no explicit `script-src`, `style-src`, `img-src`, or `font-src` directives. The CSP lacks `'unsafe-inline'` for styles, which may break Tailwind CSS utility classes injected at runtime. No `report-uri` or `report-to` directive means CSP violations are invisible in production. |
| **Impact** | Potential silent breakage of styling or future third-party integrations. CSP violations are invisible in production with no reporting mechanism. |
| **Fix** | Add explicit directives: `script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; report-uri /api/csp-report`. Consider using CSP nonces for inline scripts. |

---

### SEC-003

| Field | Detail |
|-------|--------|
| **Severity** | 🔴 Critical |
| **File** | `apps/web/vite.config.ts` |
| **Line(s)** | 29 |
| **Problem** | The Vite `define` block includes `'process.env.GEMINI_API_KEY': JSON.stringify('')`. While currently set to an empty string, this pattern statically replaces all references to `process.env.GEMINI_API_KEY` in the client bundle with whatever value is present at build time. If the environment variable is ever set during CI/CD builds, the key will be embedded in the publicly-served JavaScript bundle. |
| **Impact** | If a real API key is ever provided via the build environment, it will be exposed in the frontend bundle visible to any user via browser DevTools. This could lead to credential theft and unauthorized API usage. |
| **Fix** | Remove `process.env.GEMINI_API_KEY` from the `define` block entirely. If an AI feature is needed client-side, proxy requests through the backend API to keep the key server-side. Alternatively, use a `VITE_` prefix only for non-sensitive configuration. |

---

## Performance

### PERF-001

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/context/NotificationContext.tsx` |
| **Line(s)** | 119–125 |
| **Problem** | NotificationContext uses a raw `WebSocket` with a fixed 5-second reconnect delay (`setTimeout(connectWebSocket, 5000)`) instead of exponential backoff. The well-engineered `WebSocketClient` class in `apps/web/src/api/ws/websocket-client.ts` (which implements proper exponential backoff with jitter) is never imported or used in the actual application. |
| **Impact** | On prolonged server outages, clients will hammer the server every 5 seconds indefinitely with no backoff, contributing to thundering herd problems during recovery. The reconnection strategy also has no maximum attempt limit. |
| **Fix** | Replace the raw `WebSocket` usage in `NotificationContext` with the existing `WebSocketClient` class from `apps/web/src/api/ws/websocket-client.ts`, which already implements exponential backoff (1s → 30s cap), jitter, max 10 attempts, and HTTP polling fallback. |

---

### PERF-002

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/context/NotificationContext.tsx` |
| **Line(s)** | 134–138 |
| **Problem** | The `playNotificationSound()` function creates a new `AudioContext` on every notification. `AudioContext` instances are expensive browser resources with a limited pool (typically 6 per page). They are never closed after use (`ctx.close()` is never called). |
| **Impact** | In high-notification environments, AudioContext instances accumulate and are never garbage-collected until the context limit is hit, causing subsequent sound playback to fail silently. Each unclosed context holds onto system audio resources. |
| **Fix** | Create a single shared `AudioContext` instance (or reuse one) and close it after the oscillator stops, or use a module-level singleton. At minimum, call `ctx.close()` after the oscillator completes (after 0.25s timeout). |

---

### PERF-003

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/context/NotificationContext.tsx` |
| **Line(s)** | 149–161 |
| **Problem** | The `useEffect` cleanup sets `ws.onclose = null` before calling `ws.close()`. The effect's dependency array is `[user, isCheckingSession]` but references `connectWebSocket`, `fetchNotifications`, and `fetchUnreadCount` which are not in the deps array. This can lead to stale closures where the WebSocket reconnects with outdated callbacks. |
| **Impact** | After user state changes, the WebSocket may reconnect using stale callback references, potentially causing notifications to be processed with outdated context or duplicate subscriptions. |
| **Fix** | Either add `connectWebSocket`, `fetchNotifications`, `fetchUnreadCount` to the dependency array (with appropriate guards), or restructure to use refs for the callbacks that don't need to trigger effect re-runs. |

---

### PERF-011

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/RiskRegister.tsx` |
| **Line(s)** | 7 |
| **Problem** | `ExcelJS` is statically imported at the top level (`import ExcelJS from 'exceljs'`). ExcelJS is a large library (~1.2 MB unminified) used only for Excel file import/export, which is a user-triggered action. Although Vite's `manualChunks` separates it into a `vendor-excel` chunk, the static import means this chunk is loaded eagerly when the RiskRegister module loads. |
| **Impact** | Every user who navigates to `/risks` downloads the ExcelJS chunk (~300+ KB gzipped) even if they never import/export an Excel file, increasing initial module load time and bandwidth usage. |
| **Fix** | Convert to a dynamic import at the point of use: `const ExcelJS = (await import('exceljs')).default;` inside the handler functions that parse/generate Excel files. This defers loading until the user actually clicks import/export. |

---

### PERF-012

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/components/PdfViewer.tsx` |
| **Line(s)** | 2 |
| **Problem** | `PdfViewer` statically imports `react-pdf` and its worker (`pdfjs-dist`) at the top level. This component is then statically imported into three modules: `AuditEvidence.tsx`, `AuditTasks.tsx`, and `Correspondence/OutgoingRegister.tsx`. The static import chain means the chunk is eagerly loaded whenever any of these modules load. |
| **Impact** | Three frequently-visited routes (`/evidence`, `/tasks`, `/cms`) download the react-pdf/pdfjs-dist chunk (~400+ KB gzipped including the PDF.js worker) on initial module load, regardless of whether the user views a PDF document. |
| **Fix** | Wrap `PdfViewer` in a lazy boundary: create a lazy wrapper `const LazyPdfViewer = React.lazy(() => import('./PdfViewer'))` in consuming modules, or conditionally render PdfViewer only when a PDF is selected using `React.lazy()` + `<Suspense>`. |

---

### PERF-004

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/public/` |
| **Line(s)** | N/A (directory-level) |
| **Problem** | All three assets in `public/` are unoptimized PNG files. No WebP or AVIF variants are provided. `ALSAQI Logo S Left.png` and `ALSAQI Logo S Under.png` are never referenced in any source file — they are unused dead assets. |
| **Impact** | PNG logos are typically 3-5× larger than modern WebP equivalents. Unused assets increase deployment size and Docker image size unnecessarily. |
| **Fix** | (1) Remove unused `ALSAQI Logo S Left.png` and `ALSAQI Logo S Under.png` from `public/`. (2) Convert `logo.png` to WebP format for smaller payload. (3) Consider adding `decoding="async"` to the `<img>` tag in `Logo.tsx`. |

---

### PERF-015

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/components/PdfTemplateEditor.tsx` |
| **Line(s)** | 3–6 |
| **Problem** | `PdfTemplateEditor.tsx` statically imports 4 CodeMirror packages but is not imported anywhere in the codebase — it appears to be dead code. If it were connected, the entire CodeMirror bundle (~200+ KB) would be eagerly loaded. |
| **Impact** | Currently no production impact since the component is unreferenced. However, if integrated in the future without a lazy boundary, it would add significant bundle weight. |
| **Fix** | (1) If unused, remove `PdfTemplateEditor.tsx` as dead code. (2) If planned for future use, ensure it is always imported via `React.lazy()` when connected. |

---

## Error Handling & UX

### ERR-001

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/components/SkeletonLoader.tsx` |
| **Line(s)** | 1 (entire file) |
| **Problem** | `SkeletonLoader.tsx` exports `TableSkeleton`, `CardSkeleton`, and `StatsSkeleton` components but none are imported or used anywhere in the application. This is dead code that provides no value. |
| **Impact** | No runtime impact (dead code), but indicates missing skeleton loading UX — data-fetching views show only a spinner or nothing during load, degrading perceived performance. |
| **Fix** | Replace inline ad-hoc spinners in data-fetching modules (Dashboard, ComplianceMatrix, SystemErrorLogs, Notifications) with the appropriate `SkeletonLoader` variants for improved perceived performance. Remove if skeleton loading is intentionally not used. |

---

### ERR-002

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/Dashboard/index.tsx` |
| **Line(s)** | 108–115 |
| **Problem** | Dashboard loading state uses an inline ad-hoc spinner (`<div class="animate-spin ... border-4 ...">`) instead of the shared `LoadingSpinner` component. Similar pattern in `ComplianceMatrixPage.tsx` (line 384), `SystemErrorLogs/index.tsx` (line 340), and `Notifications.tsx` (line 231). |
| **Impact** | Inconsistent loading experience across the app. If the loading spinner design needs to change, these inline instances will be missed. |
| **Fix** | Replace all inline spinner implementations with `<LoadingSpinner />` from `../components/LoadingSpinner`. The shared component already provides consistent sizing, accessibility attributes, and i18n support. |

---

### ERR-003

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/api/httpClient.ts` |
| **Line(s)** | 22 |
| **Problem** | The raw Axios instance (`client.http`) exported by `httpClient.ts` bypasses the `requestWithRetry()` wrapper. Modules using `import api from '../api/httpClient'` (22+ modules) make direct `api.get()` / `api.post()` calls that have NO retry logic for network failures or 5xx errors. |
| **Impact** | Transient network failures or brief 5xx responses will immediately surface as errors to users in most modules, even though the typed client was designed to transparently retry. This defeats the purpose of the retry infrastructure. |
| **Fix** | Add Axios response interceptor on the `http` instance for automatic retry on 5xx/network errors, OR migrate all modules to use the typed API client methods (`api.findings.list()` pattern) which already include retry. |

---

### ERR-004

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/utils/errorReporter.ts` |
| **Line(s)** | 1 (architecture) |
| **Problem** | No third-party error monitoring service (Sentry, Bugsnag, Datadog) is integrated. The custom `errorReporter` sends errors to an internal `/api/system-errors` endpoint, which provides basic collection but lacks production-grade features: source map deobfuscation, alerting on error spikes, intelligent grouping/deduplication, user impact analysis, and release tracking. |
| **Impact** | Production errors will be harder to diagnose (minified stack traces), spikes won't trigger alerts, and there's no way to assess user impact without manual database queries. If the backend endpoint is down, errors are silently lost. |
| **Fix** | Integrate Sentry (`@sentry/react`) or equivalent service. Initialize in `main.tsx` with source map uploads configured in `vite.config.ts`. The existing `errorReporter` can remain for internal logging while Sentry handles production-grade monitoring. |

---

### ERR-005

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/api/httpClient.ts` |
| **Line(s)** | 30 |
| **Problem** | The `onError` callback uses `console.error('[API Error]', error.type, error.url, error.reason)` which will be stripped by Terser's `drop_console` in production builds. Production API errors will have no visibility if `errorReporter` is not explicitly invoked. |
| **Impact** | API errors that are non-retriable (4xx client errors other than 401) are logged only to console which is stripped in production. These errors become invisible — neither the user nor the development team has visibility. |
| **Fix** | Replace `console.error` with the `errorReporter.report()` call or integrate with a proper monitoring service. The `onError` callback should report to the structured error pipeline rather than relying on console output. |

---

## Code Quality & Stability

### CQ-001

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/context/NotificationContext.tsx` |
| **Line(s)** | Multiple |
| **Problem** | Contains `console.error` statements for WebSocket error logging. While Terser will strip these in production, they indicate debugging code left behind and add noise in development. |
| **Impact** | Console statements are stripped by Terser in production (`drop_console: true`), so no runtime impact. However, they indicate incomplete error handling — errors should be routed through `errorReporter` instead. |
| **Fix** | Replace `console.error` with calls to the structured `errorReporter.report()` utility, which persists errors to the backend endpoint. |

---

### CQ-002

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/api/httpClient.ts` |
| **Line(s)** | 30 |
| **Problem** | `console.error('[API Error]', ...)` statement for logging API errors. |
| **Impact** | Stripped in production — errors become invisible without alternative logging. |
| **Fix** | Route through `errorReporter.report()` for production-persistent error logging. |

---

### CQ-003

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/api/client.ts` |
| **Line(s)** | Multiple |
| **Problem** | Contains `console.warn` and `console.error` statements for retry exhaustion and request failures. |
| **Impact** | Stripped in production — retry failures become invisible. |
| **Fix** | Replace with `errorReporter.report()` calls with appropriate severity levels. |

---

### CQ-004

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/context/AuthContext.tsx` |
| **Line(s)** | Multiple |
| **Problem** | `console.error` used for session check failures and authentication errors. |
| **Impact** | Auth errors invisible in production after Terser stripping. |
| **Fix** | Replace with structured error reporting via `errorReporter`. |

---

### CQ-005

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/utils/globalErrorHandlers.ts` |
| **Line(s)** | Multiple |
| **Problem** | Contains `console.error` for `window.onerror` and `unhandledrejection` handlers. |
| **Impact** | Global error handler's console output stripped in production. The `errorReporter` is called separately, so production impact is minimal. |
| **Fix** | Remove redundant `console.error` since `errorReporter.report()` already handles persistence. |

---

### CQ-006

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/hooks/useConnectionStatus.ts` |
| **Line(s)** | Multiple |
| **Problem** | `console.warn` used for connectivity status changes during development. |
| **Impact** | No production impact — stripped by Terser. |
| **Fix** | Remove or gate behind `import.meta.env.DEV` for explicit dev-only logging. |

---

### CQ-007

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/modules/Reports/hooks/useReports.ts` |
| **Line(s)** | Multiple |
| **Problem** | `console.error` used for report generation failures. |
| **Impact** | Report generation errors invisible in production. |
| **Fix** | Replace with `errorReporter.report()`. |

---

### CQ-008

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/modules/Dashboard/index.tsx` |
| **Line(s)** | Multiple |
| **Problem** | `console.error` used for dashboard data fetching failures. |
| **Impact** | Dashboard errors invisible in production. |
| **Fix** | Replace with structured error reporting. |

---

### CQ-009

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/utils/errorService.ts` |
| **Line(s)** | Multiple |
| **Problem** | Contains `console.warn` for non-critical error service diagnostics. |
| **Impact** | No production impact — stripped by Terser. Redundant given the file's own structured error pipeline. |
| **Fix** | Remove in favor of structured logging only. |

---

### CQ-010

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/api/ws/websocket-client.ts` |
| **Line(s)** | Multiple |
| **Problem** | `console.log` and `console.warn` statements for WebSocket lifecycle events (connect, disconnect, reconnect). |
| **Impact** | No production impact — stripped by Terser. Useful for development debugging only. |
| **Fix** | Gate behind `import.meta.env.DEV` or remove. |

---

### CQ-011

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/utils/webVitalsReporter.ts` |
| **Line(s)** | Multiple |
| **Problem** | `console.log` used for Web Vitals metric reporting during development. |
| **Impact** | No production impact — stripped by Terser. |
| **Fix** | Gate behind `import.meta.env.DEV` or replace with production-grade Web Vitals reporting endpoint. |

---

### CQ-012

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/api/modules/dashboard.ts` |
| **Line(s)** | 12 |
| **Problem** | Uses `as any` to bypass type checking on dashboard API response parsing. |
| **Impact** | Disables TypeScript's strict mode safety for the dashboard data pipeline — runtime type errors won't be caught at compile time. |
| **Fix** | Define a proper typed interface and Zod schema for the dashboard response, removing the `any` assertion. |

---

### CQ-013

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/api/modules/user-management.ts` |
| **Line(s)** | Multiple |
| **Problem** | Multiple `as any` casts used throughout the user management module for API response handling. |
| **Impact** | User management CRUD operations bypass TypeScript type safety — breaking API changes won't trigger compile-time errors. |
| **Fix** | Add typed Zod schemas for all user management endpoints and remove `any` assertions. |

---

### CQ-014

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx` |
| **Line(s)** | Multiple |
| **Problem** | Uses `as any` for compliance matrix data structures where the type system couldn't infer the correct shape. |
| **Impact** | Type safety gap in a critical audit workflow component. |
| **Fix** | Define proper types for compliance matrix data and remove the assertion. |

---

### CQ-015

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/AuditWorkspace.tsx` |
| **Line(s)** | Multiple |
| **Problem** | Uses `as any` type assertions for workspace configuration objects. |
| **Impact** | Configuration type errors won't be caught at compile time. |
| **Fix** | Define explicit interface for workspace configuration. |

---

### CQ-016

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/Correspondence/CorrespondenceSystem.tsx` |
| **Line(s)** | Multiple |
| **Problem** | `as any` used for correspondence form data submission. |
| **Impact** | Form data shape mismatches with backend API won't be caught at compile time. |
| **Fix** | Type the form data to match the API contract defined in `@alsaqi/shared`. |

---

### CQ-017

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/AuditFindings.tsx` |
| **Line(s)** | Multiple |
| **Problem** | `as any` type assertion on findings data structures. |
| **Impact** | Finding entity type safety is compromised — a core audit workflow entity. |
| **Fix** | Use the typed `Finding` interface from `@alsaqi/shared`. |

---

### CQ-018

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/FraudLog/hooks/useFraudLog.ts` |
| **Line(s)** | Multiple |
| **Problem** | Uses `: any` type annotation on fraud case data variables. |
| **Impact** | Fraud log data pipeline bypasses type checking entirely. |
| **Fix** | Import and use the `FraudCase` type from `modules/FraudLog/types.ts`. |

---

### CQ-019

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/Recommendations.tsx` |
| **Line(s)** | Multiple |
| **Problem** | `as any` on recommendation form submission payload. |
| **Impact** | Form-to-API data shape mismatches won't be caught at compile time. |
| **Fix** | Define typed interface for recommendation payloads. |

---

### CQ-020

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/AuditPlan.tsx` |
| **Line(s)** | Multiple |
| **Problem** | `as any` type cast on audit plan schedule configuration. |
| **Impact** | Schedule configuration type errors won't surface at compile time. |
| **Fix** | Use the typed `AuditPlan` interface and remove the assertion. |

---

### CQ-021

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/Settings/SettingsPage.tsx` |
| **Line(s)** | Multiple |
| **Problem** | Uses `as any` for settings form data. |
| **Impact** | Settings mutations bypass type safety. |
| **Fix** | Define a proper settings interface. |

---

### CQ-022

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/components/AuditPlanForm.tsx` |
| **Line(s)** | Multiple |
| **Problem** | `as any` on form field values during validation. |
| **Impact** | Validation logic type safety is compromised. |
| **Fix** | Type form field values using the Zod schema's inferred type. |

---

### CQ-023

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/components/FindingForm.tsx` |
| **Line(s)** | Multiple |
| **Problem** | `as any` assertion on finding form state. |
| **Impact** | Finding form data shape isn't validated at compile time. |
| **Fix** | Use Zod-inferred type for form state. |

---

### CQ-024

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/components/RiskForm.tsx` |
| **Line(s)** | Multiple |
| **Problem** | `as any` on risk assessment data submission. |
| **Impact** | Risk data type mismatches with backend won't be caught. |
| **Fix** | Define and use typed risk assessment interface. |

---

### CQ-025

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/utils/pdfExport.ts` |
| **Line(s)** | Multiple |
| **Problem** | `as any` assertions for jsPDF API calls with untyped configuration objects. |
| **Impact** | PDF generation may silently fail with incorrect parameters in production. |
| **Fix** | Use jsPDF's TypeScript types for configuration objects. |

---

### CQ-026

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/utils/docxExport.ts` |
| **Line(s)** | Multiple |
| **Problem** | `as any` used for docx library paragraph/table construction. |
| **Impact** | DOCX generation type safety gap — malformed documents may only surface at runtime. |
| **Fix** | Use the `docx` library's typed API (`Paragraph`, `Table`, `TableRow` constructors). |

---

### CQ-028

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/api/modules/dashboard.ts` |
| **Line(s)** | 1–35 |
| **Problem** | Module defines local `DashboardStats` interface and does not import any types from `@alsaqi/shared`. Uses `z.record(z.string(), z.unknown())` with no typed contract — all data is effectively `unknown`. |
| **Impact** | No compile-time guarantees on dashboard data shape; runtime errors are invisible until they manifest in the UI. |
| **Fix** | Define a `DashboardStats` interface in `@alsaqi/shared` and import it. Replace the generic record schema with a typed Zod schema matching the backend response. |

---

### CQ-029

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/api/modules/regulatory.ts` |
| **Line(s)** | 8 |
| **Problem** | Imports `CentralBankInstruction` from local `../../types` instead of `@alsaqi/shared`, even though `@alsaqi/shared` exports an identical interface. This creates a parallel type definition that may drift. |
| **Impact** | Type inconsistencies between frontend and backend can develop silently if the local and shared types diverge. |
| **Fix** | Change import to `import type { CentralBankInstruction } from '@alsaqi/shared';` and remove the duplicate from the local `types.ts`. |

---

### CQ-030

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/api/modules/user-management.ts` |
| **Line(s)** | 1–180 |
| **Problem** | Module defines local `Role`, `Permission`, `UserSession`, `JobTitle`, and `UserManagementSettings` interfaces without importing from `@alsaqi/shared`. Uses many generic `z.record(z.string(), z.unknown())` schemas. |
| **Impact** | No shared type contract for user management operations; backend API structure changes won't trigger compile-time errors. |
| **Fix** | Add these types to `@alsaqi/shared` and import them. Replace generic record schemas with typed Zod schemas. |

---

### CQ-031

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/api/hooks/useAuth.ts` |
| **Line(s)** | 1–end |
| **Problem** | The `useAuth` React Query hook (login, register, change password mutations) has no corresponding test file. Auth flows are critical business logic. |
| **Impact** | Authentication mutations (login, register, change-password) are untested — regressions in auth flow could ship unnoticed. |
| **Fix** | Create `apps/web/src/api/hooks/__tests__/useAuth.test.ts` with tests for login success/failure, token refresh, and error handling. |

---

### CQ-032

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/api/hooks/useFindings.ts` |
| **Line(s)** | 1–end |
| **Problem** | The `useFindings` React Query hook has no corresponding test file. Findings are a core audit workflow entity. |
| **Impact** | CRUD operations on audit findings are untested at the hook level — silent regressions in data fetching/mutation logic. |
| **Fix** | Create `apps/web/src/api/hooks/__tests__/useFindings.test.ts`. |

---

### CQ-033

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/api/hooks/useAuditPlans.ts` |
| **Line(s)** | 1–end |
| **Problem** | The `useAuditPlans` React Query hook has no corresponding test file. |
| **Impact** | Audit plan CRUD is untested at the hook layer. |
| **Fix** | Create `apps/web/src/api/hooks/__tests__/useAuditPlans.test.ts`. |

---

### CQ-034

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/api/hooks/useTasks.ts` |
| **Line(s)** | 1–end |
| **Problem** | The `useTasks` React Query hook has no corresponding test file. |
| **Impact** | Task mutations are untested; regressions could break the task management workflow. |
| **Fix** | Create `apps/web/src/api/hooks/__tests__/useTasks.test.ts`. |

---

### CQ-035

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/api/hooks/useUsers.ts` |
| **Line(s)** | 1–end |
| **Problem** | The `useUsers` React Query hook has no corresponding test file. |
| **Impact** | User management CRUD is untested at the hook layer. |
| **Fix** | Create `apps/web/src/api/hooks/__tests__/useUsers.test.ts`. |

---

### CQ-036

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/api/hooks/useNotifications.ts` |
| **Line(s)** | 1–end |
| **Problem** | The `useNotifications` React Query hook has no corresponding test file. |
| **Impact** | Mark-read and notification listing are untested. |
| **Fix** | Create `apps/web/src/api/hooks/__tests__/useNotifications.test.ts`. |

---

### CQ-037

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/api/httpClient.ts` |
| **Line(s)** | 1–end |
| **Problem** | The legacy HTTP client wrapper (backward-compat Axios instance) has no dedicated test file. Many modules still import this directly. |
| **Impact** | Interceptor configuration (auth token attachment, 401 redirect) is only indirectly tested through `client.test.ts`. Direct consumers have no isolated coverage. |
| **Fix** | Add `apps/web/src/api/httpClient.test.ts` or ensure `client.test.ts` covers the backward-compat export path. |

---

### CQ-038

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/context/UserContext.tsx` |
| **Line(s)** | 1–end |
| **Problem** | `UserContext` (provides current user state to the entire app) has no corresponding test file in `context/__tests__/`. |
| **Impact** | User state management (set user, clear user, context value stability) is untested. AuthContext and NotificationContext both have tests, but UserContext does not. |
| **Fix** | Create `apps/web/src/context/__tests__/UserContext.test.tsx`. |

---

### CQ-039

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/types.ts` |
| **Line(s)** | 179–189 |
| **Problem** | `LawBankItem` interface is exported but never imported by any file. The shared package also exports this type at `@alsaqi/shared`. |
| **Impact** | Dead code increases bundle analysis noise and confuses maintainers about which types are in use. |
| **Fix** | Remove `LawBankItem` from the local `types.ts`. Future consumers should import from `@alsaqi/shared`. |

---

### CQ-040

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/types.ts` |
| **Line(s)** | 191–197 |
| **Problem** | `FraudCase` interface is exported but never imported by any other file. The `FraudLog` module defines its own local `FraudCase` type with a different shape. |
| **Impact** | Duplicate, divergent type definitions create confusion. The local `types.ts` version is dead code. |
| **Fix** | Remove `FraudCase` from local `types.ts`. Consolidate on the `FraudLog/types.ts` version or promote to `@alsaqi/shared`. |

---

### CQ-041

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/types.ts` |
| **Line(s)** | 228–239 |
| **Problem** | `OrgPosition` interface is exported but never imported by any file. The shared package also exports this type. |
| **Impact** | Dead code that inflates the local types file and misleads developers. |
| **Fix** | Remove `OrgPosition` from local `types.ts`. Consumers should import from `@alsaqi/shared`. |

---

### CQ-042

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/test/` |
| **Line(s)** | N/A (directory) |
| **Problem** | Test infrastructure exists and is reasonably complete but there is no coverage configuration or threshold enforcement in `vitest.config.ts`. |
| **Impact** | Without coverage thresholds, test coverage can silently degrade over time. |
| **Fix** | Add `coverage` configuration to `vitest.config.ts` with minimum thresholds (e.g., 60% for critical modules like `api/`, `context/`, `permissions/`). |

---

### CQ-043

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/package.json` |
| **Line(s)** | 54 |
| **Problem** | `devDependencies` use caret (`^`) and tilde (`~`) ranges: `typescript: ~5.9.3`, `terser: ^5.48.0`, `eslint-plugin-jsx-a11y: ^6.10.2`, `vitest-axe: ^0.1.0`. |
| **Impact** | DevDependency version drift is lower risk than runtime dependencies but can cause inconsistent local/CI build behavior. |
| **Fix** | Pin TypeScript to exact version (`"typescript": "5.9.3"`) since compiler version changes can affect type-checking behavior. |

---

## RTL & Arabic Support

### RTL-001

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/index.html` |
| **Line(s)** | 2 |
| **Problem** | Static `<html lang="en">` with no `dir` attribute causes a flash-of-wrong-direction (FOWD) for Arabic users before JavaScript initializes. |
| **Impact** | Arabic-language users see a brief LTR layout on initial page load until `i18n.ts` runs and sets `dir="rtl"`. On slow connections or large JS bundles this flash is noticeable and feels unprofessional. |
| **Fix** | Add an inline `<script>` in `<head>` before any module scripts that reads `localStorage.getItem('i18nextLng')` and sets `document.documentElement.dir` and `document.documentElement.lang` synchronously. Also set `lang="ar"` and `dir="rtl"` as static defaults since Arabic is the primary locale. |

---

### RTL-004

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/components/auth/ChangePasswordModal.tsx` |
| **Line(s)** | 97, 150 |
| **Problem** | Hardcoded `right-3` class on password visibility toggle buttons inside `dir="ltr"` containers. The pattern is fragile and differs from the RTL-conditional approach used in `ContactAdminModal.tsx`. |
| **Impact** | Currently functions correctly because the parent has `dir="ltr"`. Low immediate impact, but inconsistency across components. |
| **Fix** | Replace `right-3` with `end-3` (Tailwind logical property) which respects the local `dir` attribute automatically. |

---

### RTL-005

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx` |
| **Line(s)** | 620 |
| **Problem** | Hardcoded `-mr-16 -mt-16` on a decorative blurred circle element. The `margin-right` negative offset won't flip in RTL. |
| **Impact** | Decorative element appears offset to the wrong side in RTL mode. Minor visual inconsistency. |
| **Fix** | Replace `-mr-16` with `-me-16` (margin-inline-end negative) to respect reading direction. |

---

### RTL-006

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/Reports/components/TopRisksList.tsx` |
| **Line(s)** | 25 |
| **Problem** | `ArrowRight` icon in "View All" button has no RTL mirroring. In RTL mode, the directional arrow should point left. |
| **Impact** | Arabic users see a right-pointing arrow next to "عرض الكل" which contradicts the RTL reading flow expectation. |
| **Fix** | Add `className="rtl:rotate-180"` to the ArrowRight icon. |

---

### RTL-007

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/RiskRegister.tsx` |
| **Line(s)** | 282, 366 |
| **Problem** | `ArrowRight` icons used as visual indicators have no RTL mirroring. |
| **Impact** | In RTL mode, arrow indicators point opposite to the reading flow, creating a subtle visual inconsistency for Arabic users. |
| **Fix** | Add `className="text-[var(--color-primary)] mt-0.5 rtl:rotate-180"` to the ArrowRight icons, or replace with a direction-neutral icon. |

---

### RTL-008

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/UserManagement/RolePermissions.tsx` |
| **Line(s)** | 119 |
| **Problem** | `ChevronRight` icon indicating the selected role does not mirror in RTL. |
| **Impact** | The selection indicator points in the wrong direction for Arabic users, breaking the visual hierarchy cue. |
| **Fix** | Add `rtl:rotate-180` class to the ChevronRight icon. |

---

### RTL-009

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx` |
| **Line(s)** | 532 |
| **Problem** | `ChevronRight` with static `className="rotate-180"` does not adapt to RTL. The hardcoded rotation is only correct for LTR. |
| **Impact** | "View All" link arrow points in wrong direction for Arabic users. |
| **Fix** | Replace `className="rotate-180"` with `className="ltr:rotate-180"`. |

---

### RTL-010

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/index.css` |
| **Line(s)** | 313–320, 340–346 |
| **Problem** | `slideInRight` and `slideInLeft` animations use fixed `translateX` directions. In RTL mode, a "slide in from right" should slide from the left (inline-start). |
| **Impact** | Entry animations appear from the wrong side in RTL mode, creating a jarring user experience. |
| **Fix** | Define RTL-specific keyframes using `[dir="rtl"]` selector that inverts the translateX values, or use CSS custom properties with a `--dir-multiplier`. |

---

### RTL-011

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/index.css` |
| **Line(s)** | 413–424 |
| **Problem** | `.skip-link` uses `left: -9999px` for off-screen positioning and `.skip-link:focus` uses `left: 10px`. These fixed directional properties don't respect RTL. |
| **Impact** | In RTL mode, the skip-to-content link appears on the wrong side of the viewport for Arabic keyboard users. |
| **Fix** | Replace `left: -9999px` with `inset-inline-start: -9999px` and `left: 10px` with `inset-inline-start: 10px`. |

---

### RTL-012

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/utils/format.ts` |
| **Line(s)** | 18 |
| **Problem** | `formatNumber` uses manual digit replacement for Arabic without handling thousand separators or grouping. `1234567` becomes `١٢٣٤٥٦٧` (no grouping) instead of the proper `١٬٢٣٤٬٥٦٧`. |
| **Impact** | Large numbers in Arabic mode are displayed without proper grouping separators, making them harder to read. |
| **Fix** | Use `Intl.NumberFormat` consistently: `return new Intl.NumberFormat('ar-EG', { useGrouping: true }).format(n)` for Arabic locale. |

---

### RTL-013

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/utils/formatService.ts` |
| **Line(s)** | 62–75 |
| **Problem** | Same issue as RTL-012 — `formatNumber` uses manual digit replacement for Arabic without handling thousand separators. |
| **Impact** | Numbers in Arabic mode lack proper grouping separators throughout the application. |
| **Fix** | Replace manual replacement with `return new Intl.NumberFormat('ar-IQ', { useGrouping: true }).format(n)`. |

---

### RTL-014

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/SystemLogsManagement.tsx` |
| **Line(s)** | 181 |
| **Problem** | Health percentage rendered using `{stats.healthPercent.toFixed(1)}%` bypasses the `formatNumber` utility entirely. In Arabic mode, displays Western numerals instead of Eastern Arabic numerals. |
| **Impact** | Arabic users see mixed-script display: Arabic text with Western numerals for the health percentage. |
| **Fix** | Use `Intl.NumberFormat` with `style: 'percent'`: `new Intl.NumberFormat('ar-IQ', { style: 'percent', maximumFractionDigits: 1 }).format(stats.healthPercent / 100)`. |

---

### RTL-002

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/i18n.ts` |
| **Line(s)** | 56–66 |
| **Problem** | Direction is set in two independent places: `i18n.ts` (via `updateDirection` on `languageChanged` event) and `PreferencesContext.tsx` (via `useEffect`). Dual-path direction setting creates a maintenance risk. |
| **Impact** | No immediate user-visible bug, but inconsistent maintenance could introduce subtle direction bugs if one handler is removed or modified. |
| **Fix** | Consolidate direction-setting logic to a single source of truth. The `i18n.ts` approach is preferable since it fires before React mounts. |

---

### RTL-003

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/i18n.ts` |
| **Line(s)** | 22 |
| **Problem** | Browser language detection is configured as the third fallback, but the `lng` option on line 16 overrides the LanguageDetector for first-time visitors by hardcoding Arabic as default. The `LanguageDetector` plugin's `navigator` detection never runs for new users. |
| **Impact** | An English-speaking user visiting for the first time will see the Arabic interface. Acceptable if Arabic is the intended primary audience, but deviates from standard i18n practice. |
| **Fix** | If browser language detection is desired, remove the explicit `lng` property and let `LanguageDetector` handle initial selection. Keep `fallbackLng: 'ar'` as the safety net. If Arabic-first is intentional, document this decision. |

---

## Infrastructure Recommendations

**Audit Date**: 2025-07-16
**Scope**: Production infrastructure tooling for `apps/web/`

---

### 1. Error Monitoring

| Field | Value |
|-------|-------|
| **Status** | Absent |
| **Current State** | Custom `errorReporter.ts` sends structured error reports to `/api/system-errors` with retry logic (exponential backoff, 3 attempts). `globalErrorHandlers.ts` captures `window.onerror` and `unhandledrejection`. No third-party error monitoring service is installed — no `@sentry/*`, `bugsnag`, `datadog-rum`, or `rollbar` packages in `package.json`. |
| **Recommendation** | Integrate **Sentry** (`@sentry/react` + `@sentry/vite-plugin`) for production-grade error monitoring. Sentry provides source map deobfuscation, intelligent error grouping/deduplication, alerting on error spikes, user impact analysis, and release tracking. The existing `errorReporter` can remain for internal logging while Sentry handles production monitoring. Configure source map uploads in `vite.config.ts` and initialize in `main.tsx`. |
| **Priority** | High |

**Reference**: Finding ERR-004

---

### 2. Content Security Policy (CSP)

| Field | Value |
|-------|-------|
| **Status** | Partial |
| **Current State** | CSP is configured in `Dockerfile` (nginx `security-headers.conf`): `default-src 'self'; connect-src 'self' wss:; frame-ancestors 'none'`. Missing explicit `script-src`, `style-src`, `img-src`, `font-src` directives. No `report-uri` or `report-to` directive — CSP violations are invisible in production. No nonce-based inline script support. |
| **Recommendation** | Expand the CSP to include explicit directives: `script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; report-uri /api/csp-report`. Add a `report-to` directive with a reporting endpoint (can reuse the internal error pipeline or Sentry CSP reporting). Consider CSP nonces for any future inline scripts. |
| **Priority** | High |

**Reference**: Finding SEC-002

---

### 3. Health Check Endpoints

| Field | Value |
|-------|-------|
| **Status** | Present |
| **Current State** | The nginx configuration in `Dockerfile` defines a `/health` endpoint that returns `200 "ok"` with `Content-Type: text/plain`. A Docker `HEALTHCHECK` directive also runs every 30s (`wget --spider http://localhost:8080/`). This covers container-level liveness. |
| **Recommendation** | The current health check is adequate for container orchestration (Docker/Kubernetes liveness probes). For deeper readiness checks, consider adding a `/ready` endpoint that verifies upstream API connectivity (via a lightweight HEAD request to the backend). This would enable Kubernetes readiness probes to distinguish "container alive" from "app fully functional." |
| **Priority** | Low |

---

### 4. Feature Flag System

| Field | Value |
|-------|-------|
| **Status** | Absent |
| **Current State** | No feature flag system is integrated. No packages (`launchdarkly-react-client-sdk`, `@unleash/proxy-client-react`, `configcat-react`) found in `package.json`. No `featureFlag`, `feature_flag`, or similar patterns found in source code. All features are unconditionally enabled. |
| **Recommendation** | Integrate a feature flag service such as **Unleash** (self-hosted, open-source) or **LaunchDarkly** (managed). Feature flags enable progressive rollouts, kill switches for problematic features, and A/B testing without redeployment. Start by wrapping high-risk or new features behind flags. For a self-hosted, cost-effective option, Unleash is recommended given the application's air-gap compatibility needs. |
| **Priority** | Medium |

---

### 5. Rate Limiting on API Requests

| Field | Value |
|-------|-------|
| **Status** | Absent (frontend layer) |
| **Current State** | The nginx configuration in the Dockerfile has no `limit_req_zone` or `limit_conn_zone` directives. The frontend has client-side throttling (UI toast throttle in `useOfflineGuard.ts`, debounced callbacks in `useDebouncedCallback.ts`), but no server-side rate limiting is configured at the reverse proxy level. The `@alsaqi/shared` package defines a `RATE_LIMIT_EXCEEDED` error code constant, suggesting the backend may implement rate limiting, but the frontend deployment (nginx) does not enforce it. |
| **Recommendation** | Add **nginx rate limiting** to the frontend deployment for the API proxy path. Configure `limit_req_zone` with a sensible default (e.g., 10 requests/second per IP with burst=20). This protects against abuse even if the backend rate limiter is bypassed. Example: `limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;` applied to `location /api/`. |
| **Priority** | Medium |

---

### 6. Performance Monitoring / Web Vitals Reporting

| Field | Value |
|-------|-------|
| **Status** | Partial |
| **Current State** | A comprehensive `webVitalsMonitor.ts` collects LCP, FID, CLS, FCP, and TTFB using raw PerformanceObserver API (no external `web-vitals` dependency). A `webVitalsReporter.ts` sends metrics to `/api/metrics/web-vitals` with retry buffer (50 entries max) and non-blocking async reporting. **However**: `initWebVitalsReporter()` is never called in `main.tsx` — the reporter is implemented but not activated. The monitor and reporter are dead code in production. |
| **Recommendation** | **Immediate**: Add `webVitalsMonitor.init()` and `initWebVitalsReporter()` calls to `main.tsx` to activate the existing implementation. **Medium-term**: Ensure the backend `/api/metrics/web-vitals` endpoint exists and persists metrics. Consider integrating with a dashboard (Grafana, Datadog RUM, or a custom analytics page) for visualization and alerting on performance regressions. |
| **Priority** | Medium |

---

### 7. Structured Log Aggregation Pipeline

| Field | Value |
|-------|-------|
| **Status** | Partial |
| **Current State** | A `StructuredLogger` utility (`utils/logger.ts`) produces structured log entries with: level, message, timestamp (ISO 8601), module, correlationId, and componentStack. In production mode, only `error`-level logs are forwarded (to `/api/system-errors` via HTTP POST); debug/info/warn are suppressed. The logger is used consistently across 20+ modules. **However**: there is no external log aggregation service (Datadog, Splunk, ELK, CloudWatch Logs). Logs are sent to an internal endpoint with no guaranteed persistence, indexing, querying, or alerting capability. Non-error logs are entirely lost in production. |
| **Recommendation** | **Short-term**: Ensure the backend `/api/system-errors` endpoint persists logs to a durable store with retention policies. **Medium-term**: Integrate a log aggregation platform (e.g., **Datadog Logs**, **AWS CloudWatch**, or self-hosted **ELK/Loki**). Route nginx access/error logs and application-level structured logs to the aggregation service. Enable log-based alerting for error rate spikes. Consider forwarding warn-level logs in production for better observability. |
| **Priority** | Medium |

---

### Summary Table

| # | Tool | Status | Priority |
|---|------|--------|----------|
| 1 | Error Monitoring (Sentry) | ❌ Absent | High |
| 2 | Content Security Policy | ⚠️ Partial | High |
| 3 | Health Check Endpoints | ✅ Present | Low |
| 4 | Feature Flag System | ❌ Absent | Medium |
| 5 | Rate Limiting (API) | ❌ Absent | Medium |
| 6 | Performance Monitoring (Web Vitals) | ⚠️ Partial (not activated) | Medium |
| 7 | Structured Log Aggregation | ⚠️ Partial (no external pipeline) | Medium |

---

### Priority Actions

#### High Priority (address before production launch)
1. Integrate Sentry for error monitoring with source map uploads
2. Expand CSP directives and add `report-uri` for violation visibility

#### Medium Priority (address within first production sprint)
3. Activate the existing Web Vitals reporter in `main.tsx`
4. Add nginx rate limiting for API proxy paths
5. Evaluate and integrate a feature flag system (Unleash recommended)
6. Establish a log aggregation pipeline with alerting

#### Low Priority (nice-to-have for operational maturity)
7. Add `/ready` endpoint for deeper readiness probes

