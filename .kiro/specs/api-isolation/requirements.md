# Requirements Document

## Introduction

تُحدد هذه الوثيقة المتطلبات الوظيفية وغير الوظيفية لعزل طبقة الـ API في مشروع ALSAQI. الهدف هو فصل منطق الخادم (Backend API) عن الواجهة الأمامية (Frontend) من خلال إنشاء حزمة API مستقلة (`packages/api`)، حزمة عقود مشتركة (`packages/shared`)، وطبقة عميل API مكتوبة الأنواع (`apps/web/src/api/`). هذا الفصل يتيح النشر المستقل، الاختبار المعزول، والتوسع بشكل منفرد.

## Glossary

- **API_Package**: حزمة الخادم المستقلة الموجودة في `packages/api` والتي تحتوي على كامل منطق الخادم (routes, services, middleware, db)
- **Shared_Package**: حزمة العقود المشتركة في `packages/shared` التي تحتوي على الأنواع ومخططات التحقق والثوابت
- **API_Client**: طبقة عميل الـ API المكتوبة الأنواع في `apps/web/src/api/` التي تغلف استدعاءات HTTP
- **API_Server**: كائن الخادم الذي يُنشأ عبر دالة `createApiServer()` ويدير دورة حياة الخادم
- **ApiResponse**: عقد الاستجابة الموحد (`ApiResponse<T>`) الذي يغلف جميع استجابات الـ API
- **Validation_Schema**: مخطط تحقق Zod مُعرَّف في Shared_Package وقابل للاستخدام في الخادم والعميل
- **Workspace_Root**: المجلد الجذري للمشروع الذي يدير الحزم المتعددة عبر npm workspaces
- **Frontend_App**: تطبيق الواجهة الأمامية (React) الموجود في `apps/web/`

## Requirements

### المتطلب 1: هيكل حزمة API المستقلة

**User Story:** بصفتي مطوراً، أريد أن يكون منطق الخادم مغلفاً في حزمة مستقلة، حتى أتمكن من نشرها واختبارها بمعزل عن الواجهة الأمامية.

#### معايير القبول (Acceptance Criteria)

1. THE API_Package SHALL contain all server logic including routes, services, middleware, database access, cron jobs, and utility modules within `packages/api/src/`
2. THE API_Package SHALL export a `createApiServer` function that accepts an `ApiServerConfig` object (containing port, corsOrigins, jwtSecret, jwtPrivateKey, jwtPublicKey, databaseUrl, uploadDir, and nodeEnv) and returns an `ApiServer` instance
3. WHEN `ApiServer.start()` is called, THE API_Package SHALL initialize the database connection, run pending Drizzle migrations, and resolve the returned Promise only after the server is accepting HTTP and WebSocket connections on the configured port
4. WHEN `ApiServer.stop()` is called, THE API_Package SHALL stop accepting new connections, allow in-flight database transactions to complete up to the 10-second timeout, close all active HTTP and WebSocket connections within 10 seconds, and release the port
5. IF `ApiServer.stop()` is called and active connections or in-flight database transactions do not complete within 10 seconds, THEN THE API_Package SHALL forcefully terminate remaining connections and transactions and release the port
6. IF `ApiServer.start()` is called and the configured port is already in use or the database is unreachable, THEN THE API_Package SHALL reject the returned Promise with an error indicating the failure reason
7. THE API_Package SHALL NOT serve any static files or frontend assets
8. THE API_Package SHALL have its own `package.json` with its own dependency list and build/start scripts, and its own `tsconfig.json` with compiler options independent from the workspace root

### المتطلب 2: حزمة العقود المشتركة

**User Story:** بصفتي مطوراً، أريد أن تكون الأنواع ومخططات التحقق مُعرَّفة في مكان واحد مشترك، حتى أضمن التوافق بين الخادم والعميل.

#### معايير القبول (Acceptance Criteria)

