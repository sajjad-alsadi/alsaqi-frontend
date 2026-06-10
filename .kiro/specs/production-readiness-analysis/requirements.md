# Requirements Document

## Introduction

يحدد هذا المستند المتطلبات الوظيفية وغير الوظيفية لتحقيق جاهزية نظام الساقي (AL-SAQI) للإنتاج. النظام هو تطبيق إدارة تدقيق داخلي مبني بـ React 19 + TypeScript + Vite يعمل في بيئة air-gapped ويتعامل مع بيانات حساسة في القطاع المصرفي. تُشتق هذه المتطلبات من وثيقة التصميم التي حددت فجوات في الأمان والأداء والموثوقية والمراقبة والديون التقنية.

## Glossary

- **System**: نظام الساقي (AL-SAQI) — تطبيق الواجهة الأمامية ومنظومة البناء والنشر
- **Module_Error_Boundary**: مكون React يلتقط أخطاء التصيير (render errors) ضمن وحدة فردية ويعرض واجهة بديلة
- **Typed_API_Client**: طبقة API الموحدة في `api/index.ts` التي تتواصل مع الخلفية عبر Axios مع Zod validation
- **Compat_Layer**: طبقة API القديمة في `api/compat/*.ts` المُراد إزالتها
- **Connection_Monitor**: مكون يراقب حالة اتصال الشبكة و WebSocket ويعرض مؤشراً بصرياً
- **Build_Pipeline**: عملية بناء التطبيق عبر Vite/Rollup التي تنتج حزم الإنتاج
- **Production_Server**: خادم Nginx الذي يقدم التطبيق في بيئة الإنتاج
- **Structured_Logger**: أداة تسجيل منظمة تُفرّق بين بيئة التطوير والإنتاج وترسل الأخطاء إلى `/api/system-errors`
- **Error_Reporter**: مكون يرسل تقارير الأخطاء إلى نقطة نهاية `/api/system-errors`
- **Web_Vitals_Monitor**: مكون يجمع مقاييس أداء الواجهة (LCP, FID, CLS, FCP, TTFB, INP)
- **CSP**: Content Security Policy — سياسة أمان المحتوى في HTTP headers

## Requirements

### Requirement 1: عزل أخطاء الوحدات

**User Story:** As an end user, I want module-level error boundaries so that a failure in one module does not crash the entire application.

#### Acceptance Criteria

1. WHEN an unhandled render error occurs in a feature module, THE Module_Error_Boundary SHALL catch the error and display a fallback UI within that module's allocated area containing: an error indication message in the user's active locale, and a retry action that re-mounts the failed module
2. WHEN a Module_Error_Boundary catches an error, THE Error_Reporter SHALL send a structured error report containing the module name, error message, and component stack to `/api/system-errors` within 5 seconds of the error occurring
3. IF the Error_Reporter fails to send the error report, THEN THE System SHALL retain the report in memory and retry delivery up to 3 times with exponential backoff, without affecting the displayed fallback UI
4. WHILE a module is in an error state, THE System SHALL allow the user to navigate to other modules without a full page reload
5. WHEN a Module_Error_Boundary catches an error, THE System SHALL render all other feature modules in their normal functional state without re-mounting or resetting their internal state
6. IF the Module_Error_Boundary itself fails to render, THEN THE global Error Boundary SHALL catch the error and display a full-page fallback containing an error indication message and a page-reload action

### Requirement 2: توحيد طبقة API

**User Story:** As a developer, I want a single unified API layer so that error handling and data validation are consistent across all modules.

#### Acceptance Criteria

1. THE Typed_API_Client SHALL provide a typed function for every operation available in the Compat_Layer, accepting the same input parameters and covering the same API endpoints
2. WHEN the Typed_API_Client receives an API response, THE Typed_API_Client SHALL validate the response against its Zod schema and return the validated typed data to the caller
3. IF the Zod schema validation fails for an API response, THEN THE Typed_API_Client SHALL throw an error of type 'validation' containing the request URL and a reason describing the schema mismatch
4. WHEN the Typed_API_Client encounters a network, timeout, or server error, THE Typed_API_Client SHALL produce an ApiClientError object containing type, url, attempts, reason, and status fields
5. WHEN a Compat_Layer function is called and the application is running in development mode (VITE_MODE equals 'development'), THE System SHALL log a deprecation warning to the console identifying the equivalent Typed_API_Client function name
6. THE System SHALL not import or reference the Compat_Layer in any module created after the Typed_API_Client reaches full operation coverage

