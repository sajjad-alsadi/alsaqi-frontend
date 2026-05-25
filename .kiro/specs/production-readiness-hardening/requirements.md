# Requirements Document

## Introduction

تحدد هذه الوثيقة متطلبات تقوية جاهزية الإنتاج لنظام الساقي (AL-SAQI) — نظام إدارة التدقيق الداخلي المبني بـ React/Vite و Express.js/TypeScript مع PostgreSQL. تركز المتطلبات على سد الثغرات الحرجة التي تمنع النشر الآمن في بيئة الإنتاج، وتشمل: تقوية الأسرار، تشفير الملفات، النسخ الاحتياطي، مصادقة WebSocket، CI/CD، فرض SSL، المصادقة الثنائية، Helmet.js، الضغط، تقسيم الجداول، وإعداد Reverse Proxy.

## Glossary

- **Server**: تطبيق Express.js الخلفي المعرّف في `server.ts` ومجلد `src/server/`
- **SecretsValidator**: مكون التحقق من صحة وقوة المتغيرات البيئية عند بدء التشغيل
- **FileEncryptionService**: خدمة تشفير/فك تشفير الملفات المرفوعة باستخدام AES-256-GCM
- **BackupScheduler**: مجدول النسخ الاحتياطي التلقائي مع سياسة الاحتفاظ
- **WSAuthGuard**: حارس مصادقة WebSocket الفوري
- **TOTPService**: خدمة المصادقة الثنائية (Time-based One-Time Password)
- **CIPipeline**: خط أنابيب GitLab CI/CD للأتمتة
- **DBSSLConfig**: إعدادات فرض SSL لاتصال قاعدة البيانات
- **HelmetMiddleware**: middleware رؤوس الأمان باستخدام Helmet.js
- **CompressionMiddleware**: middleware ضغط استجابات HTTP
- **PartitionManager**: مدير تقسيم جدول audit_trail
- **ReverseProxyConfig**: نموذج إعداد Nginx مع TLS

## Requirements

### Requirement 1: تقوية الأسرار والتحقق عند بدء التشغيل (Secrets Hardening)

**User Story:** بصفتي مهندس أمان، أريد أن يرفض الخادم البدء في بيئة الإنتاج إذا كانت الأسرار ضعيفة أو افتراضية، حتى لا يتم نشر النظام بإعدادات غير آمنة.

#### Acceptance Criteria

1. WHEN `NODE_ENV=production`, THE SecretsValidator SHALL reject startup if `JWT_SECRET` equals `alsaqi-dev-secret-key-123` or any value shorter than 64 characters
2. WHEN `NODE_ENV=production`, THE SecretsValidator SHALL reject startup if `VITE_STORAGE_SECRET` is unset, equals `your-32-character-secret-key-here`, or is shorter than 32 characters
3. WHEN `NODE_ENV=production`, THE SecretsValidator SHALL reject startup if `VITE_NETWORK_SECRET` is unset or equals `your-network-hmac-secret-here`
4. WHEN `NODE_ENV=production`, THE SecretsValidator SHALL reject startup if `DATABASE_URL` is not set
5. THE SecretsValidator SHALL log all validation errors without revealing the actual secret values
6. THE `.env.example` file SHALL NOT contain usable default values for security-critical variables — only placeholder instructions
7. WHEN `NODE_ENV=development`, THE SecretsValidator SHALL log warnings for weak secrets but SHALL NOT prevent startup

### Requirement 2: تشفير الملفات أثناء السكون (Encryption at Rest)

**User Story:** بصفتي مسؤول أمن المعلومات، أريد تشفير جميع الملفات المرفوعة (أدلة التدقيق، تقارير الاحتيال، إفصاحات تضارب المصالح) على القرص، حتى لا يتمكن أي شخص لديه وصول فيزيائي للخادم من قراءة المحتوى بدون مفتاح التشفير.

#### Acceptance Criteria

