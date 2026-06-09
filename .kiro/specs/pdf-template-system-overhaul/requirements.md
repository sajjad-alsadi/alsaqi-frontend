# Requirements Document

## Introduction

يحدد هذا المستند المتطلبات الوظيفية لإعادة هيكلة نظام قوالب PDF في تطبيق الساقي. تشمل إعادة الهيكلة: توحيد خدمات القوالب المكررة، استبدال html2canvas بمحرك Puppeteer على الخادم، إصلاح عدم تطابق مفاتيح أنواع القوالب، ربط Worker بالقوالب المخزنة، وإضافة محرر قوالب مع معاينة حية.

## Glossary

- **PdfTemplateService**: خدمة CRUD الموحدة لإدارة قوالب PDF في `packages/api/`
- **PdfEngine**: محرك توليد PDF الموحد الذي يستخدم Puppeteer على الخادم
- **TemplateTypeKey**: مفتاح ثابت (snake_case إنجليزي) يُعرّف نوع القالب بشكل فريد
- **TemplateTypeRegistry**: سجل مركزي يربط المفاتيح الثابتة بتسميات الترجمة
- **Worker**: عامل الخلفية (BullMQ) المسؤول عن توليد تقارير PDF بشكل غير متزامن
- **القالب_الافتراضي**: القالب الوحيد المعتمد (Approved) والمُعلّم كافتراضي (is_default=1) لنوع معين
- **القالب_الاحتياطي**: قالب HTML مدمج في الكود يُستخدم عند عدم وجود قالب مخزن
- **المعاينة_السريعة**: تجميع Handlebars وعرض HTML في iframe بدون Puppeteer
- **المعاينة_الدقيقة**: توليد PDF حقيقي عبر Puppeteer وإعادته كملف قابل للتحميل
- **PdfSettings**: إعدادات توليد PDF (هوامش، خطوط، RTL، رأس/تذييل)

## Requirements

### المتطلب 1: توحيد خدمة القوالب

**قصة المستخدم:** بصفتي مطوراً، أريد خدمة قوالب PDF واحدة موحدة، حتى أتجنب التكرار والتناقض بين النسختين الحاليتين.

#### معايير القبول

1. THE PdfTemplateService SHALL provide CRUD operations (create, read, update, delete) for PDF templates from a single location in `packages/api/`, where create requires template_name (maximum 200 characters), template_type_key (one of the defined TemplateTypeKey values), and content (maximum 500 KB)
2. WHEN a template is created, THE PdfTemplateService SHALL assign a sequential version number starting from 1
3. WHEN a template content field is updated, THE PdfTemplateService SHALL increment the version number by 1, while updates to metadata fields only (template_name, status) SHALL NOT change the version number
4. WHEN a template is created or updated, THE PdfTemplateService SHALL record the username of the actor in the created_by field (on create) or updated_by field (on update) and the current timestamp in the corresponding created_at or updated_at field
5. THE PdfTemplateService SHALL return templates with boolean is_default values in the service layer regardless of the numeric storage format in the database
6. IF a delete operation targets a template where is_default is true and status is 'Approved', THEN THE PdfTemplateService SHALL reject the operation with an error message indicating that the default template cannot be deleted until another template is designated as default
7. IF a create or update operation provides content exceeding 500 KB or a template_name exceeding 200 characters, THEN THE PdfTemplateService SHALL reject the operation with an error message indicating which field exceeded its size limit

---

### المتطلب 2: وحدانية القالب الافتراضي

**قصة المستخدم:** بصفتي مسؤول نظام، أريد ضمان وجود قالب افتراضي واحد فقط لكل نوع، حتى لا يحدث تعارض عند توليد التقارير.

#### معايير القبول

1. WHEN a new template is marked as default for a given TemplateTypeKey, THE PdfTemplateService SHALL set is_default to false for any previously default template of the same type before setting the new template as default
2. THE database SHALL enforce a unique constraint on (template_type_key) WHERE is_default = 1 AND status = 'Approved' to prevent more than one default approved template per type
3. WHEN PdfTemplateService.getActiveByType is called with a valid TemplateTypeKey, THE PdfTemplateService SHALL return at most one template with status 'Approved' and is_default = true, or null if none exists
4. IF a template with status other than 'Approved' is requested to be marked as default, THEN THE PdfTemplateService SHALL reject the operation and return an error indicating that only Approved templates can be set as default
5. IF the database unique constraint is violated during a concurrent default assignment, THEN THE PdfTemplateService SHALL return an error indicating a conflict and not leave multiple defaults in place

