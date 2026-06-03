# تصميم إصلاح - Horizontal Overflow في التخطيط

## Overview

يهدف هذا المستند إلى توثيق النهج التقني لإصلاح مشكلة التجاوز الأفقي (horizontal overflow) التي تظهر في جميع صفحات التطبيق. المشكلة بنيوية وتضم أربعة مواقع جذرية: ملف `src/index.css` (غياب `overflow-x: hidden` على `body`)، ومكوّن `Login.tsx` (الحاوية الجذرية ولوحة النموذج معاً)، ومكوّن `LoginIllustration.tsx` (بطاقات الإحصاءات المُطلقة الموضع)، ومكوّن `Layout.tsx` (الـ sidebar). الإصلاح يستهدف منع التمرير الأفقي بشكل كامل مع الحفاظ على كل السلوكيات القائمة دون أي انحدار.

## Glossary

- **Bug_Condition (C)**: الحالة التي تُتيح للمتصفح رسم محتوى خارج حدود الـ viewport أفقياً
- **Property (P)**: السلوك المطلوب — لا تمرير أفقي، لا فراغ أبيض خارج حدود الشاشة
- **Preservation**: جميع السلوكيات الحالية يجب أن تبقى سليمة بعد الإصلاح
- **overflow-x: hidden**: خاصية CSS تمنع ظهور شريط التمرير الأفقي وتقطع المحتوى الفائض
- **body**: العنصر الجذري الأساسي في `src/index.css` الذي يغطي جميع صفحات التطبيق
- **Login.tsx**: مكوّن صفحة تسجيل الدخول في `src/components/Login.tsx`
- **LoginIllustration.tsx**: مكوّن القسم التوضيحي في `src/components/Login/LoginIllustration.tsx`
- **Layout.tsx**: مكوّن التخطيط الرئيسي في `src/components/Layout.tsx`
- **box-shadow الاتجاهي**: ظل خارج الحاوية بمقدار 20px يسبب overflow عند حافة الـ viewport
- **whileHover x**: تحريك Framer Motion على المحور الأفقي (4px) يسبب نزيفاً طفيفاً في الـ sidebar

## Bug Details

### Bug Condition

تظهر المشكلة في أي حالة يُفتح فيها أي صفحة من التطبيق؛ العنصر `body` لا يمنع التمرير الأفقي، وصفحة تسجيل الدخول تضيف ظلاً اتجاهياً بمقدار 20px يتجاوز حدود الـ viewport، ومكوّن `LoginIllustration` يحتوي على بطاقات مطلقة الموضع تُسبب overflow في بعض الدقة، والـ sidebar يُحرّك عناصره 4px أفقياً بما يسبب نزيفاً طفيفاً.

**الصياغة الرسمية:**
```
FUNCTION isBugCondition(context)
  INPUT: context يمثل الصفحة الحالية والعناصر المعروضة
  OUTPUT: boolean

  RETURN (
    NOT body.style.overflowX === 'hidden'
    OR (
      context.page === 'login'
      AND loginFormPanel.hasShadow(['20px_0_50px', '-20px_0_50px'])
      AND loginRoot.hasNoOverflowHidden
    )
    OR (
      context.page === 'login'
      AND illustrationStats.isAbsolutePositioned
      AND illustrationPanel.width < totalCardWidth
    )
    OR (
      context.layout === 'main'
      AND sidebar.hasHoverAnimationX
    )
  )
END FUNCTION
```

### أمثلة ملموسة

- **مثال 1 (بسيط)**: المستخدم يفتح صفحة لوحة التحكم → يلاحظ أن بإمكانه التمرير للأيمن بمقدار ~20px وظهور فراغ أبيض
- **مثال 2 (صفحة تسجيل الدخول - LTR)**: الظل `shadow-[20px_0_50px_-15px_...]` على لوحة النموذج يمتد 20px للأيمن خارج الـ viewport
- **مثال 3 (صفحة تسجيل الدخول - RTL)**: الظل `rtl:shadow-[-20px_0_50px_-15px_...]` يمتد 20px للأيسر، ونفس المشكلة من الجهة الأخرى
- **مثال 4 (حافة الصفحة)**: بطاقتا الإحصاءات في `LoginIllustration` (عرض كل منهما 200px مع gap-6 = ~424px) تتجاوزان عرض الـ panel عند دقة 1024px
- **مثال 5 (Sidebar)**: عند تحريك الماوس فوق عنصر في الـ sidebar، `whileHover={{ x: 4 }}` يُحرّك العنصر 4px نحو الخارج مسبباً نزيفاً طفيفاً