1. WHEN a file is uploaded, THE FileEncryptionService SHALL encrypt it using AES-256-GCM with a unique 12-byte IV before writing to disk
2. THE FileEncryptionService SHALL derive the encryption key from `FILE_ENCRYPTION_KEY` environment variable using HKDF-SHA256
3. THE FileEncryptionService SHALL store encrypted files with `.enc` extension and file permissions `0o600`
4. WHEN a file is requested for download, THE FileEncryptionService SHALL decrypt it in memory and stream the plaintext to the authenticated user
5. THE FileEncryptionService SHALL compute and store a SHA-256 checksum of the original file for integrity verification
6. THE FileEncryptionService SHALL store encryption metadata (IV, auth tag, checksum, key version) in the database
7. IF `FILE_ENCRYPTION_KEY` is not set in production, THEN THE Server SHALL log a warning and store files unencrypted (backward compatibility)
8. THE FileEncryptionService SHALL support key rotation — re-encrypting existing files with a new key version

### Requirement 3: جدولة النسخ الاحتياطي (Backup Scheduling)

**User Story:** بصفتي مسؤول النظام، أريد نسخاً احتياطياً تلقائياً يومياً مع سياسة احتفاظ واضحة، حتى أتمكن من استعادة البيانات في حالة الكوارث.

#### Acceptance Criteria

1. THE BackupScheduler SHALL execute a database backup daily at 02:00 AM server time using `node-cron`
2. WHEN the database is PostgreSQL (external), THE BackupScheduler SHALL use `pg_dump` to create a compressed SQL dump
3. THE BackupScheduler SHALL apply a retention policy deleting backups older than the configured `BACKUP_RETENTION_DAYS` (default: 30)
4. THE BackupScheduler SHALL record each backup attempt (success or failure) in a `backup_history` database table
5. IF a backup fails, THEN THE BackupScheduler SHALL send a notification to all admin users via the existing notification system
6. THE BackupScheduler SHALL support manual backup triggering via `POST /api/admin/backup` (admin-only)
7. THE BackupScheduler SHALL verify backup integrity by checking file size > 0 and recording the checksum
8. THE BackupScheduler SHALL encrypt backup files when `ENCRYPT_BACKUPS=true` is set

### Requirement 4: إصلاح مصادقة WebSocket (WebSocket Auth Fix)

**User Story:** بصفتي مهندس أمان، أريد رفض اتصالات WebSocket فوراً بدون token صالح، حتى لا يبقى أي اتصال غير مصادق مفتوحاً لمدة 30 ثانية.

#### Acceptance Criteria

1. THE WSAuthGuard SHALL require a JWT token in the WebSocket upgrade request query parameter (`?token=`)
2. IF the upgrade request lacks a token, THEN THE WSAuthGuard SHALL reject the connection with HTTP 401 before completing the WebSocket handshake
3. IF the token is invalid or expired, THEN THE WSAuthGuard SHALL reject the connection with HTTP 401 before completing the WebSocket handshake
4. THE WSAuthGuard SHALL NOT allow any unauthenticated WebSocket connection to remain open for more than 0 milliseconds
5. WHEN a valid token is provided, THE WSAuthGuard SHALL attach `userId` and `username` to the WebSocket instance before emitting the `connection` event
6. THE WSAuthGuard SHALL use the `noServer` mode of the `ws` library with manual upgrade handling
7. THE existing WebSocket heartbeat mechanism (ping/pong every 30s) SHALL continue to function for authenticated connections

### Requirement 5: المصادقة الثنائية (Two-Factor Authentication)

**User Story:** بصفتي مدير النظام، أريد فرض المصادقة الثنائية (TOTP) على الأدوار الحساسة، حتى تكون الحسابات الإدارية محمية بطبقة أمان إضافية حتى لو تسربت كلمة المرور.

#### Acceptance Criteria

1. THE TOTPService SHALL provide a `POST /api/auth/2fa/setup` endpoint that generates a TOTP secret and returns a QR code data URL
2. THE TOTPService SHALL store the TOTP secret encrypted with AES-256-GCM in the database (never in plaintext)
3. THE TOTPService SHALL generate 10 single-use backup codes during setup, stored as bcrypt hashes
4. WHEN a user with 2FA enabled logs in successfully (password verified), THE Server SHALL return `{requires2FA: true, tempToken}` instead of access tokens
5. THE TOTPService SHALL provide a `POST /api/auth/2fa/validate` endpoint that verifies the TOTP code and issues full access tokens
6. THE TOTPService SHALL accept TOTP codes within a ±1 time window (±30 seconds) to account for clock drift
7. THE TOTPService SHALL use timing-safe comparison for TOTP code verification to prevent timing attacks
8. THE TOTPService SHALL allow users to disable 2FA only after providing their current password
9. WHEN an admin creates a new user with role `Admin` or `Audit Manager`, THE Server SHALL set `requires_2fa_setup = true` on the user record
10. THE TOTPService SHALL provide a `POST /api/auth/2fa/backup` endpoint that accepts a backup code as an alternative to TOTP