---

### المتطلب 3: تحويل مفاتيح أنواع القوالب

**قصة المستخدم:** بصفتي مطوراً، أريد نظام مفاتيح ثابتة لأنواع القوالب، حتى تعمل الواجهة والخادم وWorker بنفس المعرّفات بغض النظر عن اللغة.

#### معايير القبول

1. THE TemplateTypeRegistry SHALL define exactly 8 TemplateTypeKey constants: "audit_report", "quarterly_report", "annual_report", "audit_plan", "audit_missions", "recommendations", "outgoing_letter", "general"
2. WHEN resolveTemplateTypeKey receives any non-empty input string, THE TemplateTypeRegistry SHALL return a valid TemplateTypeKey value from the 8 defined constants and never return undefined or throw an exception
3. WHEN resolveTemplateTypeKey receives one of the recognized Arabic labels ("تقرير التدقيق", "التقرير الربعي", "التقرير السنوي", "خطة التدقيق", "مهام التدقيق", "التوصيات", "خطاب صادر", "عام"), THE TemplateTypeRegistry SHALL map it to the corresponding TemplateTypeKey
4. WHEN resolveTemplateTypeKey receives a legacy English camelCase key ("auditReport", "quarterlyReport", "complianceRequirements", "activityAuditResults", "eventParticipationSummary", "monthlyDepartmentReport"), THE TemplateTypeRegistry SHALL map it to the corresponding TemplateTypeKey using the defined LEGACY_MAPPING
5. WHEN resolveTemplateTypeKey receives an unrecognized input string that does not match any entry in the legacy mapping, THE TemplateTypeRegistry SHALL return "general" as the fallback value
6. THE TemplateTypeRegistry SHALL export a single TEMPLATE_TYPES constant array (containing the 8 TemplateTypeKey definitions with their i18n label keys) that is imported by both the frontend and backend, so that adding or removing a key in one location is reflected in all consumers
7. IF resolveTemplateTypeKey receives an empty string, null, or undefined input, THEN THE TemplateTypeRegistry SHALL return "general" without throwing an exception
8. WHEN resolveTemplateTypeKey receives an input string that is already a valid TemplateTypeKey (e.g. "audit_report"), THE TemplateTypeRegistry SHALL return it unchanged without consulting the legacy mapping

---

### المتطلب 4: محرك PDF الموحد (PdfEngine)

**قصة المستخدم:** بصفتي مسؤول نظام، أريد محرك PDF واحد يعمل على الخادم عبر Puppeteer، حتى أحصل على نص متجه وترقيم صفحات حقيقي ودعم RTL موثوق.

#### معايير القبول

1. WHEN renderFromTemplate is called with RenderOptions containing non-null data, a complete PdfSettings object, and a language value of 'ar' or 'en', THE PdfEngine SHALL return a PdfResult with a buffer of length greater than 0 bytes
2. WHEN renderFromTemplate produces a PDF buffer, THE PdfEngine SHALL ensure the buffer starts with the PDF signature bytes (%PDF-)
3. WHEN renderFromTemplate produces a PDF buffer, THE PdfEngine SHALL set fileSize equal to buffer.length
4. IF RenderOptions includes a template with valid Handlebars syntax, THEN THE PdfEngine SHALL compile the template content using Handlebars with the provided data before rendering
5. IF RenderOptions does not include a template, THEN THE PdfEngine SHALL use the built-in fallback template corresponding to the templateTypeKey, defaulting to the 'general' fallback when templateTypeKey has no matching built-in template
6. WHEN PdfSettings specifies rtl_enabled as true, THE PdfEngine SHALL apply dir="rtl" to the document
7. WHEN PdfSettings specifies margin values, THE PdfEngine SHALL apply those margins to the generated PDF in millimeters
8. WHEN PdfSettings specifies header_template or footer_template, THE PdfEngine SHALL include them in the generated PDF
9. IF Puppeteer exceeds 30 seconds for rendering, THEN THE PdfEngine SHALL close the page and retry once
10. IF the retry attempt also exceeds 30 seconds, THEN THE PdfEngine SHALL close the page and throw an error indicating a rendering timeout, without returning a buffer
11. IF RenderOptions includes a template with invalid Handlebars syntax, THEN THE PdfEngine SHALL fall back to the built-in fallback template for the given templateTypeKey and log a warning indicating the compilation failure

