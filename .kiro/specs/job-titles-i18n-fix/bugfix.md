# Bugfix Requirements Document

## Introduction

مفاتيح ترجمة متعددة تظهر كنص خام بدلاً من النص المترجم الصحيح في مكوّنين:

1. **المسميات الوظيفية** (`JobTitles.tsx`): مفاتيح مثل `jobTitles.staff` تظهر بصيغة `⚠️ [jobTitles.staff]`. السبب: تعارض بنيوي — المكوّن يستخدم صيغة نقطية تفترض أن `jobTitles` كائن، بينما ملفات الترجمة تعرّفه كنص عادي.

2. **التوصيات** (`Recommendations.tsx`): مفتاح `recommendations.noRecommendations` يظهر بصيغة `⚠️ [recommendations.noRecommendations]`. السبب: المفتاح غير موجود في ملفات الترجمة — الموجود هو `recommendations.noRecommendationTextFound` (مفتاح مختلف).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the component calls `t('jobTitles.staff')`, `t('jobTitles.executive')`, `t('jobTitles.manager')`, or `t('jobTitles.officer')` THEN the system displays `⚠️ [jobTitles.staff]` (raw key with warning indicator) instead of the translated text

1.2 WHEN the component calls `t('jobTitles.failedToSaveJobTitle')` or `t('jobTitles.failedToDeleteJobTitle')` THEN the system displays the raw key with warning indicator instead of a localized error message

1.3 WHEN the component renders dynamic keys via `t(`jobTitles.${title.job_level?.toLowerCase()}`)` or `t(`jobTitles.${title.status?.toLowerCase()}`)` THEN the system displays `⚠️ [jobTitles.executive]` or `⚠️ [jobTitles.active]` instead of the translated job level/status text

1.4 WHEN the component calls `t('jobTitles')` directly as a page title THEN the system returns the flat string "المسميات الوظيفية"/"Job Titles" correctly, but this usage conflicts structurally with the sub-key lookups above

1.5 WHEN the Recommendations component calls `t('recommendations.noRecommendations')` to display an empty state message THEN the system displays `⚠️ [recommendations.noRecommendations]` instead of a localized "no recommendations" message, because the key does not exist in either locale file

### Expected Behavior (Correct)

2.1 WHEN the component calls `t('jobTitles.staff')`, `t('jobTitles.executive')`, `t('jobTitles.manager')`, or `t('jobTitles.officer')` THEN the system SHALL return the properly translated text for each job level (e.g., "موظف", "تنفيذي", "مدير", "ضابط" in Arabic)

2.2 WHEN the component calls `t('jobTitles.failedToSaveJobTitle')` or `t('jobTitles.failedToDeleteJobTitle')` THEN the system SHALL return a properly localized error message

2.3 WHEN the component renders dynamic keys via `t(`jobTitles.${title.job_level?.toLowerCase()}`)` or `t(`jobTitles.${title.status?.toLowerCase()}`)` THEN the system SHALL return the corresponding translated text for the job level or status value

2.4 WHEN the page title for the Job Titles module needs to be displayed THEN the system SHALL use an alternative key path (such as `common.jobTitles` which already exists) so that `jobTitles` can be restructured as an object without losing the title translation

2.5 WHEN the Recommendations component has no data to display THEN the system SHALL display the properly translated "no recommendations" message (e.g., "لا توجد توصيات" in Arabic, "No recommendations found" in English) using the key `recommendations.noRecommendations`

### Unchanged Behavior (Regression Prevention)

3.1 WHEN other components reference `common.jobTitles` for navigation menus or breadcrumbs THEN the system SHALL CONTINUE TO display "المسميات الوظيفية" / "Job Titles" correctly

3.2 WHEN other translation keys at the same level as `jobTitles` (e.g., `userManagement`, `departments`) are accessed THEN the system SHALL CONTINUE TO resolve correctly without being affected by the restructuring of `jobTitles`

3.3 WHEN i18next's `parseMissingKeyHandler` encounters a genuinely missing key THEN the system SHALL CONTINUE TO display the `⚠️ [key]` fallback indicator

3.4 WHEN the language is switched between Arabic and English THEN the system SHALL CONTINUE TO display all other existing translations without regression

---

## Bug Condition (Formal)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type TranslationKeyCall
  OUTPUT: boolean
  
  // Case 1: dot-notation sub-key of 'jobTitles' requested but 'jobTitles' is a flat string
  IF X.key STARTS WITH "jobTitles." AND typeof(translationResource["jobTitles"]) = "string" THEN
    RETURN true
  END IF
  
  // Case 2: key 'recommendations.noRecommendations' does not exist in locale files
  IF X.key = "recommendations.noRecommendations" AND NOT keyExists(translationResource, X.key) THEN
    RETURN true
  END IF
  
  RETURN false
END FUNCTION
```

```pascal
// Property: Fix Checking - Sub-keys resolve to translated text
FOR ALL X WHERE isBugCondition(X) DO
  result ← t'(X.key)
  ASSERT result IS NOT EMPTY
    AND result DOES NOT START WITH "⚠️"
    AND result ≠ X.key
END FOR
```

```pascal
// Property: Preservation Checking - Non-buggy keys unaffected
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT t(X.key) = t'(X.key)
END FOR
```