1. THE Shared_Package SHALL define all data model types that are referenced by both API_Package and Frontend_App within `packages/shared/src/types/`, such that no TypeScript type used in both packages is defined outside Shared_Package
2. THE Shared_Package SHALL define Zod validation schemas for every API endpoint that accepts user input within `packages/shared/src/validators/`, covering at minimum: request body schemas, query parameter schemas, and path parameter schemas
3. THE Shared_Package SHALL define shared constants including error codes, user roles, and status enums within `packages/shared/src/constants/`
4. THE Shared_Package SHALL export all public types, validators, and constants through a single entry point (`packages/shared/src/index.ts`) such that API_Package and Frontend_App import exclusively from this entry point
5. WHEN a Validation_Schema is executed with the same input on both server (Node.js) and client (browser) environments, THE Shared_Package SHALL produce identical results for the `success` boolean, the `error.issues` array structure (field paths and error codes), and the parsed `data` output
6. IF API_Package or Frontend_App imports a data model type that is used by the other package, THEN THE Shared_Package SHALL be the sole source of that type definition, and direct cross-imports between API_Package and Frontend_App SHALL be prohibited
7. WHEN Shared_Package is compiled with `tsc --noEmit`, THE Shared_Package SHALL produce zero type errors, confirming that all exported types, validators, and constants are internally consistent

### المتطلب 3: عقد الاستجابة الموحد

**User Story:** بصفتي مطور واجهة أمامية، أريد أن تتبع جميع استجابات الـ API هيكلاً موحداً، حتى أتمكن من معالجتها بشكل متسق.

#### معايير القبول (Acceptance Criteria)

1. WHEN a request succeeds, THE API_Package SHALL return an HTTP 2xx response with `success: true`, a `data` field containing the response payload, and a `meta` object containing `requestId` (UUID v4 format), `timestamp` (ISO 8601 datetime format), and `version` (API version as a semantic versioning string, e.g., "1.0.0", representing the API contract version not the package version)
2. WHEN a request includes `page` and `pageSize` query parameters, THE API_Package SHALL include a `pagination` object within `meta` containing `page` (integer, minimum 1), `pageSize` (integer, 1 to 100, defaulting to 20 when the client does not specify it), `total` (integer, minimum 0), `totalPages` (integer, minimum 0), `hasNext` (boolean), and `hasPrev` (boolean) fields
3. WHEN a request fails, THE API_Package SHALL return an HTTP 4xx or 5xx response with `success: false`, `data: null`, an `error` object containing `code` (string), `message` (string), `traceId` (string), and optionally `details` (an array of field-level error objects, each with `path`, `message`, and `code`, included when the error is a validation failure), and a `meta` object containing `requestId` (UUID v4 format), `timestamp` (ISO 8601 datetime format), and `version` (API version as a semantic versioning string, e.g., "1.0.0")
4. THE ApiResponse SHALL be defined as a Zod schema in Shared_Package to enable validation on both server and client sides
5. IF the API_Package returns a response that does not conform to the ApiResponse Zod schema, THEN THE API_Client SHALL throw a validation error indicating the response structure mismatch

### المتطلب 4: طبقة عميل الـ API المكتوبة الأنواع

**User Story:** بصفتي مطور واجهة أمامية، أريد واجهة برمجية مكتوبة الأنواع لاستدعاء الـ API، حتى أكتشف الأخطاء في وقت التجميع بدلاً من وقت التشغيل.

#### معايير القبول (Acceptance Criteria)

1. THE API_Client SHALL provide a `createApiClient` function that accepts `ApiClientConfig` (including `baseUrl`, optional `timeout` defaulting to 30000ms, `onUnauthorized` callback, and `onError` callback) and returns a typed client object with module-specific sub-clients (auth, auditPlans, auditPrograms, findings, tasks, users, departments, notifications, riskRegister, correspondence, recommendations).
2. WHEN an API call is made through API_Client, THE API_Client SHALL validate the response against the corresponding Zod schema from Shared_Package before returning data to the caller.
3. IF response validation against the Zod schema fails, THEN THE API_Client SHALL throw a `ZodError` containing the schema mismatch details without returning the invalid data to the caller.
4. WHEN API_Client receives a 401 response that is not a token refresh request, THE API_Client SHALL attempt exactly one token refresh and, if the refresh succeeds, retry the original request exactly once.
5. IF token refresh fails or the retried request returns 401 again, THEN THE API_Client SHALL invoke the configured `onUnauthorized` callback without further retry attempts.
6. WHEN API_Client sends a request, THE API_Client SHALL automatically attach a CSRF token header (`x-csrf-token`, read from the server-issued `csrf-token` cookie) and a correlation ID header (a UUID v4 string unique per request) to the outgoing request headers.
7. THE API_Client SHALL provide React Query hooks (useQuery-based for reads, useMutation-based for writes) for each API module, with automatic query key management and cache invalidation on successful mutations.

### المتطلب 5: عزل الاستيرادات بين الحزم

**User Story:** بصفتي مهندس برمجيات، أريد أن يكون هناك فصل تام في الاستيرادات بين الحزم، حتى لا يحدث تشابك غير مقصود بين طبقة الخادم والواجهة.

