# Requirements Document

## Introduction

This document defines the requirements for the API Audit & Improvements feature of the AL-SAQI system. The requirements are derived from the technical design document which identified 12 problems and 8 technical gaps in the current API layer. The AL-SAQI system is a Modular Monolith built with Express.js 5 and TypeScript, serving a React SPA via RESTful API with WebSocket for real-time notifications.

The improvements span security hardening, response consistency, performance optimization, and operational observability.

## Glossary

- **API_Gateway**: The Express.js HTTP server layer that receives and routes all client requests
- **Response_Wrapper**: Middleware that wraps all API responses in a unified envelope structure
- **Request_Logger**: Middleware that records request/response metadata and performance metrics
- **File_Access_Controller**: Service that enforces authentication and authorization on uploaded files
- **Idempotency_Service**: Service that prevents duplicate operations when requests are retried
- **Soft_Delete_Service**: Service that marks records as deleted without physical removal from the database
- **Health_Check_Service**: Service that reports the operational status of all system subsystems
- **Rate_Limiter**: Middleware that throttles requests based on per-user identity rather than IP alone
- **Validation_Layer**: Zod-based middleware that validates request inputs against defined schemas
- **Pagination_Service**: Utility that provides consistent cursor-based or offset-based pagination across all list endpoints
- **Route_Registry**: The Express router configuration that maps URL paths to handler functions
- **Error_Handler**: Middleware that catches errors and returns sanitized error responses
- **Bulk_Operations_Service**: Service that processes multiple create/update/delete operations in a single transactional request
- **Signed_URL**: A time-limited, cryptographically signed URL that grants temporary access to a protected file
- **Cron_Scheduler**: Background job system that executes periodic tasks such as overdue notifications

## Requirements

### Requirement 1: Unified Response Envelope

**User Story:** As a frontend developer, I want all API responses to follow a consistent structure, so that I can build a single client-side interceptor for response handling.

#### Acceptance Criteria

1. THE Response_Wrapper SHALL wrap every JSON response in an envelope containing `success`, `data`, `error`, and `meta` fields
2. WHEN the HTTP status code is between 200 and 399, THE Response_Wrapper SHALL set the `success` field to `true` and populate the `data` field with the response body, or set `data` to `null` if the response body is empty
3. WHEN the HTTP status code is 400 or above, THE Response_Wrapper SHALL set the `success` field to `false`, set the `data` field to `null`, and populate the `error` field with `code`, `message`, and `traceId`
4. THE Response_Wrapper SHALL include a `meta` object containing `requestId` (UUID), `timestamp` (ISO 8601 format), and `version` (API version string) in every response
5. WHEN the response body contains a `pagination` property, THE Response_Wrapper SHALL move it into the `meta` object as a `pagination` sub-object containing `page`, `pageSize`, `total`, `totalPages`, `hasNext`, and `hasPrev`
6. THE Response_Wrapper SHALL set the `X-Request-Id` response header to the correlation ID of the current request
7. THE Response_Wrapper SHALL set the `X-Response-Time` response header to the elapsed time in milliseconds between request receipt and response serialization
8. IF the response body is already wrapped in the envelope structure (contains both `success` and `meta` fields), THEN THE Response_Wrapper SHALL pass it through without double-wrapping

### Requirement 2: Duplicate Route Resolution

**User Story:** As a system maintainer, I want each API resource to have a single authoritative route registration, so that request handling is predictable and conflict-free.

#### Acceptance Criteria

1. THE Route_Registry SHALL register each combination of HTTP method and URL path at most once across the entire application
2. WHEN both a CRUD generator route and a custom route exist for the same resource path prefix, THE Route_Registry SHALL exclude that resource from the CRUD generator and use only the custom route for all operations on that path prefix
3. WHEN the application starts, THE Route_Registry SHALL log a warning for each detected duplicate path registration, including the HTTP method, the conflicting path, and the source of each registration (CRUD generator or custom route file name)
4. IF a request targets an HTTP method and path that was excluded from the CRUD generator and the custom route does not implement that method, THEN THE Route_Registry SHALL return a 405 Method Not Allowed status

### Requirement 3: Secure Error Messages

**User Story:** As a security engineer, I want error messages to not reveal internal system details, so that attackers cannot infer the system architecture.

#### Acceptance Criteria

