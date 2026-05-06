# نظام الساقي (AL-SAQI)
> نظام متكامل لإدارة التدقيق الداخلي، المراسلات، تقييم المخاطر، والنزاهة للشركات. تم تصميم النظام ليعمل بالكامل داخل الخوادم المحلية (On-Premises) لضمان الخصوصية وسرية البيانات.
> **الإصدار:** 1.0.0 | **آخر تحديث:** 2024

---

## 1. نظرة عامة (Overview)
- **نوع التطبيق:** تطبيق ويب (Web Application)
- **المكدس التقني (Tech Stack):** 
  - **الواجهة الأمامية (Frontend):** React (Vite)، Tailwind CSS، Lucide React.
  - **الواجهة الخلفية (Backend):** Express.js (Node.js) مع TypeScript.
- **قاعدة البيانات:** PostgreSQL (psql للإنتاج) + PGlite (مدمجة وقتاً للتجربة والاختيار المحلي بلا خوادم).
- **الحالة الحالية:** جاهز ومستقر (تم إزالة كافة التبعيات السحابية).

## 2. هيكل المشروع (Project Structure)
- `src/` - يحتوي على كل السورس كود.
  - `components/` - مكونات واجهة المستخدم التفاعلية (زر، جداول، نوافذ).
  - `modules/` - الأقسام المنفصلة للتطبيق (الموثقة لاحقاً).
  - `server/` - إعدادات الخادم، المسارات (Routes)، وقواعد البيانات (DB).
  - `locales/` - ملفات الترجمة (عربي/إنجليزي).
  - `services/` - خدمات الواجهة الأمامية للاتصال مع الـ API (Frontend services).

## 3. الأقسام الرئيسية (Core Modules)

### 3.1 المصادقة والأمان (Auth & Security)
- **الملفات الرئيسية:** 
  - `src/server/routes/auth/`
  - `src/components/Login.tsx`
- **المسارات (Routes/API):**
  - `POST /api/auth/login` - تسجيل الدخول
  - `POST /api/auth/refresh` - تجديد التوكن
  - `POST /api/auth/logout` - تسجيل الخروج
- **قاعدة البيانات المرتبطة:**
  - جدول `users` (id, username, password, role، الخ).
  - جدول `refresh_tokens`.
  - جدول `login_history`.
- **الحالة:** ✅ يعمل محلياً ويستخدم JWT مع تشفير RSA وكلمات مرور مشفرة بـ bcrypt.

### 3.2 التدقيق الداخلي (Internal Audit)
- **الملفات الرئيسية:** 
  - `src/modules/AuditProgram/` - إدارة خطط التدقيق.
  - `src/modules/AuditFieldwork/` - المهام والإجراءات الميدانية.
  - `src/server/routes/audit.ts` - واجهات برمجة التدقيق.
- **قاعدة البيانات المرتبطة:**
  - جداول: `audit_programs`, `audit_plans`, `audit_tasks`, `audit_findings`, `recommendations`.
- **الحالة:** ✅ يعمل بالكامل بدون أي تخزين سحابي.

### 3.3 المراسلات الرسمية والاتصالات (Correspondence)
- **الملفات الرئيسية:** 
  - `src/modules/Correspondence/` - الصادر والوارد.
  - `src/server/routes/correspondence.ts`
- **قاعدة البيانات المرتبطة:**
  - جداول: `incoming_correspondence`, `outgoing_correspondence`, `correspondence_attachments`.
- **الحالة:** ✅ رفع الملفات يتم للمجلد الداخلي `uploads/`.

### 3.4 الامتثال والمخاطر (Compliance & Risk)
- **الملفات الرئيسية:** 
  - `src/modules/Risk/` - سجل المخاطر.
  - `src/modules/Legal/` - التشريعات وقوانين البنك المركزي.
  - `src/server/routes/regulatory.ts`
- **قاعدة البيانات المرتبطة:**
  - جداول: `risk_register`, `central_bank_instructions`, `law_bank`.
- **الحالة:** ✅ محلي.

### 3.5 النزاهة والاحتيال (Integrity & Fraud)
- **الملفات الرئيسية:**
  - `src/modules/Integrity/`
- **قاعدة البيانات المرتبطة:**
  - جداول: `fraud_log`, `fraud_access_requests`, `conflict_of_interest`.
