# Implementation Plan: API Audit & Improvements

## Overview

This plan implements comprehensive API audit improvements for the AL-SAQI system (Express.js 5 + TypeScript Modular Monolith). The implementation follows a phased approach: foundational middleware first, then core services, then advanced features, with integration wiring at the end. Each task builds incrementally on previous work to ensure no orphaned code.

## Tasks

- [x] 1. Set up foundational infrastructure and shared types
  - [x] 1.1 Create shared API response types and interfaces
    - Create `server/types/api.ts` with `ApiResponse<T>`, `PaginationMeta`, `ErrorResponse`, and `HealthStatus` interfaces
    - Create `server/types/middleware.ts` with middleware option interfaces
    - _Requirements: 1.1, 1.4_

  - [x] 1.2 Create database migration for new tables
    - Add `idempotency_keys` table with columns: id, idempotency_key, user_id, method, path, response_status, response_body, created_at, expires_at
    - Add `request_logs` table with columns: id, request_id, user_id, method, path, status_code, duration_ms, ip_address, user_agent, error_message, created_at
    - Add `file_access_logs` table with columns: id, user_id, file_path, access_type, result, ip_address, created_at
    - Add `dead_letter_queue` table with columns: id, event_type, payload, failure_reason, created_at, retry_count
    - Ensure `deleted_at` and `deleted_by` columns exist on all entity tables that need soft delete
    - _Requirements: 8.1, 11.4, 12.4, 13.3, 17.2_

  - [x] 1.3 Set up testing utilities for new middleware
    - Create `server/__tests__/helpers/apiTestUtils.ts` with mock request/response factories
    - Add helper functions for creating authenticated mock requests with correlation IDs
    - _Requirements: All (testing infrastructure)_

