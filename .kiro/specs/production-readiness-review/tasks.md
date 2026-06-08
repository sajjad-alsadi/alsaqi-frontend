# Implementation Plan: Production Readiness Review

## Overview

Implement 11 production-readiness components for the AL-SAQI system: CI/CD deployment, structured logging, Prometheus metrics, WebSocket rate limiting, Docker secrets hardening, frontend .env hygiene, backup enhancement, frontend error tracking, Nginx finalization, load testing, and observability stack. Each task builds incrementally — infrastructure and core utilities first, then application-level features, then integration wiring.

## Tasks

- [x] 1. Set up structured logging with file transports and request metadata
  - [x] 1.1 Enhance Winston logger with daily-rotate-file transport and metadata format
    - Install `winston-daily-rotate-file` dependency
    - Modify `src/server/utils/logger.ts` to add `AsyncLocalStorage`-based `requestContext`, `addMetadata` format, and production file transports (combined daily-rotate + error file)
    - Include `pid`, `hostname`, `service`, `correlationId` in every log entry
    - _Requirements: 2.1, 2.2, 2.4, 9.1, 9.2, 9.3, 9.5_

  - [x] 1.2 Create HTTP request logging middleware
    - Create `src/server/middleware/requestLogger.ts`
    - Generate correlation ID from `x-correlation-id` header or UUID
    - Log method, path, statusCode, responseTimeMs on response finish
    - Wire middleware into Express app in `src/server/index.ts`
    - _Requirements: 2.5_

  - [x] 1.3 Write property test for log entry mandatory fields (Property 1)
    - **Property 1: Log entries contain mandatory fields**
    - For any log message, verify JSON output contains: `timestamp`, `level`, `service`, `message`, `pid`, `hostname`
    - **Validates: Requirements 2.4, 9.5**

  - [x] 1.4 Write property test for HTTP request log metadata (Property 2)
    - **Property 2: HTTP request logs contain request metadata**
    - For any HTTP request, verify log entry includes `method`, `path`, `statusCode`, `responseTimeMs` with correct types
    - **Validates: Requirements 2.5**

- [x] 2. Implement Docker secrets hardening and environment validation
  - [x] 2.1 Create environment variable validator
    - Create `src/server/utils/envValidator.ts`
    - Define REQUIRED_VARS with minimum length constraints (JWT_SECRET ≥ 64, MINIO_ROOT_PASSWORD ≥ 32, REDIS_PASSWORD ≥ 32)
    - Export `validateRequiredEnv()` that exits process on failure with descriptive error
    - Call validator at server startup before any service initialization in `src/server/index.ts`
    - _Requirements: 5.2, 5.3_

  - [x] 2.2 Write property test for missing env var detection (Property 3)
    - **Property 3: Missing environment variable prevents startup**
    - For any single required variable removed, validate that `validateRequiredEnv` throws/exits with the variable name in the error
    - **Validates: Requirements 5.3**

  - [x] 2.3 Harden Docker Compose environment definitions
    - Modify `deploy/docker-compose.yml` to remove all default password fallbacks (minioadmin, redispass)
    - Remove host port mappings for MinIO (9000, 9001) and Redis (6379) — use `expose` only
    - Require DATABASE_URL, JWT_SECRET, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, REDIS_PASSWORD without defaults
    - _Requirements: 5.1, 5.2, 5.4_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Prometheus metrics and alert rules
  - [x] 4.1 Create Prometheus metrics module and /metrics endpoint
    - Create `src/server/metrics/prometheus.ts` with `prom-client` Registry, Counter (`http_requests_total`), Histogram (`http_request_duration_seconds`), Gauge (`active_connections`), and `collectDefaultMetrics`
    - Create metrics middleware in `src/server/middleware/metricsMiddleware.ts` to instrument all HTTP requests
    - Register `GET /metrics` endpoint returning `metricsRegistry.metrics()` in Prometheus exposition format
    - _Requirements: 3.1_

  - [x] 4.2 Create Prometheus alert rules configuration
    - Create `deploy/prometheus/alerts.yml` with HighErrorRate (>5% over 5m), HighLatency (p95 >2000ms over 5m), and LowDiskSpace (<20%) rules
    - Create `deploy/prometheus/prometheus.yml` with scrape config targeting API at 15s intervals
    - _Requirements: 3.4, 3.5, 3.6_

  - [x] 4.3 Write property test for high error rate alert threshold (Property 13)
    - **Property 13: Alert rule fires on high error rate**
    - For any combination where error_requests/total_requests > 0.05 over 5m, verify alert expression evaluates to firing
    - **Validates: Requirements 3.4**

  - [x] 4.4 Write property test for high latency alert threshold (Property 14)
    - **Property 14: Alert rule fires on high latency**
    - For any response time distribution where p95 > 2000ms over 5m, verify alert expression evaluates to firing
    - **Validates: Requirements 3.5**