#### معايير القبول (Acceptance Criteria)

1. THE API_Package SHALL NOT contain any static import statement (import/require) that references a path within Frontend_App (`apps/web/`), including type-only imports
2. THE Frontend_App SHALL NOT contain any static import statement (import/require) that references a path within API_Package (`packages/api/`), including type-only imports
3. IF API_Package or Frontend_App requires a type, interface, validator, or constant used by both packages, THEN THE system SHALL import it exclusively from Shared_Package (`packages/shared`)
4. THE Workspace_Root SHALL configure TypeScript project references with `composite: true` and `references` in each package's `tsconfig.json` to restrict cross-package import resolution to only explicitly declared dependencies
5. IF a developer introduces an import that violates the boundaries defined in criteria 1 or 2, THEN THE TypeScript compilation (`tsc --build`) SHALL fail with a module resolution error before the code can be merged

### المتطلب 6: التوافق العكسي مع المسارات الحالية

**User Story:** بصفتي مستخدماً للنظام، أريد أن تستمر جميع واجهات الـ API الحالية بالعمل بعد الترحيل، حتى لا يتأثر عملي اليومي.

#### معايير القبول (Acceptance Criteria)

1. WHEN a request is sent to any existing API path without a version prefix (e.g., `/api/findings`, `/api/auth/login`), THE API_Package SHALL rewrite the path internally to `/api/v1/{resource}` and serve the request; WHEN a request is sent to an explicitly versioned path (e.g., `/api/v1/findings`), THE API_Package SHALL serve it directly without rewriting. In both cases, the response SHALL maintain the same endpoint paths, HTTP methods, authentication behavior, and response data content as the previous monolith implementation, wrapped in the standard ApiResponse envelope structure defined in Requirement 3
2. THE API_Package SHALL maintain the same HTTP methods, request body schemas, query parameter names, and query parameter formats for all existing endpoints, such that any request accepted by the monolith is also accepted by the API_Package and any request rejected by the monolith is also rejected by the API_Package
3. THE API_Package SHALL maintain the same authentication and authorization behavior for all existing protected routes, such that requests with a valid JWT token that were authorized by the monolith are also authorized by the API_Package, and requests with an invalid or missing token receive the same HTTP 401 or 403 status code
4. WHEN the API_Package is deployed as a replacement for the monolith server, THE API_Package SHALL accept requests on the same base path prefix (`/api/`) and on the same network port (default 3000 or as configured via the `PORT` environment variable)
5. WHEN a request is sent to the WebSocket upgrade path with a valid JWT token in the `?token=` query parameter, THE API_Package SHALL complete the WebSocket handshake and maintain the same connection lifecycle (server-initiated ping every 30 seconds with a 10-second pong timeout, authentication via query parameter) as the previous monolith implementation
6. IF a request is sent to a non-existent API path under `/api/`, THEN THE API_Package SHALL return an HTTP 404 response with a JSON body containing an error message indicating the endpoint was not found, consistent with the monolith behavior
7. THE API_Package SHALL include the `X-API-Version` response header on all `/api/` responses, preserving the existing versioning mechanism

### المتطلب 7: استقلال النشر

**User Story:** بصفتي مهندس DevOps، أريد أن أتمكن من نشر الـ API والواجهة الأمامية بشكل مستقل، حتى أقلل من مخاطر النشر وأسرّع دورات التسليم.

#### معايير القبول (Acceptance Criteria)

1. WHEN API_Package is deployed independently, THE Frontend_App SHALL continue serving pages and responding to user interactions, and its health check endpoint SHALL return a success status within 5 seconds of the API_Package deployment completing
2. WHEN Frontend_App is deployed independently, THE API_Package SHALL continue processing API requests without requiring a restart, and its health check endpoint SHALL return a success status within 5 seconds of the Frontend_App deployment completing
3. THE API_Package SHALL be buildable and runnable as a standalone Docker container with its own Dockerfile, such that executing `docker build` followed by `docker run` results in the container health check passing within 30 seconds without any dependency on Frontend_App files or container
4. THE deploy configuration SHALL define separate services for API_Package and Frontend_App in `docker-compose.yml`, each with an independent `build` context, independent `healthcheck` definition, and no `depends_on` relationship between them
5. THE nginx configuration SHALL route requests with `/api` prefix to the API_Package container and all other requests to the Frontend_App container
6. IF the API_Package container is unreachable, THEN THE Frontend_App SHALL continue serving the application shell and display an error indication to the user within 5 seconds of the first failed API request
7. IF the Frontend_App container is unreachable, THEN THE nginx configuration SHALL return an HTTP 502 response for non-API requests while continuing to route `/api` prefix requests to the API_Package container