- [x] 2. Implement Request ID Tracing and Response Envelope
  - [x] 2.1 Implement unified correlation ID middleware
    - Modify `server/middleware/correlationId.ts` to generate UUID v4 when `X-Correlation-Id` header is missing
    - Accept and validate existing `X-Correlation-Id` header (UUID format: 36 chars, pattern `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
    - Ignore invalid format headers and generate new UUID
    - Attach request ID to `req` context for downstream use
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 2.2 Implement unified response wrapper middleware
    - Create `server/middleware/responseWrapper.ts` that overrides `res.json()`
    - Wrap all responses in `{ success, data, error, meta }` envelope
    - Set `success: true` for status 200-399, `success: false` for 400+
    - Include `meta.requestId`, `meta.timestamp` (ISO 8601), `meta.version`
    - Move `pagination` from body into `meta.pagination` when present
    - Set `X-Request-Id` and `X-Response-Time` response headers
    - Detect already-wrapped responses (has both `success` and `meta`) and pass through
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 2.3 Write property test for response envelope structure (Property 1)
    - **Property 1: Response Envelope Structure Consistency**
    - Test that for any HTTP status code, `success` is `true` iff status in [200, 399]
    - Test that `meta` always contains valid UUID `requestId` and ISO 8601 `timestamp`
    - Test that error responses populate `error` with `code`, `message`, `traceId`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.6**

- [x] 3. Implement Secure Error Handling
  - [x] 3.1 Refactor error handler for production sanitization
    - Modify `server/middleware/error.ts` to detect production mode via `NODE_ENV`
    - In production: replace table names, column names, file paths, SQL fragments with generic messages
    - In production: omit stack traces from responses
    - Return 403 with generic "Forbidden" (no permission/module details)
    - Return 404 with generic "Resource not found" (no table name)
    - Return 409 with generic conflict message (no constraint/column details)
    - In development: include full error details for debugging
    - Sanitize third-party library error messages in production
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 3.2 Write property test for error message sanitization (Property 3)
    - **Property 3: Error Message Sanitization in Production**
    - Generate random error messages containing table names, column names, stack traces
    - Verify production responses never contain these internal identifiers
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 4. Implement API Versioning and Route Resolution
  - [x] 4.1 Implement API versioning with route prefix
    - Modify `server/routes/index.ts` to prefix all API routes with `/api/v1/`
    - Add fallback: requests to `/api/` without version prefix route to current version (v1)
    - Set `X-API-Version` response header with format `{major}.{minor}` (e.g., `1.0`)
    - Return 404 for unsupported version segments
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 4.2 Resolve duplicate route registrations
    - Audit `server/routes/index.ts` and `server/utils/crudGenerator.ts` for conflicts
    - Exclude `audit-tasks`, `audit-programs`, and `recommendations` from CRUD generator
    - Add startup-time duplicate detection that logs warnings with method, path, and source
    - Return 405 Method Not Allowed for methods not implemented on custom routes
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 4.3 Write property test for route uniqueness (Property 18)
    - **Property 18: Route Uniqueness**
    - Verify that for any registered route, exactly one handler exists per HTTP method + path
    - **Validates: Requirements 2.1, 2.2**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Unified Pagination
  - [x] 6.1 Implement unified pagination service
    - Create `server/utils/paginationService.ts` with consistent pagination logic
    - Accept `page` and `pageSize` query parameters on all list endpoints
    - Compute `totalPages` as `ceil(total / pageSize)`, `hasNext` as `page < totalPages`, `hasPrev` as `page > 1`
    - Default to page 1, pageSize 20 when not provided
    - Cap `pageSize` at 100 without error
    - Reject invalid `page`/`pageSize` (< 1, non-integer, non-numeric) with 400
    - Return empty data array when `page > totalPages` (with `hasNext: false`)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 6.2 Integrate pagination service into existing endpoints
    - Update `BaseService.findAll` to use the unified pagination service
    - Update `notifications.ts`, `correspondence.ts`, `dashboard.ts` to use unified pagination
    - Ensure CRUD generator endpoints use the same pagination structure
    - _Requirements: 5.5_

  - [x] 6.3 Write property test for pagination metadata correctness (Property 2)
    - **Property 2: Pagination Metadata Correctness**
    - For any combination of `page`, `pageSize`, and `total`, verify computed metadata
    - Verify `pageSize` is capped at 100 for inputs exceeding 100
    - **Validates: Requirements 5.2, 5.4**

- [x] 7. Implement Comprehensive Input Validation
  - [x] 7.1 Create Zod schemas for unvalidated endpoints
    - Create schemas for `POST /api/correspondence/attachments` (file size ≤ 10MB, filename ≤ 255 chars, MIME type allowlist)
    - Create schemas for `GET /api/dashboard-stats` query params with type coercion
    - Create schemas for `GET /api/analytics/*` query params
    - Create schemas for CRUD generator filter parameters
    - _Requirements: 6.1, 6.3, 6.4_

  - [x] 7.2 Implement validation middleware enhancements
    - Modify `server/middleware/validate.ts` to validate body, query, and path params
    - Return 400 with field-level errors array (field path, rule, message)
    - Strip unknown fields from request body before passing to handler
    - Validate path parameter format (integer or UUID) with 400 on mismatch
    - Reject request bodies exceeding 1 MB with 413 (except file upload endpoints)
    - _Requirements: 6.1, 6.2, 6.5, 6.6, 6.7_

  - [x] 7.3 Write property test for unknown field stripping (Property 13)
    - **Property 13: Validation Layer Unknown Field Stripping**
    - Generate request bodies with extra fields not in schema
    - Verify handler only receives schema-defined fields
    - **Validates: Requirements 6.2, 6.5**

- [x] 8. Implement Mutex Optimization for PGlite
  - [x] 8.1 Implement read-write lock for PGlite mode
    - Modify `server/db/index.ts` DBWrapper to use a read-write lock instead of single mutex
    - Allow concurrent read operations (shared lock for SELECT)
    - Exclusive write lock for INSERT, UPDATE, DELETE (blocks all other operations)
    - Queue incoming requests when write lock is held
    - Add 5000ms lock acquisition timeout returning 503
    - Ensure identical API behavior between PGlite and PostgreSQL modes
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 9. Implement Unified Soft Delete
  - [x] 9.1 Implement SoftDeleteService
    - Create `server/services/SoftDeleteService.ts` with `softDelete`, `restore`, `permanentDelete`, `getDeleted` methods
    - Set `deleted_at` and `deleted_by` on soft delete
    - Exclude soft-deleted records from standard queries (modify `BaseService.findAll` and `findById`)
    - Clear `deleted_at`/`deleted_by` on restore
    - Cascade soft delete to dependent records within a single transaction
    - Require admin permissions for permanent delete (403 otherwise)
    - Record audit log for every soft delete, restore, and permanent delete
    - Support paginated listing of soft-deleted records
    - Return 404 for non-existent or already-in-requested-state records
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_

  - [x] 9.2 Write property test for soft delete round-trip (Property 4)
    - **Property 4: Soft Delete Round-Trip**
    - Verify soft delete followed by restore returns record to original state
    - Verify soft-deleted records don't appear in standard queries
    - **Validates: Requirements 8.1, 8.2, 8.3**

  - [x] 9.3 Write property test for soft delete cascade integrity (Property 5)
    - **Property 5: Soft Delete Cascade Integrity**
    - For parent with N children, verify soft-deleting parent also soft-deletes all N children
    - Verify total soft-deleted count equals N + 1
    - **Validates: Requirements 8.4, 8.6**

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement N+1 Query Optimization in Cron Jobs
  - [x] 11.1 Refactor cron job for batch query and notification
    - Modify `server/cron/index.ts` to use single JOIN query for overdue recommendations with user info
    - Execute single bulk UPDATE for status changes
    - Group notifications by user (one notification per user with count)
    - Skip records where `responsible` doesn't resolve to a valid user
    - Log errors with context and abort on failure without partial notifications
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 11.2 Write property test for cron notification batching (Property 16)
    - **Property 16: Cron Notification Batching**
    - For N distinct users with overdue items, verify exactly N notifications produced
    - Verify each notification contains correct count per user
    - **Validates: Requirements 9.2**

- [x] 12. Implement Request/Response Logging
  - [x] 12.1 Implement request logger middleware
    - Create `server/middleware/requestLogger.ts`
    - Record method, path, status code, duration (ms), user ID, IP, user agent for every non-excluded request
    - Emit warning-level log for requests exceeding slow threshold (default: 3000ms)
    - Exclude `/api/health` and `/uploads/*` paths from logging
    - Persist log entries to `request_logs` table
    - On DB persist failure: write to stderr and continue without affecting response
    - Include correlation request ID in every log entry
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 12.2 Write property test for request logger completeness (Property 14)
    - **Property 14: Request Logger Completeness**
    - For any request to non-excluded path, verify log entry contains all required fields
    - Verify request ID in log matches `X-Request-Id` response header
    - **Validates: Requirements 11.1, 10.4**

- [x] 13. Implement Secure File Access
  - [x] 13.1 Implement secure file access controller
    - Create `server/middleware/secureFile.ts` replacing `express.static` for `/uploads`
    - Require valid authentication token (401 if missing/invalid)
    - Check module-level permission (403 if unauthorized)
    - Log every access attempt (granted/denied) to `file_access_logs` table
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 13.2 Implement signed URL generation and verification
    - Create `server/services/SecureFileService.ts` with `generateSignedUrl` and `verifySignedUrl`
    - Support TTL between 5 minutes and 7 days, default 60 minutes
    - Use HMAC-SHA256 signature bound to filePath + userId + expiry
    - Use `crypto.timingSafeEqual` for signature verification
    - Reject expired URLs with 401 indicating expiration
    - Allow unauthenticated access with valid signed URL
    - _Requirements: 12.1, 12.5, 12.6, 12.7_

  - [x] 13.3 Write property test for file access authorization (Property 8)
    - **Property 8: File Access Authorization Enforcement**
    - Verify unauthenticated requests get 401, unauthorized get 403
    - **Validates: Requirements 12.1, 12.2, 12.3**

  - [x] 13.4 Write property test for signed URL validity (Property 9)
    - **Property 9: Signed URL Validity and Expiration**
    - Verify URLs verify before TTL and reject after TTL
    - Verify any modification to path/userId/expiry causes verification failure
    - **Validates: Requirements 12.5, 12.6, 12.7**

- [x] 14. Implement Idempotency Support
  - [x] 14.1 Implement idempotency middleware and service
    - Create `server/middleware/idempotency.ts` for POST/PUT requests
    - Check `X-Idempotency-Key` header (1-256 characters)
    - Return stored response for matching key + user (without re-executing)
    - Store response on first execution with configurable TTL (default: 24 hours)
    - Scope keys per authenticated user
    - Return 409 Conflict for in-flight duplicate keys
    - Return 400 for empty or >256 character keys
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [x] 14.2 Write property test for idempotency guarantee (Property 6)
    - **Property 6: Idempotency Guarantee**
    - Verify same key + user returns identical stored response without re-execution
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.5**

  - [x] 14.3 Write property test for idempotency key expiration (Property 7)
    - **Property 7: Idempotency Key Expiration**
    - Verify expired records are not returned and new execution occurs
    - **Validates: Requirements 13.4**

- [x] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement Per-User Rate Limiting
  - [x] 16.1 Implement per-user rate limiting middleware
    - Modify rate limiting in `server/middleware/` or create `server/middleware/rateLimiter.ts`
    - Authenticated users: 100 requests per 60-second sliding window keyed by user ID
    - Unauthenticated users: 50 requests per 60-second sliding window keyed by IP
    - Return 429 with `Retry-After` header (seconds until reset)
    - Ensure per-user isolation (one user's limit doesn't affect others on same IP)
    - Include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers in every response
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 16.2 Write property test for per-user rate limiting fairness (Property 10)
    - **Property 10: Per-User Rate Limiting Fairness**
    - Verify two users on same IP have independent quotas
    - Verify one user exhausting limit doesn't reduce other user's quota
    - **Validates: Requirements 14.1, 14.4**

- [x] 17. Implement Comprehensive Health Check
  - [x] 17.1 Implement enhanced health check endpoint
    - Create or modify `server/routes/health.ts` with comprehensive checks
    - Check: database connectivity (simple query), filesystem (uploads dir writable + ≥100MB free), memory (< 90% heap), WebSocket server (accepting connections), cron status (last run within expected interval)
    - Each check has independent 2-second timeout
    - Return "healthy" (200) if all pass, "degraded" (200) if non-DB fails, "unhealthy" (503) if DB fails
    - Include latency (ms) for each subsystem in response
    - Respond within 3 seconds regardless of individual outcomes
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_

  - [x] 17.2 Write property test for health check status derivation (Property 15)
    - **Property 15: Health Check Status Derivation**
    - Verify status is "unhealthy" when DB fails, "degraded" when non-DB fails, "healthy" when all pass
    - **Validates: Requirements 15.2, 15.3, 15.4**

- [x] 18. Implement Bulk Operations
  - [x] 18.1 Implement bulk operations service and endpoint
    - Create `server/services/BulkOperationsService.ts`
    - Create `server/routes/bulk.ts` with `POST /api/v1/bulk/:resource`
    - Validate all items before processing; reject entire batch on validation failure with per-item errors
    - Enforce batch size 1-100 items (400 if outside range)
    - Process all valid items in single transaction; rollback on any processing failure
    - Return response with `processed`, `success` count, and per-item status
    - Record single audit log entry for bulk operation
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [x] 18.2 Write property test for bulk operation atomicity (Property 11)
    - **Property 11: Bulk Operation Atomicity**
    - Verify if any item fails, entire transaction rolls back (zero persisted)
    - Verify if all valid, all N items are persisted
    - **Validates: Requirements 16.1, 16.2**

  - [x] 18.3 Write property test for bulk operation response consistency (Property 12)
    - **Property 12: Bulk Operation Response Consistency**
    - Verify `processed` equals `success + failure` count
    - Verify `details` array length equals `processed` count
    - **Validates: Requirements 16.3, 16.4**

- [x] 19. Implement Graceful Degradation for External Services
  - [x] 19.1 Implement circuit breaker and retry logic for external services
    - Create `server/services/CircuitBreaker.ts` with retry + exponential backoff (1s start, 3 max attempts)
    - Implement circuit breaker: open after 5 consecutive failures in 60s window
    - While open: skip webhook calls, store events in dead letter queue, return success for core operation
    - Health probe every 30s while open; close after 1 successful probe within 5s
    - Store failed events in `dead_letter_queue` table with event_type, payload, timestamp, failure_reason
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [x] 19.2 Write property test for circuit breaker state transitions (Property 17)
    - **Property 17: Circuit Breaker State Transitions**
    - Verify circuit opens after 5 consecutive failures
    - Verify open circuit stores events in dead letter queue
    - **Validates: Requirements 17.2, 17.3**

- [x] 20. Integration and Wiring
  - [x] 20.1 Wire all middleware into the Express application
    - Update `server/routes/index.ts` (or main app setup) to register middleware in correct order:
      1. Rate limiter
      2. Correlation ID
      3. Response wrapper
      4. CSRF
      5. Auth
      6. Validation
      7. Idempotency
      8. Request logger
    - Replace `express.static('/uploads', ...)` with secure file access controller
    - Register versioned routes under `/api/v1/`
    - Register health check endpoint
    - Register bulk operations endpoint
    - Wire circuit breaker into n8n webhook calls
    - _Requirements: All_

  - [x] 20.2 Write integration tests for full request lifecycle
    - Test complete flow: auth → validation → handler → response envelope
    - Test error flow: invalid input → validation error → sanitized error response
    - Test idempotency: duplicate POST → same response returned
    - Test rate limiting: exceed limit → 429 response
    - _Requirements: All_

- [x] 21. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript throughout, matching the existing codebase
- All middleware follows Express.js 5 patterns with async handler support
- Database migrations should be added to the existing versioned migration system

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "4.2"] },
    { "id": 2, "tasks": ["2.2", "3.1", "4.1"] },
    { "id": 3, "tasks": ["2.3", "3.2", "4.3"] },
    { "id": 4, "tasks": ["6.1", "7.1", "8.1"] },
    { "id": 5, "tasks": ["6.2", "7.2", "6.3"] },
    { "id": 6, "tasks": ["7.3", "9.1", "11.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "11.2", "12.1"] },
    { "id": 8, "tasks": ["12.2", "13.1", "14.1"] },
    { "id": 9, "tasks": ["13.2", "13.3", "14.2", "14.3"] },
    { "id": 10, "tasks": ["13.4", "16.1", "17.1"] },
    { "id": 11, "tasks": ["16.2", "17.2", "18.1"] },
    { "id": 12, "tasks": ["18.2", "18.3", "19.1"] },
    { "id": 13, "tasks": ["19.2", "20.1"] },
    { "id": 14, "tasks": ["20.2"] }
  ]
}
```