### Requirement 3: مرونة الاتصال

**User Story:** As an end user, I want the application to handle network interruptions gracefully so that I do not lose unsaved work or miss notifications.

#### Acceptance Criteria

1. WHEN the network connection is lost, THE Connection_Monitor SHALL display a persistent on-screen indicator within 2 seconds showing the offline status, visually distinct from the degraded-connection indicator
2. WHEN the WebSocket connection drops, THE System SHALL attempt reconnection using exponential backoff starting at 1 second up to a maximum interval of 30 seconds, for a maximum of 10 attempts
3. IF all reconnection attempts are exhausted without success, THEN THE System SHALL display an error indicator informing the user that automatic reconnection has failed and manual page refresh is required
4. WHEN the WebSocket reconnects after a disconnection of up to 30 minutes, THE System SHALL synchronize up to 100 missed notifications that accumulated during the disconnection period
5. WHILE the network connection is lost, THE System SHALL preserve all user-entered form data in memory without discarding it for the duration of the browser session
6. WHEN the network connection is restored, THE Connection_Monitor SHALL update the indicator to show the online status within 2 seconds
7. WHEN the API latency exceeds 5 seconds, THE Connection_Monitor SHALL display a degraded-connection indicator that is visually distinct from the offline status indicator

### Requirement 4: حتمية البناء

**User Story:** As a DevOps engineer, I want deterministic builds that work offline so that the application can be deployed reliably in an air-gapped environment.

#### Acceptance Criteria