### المتطلب 8: أمان الاتصال بين الحزم

**User Story:** بصفتي مهندس أمان، أريد أن تبقى آليات الحماية (CORS, CSRF, JWT, Rate Limiting) فعالة بعد العزل، حتى لا يُفتح أي ثغرة أمنية جديدة.

#### معايير القبول (Acceptance Criteria)

1. THE API_Package SHALL configure CORS to accept requests only from origins explicitly listed in the `CORS_ORIGIN` environment variable, and SHALL reject requests from any origin not in that list by omitting CORS access-control headers from the response; wildcard (`*`) SHALL NOT be used when `NODE_ENV` is set to `production`
2. THE API_Package SHALL validate CSRF tokens on all state-changing requests (POST, PUT, PATCH, DELETE) using the cookie-to-header mechanism, comparing the `x-csrf-token` header value against the `csrf-token` cookie value
3. IF a state-changing request is received without a valid CSRF token, THEN THE API_Package SHALL reject the request with HTTP 403 and an error message indicating CSRF validation failure, except for explicitly exempt authentication endpoints (login, token refresh)
4. THE API_Package SHALL store JWT private and public keys exclusively within its own configuration and SHALL NOT expose them to Frontend_App or Shared_Package; Shared_Package SHALL contain only types, validators, and constants with no cryptographic key references
5. THE API_Package SHALL enforce rate limiting on all `/api` endpoints using a sliding window of 60 seconds, allowing a maximum of 100 requests per window for authenticated users (identified by user ID) and 50 requests per window for unauthenticated users (identified by IP address)
6. IF a client exceeds the rate limit, THEN THE API_Package SHALL respond with HTTP 429, include a `Retry-After` header indicating the number of seconds until the next available slot, and include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers in the response
7. THE API_Package SHALL perform file validation using Google's Magika library (added as a new dependency) for all file upload endpoints, verifying that the file's detected content type matches its declared extension
8. IF file validation detects a content-type mismatch, THEN THE API_Package SHALL reject the upload with HTTP 400 and an error message indicating a content mismatch for the file
9. WHEN separate packages are deployed, THE system SHALL maintain separate `.env` files for each package where API_Package contains database credentials, JWT keys, and server secrets, Frontend_App contains only the API base URL, and Shared_Package contains no secrets

### المتطلب 9: دعم WebSocket بعد الترحيل

**User Story:** بصفتي مستخدم للنظام، أريد أن تستمر الإشعارات الفورية بالعمل بعد ترحيل الـ API، حتى أبقى على اطلاع بالتحديثات لحظياً.

#### معايير القبول (Acceptance Criteria)

1. THE API_Package SHALL support WebSocket connections for real-time notifications alongside HTTP endpoints, delivering notification messages to connected clients within 2 seconds of the triggering event
2. WHEN a WebSocket connection is interrupted, THE API_Client SHALL attempt automatic reconnection with exponential backoff starting at 1 second initial delay, multiplying by 2 on each attempt, up to a maximum delay of 30 seconds between attempts, for a maximum of 5 reconnection attempts
3. IF WebSocket reconnection fails after 5 attempts, THEN THE API_Client SHALL fall back to HTTP polling for notifications at an interval of 30 seconds, and SHALL display a status indicator informing the user that real-time updates are operating in degraded mode
4. WHEN a WebSocket connection is re-established after interruption, THE API_Client SHALL synchronize missed notifications by requesting all notifications generated since the last successfully received notification (identified by sequence ID, a monotonically increasing integer assigned by the server), up to a maximum of 100 notifications
5. IF the API_Client is in HTTP polling fallback mode AND a WebSocket connection is successfully re-established, THEN THE API_Client SHALL stop HTTP polling and resume receiving notifications via the WebSocket connection

### المتطلب 10: التحقق من البيانات المشترك

**User Story:** بصفتي مطوراً، أريد أن أستخدم نفس مخططات التحقق في الخادم والعميل، حتى أتجنب تكرار المنطق وأضمن تطابق قواعد التحقق.

#### معايير القبول (Acceptance Criteria)

