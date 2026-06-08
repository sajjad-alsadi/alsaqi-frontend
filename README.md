<div dir="rtl" align="right">

# الساقي — AL-SAQI

## نظام إدارة التدقيق الداخلي

نظام متكامل لإدارة التدقيق الداخلي مصمم للمؤسسات العربية. يوفر النظام إدارة شاملة لـ:

- **برامج وخطط التدقيق** — إنشاء ومتابعة برامج التدقيق السنوية وخطط العمل
- **مهام التدقيق** — توزيع وتتبع مهام فريق التدقيق
- **الملاحظات والتوصيات** — توثيق نتائج التدقيق ومتابعة تنفيذ التوصيات
- **سجل المخاطر** — تقييم وإدارة المخاطر المؤسسية
- **المراسلات** — إدارة المراسلات الرسمية المتعلقة بالتدقيق
- **مصفوفة الامتثال** — متابعة الالتزام بالأنظمة والتشريعات
- **كشف الاحتيال** — أدوات تحليل ورصد حالات الاحتيال المحتملة
- **تضارب المصالح** — إدارة إفصاحات تضارب المصالح
- **التقارير التنفيذية** — لوحات معلومات وتقارير للإدارة العليا

---

## المتطلبات الأساسية

| المتطلب | الإصدار | ملاحظات |
|---------|---------|---------|
| Node.js | 20+ | LTS مطلوب |
| npm | 9+ | يأتي مع Node.js |
| PostgreSQL | 14+ | لبيئة الإنتاج |
| Docker | 24+ | للنشر في الإنتاج |
| Docker Compose | 2.20+ | لتنسيق الحاويات |

> **ملاحظة:** في بيئة التطوير، يمكن استخدام PGlite (قاعدة بيانات مدمجة) بدلاً من PostgreSQL — لا حاجة لتثبيت خادم قاعدة بيانات منفصل.

---

## إعداد بيئة التطوير

### 1. استنساخ المستودع

```bash
git clone https://gitlab.com/your-org/alsaqi.git
cd alsaqi
```

### 2. تثبيت الاعتماديات

```bash
npm install
```

### 3. إعداد المتغيرات البيئية

```bash
cp .env.example .env
```

افتح ملف `.env` وعدّل القيم حسب بيئتك. في بيئة التطوير، يمكنك ترك `DATABASE_URL` فارغاً لاستخدام PGlite.

### 4. تشغيل خادم التطوير

```bash
npm run dev
```

سيعمل التطبيق على: http://localhost:3000

---

## النشر في بيئة الإنتاج

### بناء صورة Docker

```bash
docker build -t alsaqi .
```

### التشغيل باستخدام Docker Compose

```bash
cd deploy
docker compose up -d
```

يتضمن ملف `deploy/docker-compose.yml` تنسيق الحاويات التالية:
- **app** — تطبيق AL-SAQI (Express.js + React)
- **nginx** — Reverse Proxy مع TLS و WebSocket

### قائمة المتغيرات البيئية المطلوبة للإنتاج

تأكد من تعيين جميع المتغيرات التالية قبل النشر (راجع `.env.example` للتفاصيل):

| المتغير | مطلوب | الوصف |
|---------|-------|-------|
| `NODE_ENV` | ✅ | يجب أن يكون `production` |
| `DATABASE_URL` | ✅ | رابط اتصال PostgreSQL مع SSL |
| `JWT_SECRET` | ✅ | مفتاح توقيع JWT (64 حرف كحد أدنى) |
| `VITE_STORAGE_SECRET` | ✅ | مفتاح تشفير التخزين المحلي (32 حرف كحد أدنى) |
| `VITE_NETWORK_SECRET` | ✅ | مفتاح HMAC للشبكة |
| `CORS_ORIGIN` | ✅ | النطاقات المسموح بها |
| `FILE_ENCRYPTION_KEY` | موصى | مفتاح تشفير الملفات (AES-256-GCM) |
| `DB_SSL_REJECT_UNAUTHORIZED` | ✅ | `true` — فرض SSL لاتصال قاعدة البيانات |

### إعداد Nginx و SSL

يتوفر نموذج إعداد Nginx جاهز في:

```
deploy/nginx/nginx.conf.example
```

يتضمن النموذج:
- TLS 1.2+ مع cipher suites قوية
- دعم WebSocket upgrade للمسار `/ws`
- ضغط Brotli و gzip
- Rate limiting
- رؤوس أمان إضافية (تكمل Helmet.js)

لإعداد شهادة SSL، استخدم Let's Encrypt:

```bash
certbot certonly --webroot -w /var/www/certbot -d your-domain.com
```

---

## إعدادات الأمان

### التحقق من الأسرار عند بدء التشغيل (SecretsValidator)