1. WHILE the application is running in production mode, THE Error_Handler SHALL replace internal identifiers including table names, column names, file paths, SQL fragments, and internal service names with a generic error message that discloses only the error category and the traceId
2. WHILE the application is running in production mode, THE Error_Handler SHALL omit stack traces from error responses
3. WHEN a permission check fails, THE Error_Handler SHALL return a 403 status with a generic "Forbidden" message without specifying which permission or module was required
4. WHEN a resource is not found, THE Error_Handler SHALL return a 404 status with a generic "Resource not found" message without revealing the table name or internal identifier
5. WHEN a database constraint violation occurs in production mode, THE Error_Handler SHALL return a 409 status with a generic conflict message without exposing the constraint name, table name, or column name from the underlying database error
6. WHILE the application is running in development mode, THE Error_Handler SHALL include full error details including table names, stack traces, SQL queries, and permission details for debugging
7. WHILE the application is running in production mode, IF an error message originating from a third-party library or database driver contains internal identifiers, THEN THE Error_Handler SHALL sanitize the message before including it in the response

### Requirement 4: API Versioning

**User Story:** As an API consumer, I want the API to support versioning, so that breaking changes do not affect existing integrations.

#### Acceptance Criteria

1. THE API_Gateway SHALL prefix all API routes with a version segment in the format `/api/v{n}/` where `{n}` is a positive integer representing the major version number
2. WHEN a request is made without a version prefix, THE API_Gateway SHALL route it to the current version (v1)
3. THE API_Gateway SHALL include the API version in the `X-API-Version` response header using the format `{major}.{minor}` (e.g., `1.0`)
4. IF a request targets a version segment that is not supported, THEN THE API_Gateway SHALL return a 404 status with an error message indicating the requested version is not available

### Requirement 5: Unified Pagination

**User Story:** As a frontend developer, I want all list endpoints to use the same pagination format, so that I can build reusable pagination components.

#### Acceptance Criteria

1. THE Pagination_Service SHALL accept `page` and `pageSize` query parameters on all list endpoints
2. THE Pagination_Service SHALL return pagination metadata containing `page`, `pageSize`, `total`, `totalPages`, `hasNext`, and `hasPrev`, where `totalPages` is computed as `ceil(total / pageSize)`, `hasNext` is `true` when `page < totalPages`, and `hasPrev` is `true` when `page > 1`
3. WHEN `page` or `pageSize` parameters are not provided, THE Pagination_Service SHALL use default values of page 1 and pageSize 20
4. WHEN `pageSize` exceeds the maximum allowed value of 100, THE Pagination_Service SHALL cap it at 100 without returning an error
5. THE Pagination_Service SHALL apply the same pagination structure across CRUD generator endpoints, custom endpoints, and notification endpoints
6. IF `page` or `pageSize` is less than 1, non-integer, or non-numeric, THEN THE Pagination_Service SHALL reject the request with a 400 status and an error message indicating the invalid parameter
7. WHEN `page` exceeds `totalPages` and `totalPages` is greater than 0, THE Pagination_Service SHALL return an empty data array with pagination metadata reflecting the requested page and `hasNext` set to `false`

### Requirement 6: Comprehensive Input Validation

**User Story:** As a security engineer, I want all API endpoints to validate their inputs, so that malformed or malicious data is rejected before reaching business logic.

#### Acceptance Criteria

1. THE Validation_Layer SHALL validate request body, query parameters, and path parameters against Zod schemas for every endpoint, rejecting requests with a 400 status if no schema is defined for the endpoint's input source
2. WHEN validation fails, THE Validation_Layer SHALL return a 400 status with an error response containing an array of field-level errors, where each entry includes the field path, the validation rule that failed, and a human-readable message
3. THE Validation_Layer SHALL validate query parameters on GET endpoints including `/api/dashboard-stats`, `/api/analytics/*`, and CRUD generator filter parameters, enforcing type coercion for numeric and date parameters
4. THE Validation_Layer SHALL validate file upload metadata on `/api/correspondence/attachments` including file size not exceeding 10 MB, filename length not exceeding 255 characters, and file MIME type matching an allowed list
5. WHEN an unknown field is present in the request body, THE Validation_Layer SHALL strip it before passing to the handler
6. WHEN a path parameter representing a resource ID does not match the expected format (integer or UUID), THE Validation_Layer SHALL return a 400 status with an error message indicating the invalid parameter
7. THE Validation_Layer SHALL reject any request body exceeding 1 MB in size with a 413 status, except for file upload endpoints which are governed by their own size limits

