# Implementation Plan: Production Readiness Hardening

## Overview

خطة تنفيذ تقوية جاهزية الإنتاج لنظام الساقي. تشمل 12 مهمة رئيسية مقسمة إلى مهام فرعية قابلة للتنفيذ. الأولوية للعناصر الحرجة (Blockers) ثم التحسينات.

## Tasks

- [x] 1. تقوية الأسرار والتحقق عند بدء التشغيل (Secrets Hardening)
  - [x] 1.1 Create `src/server/utils/secretsValidator.ts` with `validateProductionSecrets()` function that checks JWT_SECRET, VITE_STORAGE_SECRET, VITE_NETWORK_SECRET, and DATABASE_URL against weak defaults and minimum length requirements
  - [x] 1.2 Integrate SecretsValidator into `server.ts` startup — call before any other initialization when `NODE_ENV=production`, exit with code 1 on failure
  - [x] 1.3 Update `.env.example` to replace usable default values with placeholder instructions (e.g., `JWT_SECRET=` with comment `# Generate: openssl rand -hex 32`)
  - [x] 1.4 Add unit tests for SecretsValidator covering: weak defaults rejected, short secrets rejected, valid secrets accepted, development mode allows weak secrets with warnings
- [x] 2. تشفير الملفات أثناء السكون (File Encryption at Rest)
  - [x] 2.1 Create `src/server/services/FileEncryptionService.ts` implementing AES-256-GCM encryption with HKDF key derivation from `FILE_ENCRYPTION_KEY`
  - [x] 2.2 Create database migration adding `encrypted_files` table with columns: id, original_name, mime_type, original_size, encrypted_path, iv, auth_tag, checksum_sha256, key_version, encrypted_at, uploaded_by, module
  - [x] 2.3 Modify file upload handlers to encrypt files before saving to disk (wrap existing `saveFile` utility)
  - [x] 2.4 Modify file download/access handlers in `secureFile` middleware to decrypt files before streaming to client
  - [x] 2.5 Add `FILE_ENCRYPTION_KEY` to `.env.example` with generation instructions
  - [x] 2.6 Add unit tests for FileEncryptionService: encryption roundtrip, checksum verification, invalid key rejection, key rotation
- [x] 3. جدولة النسخ الاحتياطي (Backup Scheduling)
  - [x] 3.1 Create database migration adding `backup_history` table with columns: id, started_at, completed_at, status, type, size_bytes, tables_count, file_path, error_message, verified, verified_at
  - [x] 3.2 Refactor `src/server/utils/backup.ts` to add `BackupScheduler` class with `start()`, `stop()`, `runNow()`, and `getHistory()` methods
  - [x] 3.3 Add pg_dump execution for external PostgreSQL databases with gzip compression
  - [x] 3.4 Implement retention policy: delete backups older than `BACKUP_RETENTION_DAYS` (default 30) during each backup run
  - [x] 3.5 Integrate BackupScheduler into `src/server/cron/index.ts` — schedule daily at 02:00 AM
  - [x] 3.6 Add `POST /api/admin/backup` endpoint for manual backup triggering (admin-only)
  - [x] 3.7 Add admin notification on backup failure via existing notification system
  - [x] 3.8 Add `BACKUP_RETENTION_DAYS`, `BACKUP_DIR`, `ENCRYPT_BACKUPS` to `.env.example`
  - [x] 3.9 Add unit tests for BackupScheduler: retention policy, history recording, failure handling
- [x] 4. إصلاح مصادقة WebSocket (WebSocket Auth Fix)
  - [x] 4.1 Refactor WebSocket setup in `server.ts` to use `noServer` mode with manual `upgrade` event handling
  - [x] 4.2 Implement token extraction from query parameter `?token=` in the upgrade request
  - [x] 4.3 Implement immediate JWT verification during upgrade — reject with HTTP 401 if token is missing or invalid
  - [x] 4.4 Remove the 30-second `authTimeout` and message-based authentication flow
  - [x] 4.5 Preserve existing heartbeat (ping/pong) mechanism for authenticated connections
  - [x] 4.6 Update frontend WebSocket connection code to pass token as query parameter
  - [x] 4.7 Add unit tests: connection rejected without token, connection rejected with expired token, connection accepted with valid token