## Expected Behavior

### Preservation Requirements

**السلوكيات التي يجب أن تبقى دون تغيير:**
- يجب أن يستمر التمرير الرأسي (vertical scroll) داخل منطقة المحتوى بشكل طبيعي تام
- يجب أن تستمر القائمة الجانبية (sidebar) في الظهور والعمل بالشكل الصحيح (طيّ/توسيع، تنقل، animations)
- يجب أن تستمر صفحة تسجيل الدخول في عرض تصميمها الكامل (القسم التوضيحي على اليسار في LTR وعلى اليمين في RTL، ونموذج الدخول على الجانب الآخر)
- يجب أن يستمر التخطيط المتجاوب (responsive) في العمل بشكل صحيح على الأجهزة المحمولة
- يجب أن يستمر وضع الظلام (dark mode) ووضع الإضاءة (light mode) في العمل بشكل صحيح
- يجب أن يستمر اتجاه RTL في عرض الواجهة من اليمين لليسار بشكل صحيح
- يجب أن تستمر بطاقتا الإحصاءات في `LoginIllustration` بالظهور بنفس التصميم الحالي

**النطاق:**
جميع المدخلات التي لا تتضمن تجاوزاً أفقياً يجب أن تبقى غير متأثرة بهذا الإصلاح. وتشمل:
- النقر على العناصر بالماوس
- التمرير الرأسي في أي صفحة
- التفاعل مع القائمة الجانبية والهيدر
- تبديل اللغة والثيم

## Hypothesized Root Cause

استناداً إلى مراجعة الكود الفعلي، الأسباب الجذرية المرتبة حسب الأولوية:

1. **غياب `overflow-x: hidden` على `body` — (أولوية عالية)**
   - في `src/index.css`، الـ `body` يملك فقط: `bg-[...] text-[...] font-sans transition-colors antialiased`
   - لا توجد خاصية `overflow-x: hidden` على الإطلاق
   - هذا يعني أن أي عنصر في أي صفحة يتجاوز الـ viewport يُنتج تمريراً أفقياً مرئياً
   - **السبب الأول والأكثر تأثيراً لأنه يشمل جميع صفحات التطبيق**

2. **الظل الاتجاهي في لوحة النموذج بـ `Login.tsx` — (أولوية عالية)**
   - الكلاسات الحالية: `shadow-[20px_0_50px_-15px_rgba(0,0,0,0.05)] rtl:shadow-[-20px_0_50px_-15px_rgba(0,0,0,0.05)]`
   - `20px_0_...` يعني: offset-x = 20px، offset-y = 0 → الظل يمتد 20px للأيمن من حافة اللوحة
   - في LTR، اللوحة تحتل `lg:w-[45%]` وتكون على اليسار، فظلها يمتد للأيمن داخل منطقة الـ illustration (لا مشكلة عادةً). لكن على الشاشات الصغيرة (`w-full`)، اللوحة تمتد بالكامل وظلها يتجاوز الحافة
   - **الحاوية الجذرية لـ Login لا تملك `overflow-x: hidden`** لاحتواء هذا الظل

3. **غياب `overflow-x: hidden` على الحاوية الجذرية لـ `Login.tsx` — (أولوية عالية)**
   - الكلاسات الحالية للـ `div` الجذري: `min-h-screen bg-[var(--color-bg-main)] flex transition-colors duration-300`
   - لا يوجد `overflow-x: hidden` لمنع الظلال أو أي عنصر داخلي من التجاوز