### Requirement 7: Mutex Optimization for PGlite

**User Story:** As a developer, I want the development database to handle concurrent requests efficiently, so that I can test realistic workloads locally.

#### Acceptance Criteria

1. WHILE using PGlite mode, THE API_Gateway SHALL acquire a shared read lock for SELECT query operations, allowing multiple read operations to execute concurrently
2. WHILE using PGlite mode, THE API_Gateway SHALL acquire an exclusive write lock for INSERT, UPDATE, and DELETE operations, blocking all other read and write operations until the write completes
3. WHILE using PGlite mode and a write operation holds the exclusive lock, THE API_Gateway SHALL queue incoming read and write requests until the write lock is released
4. WHEN switching between PGlite and PostgreSQL modes, THE API_Gateway SHALL maintain identical API response structure, status codes, and data semantics regardless of the database backend
5. IF a lock cannot be acquired within 5000 milliseconds, THEN THE API_Gateway SHALL reject the request with a 503 status indicating temporary unavailability

### Requirement 8: Unified Soft Delete

**User Story:** As a system administrator, I want deleted records to be recoverable, so that accidental deletions do not cause permanent data loss.

#### Acceptance Criteria

1. WHEN a delete operation is requested for an existing active record, THE Soft_Delete_Service SHALL set the `deleted_at` timestamp and `deleted_by` field instead of removing the record
2. THE Soft_Delete_Service SHALL exclude soft-deleted records from all standard query results returned by list and detail endpoints
3. WHEN a restore operation is requested for a soft-deleted record, THE Soft_Delete_Service SHALL clear the `deleted_at` and `deleted_by` fields returning the record to active status
4. WHEN a record with related child records is soft-deleted, THE Soft_Delete_Service SHALL cascade the soft delete to all dependent records within a single transaction
5. WHEN a permanent delete is requested, THE Soft_Delete_Service SHALL require administrator-level permissions before physically removing the record
6. IF a permanent delete is requested by a user without administrator-level permissions, THEN THE Soft_Delete_Service SHALL reject the request with a 403 status
7. THE Soft_Delete_Service SHALL record an audit log entry for every soft delete, restore, and permanent delete operation including the user ID, operation type, target table, and record ID
8. WHEN an administrator requests a list of soft-deleted records for a given resource, THE Soft_Delete_Service SHALL return paginated results containing only soft-deleted records
9. IF a soft-delete or restore operation targets a record that does not exist or is already in the requested state, THEN THE Soft_Delete_Service SHALL return a 404 status indicating the record was not found or is not eligible for the operation

### Requirement 9: N+1 Query Optimization in Cron Jobs

**User Story:** As a system operator, I want background jobs to execute efficiently, so that they do not degrade system performance under load.

#### Acceptance Criteria

1. WHEN the cron scheduler processes overdue recommendations, THE Cron_Scheduler SHALL retrieve all recommendations with status 'Open' or 'In Progress' and due_date before the current date, joined with their associated user information, in a single query rather than issuing separate queries per record
2. WHEN sending overdue notifications, THE Cron_Scheduler SHALL group overdue items by resolved user and send at most one notification per user containing the total count of that user's overdue items, skipping any records whose responsible field does not resolve to a valid user
3. WHEN updating overdue statuses, THE Cron_Scheduler SHALL execute a single bulk UPDATE statement setting status to 'Overdue' for all matching records instead of individual updates per record
4. IF the database query or bulk update fails during cron execution, THEN THE Cron_Scheduler SHALL log the error with sufficient context and abort the current run without sending partial notifications

### Requirement 10: Complete Request ID Tracing

**User Story:** As a system operator, I want every request to carry a consistent trace ID from entry to response, so that I can correlate logs across the entire request lifecycle.

#### Acceptance Criteria

1. WHEN an incoming request does not include an `X-Correlation-Id` header, THE API_Gateway SHALL generate a UUID v4 request ID and assign it to the request context
2. WHEN an incoming request includes an `X-Correlation-Id` header with a valid UUID format (36 characters, pattern `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`), THE API_Gateway SHALL use the provided value as the request ID
3. IF an incoming request includes an `X-Correlation-Id` header with an invalid format, THEN THE API_Gateway SHALL ignore the provided value and generate a new UUID v4 request ID
4. THE API_Gateway SHALL include the request ID in both successful and error responses via the `X-Request-Id` response header
5. THE Request_Logger SHALL include the request ID field in every log entry written during the processing of that request
6. THE API_Gateway SHALL include the request ID as the `traceId` field within the error object of error responses and as the `requestId` field within the `meta` object of all responses

