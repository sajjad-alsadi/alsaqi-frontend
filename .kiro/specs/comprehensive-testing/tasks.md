# Implementation Plan: Comprehensive Testing

## Overview

خطة تنفيذ مجموعة اختبارات شاملة لنظام AL-SAQI مقسمة إلى 6 موجات. كل موجة تبني على سابقتها لضمان تقدم تدريجي ومتكامل.

## Tasks

- [x] 1. البنية التحتية للاختبارات (Wave 1)
  - [x] 1.1 إنشاء مصنع بيانات الاختبار
    - إنشاء ملف `src/test/factories/index.ts`
    - تعريف مصانع: createUser, createAuditPlan, createAuditTask, createAuditFinding, createRisk, createCorrespondence, createNotification, createComplianceItem
    - كل مصنع يقبل overrides جزئية ويولد بيانات افتراضية واقعية
    - _المتطلبات: 1.1-1.8, 4.1-4.8, 5.1-5.6_

  - [x] 1.2 إنشاء أدوات مساعدة للخادم
    - إنشاء ملف `src/test/helpers/server.ts`
    - تعريف `createTestApp()` لإنشاء تطبيق Express مصغر مع وسيط مصادقة وهمي
    - تعريف `createMockDb()` لمحاكاة قاعدة البيانات مع prepare/get/all/run
    - تعريف `createAuthenticatedRequest()` لإنشاء طلبات مصادق عليها
    - _المتطلبات: 2.1-2.7, 3.1-3.9, 4.1-4.8_

  - [x] 1.3 إنشاء أدوات مساعدة للعميل
    - إنشاء ملف `src/test/helpers/render.tsx`
    - تعريف `renderWithProviders()` لعرض المكونات مع جميع السياقات
    - تعريف `createMockRouter()` لمحاكاة React Router
    - تعريف `mockApi()` لإعداد محاكاة API بسهولة
    - _المتطلبات: 14.1-14.6, 15.1-15.7, 16.1-16.6_

  - [x] 1.4 إنشاء مولدات fast-check المخصصة
    - إنشاء ملف `src/test/helpers/arbitraries.ts`
    - تعريف مولدات: userArb, validTableNameArb, validColumnNameArb, maliciousColumnNameArb
    - تعريف مولدات: auditTaskStatusArb, complianceStatusArb, correspondenceArb
    - تعريف مولدات HTML خبيثة لاختبار DOMGuard
    - _المتطلبات: 13.1-13.4, 18.1-18.5, 19.1-19.5, 24.1-24.4_

  - [x] 1.5 تحديث إعداد الاختبارات
    - تحديث `src/test/setup.ts` لإضافة محاكاة WebSocket
    - إضافة محاكاة `window.matchMedia` للسمات
    - إضافة محاكاة `IntersectionObserver` للتحميل الكسول
    - _المتطلبات: 16.3-16.6, 22.1-22.6_

- [x] 2. نقطة تفتيش - التحقق من البنية التحتية
  - تشغيل `npm run test` للتأكد من عدم وجود أخطاء
  - التأكد من أن جميع الملفات المساعدة تُصدَّر بشكل صحيح
  - سؤال المستخدم إذا كانت هناك أسئلة