- [x] 5. المصادقة الثنائية (Two-Factor Authentication)
  - [x] 5.1 Install `otpauth` and `qrcode` packages as production dependencies
  - [x] 5.2 Create database migration adding `user_totp` table with columns: id, user_id, secret_encrypted, secret_iv, secret_tag, is_enabled, enabled_at, backup_codes_hash, last_used_at, created_at
  - [x] 5.3 Add `requires_2fa_setup` column to users table via migration
  - [x] 5.4 Create `src/server/services/TOTPService.ts` with setup(), verify(), disable(), useBackupCode(), isEnabled() methods
  - [x] 5.5 Create `POST /api/auth/2fa/setup` endpoint — generates secret, returns QR code data URL and backup codes
  - [x] 5.6 Create `POST /api/auth/2fa/verify` endpoint — confirms setup by verifying first TOTP code
  - [x] 5.7 Create `POST /api/auth/2fa/validate` endpoint — validates TOTP during login flow, issues full tokens
  - [x] 5.8 Create `POST /api/auth/2fa/backup` endpoint — accepts backup code as alternative to TOTP
  - [x] 5.9 Create `DELETE /api/auth/2fa` endpoint — disables 2FA after password confirmation
  - [x] 5.10 Modify login flow in `AuthService.ts` to check 2FA status and return `{requires2FA: true, tempToken}` when enabled
  - [x] 5.11 Add unit tests for TOTPService: secret generation, code verification within window, backup code usage, timing-safe comparison
- [x] 6. خط أنابيب CI/CD (GitLab CI/CD Pipeline)
  - [x] 6.1 Create `.gitlab-ci.yml` with stages: validate, test, build, deploy
  - [x] 6.2 Configure `validate` stage with jobs: lint (eslint + prettier), typecheck (tsc --noEmit), audit (npm audit)
  - [x] 6.3 Configure `test` stage with vitest --run --coverage and coverage reporting
  - [x] 6.4 Configure `build` stage with Docker build and image tagging (commit SHA + latest)
  - [x] 6.5 Configure `deploy` stage with manual trigger for production
  - [x] 6.6 Add node_modules caching configuration for pipeline performance
  - [x] 6.7 Add `.gitlab-ci.yml` documentation comments explaining each stage
- [x] 7. فرض SSL لقاعدة البيانات (Database SSL Enforcement)
  - [x] 7.1 Modify `src/server/db/index.ts` to configure SSL options based on environment — `rejectUnauthorized: true` when `NODE_ENV=production`
  - [x] 7.2 Add support for custom CA certificate via `DB_SSL_CA_PATH` environment variable
  - [x] 7.3 Add startup validation: refuse to start in production if DATABASE_URL is set but SSL connection fails
  - [x] 7.4 Uncomment and update `DB_SSL_REJECT_UNAUTHORIZED=true` in `.env.example` with documentation
  - [x] 7.5 Add unit tests for SSL config creation: production enforces SSL, development skips SSL, custom CA path loaded
- [x] 8. استبدال رؤوس الأمان بـ Helmet.js (Helmet.js Integration)
  - [x] 8.1 Install `helmet` package as production dependency
  - [x] 8.2 Create `src/server/middleware/helmet.ts` with configured Helmet middleware (CSP for React SPA, HSTS, frameguard, etc.)
  - [x] 8.3 Replace the manual security headers middleware block in `server.ts` with the Helmet middleware
  - [x] 8.4 Configure CSP directives compatible with React SPA: self, unsafe-inline for styles, fonts.googleapis.com, data: for images, ws:/wss: for WebSocket
  - [x] 8.5 Add integration test verifying all expected security headers are present in responses
  - [x] 8.6 Verify no regression: compare response headers before and after replacement
- [x] 9. ضغط الاستجابات (Response Compression)
  - [x] 9.1 Install `compression` package as production dependency and `@types/compression` as dev dependency
  - [x] 9.2 Create `src/server/middleware/compression.ts` with configured compression middleware (threshold: 1KB, filter for text-based content)
  - [x] 9.3 Integrate compression middleware in `server.ts` after security middleware but before routes
  - [x] 9.4 Add integration test verifying responses are gzip-compressed when Accept-Encoding includes gzip