### Requirement 11: Request/Response Logging

**User Story:** As a system operator, I want structured logs for every API request, so that I can monitor system health and debug issues.

#### Acceptance Criteria

1. THE Request_Logger SHALL record the HTTP method, path, status code, response duration in milliseconds, user ID (or null for unauthenticated requests), IP address, and user agent for every non-excluded request
2. WHEN a request's response duration exceeds the configured slow threshold (default: 3000 milliseconds), THE Request_Logger SHALL emit a warning-level log entry containing the request method, path, and actual duration
3. THE Request_Logger SHALL exclude requests matching the health check path (`/api/health`) and static asset paths (`/uploads/*`) from logging
4. THE Request_Logger SHALL persist log entries to the request_logs database table
5. IF persisting a log entry to the database fails, THEN THE Request_Logger SHALL write the log entry to the application error output and continue processing the request without affecting the response to the client
6. THE Request_Logger SHALL include the request ID from the correlation ID middleware in every log entry

### Requirement 12: Secure File Access

**User Story:** As a security engineer, I want uploaded files to require authentication before access, so that sensitive audit documents are protected from unauthorized viewing.

#### Acceptance Criteria

1. THE File_Access_Controller SHALL require a valid authentication token before serving any uploaded file, unless the request includes a valid Signed_URL
2. WHEN an unauthenticated request without a valid Signed_URL attempts to access an uploaded file, THE File_Access_Controller SHALL return a 401 status
3. WHEN an authenticated user without the required module permission attempts to access a file, THE File_Access_Controller SHALL return a 403 status
4. THE File_Access_Controller SHALL log every file access attempt, including denied attempts (401 and 403), recording user ID (or "anonymous" for unauthenticated requests), file path, access type (view or download), result (granted or denied), and IP address to the file access audit table
5. WHEN an authenticated user with the required module permission requests a temporary share link for a file, THE File_Access_Controller SHALL generate a Signed_URL with a time-to-live between 5 minutes and 7 days, defaulting to 60 minutes if not specified
6. WHEN a Signed_URL has expired, THE File_Access_Controller SHALL reject the request with a 401 status indicating expiration
7. THE File_Access_Controller SHALL use timing-safe comparison when verifying Signed_URL signatures to prevent timing attacks

### Requirement 13: Idempotency Support

**User Story:** As a frontend developer, I want to safely retry failed requests without creating duplicate records, so that network issues do not corrupt data.

#### Acceptance Criteria

1. WHEN a POST or PUT request includes an `X-Idempotency-Key` header with a value between 1 and 256 characters, THE Idempotency_Service SHALL check for a previously stored response matching that key and the authenticated user
2. WHEN a matching idempotency key is found and has not expired, THE Idempotency_Service SHALL return the stored response body and the original HTTP status code without re-executing the operation
3. WHEN a matching idempotency key is not found, THE Idempotency_Service SHALL execute the operation, then store the response body and HTTP status code with the key
4. THE Idempotency_Service SHALL expire stored idempotency records after a configurable TTL defaulting to 24 hours
5. THE Idempotency_Service SHALL scope idempotency keys per authenticated user to prevent cross-user key collisions
6. IF a request arrives with an idempotency key that is currently being processed by another in-flight request, THEN THE Idempotency_Service SHALL return a 409 Conflict status indicating the request is already in progress
7. IF a POST or PUT request includes an `X-Idempotency-Key` header with an empty value or a value exceeding 256 characters, THEN THE Idempotency_Service SHALL reject the request with a 400 status and an error message indicating an invalid idempotency key format

### Requirement 14: Per-User Rate Limiting

**User Story:** As a system administrator, I want rate limiting based on user identity, so that one user behind a shared NAT cannot exhaust the rate limit for all users.

#### Acceptance Criteria