4. **بطاقات الإحصاءات المطلقة في `LoginIllustration.tsx` — (أولوية متوسطة)**
   - الكوّد: `className="absolute bottom-16 start-16 xl:start-24 flex gap-6"`
   - كل بطاقة بعرض `min-w-[200px]`، بطاقتان مع `gap-6` (24px) = ~424px حداً أدنى
   - المكوّن الأب `LoginIllustration` يملك `overflow-hidden` على مستواه، لكن عند دقة حرجة بين `lg` و`xl` يمكن أن يتجاوز العرض
   - الحل: تقليل `min-w` أو تغيير التخطيط لمنع الخروج عن الحدود

5. **تحريك `whileHover={{ x: 4 }}` في الـ Sidebar بـ `Layout.tsx` — (أولوية منخفضة)**
   - الكود في `Layout.tsx`: `whileHover={{ scale: 1.02, x: isCollapsed ? 0 : (isRTL ? -4 : 4) }}`
   - هذا يُحرّك عنصر التنقل 4px باتجاه الخارج عند hover، مما قد يسبب نزيفاً طفيفاً
   - الـ sidebar يملك `overflow-y-auto` لكن لا `overflow-x-hidden`

## Correctness Properties

Property 1: Bug Condition - منع التمرير الأفقي في جميع الصفحات

_For any_ صفحة يفتحها المستخدم في التطبيق (بما فيها تسجيل الدخول)، حيث تنطبق شروط الخلل (isBugCondition returns true)، يجب أن يمنع الكود المُصلَح أي تمرير أفقي ولا يُعرض أي فراغ خارج حدود الـ viewport، سواء في LTR أو RTL، في الوضع الفاتح أو المظلم.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - الحفاظ على جميع السلوكيات القائمة

_For any_ تفاعل لا يتضمن شروط الخلل (isBugCondition returns false) — كالتمرير الرأسي، والنقر بالماوس، وتبديل اللغة والثيم، والتنقل في القائمة الجانبية، وعرض صفحة تسجيل الدخول — يجب أن ينتج الكود المُصلَح نفس نتيجة الكود الأصلي تماماً دون أي تغيير في السلوك أو المظهر.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

بافتراض صحة تحليل الأسباب الجذرية:

---

### الملف 1: `src/index.css` — (أولوية عالية)

**المشكلة:** الـ `body` لا يمنع التمرير الأفقي.

**قبل الإصلاح:**
```css
@layer base {
  body {
    @apply bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-sans transition-colors duration-200 antialiased;
    font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  }
}
```

**بعد الإصلاح:**
```css
@layer base {
  html {
    overflow-x: hidden;
  }
  body {
    @apply bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-sans transition-colors duration-200 antialiased;
    font-feature-settings: "cv02", "cv03", "cv04", "cv11";
    overflow-x: hidden;
  }
}
```

**التغييرات:**
1. إضافة `overflow-x: hidden` مباشرةً على `body` داخل `@layer base`
2. إضافة `overflow-x: hidden` على `html` أيضاً لضمان التغطية الكاملة على جميع المتصفحات
3. **لا تأثير على التمرير الرأسي** — `overflow-x` لا تمس `overflow-y`

---

### الملف 2: `src/components/Login.tsx` — (أولوية عالية)

**المشكلة 1:** الحاوية الجذرية لا تحتوي الظلال والعناصر الفائضة.

**قبل الإصلاح:**
```tsx
<div 
  className="min-h-screen bg-[var(--color-bg-main)] flex transition-colors duration-300"
  dir={language === Language.AR ? 'rtl' : 'ltr'}
>
```

**بعد الإصلاح:**
```tsx
<div 
  className="min-h-screen bg-[var(--color-bg-main)] flex transition-colors duration-300 overflow-x-hidden"
  dir={language === Language.AR ? 'rtl' : 'ltr'}
>
```

**المشكلة 2:** الظل الاتجاهي على لوحة النموذج يتجاوز الـ viewport.

**قبل الإصلاح:**
```tsx
<div className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-12 bg-[var(--color-card)] border-e border-[var(--color-border-soft)] shadow-[20px_0_50px_-15px_rgba(0,0,0,0.05)] rtl:shadow-[-20px_0_50px_-15px_rgba(0,0,0,0.05)]">
```