- [x] 5. Implement frontend .env hygiene and Vite build validation
  - [x] 5.1 Create .env.example and Vite env validator plugin
    - Create `apps/web/.env.example` with documented placeholders for VITE_API_URL, VITE_APP_VERSION, VITE_ERROR_REPORT_URL, VITE_WS_URL
    - Create `apps/web/vite-env-validator.ts` plugin that fails build if VITE_API_URL is missing
    - Register plugin in `apps/web/vite.config.ts`
    - Ensure `apps/web/.env` is in root `.gitignore`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 5.2 Write property test for missing frontend env var build failure (Property 4)
    - **Property 4: Frontend build fails on missing required env vars**
    - For any required variable (VITE_API_URL) that is undefined, verify the plugin throws an error naming the variable
    - **Validates: Requirements 6.4**

- [x] 6. Implement frontend error tracking system
  - [x] 6.1 Create ErrorReporter utility and global error handlers
    - Create `apps/web/src/utils/errorReporter.ts` with `ErrorReporter` class (fire-and-forget POST to `/api/system-errors`)
    - Create `apps/web/src/utils/globalErrorHandlers.ts` with `window.onerror` and `unhandledrejection` handlers
    - Include appVersion, sessionId, userAgent, routePath, timestamp, type in every payload
    - Register global handlers in `apps/web/src/main.tsx`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 6.2 Create backend /api/system-errors endpoint
    - Create `src/server/routes/systemErrors.ts` with POST handler
    - Compute error signature from message + first stack frame (SHA-256)
    - Implement upsert logic: increment count, update last_seen, mark is_recurring when count > 10 in 1h
    - Create database migration for `system_errors` table with indexes
    - Register route in Express app
    - _Requirements: 8.5, 8.6_

  - [x] 6.3 Write property test for error report payload metadata (Property 8)
    - **Property 8: Error report payload contains required metadata**
    - For any error, verify POST payload includes non-empty appVersion, sessionId, userAgent, routePath, timestamp
    - **Validates: Requirements 8.4**

  - [x] 6.4 Write property test for error storage required fields (Property 9)
    - **Property 9: Error storage preserves required fields**
    - For any valid error report submitted, verify stored record contains signature, message, count ≥ 1, first_seen, last_seen
    - **Validates: Requirements 8.5**

  - [x] 6.5 Write property test for recurring incident detection (Property 10)
    - **Property 10: Recurring incident detection threshold**
    - For any error signature with N occurrences in 1h: if N > 10 → is_recurring=true; if N ≤ 10 → is_recurring=false
    - **Validates: Requirements 8.6**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Enhance automated database backup with MinIO upload and retry
  - [x] 8.1 Add MinIO upload and retry logic to BackupScheduler
    - Modify `src/server/utils/backup.ts` to add `uploadToMinIO()` using `@aws-sdk/client-s3`
    - Implement `runWithRetry()` that retries once after 5-minute delay on failure
    - Log backup filename, size_bytes, and duration_ms on success
    - Upload encrypted backup to MinIO `backups` bucket after local storage
    - _Requirements: 7.4, 7.5, 7.6_

  - [x] 8.2 Write property test for backup encryption round-trip (Property 5)
    - **Property 5: Backup encryption round-trip preserves data**
    - For any byte sequence, encrypt with AES-256-GCM then decrypt with same key → original data
    - **Validates: Requirements 7.2**

  - [x] 8.3 Write property test for backup retention cleanup (Property 6)
    - **Property 6: Backup retention deletes only expired records**
    - For any set of records and retention period N, verify only records older than N days are deleted
    - **Validates: Requirements 7.3**

  - [x] 8.4 Write property test for successful backup log metadata (Property 7)
    - **Property 7: Successful backup log contains required metadata**
    - For any successful backup, verify log contains non-empty filename, non-negative size_bytes, non-negative duration_ms
    - **Validates: Requirements 7.6**