- [x] 3. اختبارات وحدة خدمات الخادم (Wave 2)
  - [x] 3.1 اختبارات AuthService الإضافية
    - إنشاء/تحديث `src/server/__tests__/auth.test.ts`
    - إضافة اختبارات: تسجيل الدخول بالبريد الإلكتروني، خيار "تذكرني"، انتهاء صلاحية كلمة المرور
    - إضافة اختبارات: قفل الحساب بعد 5 محاولات، إشعار المسؤولين عند القفل
    - _المتطلبات: 1.1-1.8_

  - [x] 3.2 اختبارات BaseService
    - إنشاء ملف `src/server/services/__tests__/BaseService.test.ts`
    - اختبار findAll: ترقيم، ترتيب، بحث، فلاتر
    - اختبار create: إزالة الحقول المقيدة، توليد الكود التلقائي
    - اختبار update: إزالة الحقول غير القابلة للتغيير، mass assignment prevention
    - اختبار delete: حذف السجل وإرجاع true
    - اختبار sanitizeBody: تحويل السلاسل الفارغة لحقول _id إلى null
    - _المتطلبات: 5.1-5.6_

  - [x] 3.3 اختبارات NotificationService
    - إنشاء ملف `src/server/services/__tests__/NotificationService.test.ts`
    - اختبار create: مستلم واحد، مستلمين متعددين، 'all'
    - اختبار markAsRead: تحديث is_read و read_at
    - اختبار markAllRead: تحديث جميع الإشعارات غير المقروءة
    - اختبار dismiss: تعيين is_dismissed بدون حذف
    - اختبار getNotifications: ترقيم وترتيب
    - _المتطلبات: 8.1-8.7_

  - [x] 3.4 اختبارات AppCodeGenerator
    - إنشاء/تحديث `src/server/utils/AppCodeGenerator.test.ts`
    - اختبار generateCode: لكل جدول مدعوم
    - اختبار generateFindingCode: مع audit_id صالح
    - اختبار resolveDepartmentCode: مع وبدون قسم
    - اختبار النمط: DeptCode-DocType-YY-NNN
    - _المتطلبات: 12.1-12.3_

  - [x] 3.5 اختبارات SessionService
    - إنشاء ملف `src/server/services/__tests__/SessionService.test.ts`
    - اختبار refresh: تدوير الرمز، إرجاع رموز جديدة
    - اختبار logout: إبطال رمز التحديث
    - اختبار logoutAll: إبطال جميع جلسات المستخدم
    - _المتطلبات: 2.2-2.4_

  - [x] 3.6 اختبارات UserService
    - إنشاء ملف `src/server/services/__tests__/UserService.test.ts`
    - اختبار createUser: تشفير كلمة المرور، تسجيل التدقيق
    - اختبار updateUser: تغيير الدور/الحالة، إرسال إشعار
    - اختبار حماية المسؤول الأخير: رفض تعليق/أرشفة/حذف آخر Admin
    - اختبار unlockUser: إعادة تعيين عداد المحاولات
    - _المتطلبات: 6.1-6.6_

  - [x] 3.7 اختبار خاصية: سلسلة هاش التدقيق
    - إنشاء ملف `src/server/__tests__/auditTrail.property.test.ts`
    - **الخاصية 1: سلسلة هاش التدقيق غير قابلة للتلاعب**
    - **يتحقق من: المتطلبات 24.1, 24.2, 24.3, 24.4**
    - اختبار: لأي تسلسل سجلات، تعديل سجل وسيط يكسر السلسلة
    - اختبار: السجل الأول يستخدم '0' كهاش سابق
    - اختبار: الهاش يتضمن جميع الحقول المطلوبة

  - [x] 3.8 اختبار خاصية: validateIdentifier يمنع SQL Injection
    - إنشاء ملف `src/server/__tests__/validateIdentifier.property.test.ts`
    - **الخاصية 2: validateIdentifier يرفض جميع محاولات SQL Injection**
    - **يتحقق من: المتطلبات 5.6, 13.4, 20.3**
    - اختبار: لأي سلسلة بأحرف خاصة، يتم الرفض
    - اختبار: لأي اسم صالح (^[a-zA-Z_][a-zA-Z0-9_]*$)، يتم القبول

  - [x] 3.9 اختبار خاصية: توليد الأكواد فريد ومتسلسل
    - إنشاء ملف `src/server/__tests__/codeGenerator.property.test.ts`
    - **الخاصية 3: توليد الأكواد ينتج أكواداً فريدة ومتسلسلة**
    - **يتحقق من: المتطلبات 12.1, 12.2**
    - اختبار: لأي جدول مدعوم، الأكواد تتبع النمط المحدد
    - اختبار: أكواد متعددة لنفس الجدول فريدة ومتسلسلة

- [x] 4. نقطة تفتيش - اختبارات الوحدة
  - تشغيل `npm run test` للتأكد من نجاح جميع الاختبارات
  - سؤال المستخدم إذا كانت هناك أسئلة

