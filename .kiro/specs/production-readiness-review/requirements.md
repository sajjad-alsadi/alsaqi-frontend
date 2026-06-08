# Requirements Document

## Introduction

Full-spectrum Production Readiness Review for the AL-SAQI internal audit management system. This review identifies and addresses gaps in deployment automation, observability, security hardening, error tracking, performance validation, and backup/recovery — providing a concrete implementation roadmap with severity-ranked requirements.

## Glossary

- **AL-SAQI System**: The internal audit management system comprising a React 19 frontend (apps/web/), Express.js 5 backend (src/server/), PostgreSQL database, and supporting services (MinIO, Redis, Nginx)
- **CI_Pipeline**: The GitLab CI/CD pipeline defined in `.gitlab-ci.yml` with validate, test, build, and deploy stages
- **Nginx_Proxy**: The Nginx reverse proxy container that terminates TLS and routes traffic to API and Web containers
- **API_Server**: The Express.js 5 backend service running in Docker, handling business logic, authentication, and WebSocket connections
- **Web_Frontend**: The React 19 + Vite frontend application served as static files from the web container
- **Logger**: The Winston-based logging utility in `src/server/utils/logger.ts` that outputs structured JSON to console
- **Error_Boundary**: The React class component in `apps/web/src/components/ErrorBoundary.tsx` that catches rendering errors
- **Docker_Compose**: The production orchestration file at `deploy/docker-compose.yml` defining all service containers
- **BullMQ_Queue**: The Redis-backed job queue used for background processing (file uploads, PDF generation)
- **Observability_Stack**: The combination of metrics collection, log aggregation, and alerting systems for monitoring production health
- **Backup_System**: The automated process for creating, encrypting, and retaining PostgreSQL database backups

## Requirements

### Requirement 1: CI/CD Deployment Automation

**Severity:** Critical

**User Story:** As a DevOps engineer, I want the GitLab CI deploy stage to perform actual deployment operations, so that production releases are automated, repeatable, and auditable.

#### Acceptance Criteria

1. WHEN the deploy job is triggered manually on the main branch, THE CI_Pipeline SHALL execute Docker image push to the configured container registry using the tagged image `alsaqi:$CI_COMMIT_SHA`
2. WHEN the Docker image is pushed successfully, THE CI_Pipeline SHALL connect to the production host via SSH and execute a `docker compose pull && docker compose up -d` sequence
3. IF the deployment fails at any step, THEN THE CI_Pipeline SHALL report the failure status, preserve the previous running containers, and exit with a non-zero status code
4. THE CI_Pipeline SHALL store the container registry URL, SSH host, and SSH credentials as GitLab CI/CD protected variables rather than hardcoded values
5. WHEN deployment completes, THE CI_Pipeline SHALL verify service health by polling the `/api/health` endpoint for a 200 response within 60 seconds

### Requirement 2: Observability — Log Aggregation

**Severity:** Critical

**User Story:** As an operations engineer, I want structured logs shipped to persistent storage and a centralized viewer, so that I can diagnose production issues without SSH access to containers.

#### Acceptance Criteria

1. THE Logger SHALL write structured JSON logs to a rotating file transport in addition to the console transport
2. WHEN running in production, THE Logger SHALL rotate log files daily and retain log files for 14 days before automatic deletion
3. THE Docker_Compose SHALL configure a logging driver that ships container stdout to a log aggregation service (Loki, ELK, or file-based collection)
4. THE Logger SHALL include the following fields in every log entry: timestamp, level, correlationId, service name, and message
5. WHEN a log entry relates to an HTTP request, THE Logger SHALL include the request method, path, response status code, and response time in milliseconds

### Requirement 3: Observability — Metrics and Alerting

**Severity:** High

**User Story:** As an operations engineer, I want real-time system metrics and threshold-based alerts, so that I can detect degradation before users are affected.

#### Acceptance Criteria

