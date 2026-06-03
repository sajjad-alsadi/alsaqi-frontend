# Implementation Plan: إصلاح مفاتيح ترجمة i18n في JobTitles و Recommendations

## Overview

خطة التنفيذ تتبع منهجية Bugfix التدريجية: أولاً استكشاف الخلل عبر اختبار property-based يفشل على الكود الأصلي (Property 1)، ثم توثيق السلوك الأساسي الواجب الحفاظ عليه (Property 2)، ثم تطبيق الإصلاح في أربعة ملفات (ar.json، en.json، JobTitles.tsx)، وأخيراً التحقق من إصلاح الخلل وعدم ظهور أي انحدار.

الخلل ناتج عن سببين:
1. تعارض بنيوي: `jobTitles` مُعرَّف كنص عادي لكن المكوّن يستخدم مفاتيح فرعية بصيغة نقطية
2. مفتاح مفقود: `recommendations.noRecommendations` غير موجود في ملفات الترجمة

## Tasks

- [x] 1. كتابة اختبار استكشافي لشرط الخلل (قبل الإصلاح)
  - **Property 1: Bug Condition** - مفاتيح الترجمة الفرعية تفشل بسبب تعارض بنيوي ومفتاح مفقود
  - **CRITICAL**: يجب أن يفشل هذا الاختبار على الكود غير المُصلَح — الفشل يثبت وجود الخلل
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: هذا الاختبار يُشفّر السلوك المتوقع — سيُصبح اختبار التحقق بعد الإصلاح
  - **GOAL**: استخراج counterexamples تُثبت وجود الخلل
  - **Scoped PBT Approach**: تحديد الحالات المحددة: جميع مفاتيح `jobTitles.*` الفرعية و `recommendations.noRecommendations`
  - اختبار أن `t('jobTitles.staff')`, `t('jobTitles.executive')`, `t('jobTitles.manager')`, `t('jobTitles.officer')` تُعيد نصاً مترجماً غير فارغ (لا يبدأ بـ `⚠️`)
  - اختبار أن `t('jobTitles.active')`, `t('jobTitles.inactive')` تُعيد نصاً مترجماً
  - اختبار أن `t('jobTitles.failedToSaveJobTitle')`, `t('jobTitles.failedToDeleteJobTitle')` تُعيد رسائل خطأ مُترجمة
  - اختبار أن `t('recommendations.noRecommendations')` تُعيد نصاً مترجماً
  - شرط الخلل من التصميم: `isBugCondition(input)` حيث `input.key STARTS WITH "jobTitles." AND typeof(localeResource["jobTitles"]) = "string"` أو `input.key = "recommendations.noRecommendations" AND NOT keyExists(localeResource, "recommendations.noRecommendations")`
  - السلوك المتوقع: لكل مدخل يحقق شرط الخلل، `result IS NOT EMPTY AND result DOES NOT START WITH "⚠️" AND result ≠ input.key`
  - تشغيل الاختبار على الكود غير المُصلَح
  - **EXPECTED OUTCOME**: يفشل الاختبار (هذا صحيح — يُثبت وجود الخلل)
  - توثيق counterexamples: `t('jobTitles.staff')` تُعيد `⚠️ [jobTitles.staff]`، `t('recommendations.noRecommendations')` تُعيد `⚠️ [recommendations.noRecommendations]`
  - اعتبار المهمة مكتملة عند كتابة الاختبار وتشغيله وتوثيق الفشل
  - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [x] 2. كتابة اختبارات property-based للحفاظ على السلوك (قبل الإصلاح)
  - **Property 2: Preservation** - المفاتيح غير المتأثرة بالخلل تبقى دون تغيير بعد الإصلاح
  - **IMPORTANT**: اتبع منهجية الملاحظة أولاً (observation-first)
  - الملاحظة على الكود غير المُصلَح:
    - `t('common.jobTitles')` تُعيد "المسميات الوظيفية" (ar) / "Job Titles" (en)
    - `t('userManagement.title')` ومفاتيح أخرى على نفس المستوى تعمل بشكل صحيح
    - `t('recommendations.title')`, `t('recommendations.noRecommendationTextFound')` تعمل بشكل صحيح
    - المفاتيح المفقودة فعلاً (مثل `t('nonexistent.key')`) تُفعّل `⚠️ [nonexistent.key]`
  - كتابة property-based test: لكل مسار مفتاح ترجمة في ملفات اللغة لا يحقق isBugCondition، القيمة المحلولة يجب أن تكون متطابقة قبل وبعد الإصلاح
  - تحميل ملفات JSON الأصلية والمُصلَحة، سرد جميع المسارات الصالحة مع استبعاد مفاتيح شرط الخلل، والتحقق من تطابق القيم
  - التحقق من أن الاختبارات تنجح على الكود غير المُصلَح
  - **EXPECTED OUTCOME**: تنجح الاختبارات (تُثبت السلوك الأساسي المراد الحفاظ عليه)
  - اعتبار المهمة مكتملة عند كتابة الاختبارات وتشغيلها والتأكد من نجاحها على الكود الأصلي
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. إصلاح خلل الترجمة: إعادة هيكلة jobTitles وإضافة المفتاح المفقود

  - [x] 3.1 إعادة هيكلة `jobTitles` من نص عادي إلى كائن في `src/locales/ar.json`
    - إزالة: `"jobTitles": "المسميات الوظيفية"`
    - إضافة كائن بالمفاتيح الفرعية: `title` ("المسميات الوظيفية"), `executive` ("تنفيذي"), `manager` ("مدير"), `officer` ("ضابط"), `staff` ("موظف"), `active` ("نشط"), `inactive` ("غير نشط"), `failedToSaveJobTitle` ("فشل في حفظ المسمى الوظيفي"), `failedToDeleteJobTitle` ("فشل في حذف المسمى الوظيفي")
    - _Bug_Condition: isBugCondition(input) حيث input.key STARTS WITH "jobTitles." AND typeof(localeResource["jobTitles"]) = "string"_
    - _Expected_Behavior: جميع مفاتيح jobTitles.* الفرعية تُحل إلى ترجمات عربية_
    - _Preservation: common.jobTitles وجميع المفاتيح المجاورة تبقى دون تغيير_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_

  - [x] 3.2 إعادة هيكلة `jobTitles` من نص عادي إلى كائن في `src/locales/en.json`
    - إزالة: `"jobTitles": "Job Titles"`
    - إضافة كائن بالمفاتيح الفرعية: `title` ("Job Titles"), `executive` ("Executive"), `manager` ("Manager"), `officer` ("Officer"), `staff` ("Staff"), `active` ("Active"), `inactive` ("Inactive"), `failedToSaveJobTitle` ("Failed to save job title"), `failedToDeleteJobTitle` ("Failed to delete job title")
    - _Bug_Condition: isBugCondition(input) حيث input.key STARTS WITH "jobTitles." AND typeof(localeResource["jobTitles"]) = "string"_
    - _Expected_Behavior: جميع مفاتيح jobTitles.* الفرعية تُحل إلى ترجمات إنجليزية_
    - _Preservation: common.jobTitles وجميع المفاتيح المجاورة تبقى دون تغيير_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_

  - [x] 3.3 إضافة مفتاح `noRecommendations` المفقود في كلا ملفي اللغة
    - إضافة `"noRecommendations": "لا توجد توصيات"` داخل كائن `recommendations` في `src/locales/ar.json`
    - إضافة `"noRecommendations": "No recommendations found"` داخل كائن `recommendations` في `src/locales/en.json`
    - _Bug_Condition: isBugCondition(input) حيث input.key = "recommendations.noRecommendations" AND NOT keyExists(localeResource, "recommendations.noRecommendations")_
    - _Expected_Behavior: t('recommendations.noRecommendations') تُعيد نصاً مترجماً_
    - _Preservation: المفاتيح الموجودة مثل recommendations.title و recommendations.noRecommendationTextFound تبقى دون تغيير_
    - _Requirements: 2.5, 3.3_

  - [x] 3.4 تحديث مرجع عنوان الصفحة في `src/modules/JobTitles.tsx`
    - استبدال `t('jobTitles')` بـ `t('common.jobTitles')` في عنوان الصفحة (السطر 144) وعنوان عمود الجدول (السطر 249)
    - هذا يضمن استمرار عرض "المسميات الوظيفية" / "Job Titles" عبر مفتاح common الموجود مسبقاً
    - _Bug_Condition: t('jobTitles') على الكائن المُعاد هيكلته يُعيد [object Object] بدلاً من نص_
    - _Expected_Behavior: t('common.jobTitles') تُعيد نص عنوان الصفحة_
    - _Preservation: common.jobTitles موجود مسبقاً ومُستخدم من DepartmentManagement.tsx_
    - _Requirements: 2.4, 3.1_

  - [x] 3.5 التحقق من نجاح اختبار شرط الخلل الاستكشافي بعد الإصلاح
    - **Property 1: Expected Behavior** - مفاتيح الترجمة الفرعية تُحل بشكل صحيح بعد الإصلاح
    - **IMPORTANT**: أعد تشغيل نفس الاختبار من المهمة 1 — لا تكتب اختباراً جديداً
    - الاختبار من المهمة 1 يُشفّر السلوك المتوقع
    - عند نجاح هذا الاختبار، يُثبت تحقق السلوك المتوقع
    - تشغيل الاختبار الاستكشافي من الخطوة 1
    - **EXPECTED OUTCOME**: ينجح الاختبار (يُثبت إصلاح الخلل)
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

  - [x] 3.6 التحقق من استمرار نجاح اختبارات الحفاظ على السلوك
    - **Property 2: Preservation** - المفاتيح غير المتأثرة بالخلل تبقى دون تغيير بعد الإصلاح
    - **IMPORTANT**: أعد تشغيل نفس الاختبارات من المهمة 2 — لا تكتب اختبارات جديدة
    - تشغيل اختبارات property-based للحفاظ على السلوك من الخطوة 2
    - **EXPECTED OUTCOME**: تنجح الاختبارات (لا انحدار)
    - التحقق من: common.jobTitles، المفاتيح المجاورة، مفاتيح recommendations الموجودة، سلوك parseMissingKeyHandler