- [x] 10. تقسيم جدول audit_trail (Audit Trail Partitioning)
  - [x] 10.1 Create `src/server/services/PartitionManager.ts` with initialize(), createPartition(), dropOldPartitions(), listPartitions() methods
  - [x] 10.2 Create versioned migration that converts `audit_trail` to a range-partitioned table by `timestamp` column
  - [x] 10.3 Create migration logic to move existing data from original table to partitioned table
  - [x] 10.4 Add monthly cron job in `src/server/cron/index.ts` to create future partitions (3 months ahead)
  - [x] 10.5 Add configurable retention via `AUDIT_TRAIL_RETENTION_MONTHS` environment variable (default: 24)
  - [x] 10.6 Add unit tests for PartitionManager: partition naming, date range calculation, retention policy
- [x] 11. نموذج إعداد Reverse Proxy (Reverse Proxy Configuration)
  - [x] 11.1 Create `deploy/nginx/nginx.conf.example` with TLS 1.2+, strong ciphers, proxy_pass to port 3000, WebSocket upgrade for /ws
  - [x] 11.2 Add Brotli and gzip compression configuration at proxy level
  - [x] 11.3 Add rate limiting configuration (limit_req_zone) as complement to application-level limiting
  - [x] 11.4 Add security headers at proxy level (X-Robots-Tag, Permissions-Policy)
  - [x] 11.5 Create `deploy/docker-compose.yml` with Nginx + App service orchestration
  - [x] 11.6 Create `deploy/nginx/Dockerfile` for custom Nginx with Brotli module
- [x] 12. تنظيف README (README Cleanup)
  - [x] 12.1 Remove all AI Studio boilerplate and generic template content from README.md
  - [x] 12.2 Write project description section in Arabic describing AL-SAQI as internal audit management system
  - [x] 12.3 Write prerequisites section (Node.js 20, PostgreSQL 14+, Docker)
  - [x] 12.4 Write development setup instructions (clone, npm install, .env configuration, npm run dev)
  - [x] 12.5 Write production deployment section (Docker build, environment variables checklist, Nginx setup reference)
  - [x] 12.6 Write security configuration section documenting all required/optional environment variables
  - [x] 12.7 Write backup and recovery section referencing the BackupScheduler

## Task Dependency Graph

```json
{
  "waves": [
    {
      "name": "Wave 1 - المهام المستقلة",
      "tasks": [1, 3, 4, 7, 8, 9, 10],
      "description": "مهام مستقلة يمكن تنفيذها بالتوازي (Secrets, Backup, WebSocket, DB SSL, Helmet, Compression, Partitioning)"
    },
    {
      "name": "Wave 2 - المهام المعتمدة",
      "tasks": [2, 5, 6, 11],
      "description": "مهام تعتمد على الموجة 1",
      "dependencies": {
        "2": [1],
        "5": [1],
        "6": [8, 9],
        "11": [8]
      }
    },
    {
      "name": "Wave 3 - التوثيق",
      "tasks": [12],
      "description": "README يعتمد على جميع المهام الأخرى",
      "dependencies": {
        "12": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      }
    }
  ]
}
```

**تفسير الموجات:**
- **الموجة 1**: مهام مستقلة يمكن تنفيذها بالتوازي (Secrets, Backup, WebSocket, DB SSL, Helmet, Compression, Partitioning)
- **الموجة 2**: مهام تعتمد على الموجة 1 (Encryption يعتمد على Secrets، 2FA يعتمد على Secrets، CI/CD يعتمد على Helmet+Compression، Nginx يعتمد على Helmet)
- **الموجة 3**: README يعتمد على جميع المهام الأخرى لتوثيق النتائج النهائية

## Notes

- المهام 1, 4, 7 هي **Blockers** حرجة ويجب تنفيذها أولاً
- المهمة 2 (تشفير الملفات) تتطلب خطة ترحيل للملفات الموجودة — يُنصح بتشفيرها تدريجياً عبر background job
- المهمة 10 (التقسيم) تعمل فقط مع PostgreSQL الخارجي — PGlite لا يدعم Partitioning
- المهمة 5 (2FA) تتطلب تحديث Frontend لإضافة شاشة إدخال رمز TOTP
- المهمة 12 (README) يجب أن تكون آخر مهمة لتوثيق جميع التغييرات