1. THE API_Server SHALL expose a `/metrics` endpoint that returns Prometheus-compatible metrics including request count, request duration histogram, active connections, and memory usage
2. THE Docker_Compose SHALL include a Prometheus container configured to scrape the API metrics endpoint at 15-second intervals
3. THE Docker_Compose SHALL include a Grafana container with pre-configured dashboards for API latency (p50, p95, p99), error rate, and resource utilization
4. WHEN the API error rate exceeds 5% of total requests over a 5-minute window, THE Observability_Stack SHALL trigger an alert notification
5. WHEN API response time at p95 exceeds 2000 milliseconds over a 5-minute window, THE Observability_Stack SHALL trigger an alert notification
6. WHEN available disk space on any volume drops below 20%, THE Observability_Stack SHALL trigger an alert notification

### Requirement 4: WebSocket Rate Limiting

**Severity:** High

**User Story:** As a security engineer, I want WebSocket connections rate-limited at the proxy level, so that a single client cannot exhaust server resources through connection flooding.

#### Acceptance Criteria

1. THE Nginx_Proxy SHALL limit WebSocket connection upgrades to 5 per second per IP address with a burst allowance of 10
2. WHEN a client exceeds the WebSocket connection rate limit, THE Nginx_Proxy SHALL reject the connection upgrade with HTTP status 429
3. THE Nginx_Proxy SHALL limit concurrent WebSocket connections to 10 per IP address
4. IF a client exceeds the concurrent WebSocket connection limit, THEN THE Nginx_Proxy SHALL reject additional connection attempts with HTTP status 503

### Requirement 5: Docker Secrets Hardening

**Severity:** Critical

**User Story:** As a security engineer, I want all service credentials replaced with strong, unique values and managed through Docker secrets or environment variable injection, so that default passwords cannot be exploited.

#### Acceptance Criteria

1. THE Docker_Compose SHALL remove all default password fallback values (minioadmin, redispass) from environment variable definitions
2. THE Docker_Compose SHALL require DATABASE_URL, JWT_SECRET, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, and REDIS_PASSWORD as mandatory environment variables with no defaults
3. IF any required environment variable is missing at container startup, THEN THE API_Server SHALL refuse to start and log an error identifying the missing variable
4. THE Docker_Compose SHALL restrict MinIO console port (9001) and Redis port (6379) to internal network access only by removing host port mappings
5. WHEN deploying to production, THE Docker_Compose SHALL reference a `.env` file that is excluded from version control and contains generated credentials of minimum 32 characters

### Requirement 6: Frontend .env File Hygiene

**Severity:** Medium

**User Story:** As a developer, I want the frontend `.env` file excluded from version control with a documented `.env.example` template, so that sensitive configuration is never accidentally committed.

#### Acceptance Criteria

1. THE AL-SAQI System SHALL include `apps/web/.env` in the root `.gitignore` file
2. THE AL-SAQI System SHALL provide an `apps/web/.env.example` file documenting all required frontend environment variables with placeholder values
3. WHEN a developer clones the repository, THE AL-SAQI System SHALL include setup documentation instructing the developer to copy `.env.example` to `.env`
4. THE Web_Frontend SHALL validate that required environment variables are defined at build time and fail the build with a descriptive error if any are missing

### Requirement 7: Automated Database Backup

**Severity:** Critical

**User Story:** As a system administrator, I want automated daily database backups with encryption and retention policies, so that data can be recovered after any failure scenario.

#### Acceptance Criteria

1. THE Backup_System SHALL execute a full PostgreSQL `pg_dump` backup daily at a configurable time (default 02:00 local time)
2. WHEN ENCRYPT_BACKUPS is set to true, THE Backup_System SHALL encrypt backup files using AES-256-GCM before writing to storage
3. THE Backup_System SHALL delete backup files older than the configured BACKUP_RETENTION_DAYS value (default 30 days)
4. THE Backup_System SHALL upload encrypted backups to MinIO object storage in the backups bucket in addition to local storage
5. IF a backup operation fails, THEN THE Backup_System SHALL log the failure with error details and retry once after a 5-minute delay
6. WHEN a backup completes successfully, THE Backup_System SHALL log the backup filename, size, and duration
7. THE Docker_Compose SHALL include a backup service container or cron job that triggers the backup process on schedule

