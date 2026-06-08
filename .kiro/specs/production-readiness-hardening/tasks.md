# Implementation Plan

## Overview

خطة تنفيذ تقوية جاهزية الإنتاج لنظام الساقي باستخدام منهجية Bug Condition. تبدأ بكتابة اختبارات استكشافية لإثبات وجود العيوب، ثم اختبارات حفظ السلوك، ثم تنفيذ الإصلاحات مع التحقق. تشمل 17 مهمة تغطي الإصلاحات الجوهرية (بناء TypeScript، ESLint، الاختبارات الفاشلة، مشاركة الجلسات) والتحسينات الإنتاجية (أسرار، تشفير، نسخ احتياطي، 2FA، CI/CD، SSL، وغيرها).

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Production Build, Lint, Test, and Session Sharing Failures
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bugs exist
  - **Scoped PBT Approach**: Scope the property to the concrete failing cases:
    - Run `tsc --build` and assert exit code === 0 (will FAIL — hundreds of type errors)
    - Run `eslint .` and assert error count === 0 (will FAIL — ~10,000 errors)
    - Run `vitest --run` and assert failed count === 0 (will FAIL — 40 tests fail)
    - Assert `PermissionService.property.test.ts` passes without `TypeError: ModuleRegistry.getModule.mockReturnValue is not a function`
    - Assert session lookup from a different instance returns cached data via Redis (will FAIL — uses in-memory Map)
  - Bug Condition from design: `isBugCondition(input)` returns true when `tsc exitCode != 0`, `eslint errorCount > 0`, `vitest failedTests > 0`, or `session_lookup` with `multi-instance` and `cacheStore == 'in-memory-map'`
  - Expected behavior: zero build errors, zero lint errors, zero test failures, Redis-backed session sharing
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bugs exist)
  - Document counterexamples found:
    - `tsc --build` produces: `implicitly has an 'any' type`, `Cannot find module`, `spread argument must have tuple type`
    - ESLint reports: `@typescript-eslint/no-explicit-any`, `no-console`, `@typescript-eslint/no-non-null-assertion`
    - `PermissionService.property.test.ts` fails with: `TypeError: ModuleRegistry.getModule.mockReturnValue is not a function`
    - Session cache returns `undefined` when request routed to different instance
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Behavior Unchanged for Non-Buggy Inputs
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (cases where `isBugCondition` returns false):
    - Observe: `tsconfig.base.json` has `strict: true` — must remain enabled after fix
    - Observe: `.eslintrc` rules are all active — no `off` overrides or blanket `eslint-disable`
    - Observe: 2,390 tests currently passing — run and record pass count
    - Observe: Without `REDIS_URL`, session cache uses in-memory Map and works correctly for single instance
    - Observe: `invalidateUserCache` and `clearPermissionCache` export signatures and return types
    - Observe: API endpoint responses for standard requests (same input → same output)
  - Write property-based tests using `fast-check`:
    - For all non-buggy session inputs (single instance, `REDIS_URL` undefined): cache set/get roundtrip works via in-memory fallback
    - For all valid cache API calls: `invalidateUserCache(userId)` and `clearPermissionCache()` maintain same function signature
    - For all API requests not triggering bug conditions: response unchanged between original and fixed code
    - Strict mode assertion: `tsconfig.base.json` → `compilerOptions.strict === true`
    - ESLint config assertion: no new `"off"` rules added, no global `eslint-disable` files
    - Passing test count assertion: vitest reports ≥ 2,390 passing tests
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix core build and quality issues (TypeScript, ESLint, Tests)

  - [x] 3.1 Fix TypeScript build errors
    - Add explicit type annotations for all `implicitly has an 'any' type` errors
    - Fix spread argument errors by converting to tuple types or proper rest parameters
    - Add missing module declarations (`.d.ts` files) for packages without type definitions
    - Ensure `tsc --build` succeeds across all packages (`packages/shared`, `packages/api`, `apps/web`)
    - Do NOT use `// @ts-ignore` or `// @ts-expect-error` as workarounds
    - Do NOT relax `strict: true` in `tsconfig.base.json`
    - _Bug_Condition: isBugCondition(input) where input.type == 'tsc_build' AND input.exitCode != 0_
    - _Expected_Behavior: tsc --build exits with code 0, zero errors_
    - _Preservation: strict: true remains enabled, runtime behavior unchanged (compile-time only fixes)_
    - _Requirements: 2.1, 3.1, 3.6_

  - [x] 3.2 Fix ESLint errors
    - Run `eslint --fix` for auto-fixable issues (formatting, unused imports)
    - Replace `console.log` statements with structured `winston` logger at appropriate severity levels
    - Replace unsafe `any` with specific types or `unknown` with type guards
    - Remove unsafe non-null assertions (`!`) and add proper null checks
    - Do NOT add blanket `eslint-disable` comments or disable rules globally
    - _Bug_Condition: isBugCondition(input) where input.type == 'eslint' AND input.errorCount > 0_
    - _Expected_Behavior: eslint reports zero errors (warnings acceptable)_
    - _Preservation: All ESLint rules remain active, same semantic information logged_
    - _Requirements: 2.2, 3.2, 3.7_

  - [x] 3.3 Fix failing tests (40 tests across 17 files)
    - Fix `PermissionService.property.test.ts`: correct the mock for `ModuleRegistry.getModule` to match actual export structure (use `vi.spyOn` or `vi.mock` with factory matching real module shape)
    - Analyze and fix remaining 39 failing tests (incorrect mocks, outdated assertions, missing dependencies)
    - Do NOT modify passing tests or production code behavior that passing tests validate
    - _Bug_Condition: isBugCondition(input) where input.type == 'vitest' AND input.failedTests > 0_
    - _Expected_Behavior: vitest --run reports 2,430 tests passing, zero failures_
    - _Preservation: 2,390 currently passing tests remain passing without modification_
    - _Requirements: 2.3, 3.3_

  - [x] 3.4 Implement Redis session cache adapter
    - Create `SessionCacheAdapter` interface with `get`, `set`, `delete`, `clear` methods
    - Implement `RedisSessionCache` using Redis on port 6379 (from `deploy/docker-compose.yml`)
    - Implement `InMemorySessionCache` as fallback (existing Map-based logic)
    - Modify `src/server/middleware/auth.ts` to use adapter pattern: Redis when `REDIS_URL` defined, in-memory otherwise
    - Preserve `invalidateUserCache` and `clearPermissionCache` function signatures (same API, backed by Redis)
    - Set TTL to 5 minutes (matching existing behavior)
    - _Bug_Condition: isBugCondition(input) where input.type == 'session_lookup' AND input.deploymentMode == 'multi-instance' AND input.cacheStore == 'in-memory-map'_
    - _Expected_Behavior: Session data retrieved from Redis regardless of which instance handles the request_
    - _Preservation: Single-instance/dev mode falls back to in-memory; cache API signatures unchanged_
    - _Requirements: 2.4, 2.5, 3.4, 3.5_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Production Build, Lint, Test, and Session Sharing Success
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure core fixes pass
  - Ensure `tsc --build` exits with code 0
  - Ensure `eslint .` reports zero errors
  - Ensure `vitest --run` reports zero failures
  - Ensure session cache works across simulated multi-instance scenario
  - Ensure all preservation tests from task 2 still pass
  - Ask the user if questions arise