---

### المتطلب 5: ربط Worker بالقوالب المخزنة

**قصة المستخدم:** بصفتي مستخدم، أريد أن يستخدم نظام توليد التقارير القوالب المخزنة فعلياً، حتى تنعكس تعديلات القوالب على التقارير المولّدة.

#### معايير القبول

1. WHEN a generate-pdf job is processed, THE Worker SHALL fetch the active template by calling PdfTemplateService.getActiveByType with the templateTypeKey from the job data, and SHALL fetch the current PDF settings from SettingsService before rendering
2. WHEN an active template exists for the requested type, THE Worker SHALL pass it along with the fetched PDF settings to PdfEngine.renderFromTemplate for PDF generation
3. IF no active template exists for the requested type, THEN THE Worker SHALL use PdfEngine.renderFallback with the built-in fallback template corresponding to the templateTypeKey
4. WHEN PDF generation completes successfully, THE Worker SHALL upload the buffer to MinIO storage under the key pattern `audits/{auditId}/reports/{reportId}.pdf` and update the report record status to "ready" with the storage key and file size
5. IF the audit data referenced by auditId does not exist, THEN THE Worker SHALL mark the report status as "failed" with an error message indicating the missing auditId, and throw an UnrecoverableError to prevent retries
6. IF the Worker fails after 3 retry attempts, THEN THE Worker SHALL update the report status to "failed" with the last error message from the failed attempt
7. WHEN a report generation request is received via API, THE API SHALL respond with HTTP 202 and a reportId while queuing the job for background processing
8. IF the active template contains invalid Handlebars syntax that fails compilation, THEN THE Worker SHALL fall back to PdfEngine.renderFallback with the built-in fallback template for that templateTypeKey and log a warning indicating the compilation error
9. IF the MinIO storage upload fails, THEN THE Worker SHALL allow BullMQ to retry the job according to the configured retry policy without updating the report status to "ready"

---

### المتطلب 6: محرر القوالب مع معاينة حية

**قصة المستخدم:** بصفتي مسؤول قوالب، أريد محرر كود مع معاينة حية للقالب، حتى أرى نتيجة تعديلاتي فوراً قبل الحفظ.

#### معايير القبول

1. THE Template_Editor SHALL provide a code editor with syntax highlighting for HTML and Handlebars
2. WHEN the user edits template content, THE Template_Editor SHALL send a debounced preview request after 800ms of inactivity
3. WHEN a preview-html request is received, THE PdfEngine.compilePreviewHtml SHALL compile the Handlebars template with user-provided sample data and return a complete HTML document ready for iframe rendering along with an errors array
4. WHEN Handlebars compilation succeeds, THE PdfEngine.compilePreviewHtml SHALL return an empty errors array
5. WHEN Handlebars compilation fails, THE PdfEngine.compilePreviewHtml SHALL return HTML containing the error indication and populate the errors array with at least the error message text and the line number where the error occurred
6. WHEN the user clicks the "preview PDF" button, THE system SHALL generate a PDF via Puppeteer within 30 seconds and return it as a downloadable blob
7. THE PdfEngine.compilePreviewHtml SHALL complete within 5ms without invoking Puppeteer or writing temporary files to disk
8. IF Puppeteer PDF generation fails or exceeds the 30-second timeout, THEN THE system SHALL display an error message indicating the failure reason and preserve the current editor content without changes

---

### المتطلب 7: ترحيل قاعدة البيانات

**قصة المستخدم:** بصفتي مطوراً، أريد ترحيل البيانات الحالية لتستخدم المفاتيح الثابتة الجديدة، حتى يعمل النظام الجديد مع البيانات الموجودة بدون فقدان.

#### معايير القبول

