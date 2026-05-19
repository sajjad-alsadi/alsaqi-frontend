# Duplicate Translation Keys

## Overview

Keys that exist at both root level and inside `common.*` in the locale files (`src/locales/ar.json` and `src/locales/en.json`).
These should be consolidated to use only the `common.*` namespace to avoid confusion and reduce maintenance burden.

## Method

Duplicates were identified by comparing all root-level string keys in `ar.json` against keys that also exist directly inside the `common` object.

## Duplicates Found

| # | Root Key | Common Key | Root Value (AR) | Common Value (AR) | Same? |
|---|----------|-----------|-----------------|-------------------|-------|
| 1 | `active` | `common.active` | نشط | نشط | ✅ |
| 2 | `add` | `common.add` | إضافة | إضافة | ✅ |
| 3 | `addNew` | `common.addNew` | إضافة جديد | إضافة جديد | ✅ |
| 4 | `allDepartments` | `common.allDepartments` | جميع الأقسام | جميع الأقسام | ✅ |
| 5 | `aml` | `common.aml` | غسل أموال | غسل أموال | ✅ |
| 6 | `askAboutPolicies` | `common.askAboutPolicies` | اسأل عن السياسات أو القوانين... | اسأل عن السياسات أو القوانين... | ✅ |
| 7 | `cancel` | `common.cancel` | إلغاء | إلغاء | ✅ |
| 8 | `close` | `common.close` | إغلاق | إغلاق | ✅ |
| 9 | `closed` | `common.closed` | مغلق | مغلق | ✅ |
| 10 | `compliance` | `common.compliance` | الامتثال | امتثال | ❌ |
| 11 | `completed` | `common.completed` | مكتمل | مكتمل | ✅ |
| 12 | `critical` | `common.critical` | حرج | حرج | ✅ |
| 13 | `delete` | `common.delete` | حذف | حذف | ✅ |
| 14 | `department` | `common.department` | القسم | القسم | ✅ |
| 15 | `description` | `common.description` | الوصف | الوصف | ✅ |
| 16 | `details` | `common.details` | التفاصيل | التفاصيل | ✅ |
| 17 | `download` | `common.download` | تحميل | تحميل | ✅ |
| 18 | `edit` | `common.edit` | تعديل | تعديل | ✅ |
| 19 | `financial` | `common.financial` | مالي | مالي | ✅ |
| 20 | `governance` | `common.governance` | الحوكمة | الحوكمة | ✅ |
| 21 | `high` | `common.high` | عالي | عالي | ✅ |
| 22 | `id` | `common.id` | المعرف | المعرف | ✅ |
| 23 | `implemented` | `common.implemented` | مُنفذ | تم التنفيذ | ❌ |
| 24 | `inProgress` | `common.inProgress` | قيد التنفيذ | قيد التنفيذ | ✅ |
| 25 | `internalPolicies` | `common.internalPolicies` | السياسات الداخلية | السياسات الداخلية | ✅ |
| 26 | `it` | `common.it` | تقنية معلومات | تقنية معلومات | ✅ |
| 27 | `localPolicySearch` | `common.localPolicySearch` | بحث محلي في السياسات والقوانين | بحث محلي في السياسات والقوانين | ✅ |
| 28 | `logout` | `common.logout` | تسجيل خروج | تسجيل خروج | ✅ |
| 29 | `low` | `common.low` | منخفض | منخفض | ✅ |
| 30 | `medium` | `common.medium` | متوسط | متوسط | ✅ |
| 31 | `open` | `common.open` | مفتوح | مفتوح | ✅ |
| 32 | `operational` | `common.operational` | تشغيلي | تشغيلي | ✅ |
| 33 | `overdue` | `common.overdue` | متأخر | متأخر | ✅ |
| 34 | `planTasks` | `common.planTasks` | مهام الخطة | مهام التدقيق | ❌ |
| 35 | `risks` | `common.risks` | المخاطر | سجل المخاطر | ❌ |
| 36 | `save` | `common.save` | حفظ | حفظ | ✅ |
| 37 | `search` | `common.search` | بحث | بحث... | ❌ |
| 38 | `searchAssistant` | `common.searchAssistant` | مساعد البحث | مساعد البحث | ✅ |
| 39 | `selectDepartment` | `common.selectDepartment` | اختر القسم | اختر القسم | ✅ |
| 40 | `status` | `common.status` | الحالة (string) | {object} | ⚠️ type mismatch |
| 41 | `statusUpdated` | `common.statusUpdated` | تم تحديث الحالة | تم تحديث الحالة بنجاح | ❌ |
| 42 | `user` | `common.user` | المستخدم | المستخدم | ✅ |
| 43 | `viewFile` | `common.viewFile` | عرض الملف | عرض الملف | ✅ |

## Summary

| Category | Count |
|----------|-------|
| **Total duplicates** | 43 |
| **Exact matches** (same value) | 36 |
| **Different values** (same type) | 6 |
| **Type mismatches** | 1 |

## Notes on Differences

### Different Values (need manual decision)

1. **`compliance`**: Root uses "الامتثال" (with definite article), common uses "امتثال" (without). Recommend keeping "الامتثال" as it's more grammatically correct in context.

2. **`implemented`**: Root uses "مُنفذ" (adjective form), common uses "تم التنفيذ" (past tense phrase). These serve different contexts - decide which is more appropriate.

3. **`planTasks`**: Root uses "مهام الخطة" (plan tasks), common uses "مهام التدقيق" (audit tasks). These are semantically different and may need separate keys.

4. **`risks`**: Root uses "المخاطر" (the risks), common uses "سجل المخاطر" (risk register). These are semantically different - the common version is a navigation label.

5. **`search`**: Root uses "بحث" (search), common uses "بحث..." (search with ellipsis - placeholder style). Minor difference, recommend standardizing.

6. **`statusUpdated`**: Root uses "تم تحديث الحالة" (status updated), common uses "تم تحديث الحالة بنجاح" (status updated successfully). Common version is more descriptive.

### Type Mismatch

- **`status`**: Root level is a string ("الحالة"), while `common.status` is an object containing sub-keys (`active`, `inactive`, `locked`, `suspended`, `pending`, `approved`, `rejected`, `success`, `completed`, `failed`). The root-level `status` serves as a label, while `common.status.*` provides status value translations.

## Recommended Action

1. **For exact matches (36 keys)**: Migrate all code references from root-level keys to `common.*` equivalents, then remove root-level duplicates.

2. **For different values (6 keys)**: Review usage in code to determine which value is correct for each context. May need to keep both if they serve different purposes, or consolidate to one canonical value.

3. **For type mismatch (1 key)**: Keep `common.status` as the object for status value translations. Rename root-level `status` to use `common.statusLabel` (which already exists in common).

## Migration Priority

High priority (most commonly used):
- `save`, `cancel`, `delete`, `edit`, `add`, `search`, `close`, `download`, `logout`

Medium priority (status/state labels):
- `active`, `open`, `closed`, `completed`, `inProgress`, `overdue`, `low`, `medium`, `high`, `critical`

Low priority (less frequently used):
- `aml`, `governance`, `operational`, `financial`, `it`, `searchAssistant`, `localPolicySearch`, `askAboutPolicies`