- [x] 9. Finalize Nginx configuration with envsubst, HSTS, and CSP
  - [x] 9.1 Create Nginx template, entrypoint, and Dockerfile
    - Create `deploy/nginx/nginx.conf.template` with parameterized `${SERVER_NAME}`, HSTS header (max-age=31536000; includeSubDomains), CSP header, structured access_log format, WebSocket rate-limiting zones
    - Create `deploy/nginx/docker-entrypoint.sh` with envsubst substitution + `nginx -t` validation
    - Create/update `deploy/nginx/Dockerfile` to use entrypoint script
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 9.2 Add WebSocket rate-limiting configuration to Nginx template
    - Add `limit_req_zone` (ws_upgrade_limit: 5r/s) and `limit_conn_zone` (ws_conn_limit: 10m) directives
    - Configure `/ws` location with `limit_req burst=10 nodelay`, `limit_conn ws_conn_limit 10`, proxy headers
    - Return 429 on rate limit exceeded, 503 on connection limit exceeded
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 9.3 Write property test for WebSocket rate limiting (Property 11)
    - **Property 11: WebSocket rate limiting rejects excess connections**
    - For any IP attempting >15 upgrades in 1s (rate=5/s + burst=10), verify excess rejected with 429
    - **Validates: Requirements 4.1, 4.2**

  - [x] 9.4 Write property test for WebSocket concurrent connection limit (Property 12)
    - **Property 12: WebSocket concurrent connection limit**
    - For any IP with 10 active WS connections, verify additional attempts rejected with 503
    - **Validates: Requirements 4.3, 4.4**

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Set up observability stack in Docker Compose
  - [x] 11.1 Add Prometheus, Grafana, Loki, Promtail, and Alertmanager to Docker Compose
    - Add prometheus (v2.51.0), grafana (10.4.0), loki (2.9.6), promtail (2.9.6), alertmanager (v0.27.0) services to `deploy/docker-compose.yml`
    - Create volumes: prometheus-data, grafana-data, loki-data, app-logs
    - Mount API container logs volume at `/app/logs`
    - Configure all services on `alsaqi-network`, expose ports internally only
    - _Requirements: 2.3, 3.2, 3.3, 9.4_

  - [x] 11.2 Create observability configuration files
    - Create `deploy/promtail/config.yml` to scrape `/var/log/alsaqi` and Docker socket
    - Create `deploy/alertmanager/alertmanager.yml` with notification routing
    - Create `deploy/grafana/provisioning/datasources/datasources.yml` for Prometheus and Loki sources
    - _Requirements: 2.3, 3.2, 3.3_

- [x] 12. Implement CI/CD deployment pipeline
  - [x] 12.1 Replace placeholder deploy job in GitLab CI
    - Modify `.gitlab-ci.yml` deploy stage: Docker build + push to registry with $CI_COMMIT_SHA tag, SSH deploy with `docker compose pull && up -d`, health check polling `/api/health` for 60s
    - Add `when: manual` trigger on main branch only
    - Reference CI/CD protected variables (DEPLOY_SSH_PRIVATE_KEY, DEPLOY_HOST, etc.)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 13. Create load testing scripts
  - [x] 13.1 Create k6 load test and WebSocket stress test scripts
    - Create `tests/load/api-load-test.js` with 50 VU / 5min scenario and smoke scenario (10 VU / 30s)
    - Define thresholds: p95 < 500ms, error rate < 1%, throughput > 100 rps
    - Create `tests/load/ws-stress-test.js` with 100 concurrent WebSocket connections for 1min
    - _Requirements: 10.1, 10.2, 10.5_

  - [x] 13.2 Add smoke load test stage to GitLab CI pipeline
    - Add `smoke-load-test` stage to `.gitlab-ci.yml` that runs k6 smoke scenario after deploy
    - Fail pipeline if thresholds breached
    - _Requirements: 10.4_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major component group
- Property tests validate universal correctness properties defined in the design using `fast-check`
- Unit tests validate specific examples and edge cases
- The project uses TypeScript (Node.js backend + React frontend), Docker Compose for orchestration, and GitLab CI/CD
- Test files should be placed alongside source in `__tests__/` directories or co-located with their modules

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "5.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.3", "5.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "4.1", "6.1"] },
    { "id": 3, "tasks": ["4.2", "6.2", "8.1"] },
    { "id": 4, "tasks": ["4.3", "4.4", "6.3", "6.4", "6.5", "8.2", "8.3", "8.4"] },
    { "id": 5, "tasks": ["9.1", "11.1"] },
    { "id": 6, "tasks": ["9.2", "11.2", "12.1"] },
    { "id": 7, "tasks": ["9.3", "9.4", "13.1"] },
    { "id": 8, "tasks": ["13.2"] }
  ]
}
```