- [x] 5. اختبارات تكامل الخادم (Wave 3)
  - [x] 5.1 اختبارات تكامل مسارات المصادقة
    - تحديث `src/server/routes/__tests__/auth.integration.test.ts`
    - إضافة اختبارات: change-password, forgot-password, session
    - اختبار تدوير رمز التحديث (token rotation)
    - اختبار مسح ملفات تعريف الارتباط عند الخروج
    - _المتطلبات: 2.1-2.7_

  - [x] 5.2 اختبارات تكامل الوسيط (Middleware)
    - إنشاء ملف `src/server/routes/__tests__/middleware.integration.test.ts`
    - اختبار authenticate: بدون رمز، رمز منتهي، مستخدم معلق، session_version مختلف
    - اختبار authorize: Admin bypass، فقدان صلاحية، checkPermission
    - اختبار validate: بيانات غير صالحة وفق Zod
    - اختبار rate limiter: تجاوز الحد
    - _المتطلبات: 3.1-3.9_

  - [x] 5.3 اختبارات تكامل مولد CRUD
    - إنشاء ملف `src/server/routes/__tests__/crud.integration.test.ts`
    - اختبار GET /{route}: ترقيم، بحث، فلاتر
    - اختبار GET /{route}/:id: سجل موجود، 404
    - اختبار POST /{route}: إنشاء مع كود تلقائي، تسجيل تدقيق، إشعارات
    - اختبار PUT /{route}/:id: تحديث مع mass assignment prevention
    - اختبار DELETE /{route}/:id: حذف مع تسجيل تدقيق
    - اختبار الصلاحيات: رفض بدون صلاحية مناسبة
    - _المتطلبات: 4.1-4.8_

  - [x] 5.4 اختبارات تكامل إدارة المستخدمين
    - إنشاء ملف `src/server/routes/__tests__/users.integration.test.ts`
    - اختبار POST /api/users: إنشاء مستخدم مع تشفير
    - اختبار PUT /api/users/:id: تغيير دور/حالة مع إشعار
    - اختبار حماية الذات: رفض تعليق/أرشفة/حذف الحساب الخاص
    - اختبار حماية المسؤول الأخير
    - اختبار POST /api/users/:id/unlock و reset-password
    - _المتطلبات: 6.1-6.6_

  - [x] 5.5 اختبارات تكامل المراسلات
    - إنشاء ملف `src/server/routes/__tests__/correspondence.integration.test.ts`
    - اختبار POST /incoming: إنشاء مع رقم تسلسلي
    - اختبار PUT /status/:type/:id: تحديث حالة مع سجل
    - اختبار POST /refer: إحالة مع تحديث حالة
    - اختبار POST /link: ربط واردة بصادرة
    - اختبار PUT /archive/:type/:id: أرشفة
    - اختبار POST /outgoing: مع ملف مرفق
    - اختبار الصلاحيات: رفض بدور غير مسموح
    - _المتطلبات: 7.1-7.7_

  - [x] 5.6 اختبارات تكامل الامتثال
    - إنشاء ملف `src/server/routes/__tests__/compliance.integration.test.ts`
    - اختبار GET /compliance: فلاتر (source_type, status, search)
    - اختبار POST /compliance: إنشاء مع COMPLIANCE_ROLES
    - اختبار PATCH /compliance/:id/status: حالة صالحة وغير صالحة
    - اختبار DELETE /compliance/:id: رفض بدون ADMIN_ROLES
    - اختبار GET /compliance/summary: ملخص إحصائي
    - _المتطلبات: 10.1-10.5_

  - [x] 5.7 اختبارات تكامل مهام التدقيق
    - إنشاء ملف `src/server/routes/__tests__/auditTasks.integration.test.ts`
    - اختبار PATCH /audit-tasks/:id/status: انتقال صالح مع إشعار
    - اختبار انتقال غير صالح: رفض بحالة 400
    - اختبار صلاحية الموافقة: approved يتطلب صلاحية خاصة
    - _المتطلبات: 9.1-9.4_

  - [x] 5.8 اختبارات تكامل التوصيات والاحتيال
    - إنشاء ملف `src/server/routes/__tests__/recommendations.integration.test.ts`
    - اختبار POST /recommendations/:id/resolve: تحديث حالة مع إغلاق
    - إنشاء ملف `src/server/routes/__tests__/fraud.integration.test.ts`
    - اختبار POST /fraud-access-requests/request: إنشاء طلب مع إشعار
    - اختبار POST /fraud-access-requests/:id/approve و reject
    - _المتطلبات: 11.1-11.4_

  - [x] 5.9 اختبارات تكامل المسارات الإضافية
    - إنشاء ملف `src/server/routes/__tests__/misc.integration.test.ts`
    - اختبار GET /api/dashboard/stats: إحصائيات شاملة
    - اختبار GET /api/analytics: بيانات تحليلية مع فلاتر
    - اختبار GET /api/executive-reports: تقارير تنفيذية
    - اختبار CRUD /api/departments: مع تفويض
    - اختبار GET /api/health: حالة النظام
    - اختبار 404 لنقاط نهاية غير موجودة
    - _المتطلبات: 21.1-21.6_

