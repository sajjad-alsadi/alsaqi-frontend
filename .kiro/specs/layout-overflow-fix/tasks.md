# Implementation Plan: إصلاح Horizontal Overflow في التخطيط

## Overview

خطة التنفيذ تتبع منهجية Bugfix التدريجية: أولاً استكشاف الخلل عبر اختبارات property-based تفشل على الكود الأصلي (Property 1)، ثم توثيق السلوك الأساسي الواجب الحفاظ عليه (Property 2)، ثم تطبيق الإصلاح في أربعة ملفات، وأخيراً التحقق من إصلاح الخلل وعدم ظهور أي انحدار.

## Tasks

- [x] 1. كتابة اختبار استكشافي لشرط الخلل (قبل الإصلاح)
  - **Property 1: Bug Condition** - غياب overflow-x:hidden وتجاوز الـ viewport أفقياً
  - **CRITICAL**: يجب أن يفشل هذا الاختبار على الكود غير المُصلَح — الفشل يثبت وجود الخلل
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: هذا الاختبار يُشفّر السلوك المتوقع — سيُصبح اختبار التحقق بعد الإصلاح
  - **GOAL**: استخراج counterexamples تُثبت وجود الخلل
  - **Scoped PBT Approach**: تحديد الحالات المحددة المعروفة بالفشل لضمان قابلية الاستنساخ
  - اختبار أن `document.body` لا يملك `overflow-x: hidden` على الكود الأصلي (isBugCondition: body.overflowX !== 'hidden')
  - اختبار أن `document.documentElement.scrollWidth > document.documentElement.clientWidth` على أي صفحة
  - اختبار أن الحاوية الجذرية في `<Login />` لا تملك `overflow-x-hidden`
  - اختبار أن الظل الاتجاهي `shadow-[20px_0_50px...]` في `Login.tsx` يتسبب في تجاوز الـ viewport عند `w-full`
  - اختبار أن `<aside>` في `Layout.tsx` لا يملك `overflow-x-hidden`
  - تشغيل الاختبار على الكود غير المُصلَح
  - **EXPECTED OUTCOME**: يفشل الاختبار (هذا صحيح — يُثبت وجود الخلل)
  - توثيق counterexamples: `document.body.style.overflowX` تُعيد `""` بدلاً من `"hidden"`، و `scrollWidth > clientWidth` يُعيد `true`
  - اعتبار المهمة مكتملة عند كتابة الاختبار وتشغيله وتوثيق الفشل
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. كتابة اختبارات property-based للحفاظ على السلوك (قبل الإصلاح)
  - **Property 2: Preservation** - الحفاظ على التمرير الرأسي وعمل الـ sidebar وتصميم صفحة تسجيل الدخول
  - **IMPORTANT**: اتبع منهجية الملاحظة أولاً (observation-first)
  - الملاحظة على الكود غير المُصلَح:
    - `overflow-y` على `#main-content` يُعيد `auto` أو `scroll` بشكل صحيح
    - الـ sidebar يظهر بعرض `w-72` عند التوسع و`w-24` عند الطي
    - عناصر التنقل في الـ sidebar مرئية وقابلة للنقر
    - `LoginIllustration` يظهر على الشاشات lg+ بالكامل
    - `dir="rtl"` يُطبَّق على الحاوية الجذرية في `<Login />`
    - ألوان `--color-bg-main` تعمل في light mode و dark mode
  - كتابة property-based test: لأي مجموعة من (LTR/RTL × light/dark × sidebar مطوي/موسّع)، يكون `overflow-y` على منطقة المحتوى طبيعياً ولا يتأثر
  - كتابة اختبار: لأي hover على عناصر الـ sidebar، `element.style.transform` يتغير لكن `getBoundingClientRect().right <= window.innerWidth` على الأب
  - كتابة اختبار: `<LoginIllustration />` يُعرض بطاقتي إحصاء على viewport 1024px
  - التحقق من أن الاختبارات تنجح على الكود غير المُصلَح
  - **EXPECTED OUTCOME**: تنجح الاختبارات (يُثبت السلوك الأساسي المراد الحفاظ عليه)
  - اعتبار المهمة مكتملة عند كتابة الاختبارات وتشغيلها والتأكد من نجاحها على الكود الأصلي
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. إصلاح Horizontal Overflow في جميع الملفات الأربعة

  - [x] 3.1 إصلاح `src/index.css` — إضافة `overflow-x: hidden` على `html` و `body`
    - إضافة `html { overflow-x: hidden; }` داخل `@layer base`
    - إضافة `overflow-x: hidden;` داخل قاعدة `body` الموجودة بعد `@apply ...`
    - التأكد من أن `overflow-y` غير مُقيَّد (لا تضر بالتمرير الرأسي)
    - _Bug_Condition: isBugCondition(context) حيث `NOT body.style.overflowX === 'hidden'`_
    - _Expected_Behavior: `window.getComputedStyle(document.body).overflowX === 'hidden'`_
    - _Preservation: `overflow-y` على `#main-content` يبقى `auto` أو `scroll`_
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 إصلاح `src/components/Login.tsx` — الحاوية الجذرية والظل الاتجاهي
    - إضافة `overflow-x-hidden` على الـ `div` الجذري (`min-h-screen bg-[var(--color-bg-main)] flex ...`)
    - تحويل الظل الاتجاهي من خارجي إلى داخلي (`inset`) على لوحة النموذج:
      - من: `shadow-[20px_0_50px_-15px_rgba(0,0,0,0.05)] rtl:shadow-[-20px_0_50px_-15px_rgba(0,0,0,0.05)]`
      - إلى: `shadow-[inset_-20px_0_50px_-15px_rgba(0,0,0,0.05)] rtl:shadow-[inset_20px_0_50px_-15px_rgba(0,0,0,0.05)]`
    - التحقق من أن التأثير البصري للظل محفوظ (عمق الفصل بين اللوحتين)
    - _Bug_Condition: isBugCondition(context) حيث `loginRoot.hasNoOverflowHidden AND loginFormPanel.hasShadow(['20px_0_50px', '-20px_0_50px'])`_
    - _Expected_Behavior: لا تجاوز أفقي من الظل على أي عرض شاشة (بما فيها `w-full` على موبايل)_
    - _Preservation: تصميم صفحة تسجيل الدخول الكامل محفوظ على LTR و RTL_
    - _Requirements: 2.2, 2.3, 3.3, 3.6_

  - [x] 3.3 إصلاح `src/components/Login/LoginIllustration.tsx` — تقييد بطاقات الإحصاءات
    - إضافة `max-w-[calc(100%-4rem)] xl:max-w-[calc(100%-6rem)]` على `motion.div` الحاوي للبطاقتين
    - تقليل `gap-6` إلى `gap-4` لتوفير مساحة إضافية
    - تقليل `min-w-[200px]` إلى `min-w-[160px]` على كلتا البطاقتين
    - إضافة `flex-1` على كلتا البطاقتين لتوزيع المساحة بمرونة
    - تقليل `p-6` إلى `p-5` على كلتا البطاقتين
    - _Bug_Condition: isBugCondition(context) حيث `illustrationStats.isAbsolutePositioned AND illustrationPanel.width < totalCardWidth`_
    - _Expected_Behavior: `totalCardWidth <= illustrationPanelWidth` على جميع دقات الشاشة_
    - _Preservation: بطاقتا الإحصاءات تظهران بنفس التصميم الحالي على جميع دقات الشاشة_
    - _Requirements: 2.3, 2.4, 3.3, 3.4_

  - [x] 3.4 إصلاح `src/components/Layout.tsx` — إضافة `overflow-x-hidden` على الـ `aside`
    - إضافة `overflow-x-hidden` على عنصر `<aside>` بجانب `overflow-y-auto` الموجود
    - التحقق من أن `whileHover={{ x: 4 }}` على عناصر التنقل لا يزال يعمل بصرياً (يُقطع بـ overflow-x-hidden فقط)
    - التحقق من أن طي وتوسيع الـ sidebar لا يزال يعمل (transition-all duration-500)
    - _Bug_Condition: isBugCondition(context) حيث `sidebar.hasHoverAnimationX AND NOT sidebar.hasOverflowXHidden`_
    - _Expected_Behavior: `aside.getBoundingClientRect().right <= window.innerWidth` في جميع أوضاع hover_
    - _Preservation: جميع وظائف الـ sidebar (طي/توسيع، تنقل، animations) تعمل بشكل صحيح_
    - _Requirements: 2.4, 3.1_

  - [x] 3.5 التحقق من نجاح اختبار شرط الخلل الاستكشافي بعد الإصلاح
    - **Property 1: Expected Behavior** - لا تمرير أفقي بعد تطبيق الإصلاح
    - **IMPORTANT**: أعد تشغيل نفس الاختبار من المهمة 1 — لا تكتب اختباراً جديداً
    - الاختبار من المهمة 1 يُشفّر السلوك المتوقع
    - تشغيل الاختبار الاستكشافي من الخطوة 1
    - **EXPECTED OUTCOME**: ينجح الاختبار (يُثبت إصلاح الخلل)
    - التحقق من: `window.getComputedStyle(document.body).overflowX === 'hidden'`، و `scrollWidth <= clientWidth`، وأن الحاوية الجذرية في `<Login />` تملك `overflow-x-hidden`، وأن `<aside>` يملك `overflow-x-hidden`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.6 التحقق من استمرار نجاح اختبارات الحفاظ على السلوك
    - **Property 2: Preservation** - الحفاظ على جميع السلوكيات القائمة بعد الإصلاح
    - **IMPORTANT**: أعد تشغيل نفس الاختبارات من المهمة 2 — لا تكتب اختبارات جديدة
    - تشغيل اختبارات property-based للحفاظ على السلوك من الخطوة 2
    - **EXPECTED OUTCOME**: تنجح الاختبارات (لا انحدار في أي سلوك)
    - التحقق من: التمرير الرأسي، عمل الـ sidebar كاملاً، صفحة تسجيل الدخول LTR/RTL، dark/light mode، responsive على 375px/768px/1024px/1440px

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
- **الملفات المتأثرة الأربعة**: `src/index.css`، `src/components/Login.tsx`، `src/components/Login/LoginIllustration.tsx`، `src/components/Layout.tsx`
- **لا تعديلات إضافية**: الإصلاح محدود بهذه الملفات الأربعة فقط دون إدخال مكتبات أو تغييرات بنيوية إضافية
