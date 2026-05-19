# Implementation Plan

## Overview

إصلاح جميع مشاكل الترجمة في نظام الساقي عبر 5 مراحل. المهام مرتبة حسب الأولوية والتبعيات: المرحلة 1 (المفاتيح الناقصة) أولاً لأنها الأساس، ثم المرحلة 2 (الخادم)، ثم المراحل 3-5 بالتوازي.

## Tasks

- [x] 1. إضافة المفاتيح الناقصة إلى ملفات الترجمة
  - [x] 1.1 إضافة مفاتيح `common.*` الناقصة (`loadMore`, `now`, `skipToContent`, `expandSidebar`, `collapseSidebar`, `hideHeader`, `showHeader`, `networkErrorDesc`, `errorDesc`, `retry`) إلى `src/locales/ar.json` و `src/locales/en.json`
  - [x] 1.2 إضافة مفاتيح `auth.*` الناقصة (`invalidCredentials`, `accountSuspended`, `accountLocked`) إلى ملفي الترجمة
  - [x] 1.3 إضافة مفاتيح `plan.selectLeadAuditor`, `userManagement.form.loadingRoles`, `settings.userId` إلى ملفي الترجمة
  - [x] 1.4 إضافة كائن `orgTypes` كامل بـ 8 مفاتيح (`Top Management`, `Department`, `Division`, `Unit`, `Branch`, `Office`, `Committee`, `Other`) إلى ملفي الترجمة
  - [x] 1.5 إزالة جميع أنماط `|| 'fallback'` من الملفات التالية: `Layout.tsx`, `ErrorState.tsx`, `Login.tsx`, `NotificationToast.tsx`, `Notifications.tsx`, `UserDetailsModal.tsx`, `UserForm.tsx`, `AuditPlanForm.tsx`

- [x] 2. نقل رسائل إشعارات الخادم إلى مفاتيح ترجمة
  - [x] 2.1 إضافة كائن `notifications.*` بجميع مفاتيح الإشعارات (riskAdded, recommendationAdded, taskAssigned, findingAdded, evidenceUploaded, taskStatusChanged, commentAdded, permissionsChanged, taskDeadlineNear) مع دعم interpolation إلى `ar.json` و `en.json`
  - [x] 2.2 تعديل `src/server/utils/crudGenerator.ts` لإرسال مفاتيح ترجمة بصيغة JSON بدلاً من نصوص عربية مباشرة
  - [x] 2.3 تعديل `src/server/routes/auditTasks.ts` لإرسال مفاتيح ترجمة بدلاً من النصوص العربية المباشرة
  - [x] 2.4 تعديل `src/server/routes/comments.ts` لإرسال مفاتيح ترجمة بدلاً من النصوص العربية المباشرة
  - [x] 2.5 تعديل `src/server/routes/users.ts` لإرسال مفاتيح ترجمة بدلاً من النصوص العربية المباشرة
  - [x] 2.6 تعديل `src/server/cron/index.ts` لإرسال مفاتيح ترجمة بدلاً من النصوص العربية المباشرة
  - [x] 2.7 تعديل عرض الإشعارات في العميل (Notifications.tsx, NotificationToast.tsx, NotificationBell.tsx) لفك تشفير مفاتيح الترجمة وترجمتها عند العرض مع دعم الرسائل القديمة كـ fallback

- [x] 3. نقل نصوص خدمات التصدير إلى ملفات الترجمة
  - [x] 3.1 إضافة كائن `export.*` بجميع مفاتيح التصدير (~25 مفتاح) إلى `ar.json` و `en.json`
  - [x] 3.2 تعديل `src/utils/docxExport.ts` لاستخدام `i18n.t()` بدلاً من أنماط `isRtl ? 'عربي' : 'English'`
  - [x] 3.3 تعديل `src/services/pdfService.ts` لاستخدام `i18n.t()` بدلاً من النصوص المباشرة
  - [x] 3.4 تعديل `src/utils/pdfExport.ts` لاستخدام `i18n.t()` بدلاً من النصوص المباشرة
  - [x] 3.5 تعديل `src/utils/notificationHelpers.ts` لاستخدام `t()` مع مفاتيح الترجمة بدلاً من شروط `language === 'ar'`

- [x] 4. إصلاح النصوص المباشرة في واجهة المستخدم
  - [x] 4.1 إضافة مفاتيح `accessibility.*` و `placeholders.*` إلى ملفي الترجمة
  - [x] 4.2 تعديل `src/components/LoadingSpinner.tsx`, `Modal.tsx`, `Breadcrumb.tsx`, `Pagination.tsx` لاستخدام `t()` في aria-labels
  - [x] 4.3 تعديل `src/components/PdfTemplateManagement.tsx` لنقل النص التعليمي العربي إلى مفتاح ترجمة
  - [x] 4.4 تعديل `src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx` لإزالة النص العربي المختلط واستخدام مفتاح ترجمة كامل
  - [x] 4.5 تعديل `src/modules/OrgStructure/OrgStructurePage.tsx` و `src/modules/Reports/components/ScheduleReportModal.tsx` لترجمة placeholders

- [x] 5. تحسين بنية ملفات الترجمة
  - [x] 5.1 توثيق المفاتيح المكررة بين المستوى الأعلى و `common.*` (مثل `active`, `closed`, `open`, `status`, `delete`, `save`, `cancel`)
  - [x] 5.2 تحديث المكونات التي تستخدم المفاتيح من المستوى الأعلى لاستخدام `common.*` بدلاً منها
  - [x] 5.3 إزالة المفاتيح المكررة من المستوى الأعلى بعد التأكد من عدم استخدامها في أي مكان

## Task Dependency Graph

```json
{
  "waves": [
    {
      "name": "Wave 1 - المفاتيح الناقصة",
      "tasks": [1],
      "description": "إضافة جميع مفاتيح الترجمة الناقصة وإزالة fallback values"
    },
    {
      "name": "Wave 2 - الخادم والتصدير وواجهة المستخدم",
      "tasks": [2, 3, 4],
      "description": "نقل النصوص المباشرة إلى ملفات الترجمة",
      "dependencies": {
        "2": [1],
        "4": [1]
      }
    },
    {
      "name": "Wave 3 - التحسينات البنيوية",
      "tasks": [5],
      "description": "إزالة التكرار وتوحيد التسمية",
      "dependencies": {
        "5": [1, 2, 3, 4]
      }
    }
  ]
}
```

## Notes

- المهمة 5 (التحسينات البنيوية) يجب تنفيذها أخيراً لأنها تعتمد على استقرار جميع المهام السابقة
- المهمة 2.7 (تعديل العميل) يجب أن تدعم الرسائل القديمة المخزنة كنص عربي مباشر (backward compatibility)
- بعد كل مهمة، يجب تشغيل `npm run build` للتأكد من عدم وجود أخطاء TypeScript
- ملفا الترجمة يجب أن يبقيا متطابقين في البنية (نفس المفاتيح بالضبط)