**بعد الإصلاح:**
```tsx
<div className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-12 bg-[var(--color-card)] border-e border-[var(--color-border-soft)] shadow-[inset_-20px_0_50px_-15px_rgba(0,0,0,0.05)] rtl:shadow-[inset_20px_0_50px_-15px_rgba(0,0,0,0.05)]">
```

**مبرر التغيير:** تحويل `box-shadow` من خارجي (يمتد خارج الحاوية) إلى داخلي (`inset`) يحافظ على التأثير البصري المطلوب بينما يُزيل التجاوز تماماً. الظل سيظهر داخل لوحة النموذج من جهة الحافة الداخلية، مما يُعطي نفس شعور العمق والفصل بين اللوحتين.

---

### الملف 3: `src/components/Login/LoginIllustration.tsx` — (أولوية متوسطة)

**المشكلة:** بطاقتا الإحصاءات مطلقتا الموضع بعرض أدنى 200px لكل منهما + gap-6 = ~424px، وهذا قد يتجاوز عرض الـ panel عند بعض دقات الشاشة. الأب يملك `overflow-hidden` لكنه قد لا يكفي عند دقة حرجة.

**قبل الإصلاح:**
```tsx
<motion.div 
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.8, delay: 0.2 }}
  className="absolute bottom-16 start-16 xl:start-24 flex gap-6"
>
  <div className="bg-[var(--color-card)]/90 backdrop-blur-sm rounded-xl p-6 min-w-[200px] shadow-2xl border border-white/20">
    ...
  </div>
  <div className="bg-[var(--color-card)]/90 backdrop-blur-sm rounded-xl p-6 min-w-[200px] shadow-2xl border border-white/20">
    ...
  </div>
</motion.div>
```

**بعد الإصلاح:**
```tsx
<motion.div 
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.8, delay: 0.2 }}
  className="absolute bottom-16 start-16 xl:start-24 flex gap-4 max-w-[calc(100%-4rem)] xl:max-w-[calc(100%-6rem)]"
>
  <div className="bg-[var(--color-card)]/90 backdrop-blur-sm rounded-xl p-5 min-w-[160px] flex-1 shadow-2xl border border-white/20">
    ...
  </div>
  <div className="bg-[var(--color-card)]/90 backdrop-blur-sm rounded-xl p-5 min-w-[160px] flex-1 shadow-2xl border border-white/20">
    ...
  </div>
</motion.div>
```

**التغييرات:**
1. تقليل `min-w-[200px]` إلى `min-w-[160px]` وإضافة `flex-1` لتوزيع المساحة بمرونة
2. إضافة `max-w-[calc(100%-4rem)]` لضمان أن الحاوية لا تتجاوز عرض الـ panel مع احتساب padding البداية
3. تقليل `gap-6` إلى `gap-4` لتوفير مساحة إضافية
4. تقليل `p-6` إلى `p-5` لتقليل العرض الكلي قليلاً مع الحفاظ على المظهر

---

### الملف 4: `src/components/Layout.tsx` — (أولوية منخفضة)

**المشكلة:** الـ sidebar لا يمنع التجاوز الأفقي الناتج عن `whileHover={{ x: 4 }}`.

**قبل الإصلاح:**
```tsx
<aside className={`${isCollapsed ? 'w-24' : 'w-72'} ${isMobileMenuOpen ? 'fixed inset-y-0 start-0 z-50' : 'hidden md:flex'} bg-[var(--color-card)] border-e border-[var(--color-border-soft)] h-screen sticky top-0 flex-col p-6 overflow-y-auto transition-all duration-500 ease-in-out shadow-sm`} ...>
```

**بعد الإصلاح:**
```tsx
<aside className={`${isCollapsed ? 'w-24' : 'w-72'} ${isMobileMenuOpen ? 'fixed inset-y-0 start-0 z-50' : 'hidden md:flex'} bg-[var(--color-card)] border-e border-[var(--color-border-soft)] h-screen sticky top-0 flex-col p-6 overflow-y-auto overflow-x-hidden transition-all duration-500 ease-in-out shadow-sm`} ...>
```

**التغيير:** إضافة `overflow-x-hidden` على الـ `aside` يمنع أي عنصر داخله من التجاوز الأفقي، بما فيها عناصر التنقل المتحركة بـ `whileHover={{ x: 4 }}`.