### Requirement 6: خط أنابيب CI/CD (CI/CD Pipeline)

**User Story:** بصفتي مهندس DevOps، أريد خط أنابيب CI/CD مؤتمت يفحص الأمان ويشغل الاختبارات ويبني الحاوية، حتى لا يتم نشر كود يحتوي على ثغرات أو أخطاء.

#### Acceptance Criteria

1. THE CIPipeline SHALL be defined in a `.gitlab-ci.yml` file at the project root
2. THE CIPipeline SHALL include a `validate` stage that runs `eslint`, `prettier --check`, and `tsc --noEmit`
3. THE CIPipeline SHALL include a `validate` stage that runs `npm audit --audit-level=moderate`
4. THE CIPipeline SHALL include a `test` stage that runs `vitest --run --coverage` and reports coverage
5. THE CIPipeline SHALL include a `build` stage that builds the Docker image and tags it with the commit SHA
6. THE CIPipeline SHALL fail the pipeline if any `validate` or `test` stage fails
7. THE CIPipeline SHALL include a `deploy` stage with manual trigger for production deployment
8. THE CIPipeline SHALL cache `node_modules` between pipeline runs for performance
9. THE CIPipeline SHALL use Node.js 20 Alpine as the base image for CI jobs

### Requirement 7: فرض SSL لقاعدة البيانات (Database SSL Enforcement)

**User Story:** بصفتي مهندس أمان، أريد فرض اتصال مشفر بين التطبيق وقاعدة البيانات في الإنتاج، حتى لا يتم نقل البيانات الحساسة بنص واضح عبر الشبكة.

#### Acceptance Criteria

1. WHEN `NODE_ENV=production`, THE DBSSLConfig SHALL set `ssl.rejectUnauthorized = true` on the PostgreSQL connection
2. THE DBSSLConfig SHALL support a custom CA certificate path via `DB_SSL_CA_PATH` environment variable
3. IF `NODE_ENV=production` AND `DATABASE_URL` is set AND SSL connection fails, THEN THE Server SHALL refuse to start and log the SSL error
4. WHEN `NODE_ENV=development`, THE DBSSLConfig SHALL NOT require SSL (PGlite does not use network connections)
5. THE `.env.example` SHALL document `DB_SSL_REJECT_UNAUTHORIZED=true` as uncommented (active) for production use

### Requirement 8: استبدال رؤوس الأمان بـ Helmet.js (Helmet.js Integration)

**User Story:** بصفتي مطور، أريد استبدال middleware رؤوس الأمان اليدوي بـ Helmet.js، حتى نحصل على تغطية أمنية أشمل مع صيانة أسهل.

#### Acceptance Criteria

