# Findings — Error Handling & UX (Task 5.2)

**Audit Date**: 2025-07-16
**Scope**: Loading states, localized errors, retry logic, 401 handling, error monitoring

---

## Check Results

### 1. Loading States (LoadingSpinner / SkeletonLoader usage)

**LoadingSpinner.tsx** — Well-implemented with:
- Multiple sizes (sm, md, lg)
- Full-page overlay option
- Accessible (`role="status"`, `aria-label` via i18n, `aria-live="polite"`)
- Used in: `RiskRegister`, `Recommendations`, `AuditWorkspace`, `AuditPlan`, `AuditFindings`

**SkeletonLoader.tsx** — Contains `TableSkeleton`, `CardSkeleton`, `StatsSkeleton` variants.

**Status**: PARTIAL PASS — `LoadingSpinner` is actively used, but `SkeletonLoader` is defined and never imported anywhere in the codebase. Multiple modules also use inline ad-hoc spinners rather than the shared component.

---

### ERR-001

| Field | Value |
|-------|-------|
| **ID** | ERR-001 |
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/components/SkeletonLoader.tsx` |
| **Line** | 1 (entire file) |
| **Problem** | `SkeletonLoader.tsx` exports `TableSkeleton`, `CardSkeleton`, and `StatsSkeleton` components but none are imported or used anywhere in the application. This is dead code that provides no value. |
| **Production Impact** | No runtime impact (dead code), but indicates missing skeleton loading UX — data-fetching views show only a spinner or nothing during load, degrading perceived performance. |
| **Suggested Fix** | Replace inline ad-hoc spinners in data-fetching modules (Dashboard, ComplianceMatrix, SystemErrorLogs, Notifications) with the appropriate `SkeletonLoader` variants for improved perceived performance. Remove if skeleton loading is intentionally not used. |

---

### ERR-002

| Field | Value |
|-------|-------|
| **ID** | ERR-002 |
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/Dashboard/index.tsx` |
| **Line** | 108–115 |
| **Problem** | Dashboard loading state uses an inline ad-hoc spinner (`<div class="animate-spin ... border-4 ...">`) instead of the shared `LoadingSpinner` component. Similar pattern in `ComplianceMatrixPage.tsx` (line 384), `SystemErrorLogs/index.tsx` (line 340), and `Notifications.tsx` (line 231). |
| **Production Impact** | Inconsistent loading experience across the app. If the loading spinner design needs to change (e.g., add accessibility improvements), these inline instances will be missed. |
| **Suggested Fix** | Replace all inline spinner implementations with `<LoadingSpinner />` from `../components/LoadingSpinner`. The shared component already provides consistent sizing, accessibility attributes, and i18n support. |

---

### 2. Localized Error Messages (i18next)

**en.json** — Contains comprehensive error keys:
- `errorOccurred`, `networkError`, `serverError`, `unauthorized`, `forbidden`, `sessionExpired`
- `internalServerError`, `invalidRequest`, `resourceNotFound`, `accessDenied`
- `validationErrors.*` object with field-level error keys
- `common.error`, `common.errorDesc`, `common.networkErrorDesc`, `common.retry`
- `globalError.title`, `globalError.description`

**ar.json** — Verified Arabic translations exist for all major error keys:
- `errorOccurred` → "حدث خطأ ما، يرجى المحاولة مرة أخرى"
- `networkError` → "خطأ في الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت."
- `unauthorized` → "غير مصرح"
- `sessionExpired` → "انتهت الجلسة"
- `serverError` → "خطأ في الخادم"

**errorService.ts** — Uses `i18next.t()` for fallback messages and maps backend error strings to i18n keys.

**Toast messages** — All `toast.error()` calls use `t('...')` for localization.

**Status**: PASS — Error messages are consistently localized through i18next with Arabic translations.

---

### 3. Retry/Backoff Mechanism

**`apps/web/src/api/client.ts`** — Excellent implementation:
- Exponential backoff: 1s → 2s → 4s (3 attempts max)
- Only retries network errors and 5xx responses
- Proper `isRetriableError()` check
- `onError` callback for exhausted retries

**However**: The retry logic only applies to the **typed API client methods** (`client.get()`, `client.post()`, etc. which use `requestWithRetry()`). The raw Axios instance exported via `httpClient.ts` does NOT include retry logic.

---

### ERR-003

