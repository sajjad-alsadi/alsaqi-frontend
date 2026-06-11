# Infrastructure Recommendations

**Audit Date**: 2025-07-16
**Scope**: Production infrastructure tooling for `apps/web/`

---

## 1. Error Monitoring

| Field | Value |
|-------|-------|
| **Status** | Absent |
| **Current State** | Custom `errorReporter.ts` sends structured error reports to `/api/system-errors` with retry logic (exponential backoff, 3 attempts). `globalErrorHandlers.ts` captures `window.onerror` and `unhandledrejection`. No third-party error monitoring service is installed — no `@sentry/*`, `bugsnag`, `datadog-rum`, or `rollbar` packages in `package.json`. |
| **Recommendation** | Integrate **Sentry** (`@sentry/react` + `@sentry/vite-plugin`) for production-grade error monitoring. Sentry provides source map deobfuscation, intelligent error grouping/deduplication, alerting on error spikes, user impact analysis, and release tracking. The existing `errorReporter` can remain for internal logging while Sentry handles production monitoring. Configure source map uploads in `vite.config.ts` and initialize in `main.tsx`. |
| **Priority** | High |

**Reference**: Finding ERR-004

---

## 2. Content Security Policy (CSP)

| Field | Value |
|-------|-------|
| **Status** | Partial |
| **Current State** | CSP is configured in `Dockerfile` (nginx `security-headers.conf`): `default-src 'self'; connect-src 'self' wss:; frame-ancestors 'none'`. Missing explicit `script-src`, `style-src`, `img-src`, `font-src` directives. No `report-uri` or `report-to` directive — CSP violations are invisible in production. No nonce-based inline script support. |
| **Recommendation** | Expand the CSP to include explicit directives: `script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; report-uri /api/csp-report`. Add a `report-to` directive with a reporting endpoint (can reuse the internal error pipeline or Sentry CSP reporting). Consider CSP nonces for any future inline scripts. |
| **Priority** | High |

**Reference**: Finding SEC-002

---

## 3. Health Check Endpoints

| Field | Value |
|-------|-------|
| **Status** | Present |
| **Current State** | The nginx configuration in `Dockerfile` defines a `/health` endpoint that returns `200 "ok"` with `Content-Type: text/plain`. A Docker `HEALTHCHECK` directive also runs every 30s (`wget --spider http://localhost:8080/`). This covers container-level liveness. |
| **Recommendation** | The current health check is adequate for container orchestration (Docker/Kubernetes liveness probes). For deeper readiness checks, consider adding a `/ready` endpoint that verifies upstream API connectivity (via a lightweight HEAD request to the backend). This would enable Kubernetes readiness probes to distinguish "container alive" from "app fully functional." |
| **Priority** | Low |

---

## 4. Feature Flag System

| Field | Value |
|-------|-------|
| **Status** | Absent |
| **Current State** | No feature flag system is integrated. No packages (`launchdarkly-react-client-sdk`, `@unleash/proxy-client-react`, `configcat-react`) found in `package.json`. No `featureFlag`, `feature_flag`, or similar patterns found in source code. All features are unconditionally enabled. |
| **Recommendation** | Integrate a feature flag service such as **Unleash** (self-hosted, open-source) or **LaunchDarkly** (managed). Feature flags enable progressive rollouts, kill switches for problematic features, and A/B testing without redeployment. Start by wrapping high-risk or new features behind flags. For a self-hosted, cost-effective option, Unleash is recommended given the application's air-gap compatibility needs. |
| **Priority** | Medium |

---

## 5. Rate Limiting on API Requests

| Field | Value |
|-------|-------|
| **Status** | Absent (frontend layer) |
| **Current State** | The nginx configuration in the Dockerfile has no `limit_req_zone` or `limit_conn_zone` directives. The frontend has client-side throttling (UI toast throttle in `useOfflineGuard.ts`, debounced callbacks in `useDebouncedCallback.ts`), but no server-side rate limiting is configured at the reverse proxy level. The `@alsaqi/shared` package defines a `RATE_LIMIT_EXCEEDED` error code constant, suggesting the backend may implement rate limiting, but the frontend deployment (nginx) does not enforce it. |
| **Recommendation** | Add **nginx rate limiting** to the frontend deployment for the API proxy path. Configure `limit_req_zone` with a sensible default (e.g., 10 requests/second per IP with burst=20). This protects against abuse even if the backend rate limiter is bypassed. Example: `limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;` applied to `location /api/`. |
| **Priority** | Medium |

---

## 6. Performance Monitoring / Web Vitals Reporting

| Field | Value |
|-------|-------|
| **Status** | Partial |
| **Current State** | A comprehensive `webVitalsMonitor.ts` collects LCP, FID, CLS, FCP, and TTFB using raw PerformanceObserver API (no external `web-vitals` dependency). A `webVitalsReporter.ts` sends metrics to `/api/metrics/web-vitals` with retry buffer (50 entries max) and non-blocking async reporting. **However**: `initWebVitalsReporter()` is never called in `main.tsx` — the reporter is implemented but not activated. The monitor and reporter are dead code in production. |
| **Recommendation** | **Immediate**: Add `webVitalsMonitor.init()` and `initWebVitalsReporter()` calls to `main.tsx` to activate the existing implementation. **Medium-term**: Ensure the backend `/api/metrics/web-vitals` endpoint exists and persists metrics. Consider integrating with a dashboard (Grafana, Datadog RUM, or a custom analytics page) for visualization and alerting on performance regressions. |
| **Priority** | Medium |

---

## 7. Structured Log Aggregation Pipeline

| Field | Value |
|-------|-------|
| **Status** | Partial |
| **Current State** | A `StructuredLogger` utility (`utils/logger.ts`) produces structured log entries with: level, message, timestamp (ISO 8601), module, correlationId, and componentStack. In production mode, only `error`-level logs are forwarded (to `/api/system-errors` via HTTP POST); debug/info/warn are suppressed. The logger is used consistently across 20+ modules. **However**: there is no external log aggregation service (Datadog, Splunk, ELK, CloudWatch Logs). Logs are sent to an internal endpoint with no guaranteed persistence, indexing, querying, or alerting capability. Non-error logs are entirely lost in production. |
| **Recommendation** | **Short-term**: Ensure the backend `/api/system-errors` endpoint persists logs to a durable store with retention policies. **Medium-term**: Integrate a log aggregation platform (e.g., **Datadog Logs**, **AWS CloudWatch**, or self-hosted **ELK/Loki**). Route nginx access/error logs and application-level structured logs to the aggregation service. Enable log-based alerting for error rate spikes. Consider forwarding warn-level logs in production for better observability. |
| **Priority** | Medium |

---

## Summary Table

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

## Priority Actions

### High Priority (address before production launch)
1. Integrate Sentry for error monitoring with source map uploads
2. Expand CSP directives and add `report-uri` for violation visibility

### Medium Priority (address within first production sprint)
3. Activate the existing Web Vitals reporter in `main.tsx`
4. Add nginx rate limiting for API proxy paths
5. Evaluate and integrate a feature flag system (Unleash recommended)
6. Establish a log aggregation pipeline with alerting

### Low Priority (nice-to-have for operational maturity)
7. Add `/ready` endpoint for deeper readiness probes