عند تشغيل الخادم في بيئة الإنتاج (`NODE_ENV=production`)، يتحقق `SecretsValidator` تلقائياً من صحة وقوة جميع المتغيرات البيئية الحرجة. إذا كانت أي قيمة ضعيفة أو افتراضية، يرفض الخادم البدء ويسجل الأخطاء بدون كشف قيم الأسرار.

في بيئة التطوير، يسجل تحذيرات فقط بدون إيقاف التشغيل.

### المتغيرات المطلوبة (Required)

جميع الأسرار يجب توليدها باستخدام:

```bash
openssl rand -hex 32
```

| المتغير | الحد الأدنى | الوصف |
|---------|-------------|-------|
| `JWT_SECRET` | 64 حرف | مفتاح توقيع JSON Web Tokens |
| `VITE_STORAGE_SECRET` | 32 حرف | تشفير localStorage في المتصفح |
| `VITE_NETWORK_SECRET` | — | مفتاح HMAC لتوقيع الطلبات |
| `DATABASE_URL` | — | رابط PostgreSQL مع SSL |

### المتغيرات الاختيارية (Optional)

| المتغير | الافتراضي | الوصف |
|---------|-----------|-------|
| `FILE_ENCRYPTION_KEY` | — | تشفير الملفات المرفوعة (AES-256-GCM). إذا لم يُعيَّن، تُخزَّن الملفات بدون تشفير |
| `TOTP_ENCRYPTION_KEY` | — | مفتاح تشفير أسرار TOTP (يستخدم `FILE_ENCRYPTION_KEY` كبديل) |
| `CORS_ORIGIN` | — | النطاقات المسموح بها (مفصولة بفاصلة) |
| `DB_SSL_CA_PATH` | — | مسار شهادة CA مخصصة لاتصال قاعدة البيانات |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` | فرض التحقق من شهادة SSL في الإنتاج |
| `BACKUP_RETENTION_DAYS` | `30` | عدد أيام الاحتفاظ بالنسخ الاحتياطية |
| `BACKUP_DIR` | `./backups` | مسار تخزين النسخ الاحتياطية |
| `ENCRYPT_BACKUPS` | `false` | تشفير ملفات النسخ الاحتياطي |
| `AUDIT_TRAIL_RETENTION_MONTHS` | `24` | عدد أشهر الاحتفاظ بأقسام سجل التدقيق |

### تشفير الملفات أثناء السكون (FileEncryptionService)

جميع الملفات المرفوعة (أدلة التدقيق، تقارير الاحتيال، إفصاحات تضارب المصالح) تُشفَّر باستخدام AES-256-GCM مع IV عشوائي لكل ملف. يُشتق مفتاح التشفير من `FILE_ENCRYPTION_KEY` عبر HKDF-SHA256.

- الملفات المشفرة تُخزَّن بصلاحيات `0o600` (owner read/write فقط)
- يُحسب checksum SHA-256 للملف الأصلي للتحقق من السلامة
- يدعم تدوير المفاتيح (Key Rotation) بدون فقدان البيانات

> **تحذير:** لا تغيّر `FILE_ENCRYPTION_KEY` بعد التعيين بدون تنفيذ عملية تدوير المفاتيح.

### المصادقة الثنائية (2FA/TOTP)

يدعم النظام المصادقة الثنائية عبر TOTP (Time-based One-Time Password) متوافق مع Google Authenticator و Authy:

- يُفرض على الأدوار الحساسة (Admin, Audit Manager)
- أسرار TOTP تُخزَّن مشفرة في قاعدة البيانات (AES-256-GCM)
- 10 رموز احتياطية (Backup Codes) تُولد عند التفعيل
- نافذة تحقق ±30 ثانية لمراعاة فروقات الساعة
- مقارنة آمنة زمنياً (timing-safe) لمنع هجمات التوقيت

### مصادقة WebSocket (WebSocket Auth Guard)

يعمل WebSocket في وضع `noServer` مع التحقق الفوري من JWT عند طلب الترقية (upgrade):

- يجب تمرير token كـ query parameter: `ws://host/ws?token=<JWT>`
- يُرفض الاتصال فوراً بـ HTTP 401 إذا لم يوجد token أو كان غير صالح
- لا يبقى أي اتصال غير مصادق مفتوحاً
- آلية heartbeat (ping/pong) تعمل للاتصالات المصادقة

### فرض SSL لقاعدة البيانات

في بيئة الإنتاج، يُفرض اتصال SSL مشفر بين التطبيق و PostgreSQL:

- `rejectUnauthorized: true` — يرفض الشهادات غير الموثقة
- يدعم شهادة CA مخصصة عبر `DB_SSL_CA_PATH`
- يرفض بدء التشغيل إذا فشل اتصال SSL

### رؤوس الأمان (Helmet.js)

يستخدم `Helmet.js` لإضافة رؤوس أمان شاملة تلقائياً:

- Content-Security-Policy مُهيأ لـ React SPA
- Strict-Transport-Security (HSTS) في الإنتاج
- X-Frame-Options: DENY (منع Clickjacking)
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Cross-Origin-Opener-Policy و Cross-Origin-Resource-Policy

### ضغط الاستجابات (Response Compression)

جميع الاستجابات النصية (JSON, HTML, CSS, JavaScript) تُضغط تلقائياً باستخدام gzip:

- الحد الأدنى للحجم: 1KB (الاستجابات الأصغر لا تُضغط)
- الملفات المضغوطة مسبقاً (صور، PDF) لا تُضغط مجدداً
- ضغط Brotli إضافي متوفر عبر Nginx

---

## النسخ الاحتياطي والاستعادة

يوفر النظام نسخاً احتياطياً تلقائياً عبر `BackupScheduler`:

### النسخ الاحتياطي التلقائي

- **الجدولة:** يومياً الساعة 02:00 صباحاً (توقيت الخادم)
- **الآلية:** `pg_dump` مع ضغط gzip لقواعد PostgreSQL الخارجية
- **الاحتفاظ:** حذف تلقائي للنسخ الأقدم من `BACKUP_RETENTION_DAYS` (افتراضي: 30 يوم)
- **التشفير:** اختياري عبر `ENCRYPT_BACKUPS=true` (AES-256-GCM)
- **السلامة:** التحقق من حجم الملف وتسجيل checksum
- **الإشعارات:** إشعار تلقائي للمسؤولين عند فشل النسخ الاحتياطي

### النسخ الاحتياطي اليدوي

```bash
# تنفيذ نسخة احتياطية فورية (يتطلب صلاحيات Admin)
curl -X POST http://localhost:3000/api/admin/backup \
  -H "Authorization: Bearer <token>"

# عرض سجل النسخ الاحتياطي
curl http://localhost:3000/api/admin/backup/history \
  -H "Authorization: Bearer <token>"
```

### متغيرات الإعداد

| المتغير | الافتراضي | الوصف |
|---------|-----------|-------|
| `BACKUP_RETENTION_DAYS` | `30` | عدد أيام الاحتفاظ بالنسخ الاحتياطية |
| `BACKUP_DIR` | `./backups` | مسار تخزين النسخ الاحتياطية |
| `ENCRYPT_BACKUPS` | `false` | تشفير ملفات النسخ الاحتياطي (AES-256-GCM) |

### الاستعادة

لاستعادة نسخة احتياطية من PostgreSQL:

```bash
gunzip -c backups/backup_2024-01-15_020000.sql.gz | psql $DATABASE_URL
```

---

## تقسيم سجل التدقيق (Audit Trail Partitioning)

جدول `audit_trail` مُقسَّم حسب الشهر (Range Partitioning) لمنع النمو غير المحدود وتحسين أداء الاستعلامات:

- أقسام شهرية بتسمية `audit_trail_yYYYYmMM`
- إنشاء تلقائي لـ 3 أقسام مستقبلية
- cron job شهري لإنشاء الأقسام الجديدة
- حذف تلقائي للأقسام الأقدم من `AUDIT_TRAIL_RETENTION_MONTHS` (افتراضي: 24 شهر)
- شفافية كاملة — جميع الاستعلامات تعمل بدون تعديل

> **ملاحظة:** التقسيم يعمل فقط مع PostgreSQL الخارجي. PGlite لا يدعم Partitioning.

---

## خط أنابيب CI/CD

يتوفر خط أنابيب GitLab CI/CD في ملف `.gitlab-ci.yml` بأربع مراحل:

| المرحلة | المهام |
|---------|--------|
| **validate** | ESLint + Prettier check, TypeScript typecheck (`tsc --noEmit`), `npm audit` |
| **test** | `vitest --run --coverage` مع تقرير التغطية |
| **build** | بناء Docker image وتوسيمها بـ commit SHA |
| **deploy** | نشر يدوي (manual trigger) لبيئة الإنتاج |

- يُخزَّن `node_modules` مؤقتاً (cache) بين عمليات التشغيل
- يستخدم Node.js 20 Alpine كصورة أساسية
- يفشل الـ pipeline إذا فشلت أي مرحلة validate أو test

---

## البنية التقنية

| الطبقة | التقنيات |
|--------|----------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend | Express.js + TypeScript |
| Database | PostgreSQL 14+ / PGlite (تطوير) |
| Auth | JWT (RS256) + 2FA (TOTP) |
| Security | Helmet.js + SecretsValidator + AES-256-GCM + DB SSL |
| Realtime | WebSocket (ws) مع Auth Guard فوري |
| CI/CD | GitLab CI/CD + Docker |
| Proxy | Nginx + TLS 1.2+ + Brotli + Rate Limiting |
| Backup | BackupScheduler + pg_dump + gzip |
| Performance | Response Compression + Audit Trail Partitioning |

---

## الرخصة

هذا المشروع مملوك وللاستخدام الداخلي فقط.

</div>