**ملاحظة:** يمكن الإبقاء على `whileHover={{ x: 4 }}` كما هي لأن `overflow-x-hidden` على الأب سيقطع أي تجاوز بدلاً من إزالة تأثير التحريك الجميل.

## Testing Strategy

### Validation Approach

تتبع استراتيجية الاختبار منهجية ثنائية المرحلة: أولاً كشف الخلل على الكود الأصلي غير المُصلَح (exploratory)، ثم التحقق من أن الإصلاح يعمل بشكل صحيح ولا يُحدث أي انحدار.

### Exploratory Bug Condition Checking

**الهدف:** إثبات وجود الخلل وفهم الأسباب الجذرية قبل تطبيق أي إصلاح.

**خطة الاختبار:** كتابة اختبارات تُحاكي فتح الصفحة والتحقق من قيم `scrollWidth` و`clientWidth` ومن وجود `overflow-x` المناسب. تشغيل هذه الاختبارات على الكود الأصلي لرؤية الفشل.

**حالات الاختبار:**
1. **اختبار body overflow (سيفشل):** التحقق من أن `document.body` لا يملك `overflow-x: hidden` → متوقع أن يثبت غياب الخاصية
2. **اختبار Login overflow (سيفشل):** رسم مكوّن `Login` والتحقق من أن `scrollWidth > clientWidth` على الحاوية الجذرية
3. **اختبار ظل لوحة النموذج (سيفشل):** التحقق من أن shadow offset-x يتجاوز الـ viewport عند `w-full` (شاشات صغيرة)
4. **اختبار بطاقات Illustration (قد يفشل):** التحقق من أن `totalCardWidth > illustrationPanelWidth` عند دقة 1024px
5. **اختبار Sidebar hover (سيفشل):** محاكاة hover وقياس تجاوز `getBoundingClientRect().right > window.innerWidth`

**Counterexamples متوقعة:**
- `document.body.style.overflowX` تُعيد `""` بدلاً من `"hidden"`
- `document.documentElement.scrollWidth > document.documentElement.clientWidth` يُعيد `true`
- Possible causes: غياب overflow-x على body، ظل اتجاهي خارج الـ viewport، بطاقات illustration تتجاوز panel

### Fix Checking

**الهدف:** التحقق من أن الإصلاح يُزيل التجاوز الأفقي في جميع الحالات.

**Pseudocode:**
```
FOR ALL context WHERE isBugCondition(context) DO
  result := renderWithFix(context)
  ASSERT document.documentElement.scrollWidth <= document.documentElement.clientWidth
  ASSERT window.getComputedStyle(document.body).overflowX === 'hidden'
  ASSERT result.horizontalScrollbar === false
END FOR
```

### Preservation Checking

**الهدف:** التحقق من أن الإصلاح لا يُغيّر أي سلوك غير مرتبط بالخلل.

**Pseudocode:**
```
FOR ALL interaction WHERE NOT isBugCondition(interaction) DO
  ASSERT behavior_original(interaction) === behavior_fixed(interaction)
END FOR
```

**نهج الاختبار:** اختبار قائم على الخصائص (property-based testing) لأن:
- يُولّد حالات اختبار كثيرة تلقائياً عبر مساحة المدخلات
- يكشف حالات الحواف التي قد تفوتها الاختبارات اليدوية
- يُعطي ضماناً قوياً بعدم تغيير السلوك لجميع المدخلات غير الخاطئة

**حالات الاختبار:**
1. **الحفاظ على التمرير الرأسي:** التحقق من أن `overflow-y` لمنطقة المحتوى لا يزال `auto` أو `scroll` بعد الإصلاح
2. **الحفاظ على ظهور الـ Sidebar:** التحقق من أن عرض الـ sidebar لا يزال `w-72`/`w-24` وجميع عناصر التنقل مرئية
3. **الحفاظ على تصميم صفحة تسجيل الدخول:** التحقق من ظهور `LoginIllustration` بالكامل على شاشات lg+
4. **الحفاظ على RTL:** التحقق من أن `dir="rtl"` لا يزال يُطبّق ظل الاتجاه الصحيح (الآن `inset`)
5. **الحفاظ على dark mode:** التحقق من أن ألوان `--color-bg-main` لا تتأثر بإضافة overflow-x
6. **الحفاظ على responsive:** التحقق من التخطيط على 375px، 768px، 1024px، 1440px