| Field | Value |
|-------|-------|
| **ID** | ERR-003 |
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/api/httpClient.ts` |
| **Line** | 22 |
| **Problem** | The raw Axios instance (`client.http`) exported by `httpClient.ts` bypasses the `requestWithRetry()` wrapper. Modules using `import api from '../api/httpClient'` (22+ modules including Dashboard, Correspondence, ComplianceMatrix, AuditWorkspace, DepartmentManagement, etc.) make direct `api.get()` / `api.post()` calls that have NO retry logic for network failures or 5xx errors. |
| **Production Impact** | Transient network failures or brief 5xx responses will immediately surface as errors to users in most modules, even though the typed client was designed to transparently retry. This defeats the purpose of the retry infrastructure. |
| **Suggested Fix** | Add Axios response interceptor on the `http` instance for automatic retry on 5xx/network errors, OR migrate all modules to use the typed API client methods (`api.findings.list()` pattern) which already include retry. A middleware-level approach (interceptor with retry) is less disruptive. |

---

### 4. 401 Response Handling / Re-authentication

**`apps/web/src/api/client.ts`** (lines 190–220):
- ✅ 401 interceptor attempts token refresh via `POST /auth/refresh`
- ✅ Queue pattern: concurrent requests wait for in-flight refresh before retrying
- ✅ Single retry guard (`__isRetryAfterRefresh` flag prevents infinite loops)
- ✅ If refresh fails, calls `onUnauthorized()` callback

**`apps/web/src/api/httpClient.ts`** (line 26):
- ✅ `onUnauthorized` redirects to `/login` (skips if already on login page)

**`apps/web/src/context/AuthContext.tsx`**:
- ✅ Session check on mount with retry (3 attempts for 503)
- ✅ `logout()` clears user/token state
- Note: AuthContext does not directly handle 401 — that's correctly delegated to the API client interceptor.

**Status**: PASS — 401 handling is well-implemented with token refresh, queue pattern for concurrent requests, and clean redirect to login on failure.

---

### 5. Error Monitoring Integration (Sentry or equivalent)

**`apps/web/src/utils/errorReporter.ts`** — Custom error reporter that:
- Sends reports to `/api/system-errors` (internal backend endpoint)
- Has retry logic with exponential backoff (1s, 2s, 4s)
- Captures: module, message, severity, stack, componentStack, appVersion, sessionId, userAgent, routePath, timestamp, type
- Used by: `ErrorBoundary.tsx`, `globalErrorHandlers.ts`

**`apps/web/src/utils/globalErrorHandlers.ts`** — Catches `window.onerror` and `unhandledrejection`.

**Missing**: No third-party error monitoring service (Sentry, Bugsnag, Datadog, Rollbar, etc.) is installed. No packages in `package.json`. The internal `/api/system-errors` endpoint provides basic error collection but lacks:
- Source map integration for production stack traces
- Alerting/notification on error spikes
- Error grouping and deduplication
- Performance transaction tracing
- Release tracking

---

### ERR-004

| Field | Value |
|-------|-------|
| **ID** | ERR-004 |
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/utils/errorReporter.ts` |
| **Line** | 1 (architecture) |
| **Problem** | No third-party error monitoring service (Sentry, Bugsnag, Datadog) is integrated. The custom `errorReporter` sends errors to an internal `/api/system-errors` endpoint, which provides basic collection but lacks production-grade features: source map deobfuscation, alerting on error spikes, intelligent grouping/deduplication, user impact analysis, and release tracking. |
| **Production Impact** | Production errors will be harder to diagnose (minified stack traces), spikes won't trigger alerts, and there's no way to assess user impact without manual database queries. If the backend `/api/system-errors` endpoint is down, errors are silently lost after 3 retries. |
| **Suggested Fix** | Integrate Sentry (`@sentry/react`) or equivalent service. Initialize in `main.tsx` with source map uploads configured in `vite.config.ts`. The existing `errorReporter` can remain for internal logging while Sentry handles production-grade monitoring, alerting, and source map resolution. |

---

### ERR-005

| Field | Value |
|-------|-------|
| **ID** | ERR-005 |
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/api/httpClient.ts` |
| **Line** | 30 |
| **Problem** | The `onError` callback in `httpClient.ts` uses `console.error('[API Error]', error.type, error.url, error.reason)` which will be stripped by Terser's `drop_console` in production builds. Production API errors will have no visibility if the `/api/system-errors` endpoint or `errorReporter` is not explicitly invoked for API-level errors. |
| **Production Impact** | API errors that are non-retriable (4xx client errors other than 401) are logged only to console which is stripped in production. These errors become invisible — neither the user nor the development team has visibility into request failures beyond 401/5xx. |
| **Suggested Fix** | Replace `console.error` with the `errorReporter.report()` call or integrate with a proper monitoring service. The `onError` callback should report to the structured error pipeline rather than relying on console output. |

---

## Summary

| Check | Result |
|-------|--------|
| Loading states (LoadingSpinner) | ⚠️ PARTIAL — Used in some modules, but many use inline spinners |
| Loading states (SkeletonLoader) | ❌ FAIL — Component exists but never imported/used |
| Localized error messages | ✅ PASS — Comprehensive en/ar coverage via i18next |
| Retry/backoff (typed client) | ✅ PASS — Proper exponential backoff (1s, 2s, 4s) |
| Retry/backoff (raw httpClient) | ❌ FAIL — 22+ modules bypass retry logic |
| 401 handling | ✅ PASS — Token refresh with queue pattern |
| Error monitoring (third-party) | ❌ FAIL — No Sentry/Bugsnag/Datadog integration |
| Error monitoring (internal) | ⚠️ PARTIAL — Custom reporter to backend endpoint |

**Findings Count**: 5
- 🟡 Warning: 5
- 🔴 Critical: 0
- 🟢 Improvement: 0