### Requirement 8: Frontend Error Tracking

**Severity:** High

**User Story:** As a frontend developer, I want unhandled errors and rejected promises reported to a centralized error tracking system, so that production issues are detected and diagnosed without user reports.

#### Acceptance Criteria

1. THE Error_Boundary SHALL report caught errors to a backend error collection endpoint (`/api/system-errors`) including the component stack trace, error message, and browser metadata
2. THE Web_Frontend SHALL register a global `window.onerror` handler that captures uncaught exceptions and reports them to the error collection endpoint
3. THE Web_Frontend SHALL register a global `unhandledrejection` handler that captures unhandled promise rejections and reports them to the error collection endpoint
4. WHEN reporting an error, THE Web_Frontend SHALL include the application version, user session identifier (anonymized), browser user-agent, and current route path
5. THE API_Server SHALL store reported frontend errors with timestamp, frequency count, and stack trace in a queryable format
6. WHEN the same error signature occurs more than 10 times within a 1-hour window, THE API_Server SHALL mark the error as a recurring incident in the error log

### Requirement 9: Structured Logging Transport

**Severity:** High

**User Story:** As an operations engineer, I want backend logs written to persistent file storage with rotation, so that logs survive container restarts and can be collected by external systems.

#### Acceptance Criteria

1. WHEN running in production, THE Logger SHALL write logs to `/app/logs/combined.log` using a file transport in addition to console output
2. WHEN running in production, THE Logger SHALL write error-level logs to a separate `/app/logs/error.log` file
3. THE Logger SHALL rotate log files when they reach 20 MB in size and retain a maximum of 5 rotated files per log type
4. THE Docker_Compose SHALL mount a named volume at `/app/logs` on the API container to persist logs across container restarts
5. THE Logger SHALL include the process PID and hostname in each log entry for multi-instance deployments

### Requirement 10: Load Testing and Performance Benchmarks

**Severity:** Medium

**User Story:** As a performance engineer, I want documented load test scripts and baseline benchmarks, so that performance regressions are detected before deployment.

#### Acceptance Criteria

1. THE AL-SAQI System SHALL include load test scripts (using k6, Artillery, or equivalent) that simulate 50 concurrent users performing common workflows (login, list audits, create findings, upload files)
2. THE load test scripts SHALL define pass/fail thresholds: p95 response time below 500ms for API endpoints, error rate below 1%, and throughput above 100 requests per second
3. THE AL-SAQI System SHALL document baseline performance results in a `PERFORMANCE.md` file including test date, hardware specs, and measured latency percentiles
4. WHEN the CI_Pipeline test stage runs on the main branch, THE CI_Pipeline SHALL execute a smoke-level load test (10 concurrent users, 30-second duration) and fail if thresholds are breached
5. THE load test scripts SHALL include a WebSocket connection stress test simulating 100 concurrent WebSocket connections with message throughput validation

### Requirement 11: Nginx Configuration Finalization

**Severity:** High

**User Story:** As a DevOps engineer, I want the Nginx configuration promoted from an example file to a production-ready template with parameterized values, so that deployment does not rely on manual file renaming.

#### Acceptance Criteria

1. THE Docker_Compose SHALL reference a production Nginx configuration file (`nginx/nginx.conf`) instead of mounting the example file (`nginx.conf.example`) as the active configuration
2. THE Nginx_Proxy configuration SHALL parameterize `server_name` using an environment variable substitution or entrypoint template (envsubst)
3. THE Nginx_Proxy configuration SHALL include an `access_log` directive with a structured log format including request time, upstream response time, and status code
4. THE Nginx_Proxy configuration SHALL enable HSTS with a max-age of 31536000 seconds and include the `includeSubDomains` directive
5. THE Nginx_Proxy configuration SHALL include a Content-Security-Policy header appropriate for a single-page application (restricting script-src, style-src, and connect-src to known origins)
6. WHEN the Nginx container starts, THE Nginx_Proxy SHALL validate the configuration syntax and fail with an error message if the configuration is invalid