1. THE database migration SHALL add a template_type_key column of type VARCHAR(50) to the pdf_templates table with an initial default value of "general"
2. WHEN the migration runs, THE system SHALL populate template_type_key by mapping existing template_type values as follows: "تقرير التدقيق" or "Audit Report" → "audit_report", "التقرير الربعي" or "Quarterly Report" → "quarterly_report", "التقرير السنوي" or "Annual Report" → "annual_report", "خطة التدقيق" or "Audit Plan" → "audit_plan", "مهام التدقيق" or "Audit Missions" → "audit_missions", "التوصيات" or "Recommendations" → "recommendations", "خطاب صادر" or "Outgoing Letter" → "outgoing_letter"
3. IF an existing template_type value is NULL, empty, or does not match any known mapping, THEN THE migration SHALL assign "general" as the template_type_key
4. THE migration SHALL alter template_type_key to NOT NULL after all existing rows have been populated
5. THE migration SHALL create a partial composite index on (template_type_key, status) filtered by is_default = 1
6. THE migration SHALL create a unique partial index on (template_type_key) filtered by is_default = 1 AND status = 'Approved' to enforce one default template per type at the database level
7. THE migration SHALL preserve the original template_type column and its data unchanged
8. IF the migration fails at any step, THEN THE system SHALL roll back all changes within a single transaction leaving the pdf_templates table in its original state

---

### المتطلب 8: حالة التقرير وتتبع التقدم

**قصة المستخدم:** بصفتي مستخدم، أريد متابعة حالة التقرير بعد طلب توليده، حتى أعرف متى يكون جاهزاً للتحميل.

#### معايير القبول

1. WHEN a report generation is requested, THE system SHALL create a report record with status "pending" and return a reportId to the caller within 2 seconds of the request
2. WHEN PDF generation completes successfully, THE system SHALL update the report status to "ready" and store the storage key and file size in bytes in the report record
3. WHEN PDF generation fails after exhausting all retry attempts (maximum 3 attempts), THE system SHALL update the report status to "failed" with an error message indicating the cause of failure
4. WHEN the frontend polls for report status, THE API SHALL return the current status, and IF the status is "ready" THEN include the download URL, or IF the status is "failed" THEN include the error message
5. IF a report remains in "pending" status for longer than 5 minutes without any Worker activity, THEN THE system SHALL update its status to "failed" with an error message indicating a timeout
6. WHILE a report status is "pending", THE API status endpoint SHALL return the status as "pending" without a download URL or error message

---

### المتطلب 9: أمان القوالب

**قصة المستخدم:** بصفتي مسؤول أمان، أريد ضمان أن القوالب لا تُنفّذ كوداً ضاراً عند المعالجة، حتى يبقى النظام محمياً.

#### معايير القبول

1. WHEN a template is processed for PDF generation or preview rendering, THE PdfEngine SHALL sanitize the HTML content by removing script tags, iframe tags, and on-event attributes before rendering
2. THE PdfEngine SHALL block all external network requests during PDF rendering by intercepting page requests and allowing only data URIs and inline resources
3. IF template content exceeds 500KB in raw byte size, THEN THE PdfTemplateService SHALL reject the create or update operation and return an error response indicating the size limit has been exceeded
4. THE system SHALL enforce a rate limit of 10 preview requests per minute per user, and IF a user exceeds this limit, THEN THE system SHALL reject subsequent preview requests and return an error response indicating the rate limit has been reached until the current time window expires

---

### المتطلب 10: إدارة موارد Puppeteer

**قصة المستخدم:** بصفتي مطوراً، أريد إدارة فعالة لموارد Puppeteer، حتى لا يستنزف توليد PDF موارد الخادم.

#### معايير القبول

1. THE PdfEngine SHALL maintain a browser pool with a maximum of 3 concurrent browser instances
2. WHEN a browser instance has rendered 50 pages, THE PdfEngine SHALL recycle it by closing the instance and creating a new replacement instance to prevent memory leaks
3. WHEN the first PDF render request is received, THE PdfEngine SHALL initialize the Puppeteer browser pool on demand rather than at server startup
4. WHEN PdfEngine.dispose is called, THE PdfEngine SHALL close all browser instances and release all pool resources within 10 seconds
5. THE PdfEngine SHALL cache compiled Handlebars templates using an LRU cache keyed by template ID and version number with a maximum capacity of 100 entries
6. IF all 3 browser instances are in use when a new render request arrives, THEN THE PdfEngine SHALL queue the request and fulfill it when an instance becomes available, with a maximum wait time of 30 seconds before returning a timeout error
7. IF a browser instance crashes or becomes unresponsive during rendering, THEN THE PdfEngine SHALL remove the failed instance from the pool, create a replacement instance, and return an error for the in-progress render request