- [x] 4. نقطة تحقق — التأكد من نجاح جميع الاختبارات
  - تشغيل مجموعة الاختبارات الكاملة: `npx vitest --run`
  - التأكد من نجاح الاختبار الاستكشافي لشرط الخلل (Property 1)
  - التأكد من نجاح اختبارات الحفاظ على السلوك (Property 2)
  - التأكد من نجاح جميع اختبارات الوحدة الأخرى في المشروع
  - اسأل المستخدم إذا ظهرت أي مشاكل أو استفسارات

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "wave": 3, "tasks": ["3.5", "3.6"] },
    { "wave": 4, "tasks": ["4"] }
  ]
}
```

## Notes

- **ترتيب التنفيذ حاسم**: يجب كتابة وتشغيل الاختبارات (المهام 1 و 2) قبل تطبيق أي إصلاح
- **المهمة 1 ستفشل عمداً**: هذا متوقع ومطلوب — الفشل هو الدليل على وجود الخلل
- **المهمة 2 يجب أن تنجح**: قبل الإصلاح، للتحقق من السلوك الأساسي الذي يجب الحفاظ عليه
- **إطار الاختبار**: Vitest + React Testing Library (موجود في المشروع)
- **تشغيل الاختبارات**: `npx vitest --run` للتشغيل المرة الواحدة (بدون watch mode)
- **الملفات المتأثرة**: `src/locales/ar.json`، `src/locales/en.json`، `src/modules/JobTitles.tsx`
- **لا تعديلات إضافية**: الإصلاح محدود بهذه الملفات فقط دون إدخال مكتبات أو تغييرات بنيوية إضافية
- **مفتاح common.jobTitles**: موجود مسبقاً ومُستخدم من مكوّنات أخرى — لا حاجة لإضافته