1. WHEN a user is authenticated, THE Rate_Limiter SHALL apply a rate limit of 100 requests per 60-second sliding window based on the user ID rather than the IP address
2. WHEN a user is not authenticated, THE Rate_Limiter SHALL fall back to IP-based rate limiting with a limit of 50 requests per 60-second sliding window
3. WHEN a user exceeds their rate limit, THE Rate_Limiter SHALL return a 429 status with a `Retry-After` header containing the number of seconds until the rate limit window resets
4. THE Rate_Limiter SHALL ensure that one user reaching their limit does not affect the available quota of other users on the same IP
5. THE Rate_Limiter SHALL include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers in every response to indicate the current window's total allowance, remaining requests, and reset time in UTC epoch seconds

### Requirement 15: Comprehensive Health Check

**User Story:** As a system operator, I want a health check endpoint that reports the status of all subsystems, so that I can detect degraded states before they become outages.

#### Acceptance Criteria

1. THE Health_Check_Service SHALL check database connectivity by executing a simple query, filesystem availability by verifying the uploads directory is writable and has at least 100 MB free space, memory usage against a threshold of 90% of available heap, WebSocket server status by confirming the server is accepting connections, and cron job status by verifying the last scheduled execution completed within the expected interval
2. WHEN all subsystem checks pass, THE Health_Check_Service SHALL return an overall status of "healthy" with individual status and latency in milliseconds for each subsystem
3. WHEN the database check fails or times out, THE Health_Check_Service SHALL return an overall status of "unhealthy"
4. WHEN any non-database subsystem check fails or times out, THE Health_Check_Service SHALL return an overall status of "degraded" and identify the failing subsystems in the response
5. THE Health_Check_Service SHALL execute each subsystem check with an independent timeout of 2 seconds, treating a timeout as a check failure so that one slow check does not block others
6. THE Health_Check_Service SHALL include latency measurements in milliseconds for each subsystem in the response, reporting the elapsed time even for checks that timed out or failed
7. THE Health_Check_Service SHALL respond within 3 seconds regardless of individual check outcomes and SHALL return the response with HTTP status 200 for "healthy", 200 for "degraded", and 503 for "unhealthy"

### Requirement 16: Bulk Operations

**User Story:** As a frontend developer, I want to perform batch operations in a single request, so that bulk actions like closing multiple recommendations are efficient.

#### Acceptance Criteria

1. WHEN a bulk operation request is received, THE Bulk_Operations_Service SHALL validate all items in the batch before beginning processing, and SHALL process all valid items within a single database transaction
2. IF any item in the batch fails validation, THEN THE Bulk_Operations_Service SHALL reject the entire batch without processing any items and SHALL return per-item validation error details indicating which items failed and why
3. IF the batch contains fewer than 1 item or more than 100 items, THEN THE Bulk_Operations_Service SHALL reject the request with a 400 status and an error message indicating the allowed range of 1 to 100 items
4. IF any item fails during transaction processing after validation has passed, THEN THE Bulk_Operations_Service SHALL roll back the entire transaction and return an error indicating the processing failure
5. WHEN a bulk operation completes successfully, THE Bulk_Operations_Service SHALL return a response containing the total processed count, success count, and per-item status including the item identifier and a success indicator for each item
6. THE Bulk_Operations_Service SHALL record a single audit log entry for the bulk operation including the operation type, the target resource, and the count of affected records

### Requirement 17: Graceful Degradation for External Services

**User Story:** As a system operator, I want the system to handle external service failures gracefully, so that a webhook outage does not block core functionality.

#### Acceptance Criteria

1. WHEN an external service call (n8n webhook) fails with an HTTP 5xx response, a connection timeout exceeding 5 seconds, or a network error, THE API_Gateway SHALL retry the call with exponential backoff starting at 1 second (doubling per attempt) up to a maximum of 3 attempts
2. IF all retry attempts fail, THEN THE API_Gateway SHALL store the failed event in a dead letter queue including the event type, payload, timestamp, and failure reason, and SHALL complete the originating API request successfully without blocking the caller
3. WHEN the circuit breaker threshold is reached (5 consecutive failures within a 60-second window), THE API_Gateway SHALL stop calling the external service, skip the webhook invocation, and continue processing the core operation to completion
4. WHILE the circuit breaker is open, THE API_Gateway SHALL attempt a single health probe to the external service every 30 seconds, and SHALL close the circuit breaker after 1 successful probe response received within 5 seconds
5. IF the circuit breaker is open and a new event occurs that would normally trigger the external service, THEN THE API_Gateway SHALL store the event in the dead letter queue and return a successful response for the core operation
