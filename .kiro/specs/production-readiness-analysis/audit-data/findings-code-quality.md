# Code Quality Findings — Task 7.2: Shared Types, Dead Code, and Test Coverage

## Shared Types Usage (Requirement 6.4)

### CQ-001
- **Severity:** 🟡 Warning
- **File path:** `apps/web/src/api/modules/dashboard.ts`
- **Line number(s):** 1–35 (entire file)
- **Problem description:** Module defines local `DashboardStats` interface and does not import any types from `@alsaqi/shared`. While `@alsaqi/shared` does not currently export a `DashboardStats` type, the module uses `z.record(z.string(), z.unknown())` with no typed contract — all data is effectively `unknown`.
- **Production impact:** No compile-time guarantees on dashboard data shape; runtime errors are invisible until they manifest in the UI.
- **Suggested fix:** Define a `DashboardStats` interface in `@alsaqi/shared` and import it in this module. Replace the generic record schema with a typed Zod schema matching the backend response.

### CQ-002
- **Severity:** 🟡 Warning
- **File path:** `apps/web/src/api/modules/regulatory.ts`
- **Line number(s):** 8
- **Problem description:** Imports `CentralBankInstruction` from local `../../types` instead of `@alsaqi/shared`, even though `@alsaqi/shared` exports an identical `CentralBankInstruction` interface. This creates a parallel type definition that may drift.
- **Production impact:** Type inconsistencies between frontend and backend can develop silently if the local and shared types diverge.
- **Suggested fix:** Change import to `import type { CentralBankInstruction } from '@alsaqi/shared';` and remove the duplicate from the local `types.ts`.

### CQ-003
- **Severity:** 🟡 Warning
- **File path:** `apps/web/src/api/modules/user-management.ts`
- **Line number(s):** 1–180 (entire file)
- **Problem description:** Module defines local `Role`, `Permission`, `UserSession`, `JobTitle`, and `UserManagementSettings` interfaces without importing from `@alsaqi/shared`. Uses many generic `z.record(z.string(), z.unknown())` schemas with no typed contract.
- **Production impact:** No shared type contract for user management operations; changes in the backend API structure won't trigger compile-time errors.
- **Suggested fix:** Add these types to `@alsaqi/shared` and import them. Replace generic record schemas with typed Zod schemas.

## Dead Code / Unused Exports (Requirement 6.5)

### CQ-004
- **Severity:** 🟢 Improvement
- **File path:** `apps/web/src/types.ts`
- **Line number(s):** 179–189
- **Problem description:** `LawBankItem` interface is exported but never imported by any file in `apps/web/src/`. The shared package also exports this type at `@alsaqi/shared`.
- **Production impact:** Dead code increases bundle analysis noise and confuses maintainers about which types are in use.
- **Suggested fix:** Remove `LawBankItem` from the local `types.ts`. Any future consumers should import from `@alsaqi/shared`.

### CQ-005
- **Severity:** 🟢 Improvement
- **File path:** `apps/web/src/types.ts`
- **Line number(s):** 191–197
- **Problem description:** `FraudCase` interface is exported but never imported by any other file. The `FraudLog` module defines its own local `FraudCase` type in `modules/FraudLog/types.ts` with a different shape.
- **Production impact:** Duplicate, divergent type definitions create confusion. The local `types.ts` version is dead code.
- **Suggested fix:** Remove `FraudCase` from local `types.ts`. Consolidate on the `FraudLog/types.ts` version or promote to `@alsaqi/shared`.

### CQ-006
- **Severity:** 🟢 Improvement
- **File path:** `apps/web/src/types.ts`
- **Line number(s):** 228–239
- **Problem description:** `OrgPosition` interface is exported but never imported by any file in `apps/web/src/`. The shared package also exports this type.
- **Production impact:** Dead code that inflates the local types file and misleads developers into thinking it's actively used.
- **Suggested fix:** Remove `OrgPosition` from local `types.ts`. Consumers should import from `@alsaqi/shared`.

## Test Coverage Gaps (Requirement 6.6)

### CQ-007
- **Severity:** 🟡 Warning
- **File path:** `apps/web/src/api/hooks/useAuth.ts`
- **Line number(s):** 1–end
- **Problem description:** The `useAuth` React Query hook (login, register, change password mutations) has no corresponding test file. Auth flows are critical business logic.
- **Production impact:** Authentication mutations (login, register, change-password) are untested — regressions in auth flow could ship unnoticed.
- **Suggested fix:** Create `apps/web/src/api/hooks/__tests__/useAuth.test.ts` with tests for login success/failure, token refresh, and error handling.

### CQ-008
- **Severity:** 🟡 Warning
- **File path:** `apps/web/src/api/hooks/useFindings.ts`
- **Line number(s):** 1–end
- **Problem description:** The `useFindings` React Query hook has no corresponding test file. Findings are a core audit workflow entity.
- **Production impact:** CRUD operations on audit findings are untested at the hook level — silent regressions in data fetching/mutation logic.
- **Suggested fix:** Create `apps/web/src/api/hooks/__tests__/useFindings.test.ts`.

### CQ-009
- **Severity:** 🟡 Warning
- **File path:** `apps/web/src/api/hooks/useAuditPlans.ts`
- **Line number(s):** 1–end
- **Problem description:** The `useAuditPlans` React Query hook has no corresponding test file.
- **Production impact:** Audit plan CRUD is untested at the hook layer.
- **Suggested fix:** Create `apps/web/src/api/hooks/__tests__/useAuditPlans.test.ts`.