1. WHEN a Validation_Schema is used on the server for request validation, THE API_Package SHALL use the same schema imported from Shared_Package without redefining or duplicating the schema logic locally
2. WHEN a Validation_Schema is used on the client for form validation, THE Frontend_App SHALL use the same schema imported from Shared_Package without redefining or duplicating the schema logic locally
3. THE Validation_Schema definitions SHALL specify minimum length of at least 1 character and a maximum length constraint for every field defined with `z.string()`, including optional text fields when a value is provided
4. THE Validation_Schema definitions SHALL constrain enum fields to explicitly defined allowed values using `z.enum()` with a fixed list of permitted strings
5. WHEN validation fails on the server, THE API_Package SHALL return an HTTP 400 response conforming to the standard error response format (Requirement 3 AC3) with `success: false`, `data: null`, an `error` object containing `code` (set to `"VALIDATION_ERROR"`), `message` (human-readable summary), `traceId` (string), and a `details` array where each element includes `path` (field name or nested path as an array of strings), `message` (human-readable error description), and `code` (Zod issue code such as `too_small`, `too_big`, or `invalid_enum_value`), and SHALL NOT persist any data from the rejected request
6. WHEN validation fails on the client, THE Frontend_App SHALL display the corresponding error message adjacent to each invalid form field within 200 milliseconds of the validation trigger without requiring a server round-trip

### المتطلب 11: إدارة مساحة العمل (Workspace Management)

**User Story:** بصفتي مطوراً، أريد أن يُدار المشروع كمساحة عمل متعددة الحزم (monorepo)، حتى أتمكن من بناء وفحص جميع الحزم بأوامر موحدة.

#### معايير القبول (Acceptance Criteria)

1. THE Workspace_Root SHALL configure npm workspaces in the root `package.json` to manage API_Package, Shared_Package, and Frontend_App as linked packages, such that `npm install` at the root resolves inter-package dependencies via symlinks without requiring separate install commands per package
2. THE Workspace_Root SHALL provide a shared `tsconfig.base.json` that all package-level TypeScript configurations extend via the `extends` field, and each package SHALL have its own `tsconfig.json` that inherits from this base
3. WHEN `tsc --build` is run at workspace root, THE system SHALL perform type checking across all packages including cross-package boundaries and exit with a non-zero code if any type error exists in any package
4. THE Workspace_Root SHALL provide workspace-level scripts that build API_Package with `esbuild` (chosen specifically for bundling the API server, separate from Vite used for frontend) and Frontend_App with `vite` independently, such that each package can be built in isolation without requiring the other packages to be built first
5. WHEN Shared_Package exports are modified, THE system SHALL make those changes immediately available to API_Package and Frontend_App without requiring a rebuild of Shared_Package or a reinstall step, achieved via TypeScript project references with `declarationMap: true`; in development mode, hot-reload SHALL be supported via `tsx --watch` or equivalent
6. IF a build command fails in any individual package, THEN THE system SHALL exit with a non-zero code and report which package failed, without silently continuing to build other packages

### المتطلب 12: معالجة الأخطاء في طبقة العميل

**User Story:** بصفتي مستخدم للنظام، أريد أن تُعرض لي رسائل خطأ واضحة عند فشل الاتصال بالـ API، حتى أعرف ما يجب فعله.

#### معايير القبول (Acceptance Criteria)

1. WHEN API_Client sends a request and receives a network-level failure (connection refused, DNS resolution failure, request timeout exceeding the configured `timeout` value, or HTTP 5xx response), THE API_Client SHALL retry the request using exponential backoff starting at 1 second with a multiplier of 2 (1s, 2s, 4s) up to a maximum of 3 attempts before reporting failure
2. IF all 3 retry attempts fail, THEN THE API_Client SHALL invoke the configured `onError` callback with an error object containing the error type (timeout, connection, or server error), the original request URL, the number of attempts made, and the last failure reason
3. WHEN the API_Package returns an `X-API-Version` header value whose major.minor version does not match the major.minor version string bundled in the API_Client at build time (ignoring patch version differences), THE API_Client SHALL display a non-dismissible notification informing the user to refresh the page to load the latest version
4. WHEN API_Client receives a validation error response (HTTP 400) conforming to the standard error response format (Requirement 3 AC3) with an `error.details` array, THE API_Client SHALL parse the `error.details` array and expose field-level errors as a structured object keyed by field path, making them accessible to the UI form for inline display
5. IF API_Client receives an HTTP 400 response whose body does not conform to the standard error response format (Requirement 3 AC3), THEN THE API_Client SHALL invoke the configured `onError` callback with a generic error indicating an unexpected error format was received, without exposing raw response details to the user