- [x] 6. نقطة تفتيش - اختبارات التكامل
  - تشغيل `npm run test` للتأكد من نجاح جميع الاختبارات
  - سؤال المستخدم إذا كانت هناك أسئلة

- [x] 7. اختبارات خصائص الخادم (Wave 4)
  - [x] 7.1 اختبارات خصائص التحقق من المدخلات
    - إنشاء ملف `src/server/__tests__/validation.property.test.ts`
    - **الخاصية 7: مخططات Zod ترفض المدخلات غير الصالحة وتقبل الصالحة**
    - **يتحقق من: المتطلبات 13.1, 13.2, 13.3**
    - اختبار: لأي بيانات عشوائية لا تطابق userSchema، يتم الرفض
    - اختبار: لأي بيانات صالحة وفق incomingSchema، يتم القبول
    - اختبار: لأي قيمة compliance_status غير مسموحة، يتم الرفض

  - [x] 7.2 اختبارات خصائص الأدوار والصلاحيات
    - إنشاء ملف `src/server/__tests__/roles.property.test.ts`
    - **الخاصية 8: صلاحيات Admin تشمل جميع الوحدات**
    - **يتحقق من: المتطلبات 19.2, 19.3**
    - اختبار: لأي وحدة وإجراء، Admin لديه صلاحية
    - اختبار: لأي دور غير Admin، صلاحياته مجموعة فرعية من Admin
    - اختبار: مجموعات الأدوار (ADMIN_ROLES, COMPLIANCE_ROLES, STAFF_ROLES) صحيحة

  - [x] 7.3 اختبارات خصائص BaseService.sanitizeBody
    - إنشاء ملف `src/server/__tests__/sanitize.property.test.ts`
    - **الخاصية 9: sanitizeBody يحول السلاسل الفارغة لحقول UUID إلى null**
    - **يتحقق من: المتطلبات 5.5**
    - اختبار: لأي كائن بحقول _id فارغة، تصبح null
    - اختبار: الحقول الأخرى تبقى دون تغيير

  - [x] 7.4 اختبارات خصائص انتقالات حالة المهام
    - إنشاء ملف `src/server/__tests__/taskStatus.property.test.ts`
    - **الخاصية 11: انتقالات حالة مهام التدقيق تتبع التسلسل المسموح**
    - **يتحقق من: المتطلبات 9.4**
    - اختبار: لأي مهمة في حالة معينة، فقط الانتقالات المسموحة تُقبل
    - اختبار: الانتقالات غير المسموحة تُرفض

- [x] 8. نقطة تفتيش - اختبارات الخصائص
  - تشغيل `npm run test` للتأكد من نجاح جميع الاختبارات
  - سؤال المستخدم إذا كانت هناك أسئلة