### CQ-010
- **Severity:** 🟡 Warning
- **File path:** `apps/web/src/api/hooks/useTasks.ts`
- **Line number(s):** 1–end
- **Problem description:** The `useTasks` React Query hook has no corresponding test file.
- **Production impact:** Task mutations are untested; regressions could break the task management workflow.
- **Suggested fix:** Create `apps/web/src/api/hooks/__tests__/useTasks.test.ts`.

### CQ-011
- **Severity:** 🟡 Warning
- **File path:** `apps/web/src/api/hooks/useUsers.ts`
- **Line number(s):** 1–end
- **Problem description:** The `useUsers` React Query hook has no corresponding test file.
- **Production impact:** User management CRUD is untested at the hook layer.
- **Suggested fix:** Create `apps/web/src/api/hooks/__tests__/useUsers.test.ts`.

### CQ-012
- **Severity:** 🟡 Warning
- **File path:** `apps/web/src/api/hooks/useNotifications.ts`
- **Line number(s):** 1–end
- **Problem description:** The `useNotifications` React Query hook has no corresponding test file.
- **Production impact:** Mark-read and notification listing are untested.
- **Suggested fix:** Create `apps/web/src/api/hooks/__tests__/useNotifications.test.ts`.

### CQ-013
- **Severity:** 🟡 Warning
- **File path:** `apps/web/src/api/httpClient.ts`
- **Line number(s):** 1–end
- **Problem description:** The legacy HTTP client wrapper (backward-compat Axios instance) has no dedicated test file. Many modules still import this directly.
- **Production impact:** Interceptor configuration (auth token attachment, 401 redirect) is only indirectly tested through `client.test.ts`. Direct consumers have no isolated coverage.
- **Suggested fix:** Add `apps/web/src/api/httpClient.test.ts` or ensure `client.test.ts` covers the backward-compat export path.

### CQ-014
- **Severity:** 🟡 Warning
- **File path:** `apps/web/src/context/UserContext.tsx`
- **Line number(s):** 1–end
- **Problem description:** `UserContext` (provides current user state to the entire app) has no corresponding test file in `context/__tests__/`.
- **Production impact:** User state management (set user, clear user, context value stability) is untested. AuthContext and NotificationContext both have tests, but UserContext does not.
- **Suggested fix:** Create `apps/web/src/context/__tests__/UserContext.test.tsx`.

## Test Infrastructure (Requirement 6.6)

### CQ-015
- **Severity:** 🟢 Improvement
- **File path:** `apps/web/src/test/`
- **Line number(s):** N/A (directory)
- **Problem description:** Test infrastructure exists and is reasonably complete — includes `setup.ts` (global mocks for localStorage, i18next, WebSocket, motion, IntersectionObserver, ResizeObserver, AudioContext, URL object methods), `helpers/render.tsx` (custom render with providers), `helpers/arbitraries.ts` (fast-check generators), `helpers/server.ts` (MSW-like helpers), and `factories/index.ts` (test data factories). However, there is no coverage configuration or threshold enforcement.
- **Production impact:** Without coverage thresholds, test coverage can silently degrade over time.
- **Suggested fix:** Add `coverage` configuration to `vitest.config.ts` with minimum thresholds (e.g., 60% for critical modules like `api/`, `context/`, `permissions/`).

## Dependency Version Pinning (Requirement 6.7)

### CQ-016
- **Severity:** 🟡 Warning
- **File path:** `apps/web/package.json`
- **Line number(s):** 17
- **Problem description:** `"@alsaqi/shared": "*"` uses a wildcard version range — the most open possible dependency specification.
- **Production impact:** Any breaking change in the shared package will be immediately picked up with no version gating. In a monorepo this is common practice, but in CI/CD it means a broken shared package can cascade into broken web builds with no rollback path.
- **Suggested fix:** Use `"workspace:*"` for explicit monorepo linking (if using pnpm/yarn workspaces) or pin to a specific version.

### CQ-017
- **Severity:** 🟢 Improvement
- **File path:** `apps/web/package.json`
- **Line number(s):** 18–52
- **Problem description:** All other dependencies use caret ranges (`^`): `@codemirror/commands: ^6.10.3`, `axios: ^1.13.6`, `react: ^19.2.7`, `zod: ^4.3.6`, etc. (34 dependencies total). Caret allows minor and patch updates which could introduce unexpected behavior.
- **Production impact:** Minor version bumps occasionally introduce breaking changes or subtle behavior differences. Risk is low but non-zero for production deployments.
- **Suggested fix:** Pin exact versions in production (`"react": "19.2.7"`) or use a lockfile strategy with `npm ci` to ensure deterministic installs. At minimum, ensure `package-lock.json` is committed and `npm ci` is used in CI.

### CQ-018
- **Severity:** 🟢 Improvement
- **File path:** `apps/web/package.json`
- **Line number(s):** 54
- **Problem description:** `devDependencies` use caret (`^`) and tilde (`~`) ranges: `typescript: ~5.9.3`, `terser: ^5.48.0`, `eslint-plugin-jsx-a11y: ^6.10.2`, `vitest-axe: ^0.1.0`.
- **Production impact:** DevDependency version drift is lower risk than runtime dependencies but can cause inconsistent local/CI build behavior.
- **Suggested fix:** Pin TypeScript to exact version (`"typescript": "5.9.3"`) since compiler version changes can affect type-checking behavior.
