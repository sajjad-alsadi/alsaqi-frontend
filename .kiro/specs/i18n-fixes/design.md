# تصميم إصلاح الترجمة (i18n Fixes)

## نظرة عامة

يعالج هذا التصميم مشاكل الترجمة في نظام الساقي عبر 5 مراحل مرتبة حسب الأولوية. الاستراتيجية الأساسية هي: جميع النصوص المعروضة للمستخدم يجب أن تمر عبر `t()` من i18next، والخادم يرسل مفاتيح ترجمة بدلاً من نصوص مباشرة.

## الحالة الحالية

- ملفا الترجمة (`ar.json` و `en.json`) متطابقان بـ 2350 مفتاح
- إعداد i18next سليم مع دعم RTL/LTR
- معظم واجهة المستخدم تستخدم `t()` بشكل صحيح
- المشاكل: ~16 مفتاح ناقص، ~30 رسالة خادم بالعربي، ~80 نص مباشر في خدمات التصدير

## استراتيجية الحل

### المرحلة 1: المفاتيح الناقصة

**المشكلة**: مفاتيح مستخدمة في الكود مع `|| 'fallback'` لكنها غير موجودة في ملفات الترجمة.

**الحل**:
1. إضافة المفاتيح التالية إلى `ar.json` و `en.json`:

```json
// في common.*
"common.loadMore": "تحميل المزيد" / "Load More"
"common.now": "الآن" / "Now"
"common.skipToContent": "تخطي إلى المحتوى الرئيسي" / "Skip to main content"
"common.expandSidebar": "توسيع القائمة الجانبية" / "Expand sidebar"
"common.collapseSidebar": "طي القائمة الجانبية" / "Collapse sidebar"
"common.hideHeader": "إخفاء الشريط العلوي" / "Hide header"
"common.showHeader": "إظهار الشريط العلوي" / "Show header"
"common.networkErrorDesc": "يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى." / "Please check your internet connection and try again."
"common.errorDesc": "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى." / "An unexpected error occurred. Please try again."
"common.retry": "إعادة المحاولة" / "Try Again"

// في auth.*
"auth.invalidCredentials": "اسم المستخدم أو كلمة المرور غير صحيحة" / "Invalid username or password"
"auth.accountSuspended": "تم إيقاف حسابك" / "Your account has been suspended"
"auth.accountLocked": "حسابك مقفل. حاول مرة أخرى لاحقاً." / "Your account is locked. Try again later."

// في plan.*
"plan.selectLeadAuditor": "اختر المدقق الرئيسي" / "Select Lead Auditor"

// في userManagement.*
"userManagement.form.loadingRoles": "جاري تحميل الأدوار..." / "Loading roles..."

// في settings.*
"settings.userId": "معرف المستخدم" / "User ID"
```

2. إضافة مفاتيح `orgTypes.*`:

```json
"orgTypes": {
  "Top Management": "الإدارة العليا" / "Top Management",
  "Department": "قسم" / "Department",
  "Division": "شعبة" / "Division",
  "Unit": "وحدة" / "Unit",
  "Branch": "فرع" / "Branch",
  "Office": "مكتب" / "Office",
  "Committee": "لجنة" / "Committee",
  "Other": "أخرى" / "Other"
}
```

3. إزالة جميع أنماط `|| 'fallback'` من الكود بعد إضافة المفاتيح.

---

### المرحلة 2: رسائل الخادم

**المشكلة**: الخادم يكتب رسائل إشعارات بالعربي مباشرة في قاعدة البيانات.

**الاستراتيجية**: تحويل الخادم لإرسال مفاتيح ترجمة مع متغيرات (interpolation) بدلاً من نصوص مباشرة. العميل يترجم عند العرض.

**التنفيذ**:

1. إنشاء ملف `src/server/utils/notificationKeys.ts`:
```typescript
export const NOTIFICATION_KEYS = {
  RISK_ADDED: 'notifications.riskAdded',
  RECOMMENDATION_ADDED: 'notifications.recommendationAdded',
  TASK_ASSIGNED: 'notifications.taskAssigned',
  FINDING_ADDED: 'notifications.findingAdded',
  EVIDENCE_UPLOADED: 'notifications.evidenceUploaded',
  TASK_STATUS_CHANGED: 'notifications.taskStatusChanged',
  COMMENT_ADDED: 'notifications.commentAdded',
  PERMISSIONS_CHANGED: 'notifications.permissionsChanged',
  TASK_DEADLINE_NEAR: 'notifications.taskDeadlineNear',
} as const;
```

2. تعديل `crudGenerator.ts` و routes لإرسال:
```typescript
// بدلاً من: notifMessage = `تم إضافة خطر جديد: ${body.description}`
// يصبح:
notifMessage = JSON.stringify({ 
  key: 'notifications.riskAdded', 
  params: { description: body.description || body.risk_id || '' }
});
```

3. إضافة مفاتيح الإشعارات إلى ملفات الترجمة:
```json
"notifications": {
  "riskAdded": "تم إضافة خطر جديد: {{description}}",
  "recommendationAdded": "تمت إضافة توصية جديدة مسندة إليك",
  "taskAssigned": "تم تعيين مهمة جديدة لك: {{title}}",
  "findingAdded": "تم إضافة ملاحظة تدقيق جديدة: {{title}}",
  "evidenceUploaded": "تم رفع دليل جديد: {{description}}",
  "taskStatusChanged": "حالة المهمة \"{{title}}\" تغيرت إلى {{status}}",
  "commentAdded": "{{actor}} أضاف تعليقاً على {{type}}",
  "permissionsChanged": "تم تغيير صلاحياتك بواسطة {{actor}}. {{details}}",
  "taskDeadlineNear": "المهمة \"{{title}}\" تنتهي خلال 3 أيام ({{date}})"
}
```

