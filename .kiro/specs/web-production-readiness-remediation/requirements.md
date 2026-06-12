# Requirements Document

## Introduction

يعالج هذا المستند نتائج جاهزية الإنتاج الخاصة بواجهة المستخدم (frontend) لنظام الساقي (Al-Saqi) الموجودة في الحزمة `apps/web/`، كما هي موثّقة في التقرير #[[file:PRODUCTION_READINESS_REPORT.md]]. يحتوي التقرير على 74 نتيجة موزّعة على ست فئات: إعدادات البناء (Build Settings)، الأمان (Security)، الأداء (Performance)، معالجة الأخطاء وتجربة المستخدم (Error Handling & UX)، جودة الكود والاستقرار (Code Quality & Stability)، ودعم اللغة العربية والاتجاه من اليمين لليسار (RTL & Arabic Support)، بالإضافة إلى قسم توصيات البنية التحتية (Infrastructure Recommendations).

هذا الجهد هو عملية معالجة (remediation) تجمع بين ثلاثة أنواع من العمل: (أ) إصلاح عيوب (bug fixes)، (ب) تحسينات (improvements)، و(ج) ميزات بنية تحتية مفقودة يجب إضافتها (missing infrastructure features). النطاق محصور بواجهة المستخدم في `apps/web/` فقط.

**خارج النطاق (Out of Scope):** جميع عناصر الواجهة الخلفية (backend) التي عُولجت بالفعل في السبيك المنفصل `production-readiness-hardening` — بما في ذلك أخطاء بناء TypeScript على مستوى المستودع، مشاكل ESLint، الاختبارات الفاشلة في الواجهة الخلفية، ذاكرة جلسات Redis، إدارة الأسرار، التشفير، المصادقة الثنائية (2FA)، خطوط أنابيب CI/CD، شهادات SSL، Helmet، الضغط (compression)، تقسيم سجلات التدقيق (audit partitioning)، إعداد nginx على مستوى الواجهة الخلفية، وملف README. لا يكرّر هذا السبيك أيًّا من تلك العناصر.

## Glossary

- **Web_App**: تطبيق الواجهة الأمامية المبني بـ React/Vite الموجود في `apps/web/`.
- **Build_System**: نظام البناء وإدارة الاعتماديات لـ `apps/web` (package.json، vite.config.ts، tsconfig، lockfile، CI).
- **API_Client**: طبقة الاتصال بالخادم في `apps/web/src/api/` بما فيها `client.ts` و`httpClient.ts` والوحدات (modules).
- **Notification_System**: سياق الإشعارات `apps/web/src/context/NotificationContext.tsx` وما يرتبط به من اتصال WebSocket وصوت التنبيه.
- **WebSocket_Client**: الصنف `WebSocketClient` في `apps/web/src/api/ws/websocket-client.ts` الذي يطبّق التراجع الأسّي (exponential backoff) مع jitter وحد أقصى للمحاولات واحتياطي عبر HTTP polling.
- **Error_Reporter**: الأداة `apps/web/src/utils/errorReporter.ts` التي ترسل تقارير أخطاء مهيكلة إلى نقطة `/api/system-errors`.
- **Error_Monitor**: خدمة مراقبة أخطاء خارجية بمستوى إنتاجي (Sentry عبر `@sentry/react`).
- **Type_System**: العقود النوعية (TypeScript types) ومخططات Zod في `apps/web` والحزمة المشتركة `@alsaqi/shared`.
- **Test_Suite**: مجموعة اختبارات `apps/web` المُشغّلة عبر Vitest وإعداداتها في `vitest.config.ts`.
- **Direction_Controller**: المنطق المسؤول عن ضبط اتجاه المستند (`document.documentElement.dir` و`lang`) عبر `i18n.ts` وملف `index.html`.
- **Number_Formatter**: أدوات تنسيق الأرقام `apps/web/src/utils/format.ts` و`apps/web/src/utils/formatService.ts`.
- **Content_Security_Policy**: سياسة أمان المحتوى المعرّفة في `apps/web/Dockerfile` (إعداد nginx security-headers).
- **Feature_Flag_System**: نظام أعلام الميزات (feature flags) الذي يجب إضافته للتحكم في تفعيل الميزات دون إعادة نشر.
- **Rate_Limiter**: إعداد تحديد المعدّل (rate limiting) في nginx الخاص بنشر الواجهة الأمامية لمسار وكيل الـ API.
- **Web_Vitals_Reporter**: الأداتان `apps/web/src/utils/webVitalsMonitor.ts` و`apps/web/src/utils/webVitalsReporter.ts` اللتان تجمعان مؤشرات الأداء وترسلانها إلى `/api/metrics/web-vitals`.
- **Log_Pipeline**: خطّاف (hook) خط أنابيب تجميع السجلات المهيكلة الناتجة عن `apps/web/src/utils/logger.ts`.
- **Bundle**: حزمة JavaScript المُنتَجة لبيئة الإنتاج من `apps/web`.

