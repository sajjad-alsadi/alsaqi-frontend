# Implementation Plan: Infrastructure Storage & Queue

## Overview

This plan implements three foundational infrastructure services for the ALSAQI audit system: MinIO object storage (StorageService), Redis + BullMQ background processing (QueueService, WorkerManager), and TLS certificate management (CertificateManager). Tasks are ordered to build foundational layers first (config, Docker, certificates), then core services (storage, queue), then workers and API integration, and finally wiring everything together.

## Tasks

- [x] 1. Set up infrastructure dependencies and configuration
  - [x] 1.1 Add runtime and dev dependencies to package.json
    - Install `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `bullmq`, `ioredis`
    - Install dev dependency `testcontainers`
    - _Requirements: Design Dependencies section_

  - [x] 1.2 Add MinIO and Redis services to Docker Compose
    - Add `minio` service with ports 9000/9001, environment, and volume
    - Add `redis` service with port 6379, password auth, and volume
    - _Requirements: Design Docker Compose section_

  - [x] 1.3 Create environment configuration module
    - Add new environment variables to `.env.example` (MINIO_*, REDIS_*, TLS_*, QUEUE_*)
    - Create `src/config/storage.config.ts` with typed MinIO configuration
    - Create `src/config/redis.config.ts` with typed Redis configuration
    - Create `src/config/tls.config.ts` with typed TLS path configuration
    - Create `src/config/queue.config.ts` with typed queue configuration (concurrency, attempts, intervals)
    - _Requirements: 8.5, 9.1, 9.2_

- [x] 2. Implement CertificateManager
  - [x] 2.1 Create CertificateManager class
    - Create `src/services/certificate-manager.ts`
    - Implement `getPostgresSSLConfig()`, `getMinioSSLConfig()`, `getRedisSSLConfig()`
    - Implement `reloadCertificates()` with file watchers (detect changes within 30 seconds)
    - Validate certificate chain (CA → cert) on load
    - Fall back to system CA store when custom certs are not configured
    - Retain previously valid certificate if reload validation fails
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.8_

  - [x] 2.2 Implement certificate expiry detection
    - Log warning when certificate expires within 30 days but more than 7 days
    - Log critical alert when certificate expires within 7 days or fewer
    - Daily expiry check schedule
    - _Requirements: 7.6, 7.7_

  - [x] 2.3 Write property test for certificate expiry detection
    - **Property 5: Certificate Expiry Detection**
    - **Validates: Requirements 7.4, 7.5**

- [x] 3. Implement StorageService (MinIO abstraction)
  - [x] 3.1 Create StorageService class with core operations
    - Create `src/services/storage.service.ts`
    - Implement `upload()` with streaming to MinIO (no full buffering)
    - Implement `download()` returning ReadableStream
    - Implement `delete()`, `exists()`, `listObjects()`
    - Implement `copy()` for temp → permanent promotion
    - Use CertificateManager for TLS config
    - _Requirements: 1.4, 2.2, 2.5, 10.2_

  - [x] 3.2 Implement presigned URL generation
    - Implement `getPresignedUrl()` with configurable expiry (default 3600s, clamped 60–86400s)
    - Generate URLs only for FileRecords with status `ready`
    - _Requirements: 3.1, 3.4, 3.5_

  - [x] 3.3 Implement storage key generation
    - Create `src/utils/storage-key.ts`
    - Generate keys matching pattern `{entityType}/{entityId}/{timestamp}-{uuid}.{ext}`
    - Extract and lowercase file extension
    - Handle missing extensions (no trailing dot)
    - Include UUID v4 for global uniqueness
    - Sanitize filenames (remove `/`, `\`, `..`, null bytes)
    - Ensure keys ≤ 1024 characters with valid S3 characters only
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 3.4 Write property test for storage key generation
    - **Property 3: Storage Key Generation Correctness**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [x] 3.5 Implement file validation
    - Create `src/utils/file-validation.ts`
    - Validate MIME type using content inspection (magika) against allowed list per bucket
    - Validate file size > 0 and ≤ per-bucket max (evidence: 50MB, reports: 100MB)
    - Validate filename ≤ 255 characters, no path traversal sequences
    - Reject files when content-detected MIME doesn't match declared extension
    - Reject files when magika fails to determine type
    - _Requirements: 1.1, 1.2, 1.3, 11.1, 11.2, 11.3, 11.6_

  - [x] 3.6 Write property test for file validation
    - **Property 2: File Validation Correctness**
    - **Validates: Requirements 1.1, 1.2, 11.1, 11.2**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement QueueService (BullMQ abstraction)
  - [x] 5.1 Create QueueService class
    - Create `src/services/queue.service.ts`
    - Implement `enqueue()` with typed job data (JobDataMap)
    - Implement `getJobStatus()` returning state, progress, timestamps
    - Implement `cancelJob()`
    - Implement `getQueueHealth()` with connection status and job counts
    - Use CertificateManager for Redis TLS config
    - Handle reconnection with exponential backoff
    - _Requirements: 2.1, 5.1, 5.2, 5.4, 5.5, 8.1_

  - [x] 5.2 Implement job status synchronization to PostgreSQL
    - Create `src/models/job-record.model.ts` with JobRecord interface and migration
    - Sync BullMQ state changes to JobRecord within 5 seconds
    - Map BullMQ states: waiting→queued, active→processing, completed→completed, failed→failed, delayed→queued
    - _Requirements: 2.7, 5.6_

  - [x] 5.3 Schedule repeatable cleanup-temp job
    - Configure cleanup-temp as a repeatable job (default: every 60 minutes)
    - Interval configurable between 5 minutes and 168 hours
    - _Requirements: 10.1_

- [x] 6. Implement WorkerManager and job processors
  - [x] 6.1 Create WorkerManager class
    - Create `src/services/worker-manager.ts`
    - Implement `registerProcessor()` for typed processor functions per JobType
    - Implement `start()` to launch workers with configurable concurrency (default: 3, min: 1, max: 50)
    - Implement `shutdown()` with configurable timeout (default: 30s), drain active jobs
    - Return remaining active jobs to queue if shutdown timeout elapses
    - Inject shared dependencies (storage, db, logger) via WorkerContext
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [x] 6.2 Implement process-file worker
    - Create `src/workers/process-file.worker.ts`
    - Verify temp file exists (fail without retry if missing)
    - Copy file from temp to permanent bucket
    - Verify SHA-256 checksum after copy (delete corrupted file on mismatch)
    - Delete temp file on success
    - Update FileRecord status: uploading → processing → ready (or failed)
    - Report progress at each step (monotonically non-decreasing 0–100)
    - Retry up to 3 times with exponential backoff (2000ms base)
    - Ensure idempotent processing (no duplicate objects or records on retry)
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 5.3, 9.5, 9.7_

  - [x] 6.3 Write property test for upload integrity round-trip
    - **Property 1: Upload Integrity Round-Trip**
    - **Validates: Requirements 1.4, 2.3**

  - [x] 6.4 Write property test for job progress invariant
    - **Property 6: Job Progress Invariant**
    - **Validates: Requirements 5.3**

  - [x] 6.5 Write property test for idempotent job processing
    - **Property 7: Idempotent Job Processing**
    - **Validates: Requirements 9.5**

  - [x] 6.6 Implement generate-pdf worker
    - Create `src/workers/generate-pdf.worker.ts`
    - Fetch full audit data from PostgreSQL (findings, recommendations, evidence)
    - Render PDF with RTL support for Arabic language
    - Upload PDF to reports bucket at `audits/{auditId}/reports/{reportId}.pdf`
    - Update report record with status ready, storage key, and file size
    - Mark job failed if audit ID not found (atomic status + error)
    - Retry up to 3 attempts with exponential backoff
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 6.7 Implement cleanup-temp worker
    - Create `src/workers/cleanup-temp.worker.ts`
    - Delete all temp objects older than 24 hours
    - Log deleted count and bytes reclaimed at info level
    - Continue deleting remaining objects if individual deletes fail
    - Log failed keys at error level
    - Complete successfully with zero-file log if no stale objects
    - _Requirements: 10.2, 10.3, 10.4, 10.5_

  - [x] 6.8 Write property test for temp cleanup age filter
    - **Property 8: Temp Cleanup Age Filter**
    - **Validates: Requirements 10.2**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement database models and migrations
  - [x] 8.1 Create FileRecord model and migration
    - Create `src/models/file-record.model.ts` with FileRecord interface
    - Create PostgreSQL migration for `files` table with all columns (id, originalName, storageKey, bucket, contentType, size, checksum, encryptionKeyId, uploadedBy, associatedEntity, associatedEntityType, status, createdAt, updatedAt)
    - Add validation rules (255 char filename, valid checksum, positive size)
    - _Requirements: 1.5, 1.7_

  - [x] 8.2 Create ServiceCertificate configuration model
    - Create `src/models/service-certificate.model.ts`
    - Define configuration interface for per-service certificate paths and metadata
    - _Requirements: 7.1, 7.2_

- [x] 9. Implement API routes and integration
  - [x] 9.1 Create file upload endpoint
    - Create `src/routes/files.routes.ts` with `POST /api/files/upload`
    - Accept multipart file upload, validate with file-validation module
    - Stream to temp bucket, compute SHA-256, create FileRecord
    - Enqueue process-file job, return 202 Accepted with jobId
    - Return 503 if MinIO unreachable
    - Log upload to audit trail (operation, file ID, user ID, timestamp, outcome)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 11.5_

  - [x] 9.2 Create file download endpoint
    - Add `GET /api/files/:fileId/download` route
    - Generate presigned URL only for files with status `ready`
    - Return 302 redirect to presigned URL
    - Return 404 if file not found or not ready
    - Return 403 if user not authorized
    - Log download to audit trail
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 11.5_

  - [x] 9.3 Write property test for presigned URL scoping
    - **Property 4: Presigned URL Scoping**
    - **Validates: Requirements 3.1, 3.4**

  - [x] 9.4 Create job status endpoint
    - Add `GET /api/jobs/:jobId/status` route
    - Return job state, progress, timestamps, result/error
    - Return 404 if job not found
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

  - [x] 9.5 Create PDF report generation endpoint
    - Add `POST /api/reports/generate` route
    - Enqueue generate-pdf job, return 202 Accepted with jobId
    - Add `GET /api/reports/:id/download` for completed reports
    - _Requirements: 4.1, 4.2_

  - [x] 9.6 Create queue health endpoint
    - Add `GET /api/health/queue` route
    - Return queue metrics (connected, waiting, active, completed, failed, delayed, workers)
    - _Requirements: 8.1_

- [x] 10. Implement error recovery and resilience
  - [x] 10.1 Implement circuit breaker for MinIO and Redis
    - Create `src/utils/circuit-breaker.ts`
    - Open circuit after 5 consecutive failures
    - Return 503 immediately when circuit is open
    - Half-open probe after 60 seconds
    - Workers pause with exponential backoff (1s → 30s max) when MinIO down
    - _Requirements: 9.1, 9.2, 9.6_

  - [x] 10.2 Implement stalled job recovery and upload timeout
    - Configure BullMQ stalled job recovery (re-queue within 60s of reconnection)
    - Abort multipart uploads exceeding 120 seconds
    - Clean up incomplete parts, update FileRecord status to failed
    - _Requirements: 9.3, 9.4_

  - [x] 10.3 Ensure job payload security
    - Validate job payloads contain only entity IDs, file references, and processing metadata
    - Never include user credentials, tokens, or session data in job payloads
    - _Requirements: 11.4_

- [x] 11. Wire services together and configure startup/shutdown
  - [x] 11.1 Integrate services into application bootstrap
    - Initialize CertificateManager on startup
    - Initialize StorageService with MinIO client and CertificateManager
    - Initialize QueueService with Redis connection and CertificateManager
    - Initialize WorkerManager with registered processors
    - Start workers after all services initialized
    - _Requirements: 7.1, 8.2_

  - [x] 11.2 Implement graceful shutdown
    - Handle SIGTERM signal
    - Drain active workers within timeout
    - Close storage and queue connections
    - _Requirements: 8.3, 8.4_

  - [x] 11.3 Write integration tests for upload→process→download flow
    - Use testcontainers for MinIO and Redis
    - Test complete file lifecycle
    - Verify TLS with self-signed test certificates
    - Test worker failure/retry behavior
    - _Requirements: 1.6, 2.1, 2.5, 3.1_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses Vitest for testing and fast-check for property-based testing
- Docker Compose provides local MinIO and Redis for development
- TLS is enforced in production; optional in development for local Docker setup

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "8.1", "8.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.3", "3.5"] },
    { "id": 3, "tasks": ["3.1", "3.4", "3.6"] },
    { "id": 4, "tasks": ["3.2", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.6", "6.7"] },
    { "id": 7, "tasks": ["6.3", "6.4", "6.5", "6.8"] },
    { "id": 8, "tasks": ["9.1", "9.4", "9.5", "9.6"] },
    { "id": 9, "tasks": ["9.2", "9.3", "10.1", "10.2", "10.3"] },
    { "id": 10, "tasks": ["11.1", "11.2"] },
    { "id": 11, "tasks": ["11.3"] }
  ]
}
```