- [x] 9. اختبارات الخطافات والسياقات (Wave 5)
  - [x] 9.1 اختبارات usePermissions
    - إنشاء ملف `src/hooks/__tests__/usePermissions.test.ts`
    - اختبار hasPermission: مع صلاحيات محددة لكل وحدة وإجراء
    - اختبار Admin bypass: السماح بكل شيء
    - اختبار مستخدم بدون صلاحيات: رفض الكل
    - _المتطلبات: 15.1_

  - [x] 9.2 اختبارات useDebounce و useDebouncedCallback
    - إنشاء ملف `src/hooks/__tests__/useDebounce.test.ts`
    - اختبار تأخير تحديث القيمة بالمدة المحددة
    - اختبار إلغاء التأخير عند تغيير القيمة قبل انتهاء المهلة
    - استخدام vi.useFakeTimers()
    - _المتطلبات: 15.2_

  - [x] 9.3 اختبارات useIdleTimeout
    - إنشاء ملف `src/hooks/__tests__/useIdleTimeout.test.ts`
    - اختبار استدعاء دالة الخمول بعد انتهاء المهلة
    - اختبار إعادة التعيين عند النشاط (mousemove, keydown)
    - استخدام vi.useFakeTimers()
    - _المتطلبات: 15.3_

  - [x] 9.4 اختبارات useFormAutosave
    - إنشاء ملف `src/hooks/__tests__/useFormAutosave.test.ts`
    - اختبار حفظ بيانات النموذج تلقائياً في localStorage
    - اختبار استعادة البيانات عند إعادة التحميل
    - اختبار مسح البيانات بعد الإرسال الناجح
    - _المتطلبات: 15.4_

  - [x] 9.5 اختبارات useOptimisticUpdate
    - إنشاء ملف `src/hooks/__tests__/useOptimisticUpdate.test.ts`
    - اختبار تحديث الواجهة فوراً قبل استجابة الخادم
    - اختبار التراجع (rollback) عند فشل الطلب
    - اختبار عدم التراجع عند نجاح الطلب
    - _المتطلبات: 15.5_

  - [x] 9.6 اختبارات usePersistedFilters و useKeyboardShortcuts
    - إنشاء ملف `src/hooks/__tests__/usePersistedFilters.test.ts`
    - اختبار حفظ الفلاتر في localStorage واستعادتها
    - إنشاء ملف `src/hooks/__tests__/useKeyboardShortcuts.test.ts`
    - اختبار تسجيل الاختصارات واستدعاء الدوال عند الضغط
    - اختبار إلغاء التسجيل عند unmount
    - _المتطلبات: 15.6, 15.7_

  - [x] 9.7 اختبارات AuthContext
    - إنشاء ملف `src/context/__tests__/AuthContext.test.tsx`
    - اختبار تهيئة: فحص الجلسة الحالية
    - اختبار logout: مسح الرموز وإعادة التوجيه
    - اختبار تحديث حالة المصادقة عند تغيير الرمز
    - _المتطلبات: 16.1, 16.2_

  - [x] 9.8 اختبارات NotificationContext
    - إنشاء ملف `src/context/__tests__/NotificationContext.test.tsx`
    - اختبار تهيئة: إنشاء اتصال WebSocket
    - اختبار استلام إشعار: تحديث العداد وعرض toast
    - محاكاة WebSocket باستخدام vi.mock
    - _المتطلبات: 16.3, 16.4_

  - [x] 9.9 اختبارات PreferencesContext
    - إنشاء ملف `src/context/__tests__/PreferencesContext.test.tsx`
    - اختبار تغيير اللغة: تحديث اتجاه الصفحة (RTL/LTR)
    - اختبار تغيير السمة: تطبيق السمة وحفظها في localStorage
    - اختبار حفظ التفضيلات واستعادتها
    - _المتطلبات: 16.5, 16.6_

- [x] 10. نقطة تفتيش - اختبارات الخطافات والسياقات
  - تشغيل `npm run test` للتأكد من نجاح جميع الاختبارات
  - سؤال المستخدم إذا كانت هناك أسئلة