### Unit Tests

- **اختبار index.css body:** التحقق من تطبيق `overflow-x: hidden` على `body` و`html`
- **اختبار Login root container:** رسم `<Login />` والتحقق من عدم وجود `scrollWidth > clientWidth` على الحاوية الجذرية
- **اختبار ظل لوحة النموذج:** التحقق من أن الكلاسات الجديدة (`shadow-[inset_...]`) لا تُسبب تجاوزاً
- **اختبار LoginIllustration cards:** رسم المكوّن والتحقق من أن `totalCardWidth` لا يتجاوز عرض الـ panel على 1024px
- **اختبار Sidebar overflow:** رسم `<Layout />` والتحقق من أن الـ aside يملك `overflow-x-hidden`
- **اختبار لا تأثير على vertical scroll:** التحقق من أن `#main-content` لا يزال `overflow-y-auto`

### Property-Based Tests

- **خاصية 1 (Fix):** لأي صفحة مُرسومة من التطبيق، `document.documentElement.scrollWidth <= window.innerWidth`
- **خاصية 2 (Fix):** لأي مجموعة عشوائية من (LTR/RTL، light/dark، sidebar مطوي/موسّع)، لا يوجد تمرير أفقي
- **خاصية 3 (Preservation):** للتمرير الرأسي، `element.scrollTop` يتغير بشكل صحيح عند scroll events
- **خاصية 4 (Preservation):** لأي تحريك hover على Sidebar، `getBoundingClientRect().right <= window.innerWidth`
- **خاصية 5 (Preservation):** لأي دقة شاشة (375px إلى 1920px)، بطاقات `LoginIllustration` تبقى داخل حدود الـ panel

### Integration Tests

- **اختبار تدفق كامل - تسجيل الدخول:** فتح صفحة تسجيل الدخول على LTR و RTL وقياس `document.body.scrollWidth` يجب ألا يتجاوز `window.innerWidth`
- **اختبار تدفق كامل - لوحة التحكم:** فتح لوحة التحكم مع sidebar موسّع ومطوي والتحقق من عدم التمرير الأفقي
- **اختبار تبديل اللغة:** تبديل من AR إلى EN والعكس والتحقق من عدم ظهور overflow في كلا الاتجاهين
- **اختبار تبديل الثيم:** تبديل dark/light mode والتحقق من عدم ظهور overflow وصحة الألوان
- **اختبار Sidebar interactions:** النقر على عناصر التنقل، طي وتوسيع الـ sidebar، hover على العناصر — جميعها يجب أن تعمل دون overflow
- **اختبار الشاشات الصغيرة:** على 375px، القائمة الجانبية للموبايل (`fixed inset-y-0`) يجب أن تعمل بشكل صحيح
- **اختبار التمرير الرأسي:** صفحة طويلة داخل `#main-content` تتمرر رأسياً بشكل طبيعي بعد الإصلاح

---

## Regression Prevention Notes

لمنع تكرار هذه المشكلة مستقبلاً:

1. **قاعدة CSS:** الحفاظ على `overflow-x: hidden` على كل من `html` و`body` في `src/index.css` — هذا هو الدرع الأول والأشمل
2. **ظلال الصفحة الكاملة:** أي `box-shadow` يُطبَّق على عنصر يلامس حافة الـ viewport يجب أن يكون `inset` أو يجب وجود `overflow-x: hidden` على أحد أسلافه
3. **العناصر المطلقة الموضع:** أي `absolute` container يحتوي على عناصر ذات `min-w` ثابتة يجب أن يُقيَّد بـ `max-w` يُحسب من عرض الأب
4. **Framer Motion transforms:** `whileHover={{ x: N }}` على عناصر داخل containers ذات عرض ثابت يجب أن يكون الأب محاطاً بـ `overflow-x-hidden`
5. **Linting:** يُنصح بإضافة ESLint rule أو تعليق TODO يُنبّه عند إضافة ظلال اتجاهية على عناصر جذرية