- [x] 5. Secrets hardening (SecretsValidator)
  - Create `src/server/utils/secretsValidator.ts` with `validateProductionSecrets()` function
  - Check JWT_SECRET, VITE_STORAGE_SECRET, VITE_NETWORK_SECRET, DATABASE_URL against weak defaults and minimum length
  - Integrate into `server.ts` startup — call before other initialization when `NODE_ENV=production`, exit code 1 on failure
  - Update `.env.example` to replace usable defaults with placeholder instructions
  - Add unit tests: weak defaults rejected, short secrets rejected, valid secrets accepted, dev mode allows weak with warnings
  - _Requirements: 2.1 (design component 1)_

- [x] 6. File encryption at rest (FileEncryptionService)
  - Create `src/server/services/FileEncryptionService.ts` implementing AES-256-GCM with HKDF key derivation from `FILE_ENCRYPTION_KEY`
  - Create database migration adding `encrypted_files` table (id, original_name, mime_type, original_size, encrypted_path, iv, auth_tag, checksum_sha256, key_version, encrypted_at, uploaded_by, module)
  - Modify file upload handlers to encrypt before saving (wrap existing `saveFile` utility)
  - Modify file download handlers to decrypt before streaming to client
  - Add `FILE_ENCRYPTION_KEY` to `.env.example` with generation instructions
  - Add unit tests: encryption roundtrip, checksum verification, invalid key rejection, key rotation
  - _Requirements: 2.4, 2.5 (design component 2)_