- **ملاحظات:** تعتمد على تقييد الصلاحيات للمستخدمين المعنيين فقط. الحالة: ✅ يعمل.

---

## 4. قاعدة البيانات (Database Architecture)

### 4.1 الجداول والعلاقات
```sql
users ||--o{ audit_tasks : "assigned to"
audit_programs ||--o{ audit_plans : "has many"
audit_plans ||--o{ audit_tasks : "has many"
audit_plans ||--o{ audit_findings : "has findings"
audit_findings ||--o{ recommendations : "has many"
users ||--o{ login_history : "logs in"
```

| الجدول | الغرض | الأعمدة الرئيسية | العلاقات |
| ------ | ----- | ---------------- | -------- |
| `users` | المستخدمين في النظام | `id`, `username`, `password`, `role`, `status` | مستخدم واحد له سجلات دخول وإجراءات |
| `login_history` | تسجيل الحوادث | `id`, `user_id`, `ip_address`, `status` | رابط `user_id` مع `users` |
| `audit_plans` | خطط التدقيق | `id`, `title`, `program_id`, `status` | مرتبط بـ `audit_programs` |
| `audit_findings` | نتائج التدقيق | `id`, `audit_id`, `description`, `risk_level` | مرتبط بـ `audit_plans` |
| `recommendations` | توصيات التدقيق | `id`, `finding_id`, `action_plan`, `status` | مرتبط بـ `audit_findings` |
| `incoming_correspondence`| الكتب الواردة | `id`, `subject`, `sender_entity`, `status` | |

### 4.2 Migrations
- **الإنتاج/الاختبار:** `src/server/db/migrations.ts` يتولى مهمة تهيئة الجداول تلقائياً عند بدء النظام (Auto-migrate). جميع الجداول تستخدم `IF NOT EXISTS`.
- **أداة الربط للملفات الثقيلة:** يتم حفظ الملفات بشكل مادي في `uploads/` ويُخزن في قاعدة البيانات مسار الملف (Local Path) داخل الجدول `audit_evidence` وقسم `correspondence_attachments`.

---

## 5. البيئات (Environments)

### 5.1 الإنتاج (Production)
- **قاعدة البيانات:** PostgreSQL
- **متغيرات البيئة:**
  ```env
  DATABASE_URL=postgres://user:pass@localhost:5432/alsaqi_db
  JWT_SECRET=strong-production-secret
  PORT=3000
  NODE_ENV=production
  ```

### 5.2 التطوير/الاختبار (Development)
- **قاعدة البيانات:** PGlite (مدمجة) وتخزن الملفات في مجلد مؤقت أو `/tmp`.
- تعتمد تلقائياً عندما لا يتم تعيين `DATABASE_URL`.

---

## 6. التبعيات (Dependencies)
| المكتبة | الإصدار | الغرض |
| ------- | ------- | ----- |
| `express` | `^5.2.1` | الخادم الأساسي (Backend) |
| `@electric-sql/pglite` | `^0.4.1` | قاعدة بيانات محلية (بديل Psql في حال التعذر) |
| `pg` | `^8.20.0` | محرك اتصال PostgreSQL للإنتاج |
| `bcryptjs` | `^3.0.3` | تشفير كلمات المرور |
| `jsonwebtoken` | `^9.0.3` | المصادقة ونقل البيانات بأمان |

---

## 7. المشاكل المعروفة (Known Issues)
- [x] الاتصالات السحابية: تم إلغاء أي اتصال بـ (Firebase, Supabase, Cloud Storage).
- [x] رفع الملفات: تم التبديل إلى `express-fileupload` المحلي.
- [ ] البحث الكامل لملكيات PDF المحلية (Full Text Search) - **قيد التحسين**.

---

## 8. التعليمات السريعة (Quick Commands)
```bash
# تثبيت التبعيات (لو كان هناك حزم جديدة)
npm install

# تشغيل بيئة التطوير (الكل في واحد)
npm run dev

# تهيئة قاعدة البيانات والتأكد من الجداول (يتم عبر السيرفر تلقائياً)
# ولكن لمسح مؤقت db pglite أو إنشائها:
# إزالة مجلد `audit_db_persistent_v2` في مجلد TEMP
```