## Requirements

### Requirement 1: Dependency and Build Configuration Safety

**User Story:** As a release engineer, I want deterministic and locked frontend dependency versions and safe build settings, so that CI installs and production builds are reproducible and never ship source maps. (BUILD-001, BUILD-002, BUILD-003, CQ-043)

#### Acceptance Criteria

1. THE Build_System SHALL declare the `@alsaqi/shared` workspace dependency in `apps/web/package.json` using a constrained specifier (`workspace:*` or an explicit semver version) instead of the wildcard `"*"`.
2. THE Build_System SHALL pin the runtime dependencies `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `axios`, and `zod` in `apps/web/package.json` to exact versions without caret (`^`) ranges.
3. THE Build_System SHALL pin `typescript` in the `devDependencies` of `apps/web/package.json` to an exact version without a tilde (`~`) range.
4. WHEN dependencies are installed in CI, THE Build_System SHALL enforce the committed lockfile (for example via `npm ci` or `--frozen-lockfile`).
5. WHEN a production build of Web_App is executed, THE Build_System SHALL produce a `dist/` output that contains no `.map` source map files.
6. THE Build_System SHALL set `build.sourcemap` to `false` or `'hidden'` for the production build configuration in `apps/web/vite.config.ts`.

### Requirement 2: Frontend Security Hardening

**User Story:** As a security reviewer, I want the version-update dialog, the Content Security Policy, and the Vite build configuration to be free of the critical frontend security blockers, so that the application is safe to deploy to production. (SEC-001, SEC-002, SEC-003)

#### Acceptance Criteria

1. WHEN the API_Client displays the version-update dialog, THE Web_App SHALL construct the reload button using DOM APIs (`document.createElement`) and attach the reload behavior via `addEventListener`, and SHALL NOT use `innerHTML` with an inline `onclick` handler.
2. WHEN a user activates the reload button under the deployed Content_Security_Policy, THE Web_App SHALL trigger a page reload within 1 second of activation.
3. WHEN a user activates the reload button under the deployed Content_Security_Policy, THE Web_App SHALL complete the reload without generating any Content_Security_Policy violation report attributable to the reload behavior.
4. THE Content_Security_Policy SHALL define explicit `script-src`, `style-src`, `img-src`, and `font-src` directives in `apps/web/Dockerfile` in addition to the existing `default-src`, `connect-src`, and `frame-ancestors` directives, and SHALL NOT use a wildcard (`*`) or `unsafe-inline` source for the `script-src` directive.
5. THE Content_Security_Policy SHALL include exactly one violation reporting directive (`report-uri` or `report-to`) that designates a reporting endpoint, so that policy violations are reported in production.
6. WHILE the deployed Content_Security_Policy is active, THE Web_App SHALL apply Tailwind CSS styling without generating any `style-src` Content_Security_Policy violation report.
7. THE Build_System SHALL remove the `process.env.GEMINI_API_KEY` entry from the `define` block in `apps/web/vite.config.ts`, so that the `define` block contains no reference to `GEMINI_API_KEY`.
8. IF the production Bundle produced from `apps/web/vite.config.ts` contains any embedded value of `GEMINI_API_KEY`, THEN THE Build_System SHALL fail the build and indicate that a secret key value was detected in the Bundle.

### Requirement 3: Resilient Real-time Notifications and Audio Resource Management

**User Story:** As an authenticated user, I want notification reconnection to use exponential backoff and notification sounds to manage audio resources correctly, so that the system does not overload the server during outages or exhaust browser audio resources. (PERF-001, PERF-002, PERF-003)

#### Acceptance Criteria

1. THE Notification_System SHALL use the WebSocket_Client class for its real-time connection instead of a raw `WebSocket` with a fixed reconnect delay.
2. WHILE the notification server is unreachable, THE Notification_System SHALL reconnect using exponential backoff with jitter and a bounded maximum number of attempts.
3. WHEN a notification sound is played, THE Notification_System SHALL reuse a single shared `AudioContext` instance or close each created `AudioContext` after the sound completes.
4. WHEN the authenticated user state changes, THE Notification_System SHALL re-establish the WebSocket connection using current callback references and SHALL NOT retain stale closures for the connect, fetch-notifications, and fetch-unread-count callbacks.

### Requirement 4: Bundle Optimization and Dead Asset Removal

**User Story:** As a performance engineer, I want heavy libraries to load on demand and unused assets and dead code removed, so that initial route loads are smaller and the deployment is leaner. (PERF-011, PERF-012, PERF-004, PERF-015)

#### Acceptance Criteria

1. WHERE Excel import or export is triggered in `apps/web/src/modules/RiskRegister.tsx`, THE Web_App SHALL load `ExcelJS` via a dynamic `import()` at the point of use rather than a top-level static import.
2. WHERE a PDF document is rendered, THE Web_App SHALL load the `PdfViewer` component (and its `react-pdf`/`pdfjs-dist` dependencies) through a lazy boundary (`React.lazy()` with `<Suspense>`) in the consuming modules (`AuditEvidence.tsx`, `AuditTasks.tsx`, `Correspondence/OutgoingRegister.tsx`).
3. THE Web_App SHALL remove the unused asset files `ALSAQI Logo S Left.png` and `ALSAQI Logo S Under.png` from `apps/web/public/`.
4. THE Web_App SHALL serve the application logo in an optimized format (for example WebP) and SHALL set `decoding="async"` on the logo `<img>` element in `Logo.tsx`.
5. IF the component `apps/web/src/components/PdfTemplateEditor.tsx` remains unreferenced, THEN THE Web_App SHALL remove it as dead code; WHERE it is connected for future use, THE Web_App SHALL import it through a lazy boundary.

### Requirement 5: Consistent Loading and Skeleton UX

**User Story:** As a user of data-heavy views, I want consistent loading indicators and skeleton placeholders, so that perceived performance and visual consistency are improved across the application. (ERR-001, ERR-002)

#### Acceptance Criteria

1. WHILE a data-fetching view (Dashboard, ComplianceMatrix, SystemErrorLogs, Notifications) is loading its initial dataset, THE Web_App SHALL display exactly one `SkeletonLoader` variant (`TableSkeleton` for tabular views, `CardSkeleton` for card-based views, or `StatsSkeleton` for summary-statistic views) and SHALL NOT display partially-rendered data for that view.
2. WHEN a data-fetching view (Dashboard, ComplianceMatrix, SystemErrorLogs, Notifications) completes its data request successfully, THE Web_App SHALL replace the displayed `SkeletonLoader` or `LoadingSpinner` with the loaded content within 300 milliseconds.
3. IF a data-fetching view's data request fails, THEN THE Web_App SHALL remove the displayed `SkeletonLoader` or `LoadingSpinner`, display an error indication describing the failure, and SHALL NOT leave the skeleton placeholder or spinner visible.
4. THE Web_App SHALL render every loading-spinner indicator in `Dashboard/index.tsx`, `ComplianceMatrixPage.tsx`, `SystemErrorLogs/index.tsx`, and `Notifications.tsx` using the shared `LoadingSpinner` component, and SHALL NOT contain inline ad-hoc spinner implementations in those files.
5. IF all `SkeletonLoader` exports have zero references across the Web_App codebase, THEN THE Web_App SHALL remove the unused `SkeletonLoader` code.

### Requirement 6: Resilient API Requests and Structured Error Reporting

**User Story:** As a developer operating the system, I want all API calls to retry on transient failures and all error logging to flow through the structured error reporter, so that errors remain visible in production where console output is stripped. (ERR-003, ERR-005, CQ-001 through CQ-011)

#### Acceptance Criteria

1. WHEN a request issued through the raw Axios instance (`client.http`) in `apps/web/src/api/httpClient.ts` encounters a network failure or a 5xx response, THE API_Client SHALL retry the request automatically.
2. WHEN the `onError` callback in `httpClient.ts` is invoked, THE API_Client SHALL report the error through `Error_Reporter.report()` instead of relying on `console.error`.
3. THE Web_App SHALL replace `console.error`, `console.warn`, and `console.log` statements used for error and failure reporting in `NotificationContext.tsx`, `httpClient.ts`, `client.ts`, `AuthContext.tsx`, `Reports/hooks/useReports.ts`, and `Dashboard/index.tsx` with calls to `Error_Reporter.report()` at the appropriate severity level.
4. WHERE console statements in `globalErrorHandlers.ts` and `errorService.ts` are redundant with existing `Error_Reporter` calls, THE Web_App SHALL remove the redundant console statements.
5. WHERE console statements in `useConnectionStatus.ts`, `websocket-client.ts`, and `webVitalsReporter.ts` are intended for development only, THE Web_App SHALL gate them behind `import.meta.env.DEV`.

### Requirement 7: Production Error Monitoring Integration

**User Story:** As a site reliability engineer, I want a production-grade error monitoring service integrated into the frontend, so that I get source map deobfuscation, error grouping, spike alerting, and release tracking. (ERR-004, Infrastructure #1)

#### Acceptance Criteria

1. THE Web_App SHALL integrate the `@sentry/react` error monitoring SDK and initialize it in `apps/web/src/main.tsx`.
2. WHEN the Web_App runs in production and an unhandled error or unhandled promise rejection occurs, THE Error_Monitor SHALL capture and report the error.
3. THE Build_System SHALL configure source map upload to the Error_Monitor in `apps/web/vite.config.ts` while keeping production-served source maps disabled per Requirement 1.
4. WHILE the Error_Monitor is active, THE Error_Reporter SHALL continue sending internal structured reports to `/api/system-errors`.

### Requirement 8: Type Safety and Typed Schemas

**User Story:** As a maintainer, I want untyped `as any`/`: any` usages replaced with typed interfaces and Zod schemas sourced from `@alsaqi/shared`, so that breaking API changes are caught at compile time. (CQ-012 through CQ-030)

#### Acceptance Criteria

1. THE Web_App SHALL remove all `as any` and `: any` assertions identified in the API modules and feature modules (`api/modules/dashboard.ts`, `api/modules/user-management.ts`, `ComplianceMatrixPage.tsx`, `AuditWorkspace.tsx`, `CorrespondenceSystem.tsx`, `AuditFindings.tsx`, `FraudLog/hooks/useFraudLog.ts`, `Recommendations.tsx`, `AuditPlan.tsx`, `Settings/SettingsPage.tsx`) and replace them with explicit typed interfaces.
2. THE Web_App SHALL type form state and submission payloads in `AuditPlanForm.tsx`, `FindingForm.tsx`, and `RiskForm.tsx` using the inferred types of their Zod schemas.
3. THE Web_App SHALL use the typed APIs of the `jsPDF` and `docx` libraries in `utils/pdfExport.ts` and `utils/docxExport.ts` instead of `as any` assertions.
4. THE Type_System SHALL define typed Zod schemas (replacing generic `z.record(z.string(), z.unknown())` schemas) for the dashboard and user-management API responses in `api/modules/dashboard.ts` and `api/modules/user-management.ts`.
5. THE Type_System SHALL import shared entity types (`DashboardStats`, `CentralBankInstruction`, and the user-management types `Role`, `Permission`, `UserSession`, `JobTitle`, `UserManagementSettings`) from `@alsaqi/shared` instead of redefining them locally.
6. WHEN `tsc --build` is executed on `apps/web` after these changes, THE Type_System SHALL compile with zero new type errors while `strict` mode remains enabled.

### Requirement 9: Removal of Dead and Duplicate Types

**User Story:** As a maintainer, I want unused and duplicated local type definitions removed, so that the type surface is clear and consumers rely on `@alsaqi/shared`. (CQ-039, CQ-040, CQ-041)

#### Acceptance Criteria

1. THE Web_App SHALL remove the unused `LawBankItem` and `OrgPosition` interfaces from `apps/web/src/types.ts`.
2. THE Web_App SHALL remove the duplicate `FraudCase` interface from `apps/web/src/types.ts` and consolidate on a single definition (the `FraudLog/types.ts` version or a promoted `@alsaqi/shared` type).
3. WHEN the duplicate and unused types are removed, THE Type_System SHALL compile with zero unresolved references to the removed types.

### Requirement 10: Test Coverage for Hooks, Contexts, and Thresholds

**User Story:** As a quality engineer, I want missing hook and context tests added and coverage thresholds enforced, so that critical frontend logic is protected against regressions. (CQ-031 through CQ-038, CQ-042)

#### Acceptance Criteria

1. THE Test_Suite SHALL include test files for the React Query hooks `useAuth`, `useFindings`, `useAuditPlans`, `useTasks`, `useUsers`, and `useNotifications`.
2. THE Test_Suite SHALL include coverage for the backward-compatible `httpClient.ts` export path (auth token attachment and 401 redirect behavior).
3. THE Test_Suite SHALL include a test file for `UserContext` covering set-user, clear-user, and context value stability.
4. THE Test_Suite SHALL define coverage thresholds in `vitest.config.ts` with minimum coverage for the critical directories `api/`, `context/`, and `permissions/`.
5. WHEN the Test_Suite is executed with `vitest --run`, THE Test_Suite SHALL pass and SHALL fail the run if coverage falls below the configured thresholds.

### Requirement 11: Default RTL Direction and Single Source of Truth

**User Story:** As an Arabic-speaking user, I want the page to render right-to-left immediately on load with a single consistent direction-setting mechanism, so that I never see a flash of wrong direction. (RTL-001, RTL-002, RTL-003)

#### Acceptance Criteria

1. THE Web_App SHALL set `lang="ar"` and `dir="rtl"` as static defaults on the `<html>` element in `apps/web/index.html`.
2. WHEN `apps/web/index.html` is first parsed, THE Direction_Controller SHALL run an inline script in `<head>` (before any module scripts) that reads the persisted language from `localStorage` and synchronously sets `document.documentElement.dir` and `document.documentElement.lang`.
3. THE Direction_Controller SHALL set the document direction from a single source of truth (`i18n.ts`) and SHALL NOT duplicate direction-setting logic in `PreferencesContext.tsx`.
4. THE Web_App SHALL document the chosen initial language-detection behavior: WHERE Arabic-first is intentional, THE Web_App SHALL retain `fallbackLng: 'ar'`; WHERE browser language detection is desired for first-time visitors, THE Direction_Controller SHALL allow `LanguageDetector` to select the initial language.

### Requirement 12: Logical CSS Properties for RTL Layout

**User Story:** As an Arabic-speaking user, I want positioning, margins, animations, and the skip link to respect reading direction, so that the layout mirrors correctly in RTL. (RTL-004, RTL-005, RTL-010, RTL-011)

#### Acceptance Criteria

1. THE Web_App SHALL replace the hardcoded `right-3` positioning on the password visibility toggles in `ChangePasswordModal.tsx` with the logical `end-3` utility.
2. THE Web_App SHALL replace the hardcoded `-mr-16` offset on the decorative element in `ComplianceMatrixPage.tsx` with the logical `-me-16` utility.
3. WHILE the document direction is RTL, THE Web_App SHALL play the `slideInRight` and `slideInLeft` entry animations in `index.css` from the correct inline side using direction-aware keyframes.
4. THE Web_App SHALL replace the fixed `left` positioning of the `.skip-link` (and its focus state) in `index.css` with `inset-inline-start`.

### Requirement 13: RTL Icon Mirroring

**User Story:** As an Arabic-speaking user, I want directional icons to mirror in RTL mode, so that arrows and chevrons point consistently with the reading flow. (RTL-006, RTL-007, RTL-008, RTL-009)

#### Acceptance Criteria

1. WHILE the document direction is RTL, THE Web_App SHALL mirror the `ArrowRight` icons in `Reports/components/TopRisksList.tsx` and `RiskRegister.tsx` (for example via `rtl:rotate-180`).
2. WHILE the document direction is RTL, THE Web_App SHALL mirror the `ChevronRight` selection indicator in `UserManagement/RolePermissions.tsx`.
3. WHILE the document direction is RTL, THE Web_App SHALL correctly orient the `ChevronRight` icon in `ComplianceMatrixPage.tsx` by replacing the static `rotate-180` class with a direction-aware class (`ltr:rotate-180`).

### Requirement 14: Arabic Number Formatting with Grouping

**User Story:** As an Arabic-speaking user, I want numbers and percentages formatted with proper Eastern Arabic digits and grouping separators, so that large values are readable and the script is consistent. (RTL-012, RTL-013, RTL-014)

#### Acceptance Criteria

1. WHEN formatting numbers for the Arabic locale, THE Number_Formatter SHALL use `Intl.NumberFormat` with grouping enabled (`useGrouping: true`) in `utils/format.ts` instead of manual digit replacement.
2. WHEN formatting numbers for the Arabic locale, THE Number_Formatter SHALL use `Intl.NumberFormat` with grouping enabled in `utils/formatService.ts` instead of manual digit replacement.
3. WHILE the active locale is Arabic, THE Web_App SHALL render the health percentage in `SystemLogsManagement.tsx` using `Intl.NumberFormat` (with `style: 'percent'`) so that Eastern Arabic numerals are displayed instead of Western numerals.

### Requirement 15: Feature Flag System

**User Story:** As a product operator, I want a feature flag system in the frontend, so that I can roll out features progressively and disable problematic features without redeployment. (Infrastructure #4)

#### Acceptance Criteria

1. THE Web_App SHALL integrate a Feature_Flag_System that exposes flag values to React components.
2. WHERE a feature is wrapped behind a flag, THE Web_App SHALL render the feature only when its flag evaluates to enabled.
3. WHEN a flag value cannot be retrieved, THE Feature_Flag_System SHALL fall back to a safe default value for that flag.

### Requirement 16: Frontend API Rate Limiting

**User Story:** As an operator, I want nginx-level rate limiting on the frontend API proxy path, so that abusive request volumes are throttled at the edge even if the backend limiter is bypassed. (Infrastructure #5)

#### Acceptance Criteria

1. THE Rate_Limiter SHALL define a `limit_req_zone` keyed on the client address in the nginx configuration of the frontend deployment (`apps/web/Dockerfile`).
2. THE Rate_Limiter SHALL apply the request-rate limit (with a configured rate and burst) to the `location /api/` proxy path.
3. IF the configured request rate is exceeded, THEN THE Rate_Limiter SHALL reject the excess requests with an appropriate HTTP status response.

### Requirement 17: Activate Web Vitals Reporting

**User Story:** As a performance engineer, I want the existing Web Vitals monitor and reporter activated, so that real-user performance metrics are collected in production instead of remaining dead code. (Infrastructure #6, CQ-011)

#### Acceptance Criteria

1. WHEN the Web_App initializes in `apps/web/src/main.tsx`, THE Web_App SHALL call `webVitalsMonitor.init()` and `initWebVitalsReporter()` to activate metric collection.
2. WHEN a Web Vitals metric (LCP, FID, CLS, FCP, TTFB) is captured, THE Web_Vitals_Reporter SHALL send the metric to `/api/metrics/web-vitals`.
3. IF sending a metric fails, THEN THE Web_Vitals_Reporter SHALL buffer the metric and retry without blocking the main thread.

### Requirement 18: Log Aggregation Pipeline Hook

**User Story:** As an operator, I want a hook for forwarding structured frontend logs to an aggregation pipeline, so that production logs are persisted, queryable, and can drive alerting. (Infrastructure #7)

#### Acceptance Criteria

1. THE Log_Pipeline SHALL provide a configurable forwarding hook for the structured log entries produced by `apps/web/src/utils/logger.ts`.
2. WHILE the Web_App runs in production, THE Log_Pipeline SHALL forward `error`-level structured log entries to the configured aggregation destination.
3. WHERE warn-level forwarding is enabled by configuration, THE Log_Pipeline SHALL also forward `warn`-level entries in production.
4. IF the aggregation destination is unavailable, THEN THE Log_Pipeline SHALL retain the existing `/api/system-errors` delivery path as a fallback.