1. THE HelmetMiddleware SHALL replace the existing manual security headers middleware in `server.ts`
2. THE HelmetMiddleware SHALL configure Content-Security-Policy compatible with the React SPA (allowing 'self', inline styles for fonts, data: for images)
3. THE HelmetMiddleware SHALL enable Strict-Transport-Security with `maxAge=31536000`, `includeSubDomains`, and `preload` in production only
4. THE HelmetMiddleware SHALL set `X-Frame-Options: DENY` to prevent clickjacking
5. THE HelmetMiddleware SHALL set `X-Content-Type-Options: nosniff`
6. THE HelmetMiddleware SHALL disable `X-Powered-By` header
7. THE HelmetMiddleware SHALL set `Referrer-Policy: strict-origin-when-cross-origin`
8. THE HelmetMiddleware SHALL set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-origin`
9. THE existing security headers behavior SHALL be preserved — no regression in protection level

### Requirement 9: ضغط الاستجابات (Response Compression)

**User Story:** بصفتي مستخدم، أريد أن تكون استجابات API والصفحات مضغوطة، حتى يكون التحميل أسرع خاصة على الشبكات البطيئة.

#### Acceptance Criteria

1. THE CompressionMiddleware SHALL compress all text-based responses (JSON, HTML, CSS, JavaScript) using gzip
2. THE CompressionMiddleware SHALL NOT compress responses smaller than 1KB (threshold)
3. THE CompressionMiddleware SHALL NOT compress binary files that are already compressed (images, PDFs)
4. THE CompressionMiddleware SHALL be placed before route handlers but after security middleware
5. THE CompressionMiddleware SHALL respect the `Accept-Encoding` header from the client
6. THE `compression` package SHALL be added as a production dependency

### Requirement 10: تقسيم جدول audit_trail (Audit Trail Partitioning)

**User Story:** بصفتي مسؤول قاعدة البيانات، أريد تقسيم جدول `audit_trail` حسب الشهر، حتى لا ينمو الجدول بشكل غير محدود ويؤثر على أداء الاستعلامات.

#### Acceptance Criteria

1. THE PartitionManager SHALL convert the `audit_trail` table to a range-partitioned table by the `timestamp` column
2. THE PartitionManager SHALL create monthly partitions with naming convention `audit_trail_yYYYYmMM`
3. THE PartitionManager SHALL pre-create 3 future monthly partitions to prevent INSERT failures
4. THE PartitionManager SHALL schedule a monthly cron job (1st of each month) to create the next future partition
5. THE PartitionManager SHALL migrate all existing data from the original `audit_trail` table to the partitioned table without data loss
6. AFTER partitioning, ALL existing queries on `audit_trail` SHALL continue to work without modification (transparent partitioning)
7. THE PartitionManager SHALL support configurable retention via `AUDIT_TRAIL_RETENTION_MONTHS` environment variable (default: 24)
8. WHEN retention is configured, THE PartitionManager SHALL drop partitions older than the retention period during the monthly maintenance job

### Requirement 11: نموذج إعداد Reverse Proxy (Reverse Proxy Configuration)

**User Story:** بصفتي مهندس بنية تحتية، أريد نموذج إعداد Nginx جاهز مع TLS و WebSocket proxy، حتى أتمكن من نشر النظام بأمان خلف reverse proxy.

#### Acceptance Criteria

1. THE ReverseProxyConfig SHALL be provided as a sample file at `deploy/nginx/nginx.conf.example`
2. THE ReverseProxyConfig SHALL configure TLS 1.2+ with strong cipher suites
3. THE ReverseProxyConfig SHALL include WebSocket upgrade support for the `/ws` path
4. THE ReverseProxyConfig SHALL include proxy headers (`X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`)
5. THE ReverseProxyConfig SHALL include Brotli and gzip compression at the proxy level
6. THE ReverseProxyConfig SHALL include rate limiting configuration (as a complement to application-level rate limiting)
7. THE ReverseProxyConfig SHALL include security headers that complement Helmet.js
8. A `deploy/docker-compose.yml` SHALL be provided showing Nginx + App container orchestration

### Requirement 12: تنظيف README وتحديث التوثيق (README Cleanup)

**User Story:** بصفتي مطور جديد في الفريق، أريد README واضح ودقيق يصف كيفية إعداد وتشغيل النظام، حتى أتمكن من البدء بسرعة دون الحاجة لمساعدة خارجية.

#### Acceptance Criteria

1. THE README.md SHALL remove all AI Studio boilerplate content and generic template text
2. THE README.md SHALL include a project description specific to AL-SAQI (internal audit management system)
3. THE README.md SHALL include prerequisites (Node.js 20, PostgreSQL, Docker)
4. THE README.md SHALL include development setup instructions (clone, install, configure .env, run)
5. THE README.md SHALL include production deployment instructions (Docker build, environment variables, Nginx setup)
6. THE README.md SHALL include a security configuration section documenting all required environment variables
7. THE README.md SHALL include a backup and recovery section
8. THE README.md SHALL be written in Arabic with English technical terms (matching the project's bilingual nature)