1. WHEN executed from the same Git commit with the same lock file, THE Build_Pipeline SHALL produce byte-identical bundle output files such that their SHA-256 content hashes match across consecutive runs
2. THE Build_Pipeline SHALL complete successfully without initiating any outbound network connections (HTTP, HTTPS, DNS, or registry requests) during the build process
3. IF a required environment variable (VITE_API_URL, VITE_APP_VERSION, VITE_ERROR_REPORT_URL, or VITE_WS_URL) is missing, THEN THE Build_Pipeline SHALL fail with an error message that names each missing variable
4. THE Build_Pipeline SHALL not include the `xlsx` CDN dependency and SHALL instead resolve all dependencies from locally available packages declared in the lock file
5. THE Build_Pipeline SHALL produce a total initial bundle size (sum of all JavaScript and CSS assets loaded for the application's first route) of less than 500KB gzipped
6. THE Build_Pipeline SHALL complete within 120 seconds on a machine with at least 4 CPU cores and 8GB RAM

### Requirement 5: وجود ترويسات الأمان

**User Story:** As a security engineer, I want all HTTP responses to include mandatory security headers so that the application is protected against common web attacks.

#### Acceptance Criteria

1. THE Production_Server SHALL include a `Content-Security-Policy` header on every HTTP response that restricts `default-src` to `'self'`, allows `connect-src` for `'self'` and WebSocket connections to the same origin (`wss:`), and sets `frame-ancestors` to `'none'`
2. THE Production_Server SHALL include `X-Content-Type-Options: nosniff` on every HTTP response
3. THE Production_Server SHALL include `X-Frame-Options: DENY` on every HTTP response
4. THE Production_Server SHALL include a `Referrer-Policy` header with value `strict-origin-when-cross-origin` on every HTTP response
5. THE Production_Server SHALL include a `Permissions-Policy` header that disables camera, microphone, and geolocation on every HTTP response
6. THE Production_Server SHALL include `Cross-Origin-Opener-Policy: same-origin` on every HTTP response
7. IF HTTPS is enabled, THEN THE Production_Server SHALL include a `Strict-Transport-Security` header with a minimum `max-age` of 31536000 seconds and the `includeSubDomains` directive on every HTTP response
8. THE Production_Server SHALL include all required security headers (criteria 1–7) on every HTTP response regardless of status code, including error responses (4xx, 5xx), redirects (3xx), and static asset responses

### Requirement 6: بناء إنتاجي خالٍ من Console

**User Story:** As a security engineer, I want production builds to contain no console output statements so that technical information is not exposed to end users.

#### Acceptance Criteria

1. THE Build_Pipeline SHALL remove all `console.log`, `console.debug`, `console.info`, `console.warn`, `console.error`, `console.trace`, `console.table`, and `console.dir` statements from the production bundle output such that a text search of the final JavaScript bundle files returns zero matches for direct console method invocations
2. IF a third-party dependency emits console output at runtime, THEN THE Build_Pipeline SHALL suppress it by configuring the minifier to drop all `console.*` calls including those originating from `node_modules`
3. WHEN an unhandled exception, rejected promise, or API error occurs in production, THE System SHALL route the error exclusively through the Structured_Logger which reports to the `/api/system-errors` endpoint without writing any output to the browser console
4. THE production bundle SHALL not expose stack traces, source file paths, or internal module names to the end user through browser console output, DOM content, or network response bodies originating from the frontend application
5. WHEN the production build completes, THE Build_Pipeline SHALL produce hidden source maps (not accessible to end users via the browser) and SHALL NOT inline source map references in the output bundle files

### Requirement 7: مراقبة أداء الواجهة

**User Story:** As a DevOps engineer, I want Web Vitals monitoring so that I can track frontend performance and detect regressions.

#### Acceptance Criteria

1. WHEN a page finishes loading or a route transition completes, THE Web_Vitals_Monitor SHALL collect Largest Contentful Paint (LCP), First Input Delay (FID), Cumulative Layout Shift (CLS), First Contentful Paint (FCP), and Time to First Byte (TTFB) metrics as reported by the browser Performance API
2. WHEN a Web Vitals metric is collected, THE Web_Vitals_Monitor SHALL classify it as `good`, `needs-improvement`, or `poor` based on the following thresholds: LCP good ≤ 2500ms / poor > 4000ms, FID good ≤ 100ms / poor > 300ms, CLS good ≤ 0.1 / poor > 0.25, FCP good ≤ 1800ms / poor > 3000ms, TTFB good ≤ 800ms / poor > 1800ms
3. WHEN a Web Vitals metric is collected, THE Web_Vitals_Monitor SHALL include the current route path (as defined by the application router) and an ISO 8601 UTC timestamp with the metric data
4. THE Web_Vitals_Monitor SHALL report collected metrics to the backend monitoring endpoint asynchronously, without adding more than 50ms of blocking time to the main thread per reporting cycle
5. IF the backend monitoring endpoint is unreachable or returns a non-success response, THEN THE Web_Vitals_Monitor SHALL retain the metric data in memory (up to 50 entries) and retry delivery on the next reporting cycle without discarding metrics or surfacing errors to the end user

### Requirement 8: تقسيم الحزم وتحسين الأداء

**User Story:** As an end user, I want the application to load quickly so that I can start working without long wait times.

#### Acceptance Criteria

1. THE Build_Pipeline SHALL split vendor dependencies into separate chunks grouped by domain (react, query, ui, pdf, excel, editor, i18n, forms)
2. THE Build_Pipeline SHALL produce chunks where each feature module is loaded on demand via lazy loading
3. THE System SHALL achieve a Time to Interactive of less than 3.5 seconds on a simulated 4G connection (download 9 Mbps, upload 1.5 Mbps, latency 170ms)
4. THE Build_Pipeline SHALL enable tree-shaking by ensuring all imports use named imports from ES modules
5. THE Build_Pipeline SHALL produce an initial bundle size (JavaScript and CSS loaded before first route render) of less than 500KB gzipped

### Requirement 9: تشديد Docker والنشر

**User Story:** As a DevOps engineer, I want the production Docker container to follow security best practices so that the deployment surface area is minimized.

#### Acceptance Criteria

1. THE Docker container SHALL run the Nginx process as a non-root user with a numeric UID of 101 or higher, verifiable by inspecting the container's running process owner via `docker top` or equivalent
2. THE Docker container SHALL disable the Nginx `server_tokens` directive so that HTTP responses do not include the Nginx version number in the `Server` header
3. THE Docker container SHALL enable gzip compression for responses with content types `text/html`, `text/css`, `application/javascript`, `application/json`, and `image/svg+xml`, with a minimum response size threshold of 256 bytes
4. THE Docker container SHALL serve static assets (files matching `.js`, `.css`, `.png`, `.jpg`, `.svg`, `.woff2`) with a `Cache-Control` header containing `immutable` and a `max-age` of at least 31536000 seconds (1 year), where filenames include a build-time content hash segment
5. THE Docker container SHALL support running with a read-only root filesystem (`--read-only` flag), with only Nginx temporary directories (pid, cache, logs) mounted as writable tmpfs volumes

### Requirement 10: التحقق من الأنماط TypeScript الصارمة

**User Story:** As a developer, I want strict TypeScript configuration so that potential runtime errors are caught at compile time.

#### Acceptance Criteria

1. THE Build_Pipeline SHALL enforce `noUncheckedIndexedAccess: true` in the TypeScript compiler configuration to prevent silent undefined values from index access
2. THE Build_Pipeline SHALL enforce `exactOptionalPropertyTypes: true` in the TypeScript compiler configuration to distinguish between missing and explicitly undefined properties
3. WHEN the TypeScript compiler detects one or more type errors, THE Build_Pipeline SHALL exit with a non-zero exit code and list all detected errors to standard output without producing bundled application artifacts
4. THE Build_Pipeline SHALL contain zero usages of the explicit `any` type, `@ts-ignore` directives, and `as any` type assertions in security-critical modules defined as: the API client module (`src/api/client.ts`), authentication hooks (`src/api/hooks/useAuth.ts`), and any provider file matching `*Security*` or `*Auth*Provider*` under `src/`
5. WHEN a developer introduces an explicit `any` type or a `@ts-ignore` directive in a security-critical module, THE Build_Pipeline SHALL fail the type-check step and report the violation location

### Requirement 11: تغطية الاختبارات

**User Story:** As a QA engineer, I want comprehensive test coverage so that regressions are detected automatically before deployment.

#### Acceptance Criteria

1. THE System SHALL have end-to-end tests that execute and assert successful completion of: login flow, audit plan creation, finding creation with recommendation, and correspondence sending, where each flow test passes only when the final expected UI state is rendered without errors
2. THE System SHALL have unit tests for each feature module (Reports, FraudLog, Correspondence, RiskRegister, ComplianceMatrix) achieving a minimum of 70% line coverage per module as reported by the coverage tool
3. THE System SHALL have automated accessibility tests that verify WCAG 2.1 AA compliance for all form components including text inputs, select dropdowns, checkboxes, radio buttons, and submit buttons
4. WHEN a pull request is submitted, THE CI pipeline SHALL run type-check, lint, and test suites sequentially and block merge if any command exits with a non-zero exit code
5. IF the overall unit test line coverage falls below 70%, THEN THE CI pipeline SHALL fail the build and report the current coverage percentage in the output

### Requirement 12: التحقق من رفع الملفات

**User Story:** As a security engineer, I want client-side file upload validation so that oversized or malicious files are rejected before transmission.

#### Acceptance Criteria

1. WHEN a user selects a file for upload, THE System SHALL validate the file size against a configurable maximum limit (default: 10 MB, configurable range: 1 MB to 100 MB) before initiating the upload request
2. WHEN a user selects a file for upload, THE System SHALL validate the file extension and MIME type against a configurable whitelist of allowed types (containing at least one entry) before initiating the upload request
3. IF a file exceeds the maximum allowed size, THEN THE System SHALL display an error message indicating the maximum permitted size and the actual file size, and prevent the upload request from being sent
4. IF a file has a disallowed type, THEN THE System SHALL display an error message indicating the allowed file types, and prevent the upload request from being sent
5. WHEN a user selects multiple files for upload, THE System SHALL validate each file independently and reject only the files that fail validation while permitting valid files to proceed
6. IF the file extension does not match the detected MIME type from the file header, THEN THE System SHALL reject the file and display an error message indicating a file type mismatch
