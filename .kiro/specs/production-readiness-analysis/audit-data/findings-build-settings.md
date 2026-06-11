# Findings — Build Settings (Task 2.1 & 2.2)

**Audit Date**: 2025-07-16
**Category**: Build Settings
**Files Inspected**: `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `tsconfig.base.json`, `apps/web/package.json`

---

## Task 2.2 — TypeScript and Package Configuration

### PASS: TypeScript strict mode enabled

- **File**: `tsconfig.base.json` (line 6)
- **Check**: `strict: true` is set in the base config, inherited by `apps/web/tsconfig.json` via `"extends": "../../tsconfig.base.json"`
- **Result**: ✅ PASS — Full strict mode active

### PASS: Production-appropriate compiler options

- **File**: `apps/web/tsconfig.json` (lines 8–10)
- **Check**: Additional strict checks beyond `strict: true`
- **Result**: ✅ PASS — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noPropertyAccessFromIndexSignature` are all enabled. These go above and beyond baseline strictness.

### PASS: Dev dependencies are appropriate

- **File**: `apps/web/package.json` (lines 45–49, devDependencies)
- **Check**: Verify no unnecessary dev dependencies leak into the production bundle
- **Result**: ✅ PASS — All devDependencies (`eslint-plugin-jsx-a11y`, `terser`, `typescript`, `vitest-axe`) are legitimate build/test tools. Vite tree-shakes and does not include devDependencies in the production bundle.

---

### BUILD-001

| Field | Value |
|-------|-------|
| **ID** | BUILD-001 |
| **Severity** | 🔴 Critical |
| **File** | `apps/web/package.json` |
| **Line** | 14 (dependencies → `@alsaqi/shared`) |
| **Problem** | Workspace dependency `@alsaqi/shared` uses wildcard version `"*"` — an open range that accepts any version without constraint |
| **Production Impact** | A breaking change in the shared package could silently propagate to the web app during CI installs or monorepo updates, causing runtime crashes with no version lock to pin a known-good state |
| **Suggested Fix** | Pin to `"workspace:*"` (if using pnpm/yarn workspaces with lockfile enforcement) or an explicit semver version like `"1.0.0"`. Ensure the lockfile is committed and used in CI (`npm ci` / `pnpm install --frozen-lockfile`). |

---

### BUILD-002

| Field | Value |
|-------|-------|
| **ID** | BUILD-002 |
| **Severity** | 🟡 Warning |
| **File** | `apps/web/package.json` |
| **Lines** | 15–44 (dependencies) |
| **Problem** | All 34 production dependencies use caret (`^`) version ranges (e.g., `"^19.2.7"`, `"^5.90.21"`, `"^1.13.6"`). Caret ranges allow automatic minor/patch upgrades that may introduce regressions. |
| **Production Impact** | A non-deterministic build if the lockfile is not enforced in CI. Even with a lockfile, `npm install` (without `--frozen-lockfile`) or a lockfile regeneration can silently pull newer versions that break functionality. |
| **Suggested Fix** | Pin critical dependencies to exact versions (remove `^`), especially for: `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `axios`, `zod`. At minimum, ensure CI uses `npm ci` or equivalent to enforce lockfile. Consider using a tool like `npm-check-updates` for controlled upgrades. |

---

### BUILD-003

| Field | Value |
|-------|-------|
| **ID** | BUILD-003 |
| **Severity** | 🟡 Warning |
| **File** | `tsconfig.base.json` |
| **Line** | 13 (`"sourceMap": true`) |
| **Problem** | Base TypeScript config enables source maps globally. While Vite's build config ultimately controls production sourcemap output, this setting means TypeScript generates `.map` files during compilation, and any misconfiguration in the build pipeline could ship full source maps to production. |
| **Production Impact** | If source maps accidentally reach production (e.g., via a build pipeline change), they expose original TypeScript source code, file structure, and variable names to end users — aiding reverse-engineering and vulnerability discovery. |
| **Suggested Fix** | Verify that `apps/web/vite.config.ts` sets `build.sourcemap` to `'hidden'` or `false` for production builds. Optionally, override `sourceMap: false` in `apps/web/tsconfig.json` since `noEmit: true` means TS-generated maps aren't used anyway (Vite handles its own). Add a CI check to ensure no `.map` files appear in the final `dist/` output. |

---

## Summary

| Status | Count |
|--------|-------|
| 🔴 Critical | 1 |
| 🟡 Warning | 2 |
| ✅ PASS | 3 |

**Critical Findings**: BUILD-001 (wildcard `*` version for `@alsaqi/shared`)
**Warning Findings**: BUILD-002 (caret ranges on all production deps), BUILD-003 (sourceMap in base tsconfig)
