# Bugfix Requirements Document

## Introduction

يوثّق هذا المستند العيوب الحرجة في جودة الكود التي تمنع نشر نظام الساقي (AL-SAQI) في بيئة الإنتاج. رغم أن التصميم المعماري والأمني ممتاز، إلا أن هذه المشاكل تجعل البناء غير موثوق، والاختبارات غير صالحة، والجلسات غير مستقرة في بيئة متعددة الخوادم. تشمل العيوب: فشل فحص TypeScript مع مئات الأخطاء، 29,392 مشكلة ESLint، 40 اختبار فاشل (أخطرها اختبارات نظام الصلاحيات)، واستخدام ذاكرة مؤقتة محلية بدلاً من Redis للجلسات.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `tsc --build` is executed on the monorepo THEN the system fails with hundreds of TypeScript errors including `implicitly has an 'any' type`, `A spread argument must either have a tuple type or be passed to a rest parameter`, and `Cannot find module` — making reliable production builds impossible

1.2 WHEN ESLint is executed across the codebase THEN the system reports 29,392 problems (approximately 10,000 explicit errors) primarily from untyped `any` usage, `non-null assertions` (`!` operator), and `console.log` statements left in production code

1.3 WHEN the test suite is executed (`vitest --run`) THEN 40 tests fail across 17 files out of 2,430 total tests — most critically `PermissionService.property.test.ts` fails with `TypeError: ModuleRegistry.getModule.mockReturnValue is not a function` due to incorrect mock setup against the actual module export structure

1.4 WHEN the application runs in a multi-instance deployment (multiple API containers behind a load balancer) THEN session cache data stored in the in-memory `Map` in `src/server/middleware/auth.ts` is not shared between instances, causing users to lose their cached session state when requests are routed to different instances

1.5 WHEN a user authenticates on instance A and their next request is routed to instance B THEN the system performs redundant database lookups for every request (losing the 5-minute cache benefit) and may exhibit inconsistent behavior when cache invalidation occurs on only one instance

### Expected Behavior (Correct)

2.1 WHEN `tsc --build` is executed on the monorepo THEN the system SHALL compile successfully with zero errors, producing valid JavaScript output for all packages (`packages/shared`, `packages/api`, `apps/web`)

2.2 WHEN ESLint is executed across the codebase THEN the system SHALL report zero errors (warnings may remain for non-critical style issues) — auto-fixable issues SHALL be resolved with `eslint --fix`, and remaining errors SHALL be fixed manually with proper type annotations, removal of non-null assertions where unsafe, and replacement of `console.log` with a structured logger

2.3 WHEN the test suite is executed (`vitest --run`) THEN all 2,430 tests SHALL pass with zero failures — specifically, `PermissionService.property.test.ts` SHALL correctly mock `ModuleRegistry.getModule` as a function that returns module definitions, matching the actual export structure of `src/permissions/registry.ts`

2.4 WHEN the application runs in a multi-instance deployment THEN the session cache SHALL use Redis (already configured in `deploy/docker-compose.yml` on port 6379) as a shared cache store, ensuring all instances share the same session cache state

2.5 WHEN a user authenticates on instance A and their next request is routed to instance B THEN the system SHALL retrieve the cached session data from Redis, providing consistent cache behavior across all instances without redundant database queries

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `tsc --build` succeeds after fixing type errors THEN the system SHALL CONTINUE TO enforce `strict: true` mode in `tsconfig.base.json` — fixes SHALL NOT disable strict checking or use `// @ts-ignore` suppressions as a workaround

3.2 WHEN ESLint errors are resolved THEN the system SHALL CONTINUE TO enforce the existing ESLint rules — fixes SHALL NOT disable rules globally or add blanket `eslint-disable` comments

3.3 WHEN the 40 failing tests are fixed THEN the remaining 2,390 passing tests SHALL CONTINUE TO pass without modification — test fixes SHALL NOT alter the production code behavior that the passing tests validate

3.4 WHEN Redis is adopted for session caching THEN the system SHALL CONTINUE TO function correctly in single-instance/development mode by falling back to in-memory cache when `REDIS_URL` is not configured

3.5 WHEN Redis is adopted for session caching THEN the existing cache invalidation API (`invalidateUserCache`, `clearPermissionCache` exports) SHALL CONTINUE TO work with the same function signatures so that calling code is not broken

3.6 WHEN TypeScript type annotations are added THEN the runtime behavior of all API endpoints SHALL CONTINUE TO produce the same responses for the same inputs — type fixes are compile-time only and SHALL NOT change runtime logic

3.7 WHEN `console.log` statements are replaced with a structured logger THEN the system SHALL CONTINUE TO log the same semantic information (authentication errors, permission denials, backup status) at appropriate severity levels

