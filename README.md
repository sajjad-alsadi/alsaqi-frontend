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
| `DATABASE_URL` | ✅ | رابط اتصال PostgreSQL |
| `JWT_SECRET` | ✅ | مفتاح توقيع JWT (64 حرف كحد أدنى) |
| `VITE_STORAGE_SECRET` | ✅ | مفتاح تشفير التخزين المحلي (32 حرف كحد أدنى) |
| `VITE_NETWORK_SECRET` | ✅ | مفتاح HMAC للشبكة |
| `CORS_ORIGIN` | ✅ | النطاقات المسموح بها |

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
- رؤوس أمان إضافية

لإعداد شهادة SSL، استخدم Let's Encrypt:

```bash
certbot certonly --webroot -w /var/www/certbot -d your-domain.com
```

---

## إعدادات الأمان

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

| المتغير | الوصف |
|---------|-------|
| `FILE_ENCRYPTION_KEY` | تشفير الملفات المرفوعة (AES-256-GCM). إذا لم يُعيَّن، تُخزَّن الملفات بدون تشفير |
| `CORS_ORIGIN` | النطاقات المسموح بها (مفصولة بفاصلة) |
| `DB_SSL_CA_PATH` | مسار شهادة CA مخصصة لاتصال قاعدة البيانات |
| `DB_SSL_REJECT_UNAUTHORIZED` | فرض التحقق من شهادة SSL (افتراضي: `true` في الإنتاج) |

### المصادقة الثنائية (2FA)

يدعم النظام المصادقة الثنائية عبر TOTP. يتم تشفير أسرار TOTP باستخدام:

| المتغير | الوصف |
|---------|-------|
| `TOTP_ENCRYPTION_KEY` | مفتاح تشفير أسرار TOTP (يستخدم `FILE_ENCRYPTION_KEY` كبديل) |

> **تحذير:** لا تغيّر مفاتيح التشفير بعد التعيين بدون تنفيذ عملية تدوير المفاتيح (Key Rotation).

---

## النسخ الاحتياطي والاستعادة

يوفر النظام نسخاً احتياطياً تلقائياً عبر `BackupScheduler`:

### النسخ الاحتياطي التلقائي

- **الجدولة:** يومياً الساعة 02:00 صباحاً (توقيت الخادم)
- **الآلية:** `pg_dump` مع ضغط gzip لقواعد PostgreSQL
- **الاحتفاظ:** حذف تلقائي للنسخ الأقدم من المدة المحددة

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

## البنية التقنية

| الطبقة | التقنيات |
|--------|----------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend | Express.js + TypeScript |
| Database | PostgreSQL 14+ / PGlite (تطوير) |
| Auth | JWT (RS256) + 2FA (TOTP) |
| Security | Helmet.js + CSRF + Rate Limiting + AES-256-GCM |
| CI/CD | GitLab CI/CD + Docker |
| Proxy | Nginx + TLS 1.2+ + Brotli |

---

## الرخصة

هذا المشروع مملوك وللاستخدام الداخلي فقط.

</div>