- [x] 7. Backup scheduling (BackupScheduler)
  - Create database migration adding `backup_history` table (id, started_at, completed_at, status, type, size_bytes, tables_count, file_path, error_message, verified, verified_at)
  - Refactor `src/server/utils/backup.ts` to add `BackupScheduler` class with `start()`, `stop()`, `runNow()`, `getHistory()` methods
  - Add pg_dump execution for external PostgreSQL with gzip compression
  - Implement retention policy: delete backups older than `BACKUP_RETENTION_DAYS` (default 30)
  - Integrate into `src/server/cron/index.ts` — schedule daily at 02:00 AM
  - Add `POST /api/admin/backup` endpoint for manual triggering (admin-only)
  - Add admin notification on failure via existing notification system
  - Add `BACKUP_RETENTION_DAYS`, `BACKUP_DIR`, `ENCRYPT_BACKUPS` to `.env.example`
  - Add unit tests: retention policy, history recording, failure handling
  - _Requirements: 3.4, 3.7 (design component 3)_

- [x] 8. WebSocket auth fix
  - Refactor WebSocket setup in `server.ts` to use `noServer` mode with manual `upgrade` event handling
  - Implement token extraction from query parameter `?token=` in upgrade request
  - Implement immediate JWT verification during upgrade — reject with HTTP 401 if token missing or invalid
  - Remove the 30-second `authTimeout` and message-based authentication flow
  - Preserve existing heartbeat (ping/pong) mechanism for authenticated connections
  - Update frontend WebSocket connection code to pass token as query parameter
  - Add unit tests: connection rejected without token, rejected with expired token, accepted with valid token
  - _Requirements: 4.1, 4.2, 4.3, 4.4 (design component 4)_

- [x] 9. Two-Factor Authentication (2FA/TOTP)
  - Install `otpauth` and `qrcode` packages
  - Create database migration adding `user_totp` table (id, user_id, secret_encrypted, secret_iv, secret_tag, is_enabled, enabled_at, backup_codes_hash, last_used_at, created_at)
  - Add `requires_2fa_setup` column to users table via migration
  - Create `src/server/services/TOTPService.ts` with setup(), verify(), disable(), useBackupCode(), isEnabled() methods
  - Create endpoints: `POST /api/auth/2fa/setup`, `POST /api/auth/2fa/verify`, `POST /api/auth/2fa/validate`, `POST /api/auth/2fa/backup`, `DELETE /api/auth/2fa`
  - Modify login flow in `AuthService.ts` to check 2FA status and return `{requires2FA: true, tempToken}` when enabled
  - Add unit tests: secret generation, code verification within window, backup code usage, timing-safe comparison
  - _Requirements: 5.6, 5.7 (design component 5)_

- [x] 10. CI/CD pipeline (GitLab)
  - Create/update `.gitlab-ci.yml` with stages: validate, test, build, deploy
  - Configure `validate` stage: lint (eslint + prettier), typecheck (tsc --noEmit), audit (npm audit)
  - Configure `test` stage: vitest --run --coverage with coverage reporting
  - Configure `build` stage: Docker build and image tagging (commit SHA + latest)
  - Configure `deploy` stage: manual trigger for production
  - Add node_modules caching for pipeline performance
  - Add documentation comments explaining each stage
  - _Requirements: 2.1, 2.2, 2.3 (design component 6)_

- [x] 11. Database SSL enforcement
  - Modify `src/server/db/index.ts` to configure SSL: `rejectUnauthorized: true` when `NODE_ENV=production`
  - Add support for custom CA certificate via `DB_SSL_CA_PATH` env variable
  - Add startup validation: refuse to start in production if SSL connection fails
  - Update `.env.example` with `DB_SSL_REJECT_UNAUTHORIZED=true` documentation
  - Add unit tests: production enforces SSL, development skips SSL, custom CA path loaded
  - _Requirements: 7.1, 7.3 (design component 7)_

- [x] 12. Helmet.js integration
  - Install `helmet` package
  - Create `src/server/middleware/helmet.ts` with configured Helmet middleware (CSP for React SPA, HSTS, frameguard)
  - Replace manual security headers middleware in `server.ts` with Helmet middleware
  - Configure CSP directives: self, unsafe-inline for styles, fonts.googleapis.com, data: for images, ws:/wss: for WebSocket
  - Add integration test verifying security headers present in responses
  - _Requirements: 8.2, 8.3 (design component 8)_

- [x] 13. Response compression
  - Install `compression` and `@types/compression` packages
  - Create `src/server/middleware/compression.ts` with configured compression (threshold: 1KB, filter for text-based content)
  - Integrate in `server.ts` after security middleware but before routes
  - Add integration test verifying gzip-compressed responses
  - _Requirements: 9.2, 9.3 (design component 9)_