- [x] 11. اختبارات العميل: الأدوات والخدمات والمكونات (Wave 6)
  - [x] 11.1 اختبارات خصائص CryptoUtils
    - إنشاء ملف `src/utils/__tests__/CryptoUtils.test.ts`
    - **الخاصية 5: التشفير/فك التشفير round-trip**
    - **يتحقق من: المتطلبات 18.1**
    - اختبار: لأي بيانات نصية، encrypt ثم decrypt يعيد الأصل
    - اختبار: بيانات مختلفة تنتج نصوص مشفرة مختلفة

  - [x] 11.2 اختبارات خصائص SecureStorage
    - إنشاء ملف `src/utils/__tests__/SecureStorage.test.ts`
    - **الخاصية 6: SecureStorage round-trip**
    - **يتحقق من: المتطلبات 18.3**
    - اختبار: لأي مفتاح وقيمة، setItem ثم getItem يعيد الأصل
    - اختبار: removeItem يحذف القيمة

  - [x] 11.3 اختبارات خصائص DOMGuard
    - إنشاء ملف `src/utils/__tests__/DOMGuard.test.ts`
    - **الخاصية 10: DOMGuard يزيل جميع العناصر الخطرة**
    - **يتحقق من: المتطلبات 18.2**
    - اختبار: لأي HTML بـ script/iframe/onclick، يتم الإزالة
    - اختبار: المحتوى النصي الآمن يبقى

  - [x] 11.4 اختبارات SecurityLogger
    - إنشاء ملف `src/utils/__tests__/SecurityLogger.test.ts`
    - اختبار تسجيل أحداث الأمان مع الطابع الزمني والنوع والتفاصيل
    - اختبار أنواع الأحداث المختلفة
    - _المتطلبات: 18.5_

  - [x] 11.5 اختبارات خدمة API (interceptors)
    - إنشاء ملف `src/services/__tests__/api.test.ts`
    - اختبار interceptor 401: محاولة تحديث الرمز وإعادة الطلب
    - اختبار فشل التحديث: تسجيل خروج وإعادة توجيه
    - اختبار إرفاق CSRF تلقائياً لطلبات POST/PUT/DELETE
    - اختبار طابور التحديث: منع طلبات تحديث متعددة
    - _المتطلبات: 17.1-17.5_

  - [x] 11.6 اختبارات مكونات واجهة المستخدم العامة
    - إنشاء ملف `src/components/__tests__/Modal.test.tsx`
    - اختبار Modal: عرض/إخفاء، إغلاق بـ Escape والخلفية
    - إنشاء ملف `src/components/__tests__/Pagination.test.tsx`
    - اختبار Pagination: أرقام الصفحات، أزرار التنقل، onChange
    - إنشاء ملف `src/components/__tests__/ErrorBoundary.test.tsx`
    - اختبار ErrorBoundary: عرض واجهة بديلة عند الخطأ
    - _المتطلبات: 22.1-22.6_

  - [x] 11.7 اختبارات مكونات النماذج
    - إنشاء ملف `src/modules/__tests__/AuditPlanForm.test.tsx`
    - اختبار عرض الحقول المطلوبة ورسائل التحقق
    - اختبار الإرسال مع بيانات صالحة
    - إنشاء ملف `src/modules/__tests__/RiskForm.test.tsx`
    - اختبار حساب درجة المخاطر تلقائياً
    - _المتطلبات: 14.1-14.6_

  - [x] 11.8 اختبارات وحدات التطبيق الرئيسية
    - إنشاء ملف `src/modules/__tests__/Dashboard.test.tsx`
    - اختبار عرض البطاقات الإحصائية مع بيانات محاكاة
    - إنشاء ملف `src/modules/__tests__/AuditPlan.test.tsx`
    - اختبار عرض قائمة الخطط مع التصفية والبحث
    - إنشاء ملف `src/modules/__tests__/Correspondence.test.tsx`
    - اختبار عرض تبويبات الوارد والصادر والأرشيف
    - إنشاء ملف `src/modules/__tests__/UserManagement.test.tsx`
    - اختبار عرض قائمة المستخدمين مع أزرار الإجراءات حسب الصلاحيات
    - _المتطلبات: 23.1-23.5_

  - [x] 11.9 اختبارات إمكانية الوصول (Accessibility)
    - إضافة اختبارات a11y لجميع النماذج: تسميات الحقول، أدوار ARIA
    - اختبار التنقل بلوحة المفاتيح للمكونات التفاعلية
    - اختبار focus management في Modal و Dropdown
    - _المتطلبات: 14.6, 22.6_

- [x] 12. نقطة تفتيش نهائية
  - تشغيل `npm run test` للتأكد من نجاح جميع الاختبارات
  - تشغيل `npm run test:coverage` للتحقق من نسبة التغطية
  - سؤال المستخدم إذا كانت هناك أسئلة

## Notes

- المهام المعلمة بـ `*` اختيارية ويمكن تخطيها للوصول لـ MVP أسرع
- كل مهمة تشير لمتطلبات محددة لضمان التتبع
- نقاط التفتيش تضمن التحقق التدريجي
- اختبارات الخصائص تتحقق من خصائص الصحة العامة
- اختبارات الوحدة تتحقق من أمثلة محددة وحالات حدية

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": "wave-1",
      "name": "البنية التحتية للاختبارات",
      "tasks": ["1"],
      "dependsOn": []
    },
    {
      "id": "wave-2",
      "name": "اختبارات وحدة خدمات الخادم",
      "tasks": ["3"],
      "dependsOn": ["wave-1"]
    },
    {
      "id": "wave-3",
      "name": "اختبارات تكامل الخادم",
      "tasks": ["5"],
      "dependsOn": ["wave-2"]
    },
    {
      "id": "wave-4",
      "name": "اختبارات خصائص الخادم",
      "tasks": ["7"],
      "dependsOn": ["wave-3"]
    },
    {
      "id": "wave-5",
      "name": "اختبارات الخطافات والسياقات",
      "tasks": ["9"],
      "dependsOn": ["wave-1"]
    },
    {
      "id": "wave-6",
      "name": "اختبارات العميل",
      "tasks": ["11"],
      "dependsOn": ["wave-5"]
    }
  ]
}
```