4. تعديل العميل (عند عرض الإشعارات) لفك تشفير المفتاح وترجمته:
```typescript
const translateNotification = (description: string) => {
  try {
    const parsed = JSON.parse(description);
    if (parsed.key) return t(parsed.key, parsed.params);
  } catch {}
  return description; // fallback للرسائل القديمة
};
```

---

### المرحلة 3: خدمات التصدير

**المشكلة**: `docxExport.ts` و `pdfService.ts` تستخدم `isRtl ? 'عربي' : 'English'` بدلاً من `t()`.

**الحل**:
1. إضافة مفاتيح تحت namespace `export.*`:
```json
"export": {
  "internalUseOnly": "للاستخدام الداخلي" / "Internal Use Only",
  "auditDepartment": "قسم الرقابة والتدقيق الداخلي" / "Internal Audit Department",
  "page": "صفحة" / "Page",
  "companyName": "شركة الساقي لخدمات الدفع الإلكتروني" / "Al-Saqi E-Payment Services",
  "quarterlyReport": "التقرير الفصلي للرقابة والتدقيق الداخلي" / "Quarterly Internal Audit Report",
  "tableOfContents": "فهرس المحتويات" / "Table of Contents",
  "executiveSummary": "الملخص التنفيذي" / "Executive Summary",
  "reportIntroduction": "مقدمة التقرير" / "Report Introduction",
  "quarterlyPlanVsAchieved": "الخطة الفصلية مقابل المنجز" / "Quarterly Plan vs. Achieved",
  "completedEngagements": "الأعمال والمهمات التدقيقية المنجزة" / "Completed Audit Engagements",
  "materialFindings": "الملاحظات الجوهرية والنتائج الرقابية" / "Material Findings and Audit Results",
  "previousRecommendations": "حالة تنفيذ التوصيات السابقة" / "Status of Previous Recommendations",
  "auditIssues": "القضايا الرقابية والتحديات" / "Audit Issues and Challenges",
  "needsAndSupport": "الاحتياجات والدعم المطلوب" / "Needs and Required Support",
  "nextQuarterPriorities": "أولويات الفصل القادم" / "Priorities for Next Quarter",
  "conclusion": "الخاتمة" / "Conclusion",
  "signaturesAndApproval": "التوقيعات والاعتماد" / "Signatures and Approval",
  "noData": "لا توجد بيانات" / "No data available",
  "internalAuditReport": "تقرير التدقيق الداخلي" / "Internal Audit Report",
  "planCode": "رمز الخطة" / "Plan Code",
  "leadAuditor": "المدقق الرئيسي" / "Lead Auditor",
  "tasks": "المهام" / "Tasks",
  "findings": "النتائج" / "Findings",
  "recommendations": "التوصيات" / "Recommendations"
}
```

2. تمرير دالة `t` إلى خدمات التصدير أو استيراد i18n مباشرة:
```typescript
import i18n from '../i18n';
const t = i18n.t.bind(i18n);
// ثم استخدام: t('export.companyName') بدلاً من isRtl ? 'شركة...' : 'Al-Saqi...'
```

---

### المرحلة 4: واجهة المستخدم

**المشكلة**: بعض المكونات تحتوي على `aria-label` و `placeholder` و نصوص تعليمية مكتوبة مباشرة.

**الحل**:
1. إضافة مفاتيح accessibility:
```json
"accessibility": {
  "breadcrumb": "مسار التنقل" / "Breadcrumb",
  "mainNavigation": "القائمة الرئيسية" / "Main navigation",
  "mainMenu": "القائمة الرئيسية" / "Main menu",
  "loading": "جاري التحميل" / "Loading",
  "closeModal": "إغلاق" / "Close",
  "pagination": "التنقل بين الصفحات" / "Pagination"
}
```

2. إضافة مفاتيح placeholders:
```json
"placeholders": {
  "riskId": "R-001",
  "entityCode": "DEPT-001",
  "emailRecipients": "email@example.com"
}
```

3. نقل النص التعليمي في `PdfTemplateManagement.tsx` إلى مفتاح ترجمة.

4. إصلاح `ComplianceMatrixPage.tsx` - استبدال النص المختلط بمفتاح ترجمة كامل.

---

### المرحلة 5: تحسينات بنيوية

**المشكلة**: تكرار مفاتيح بين المستوى الأعلى و `common.*`، وعدم تناسق في التسمية.

**الحل** (تدريجي - لا يكسر الكود الحالي):
1. توثيق المفاتيح المكررة
2. تحديث الكود تدريجياً لاستخدام المفاتيح تحت `common.*` فقط
3. إزالة المفاتيح المكررة من المستوى الأعلى بعد التأكد من عدم استخدامها

## ملاحظات التنفيذ

- **التوافق العكسي**: رسائل الإشعارات القديمة (المخزنة كنص عربي) يجب أن تستمر بالعمل - لذلك نستخدم `try/catch` عند محاولة فك JSON
- **الاختبار**: بعد كل مرحلة، تشغيل `npm run build` للتأكد من عدم وجود أخطاء
- **ملفات الترجمة**: يجب أن يبقى `ar.json` و `en.json` متطابقين في البنية دائماً
- **الخادم**: لا يحتاج الخادم لمكتبة i18next - يكفي إرسال المفاتيح والعميل يترجم