- [x] 14. Audit trail partitioning
  - Create `src/server/services/PartitionManager.ts` with initialize(), createPartition(), dropOldPartitions(), listPartitions() methods
  - Create migration converting `audit_trail` to range-partitioned table by `timestamp`
  - Add data migration from original table to partitioned table
  - Add monthly cron job in `src/server/cron/index.ts` to create future partitions (3 months ahead)
  - Add configurable retention via `AUDIT_TRAIL_RETENTION_MONTHS` (default: 24)
  - Add unit tests: partition naming, date range calculation, retention policy
  - _Requirements: 10.5, 10.6 (design component 10)_

- [x] 15. Reverse proxy configuration (Nginx)
  - Create `deploy/nginx/nginx.conf.example` with TLS 1.2+, strong ciphers, proxy_pass to port 3000, WebSocket upgrade for /ws
  - Add Brotli and gzip compression at proxy level
  - Add rate limiting configuration (limit_req_zone)
  - Add security headers at proxy level (X-Robots-Tag, Permissions-Policy)
  - Create `deploy/docker-compose.yml` with Nginx + App service orchestration
  - Create `deploy/nginx/Dockerfile` for custom Nginx with Brotli module
  - _Requirements: 11.1 (design component 11)_

- [x] 16. README cleanup
  - Remove all AI Studio boilerplate and generic template content from README.md
  - Write project description in Arabic describing AL-SAQI as internal audit management system
  - Write prerequisites section (Node.js 20, PostgreSQL 14+, Docker)
  - Write development setup instructions (clone, npm install, .env configuration, npm run dev)
  - Write production deployment section (Docker build, env variables checklist, Nginx setup reference)
  - Write security configuration section documenting all required/optional environment variables
  - Write backup and recovery section referencing BackupScheduler
  - _Requirements: 12.1 (design component 12)_

- [x] 17. Final checkpoint - Full validation
  - Run `tsc --build` — must exit with code 0
  - Run `eslint .` — must report zero errors
  - Run `vitest --run` — must report zero failures across all 2,430+ tests
  - Verify exploration test (Property 1) passes
  - Verify preservation tests (Property 2) pass
  - Verify all new unit tests pass (secrets, encryption, TOTP, WebSocket, backup, partitioning)
  - Verify Docker build succeeds
  - Ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [
    {
      "name": "Wave 0 - Exploration & Preservation Tests",
      "tasks": [1, 2],
      "description": "Write bug condition and preservation tests BEFORE any fix — observe unfixed code behavior"
    },
    {
      "name": "Wave 1 - Core Bug Fixes",
      "tasks": [3, 4],
      "description": "Fix TypeScript, ESLint, tests, and session cache. Verify exploration and preservation tests.",
      "dependencies": {
        "3": [1, 2],
        "4": [3]
      }
    },
    {
      "name": "Wave 2 - Production Hardening (Independent)",
      "tasks": [5, 7, 8, 11, 12, 13, 14],
      "description": "Independent production hardening tasks that can run in parallel",
      "dependencies": {
        "5": [4],
        "7": [4],
        "8": [4],
        "11": [4],
        "12": [4],
        "13": [4],
        "14": [4]
      }
    },
    {
      "name": "Wave 3 - Dependent Hardening",
      "tasks": [6, 9, 10, 15],
      "description": "Tasks that depend on Wave 2 completions",
      "dependencies": {
        "6": [5],
        "9": [5],
        "10": [12, 13],
        "15": [12]
      }
    },
    {
      "name": "Wave 4 - Documentation & Final Validation",
      "tasks": [16, 17],
      "description": "README cleanup and final checkpoint depend on all other tasks",
      "dependencies": {
        "16": [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        "17": [16]
      }
    }
  ]
}
```

## Notes

- المهام 1 و 2 هي اختبارات **يجب** تنفيذها قبل أي إصلاح (منهجية Bug Condition)
- المهمة 1 (exploration test) يجب أن **تفشل** على الكود غير المُصلح — هذا يُثبت وجود العيوب
- المهمة 2 (preservation test) يجب أن **تنجح** على الكود غير المُصلح — هذا يُثبت السلوك الأصلي
- المهمة 3 تحتوي على الإصلاحات الجوهرية الأربعة (TypeScript, ESLint, Tests, Redis) وهي **Blocker** حرج
- المهمة 14 (التقسيم) تعمل فقط مع PostgreSQL الخارجي — PGlite لا يدعم Partitioning
- المهمة 9 (2FA) تتطلب تحديث Frontend لإضافة شاشة إدخال رمز TOTP
- المهمة 16 (README) يجب أن تكون آخر مهمة لتوثيق جميع التغييرات
- Property-Based Testing يستخدم مكتبة `fast-check` الموجودة في devDependencies
