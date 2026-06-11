# Production Readiness Score Calculation

**Date**: 2025-07-16
**Method**: Weighted penalty formula per design specification

---

## 1. Findings Count by Severity (After Deduplication)

| Severity | Count | Sources |
|----------|-------|---------|
| 🔴 Critical | 4 | BUILD-001, SEC-001, SEC-002, SEC-003 |
| 🟡 Warning | 50 | Build (2) + Performance (5) + Error Handling (5) + Code Quality 7.1 (15) + Code Quality 7.2 (11) + RTL 8.1 (1) + RTL 8.2 (11) |
| 🟢 Improvement | 20 | Performance (2) + Code Quality 7.1 (11) + Code Quality 7.2 (5) + RTL 8.1 (2) |
| **Total** | **74** | |

### Deduplication Applied

| Duplicate | Original | Resolution |
|-----------|----------|------------|
| CQ-016 (wildcard dep `*`) | BUILD-001 | Counted once as 🔴 Critical (BUILD-001) |
| CQ-017 (caret ranges) | BUILD-002 | Counted once as 🟡 Warning (BUILD-002) |

### Excluded (Not Findings)

| ID | Reason |
|----|--------|
| CQ-027 | Informational only (no TODO/FIXME found — positive result) |
| RTL-015 | Documented as acceptable (not a real finding) |
| RTL-016 | ✅ Pass (not a finding) |

---

## 2. Detailed Breakdown by Category

### Build Settings (3 findings)
| ID | Severity | Description |
|----|----------|-------------|
| BUILD-001 | 🔴 Critical | Wildcard `*` version for `@alsaqi/shared` |
| BUILD-002 | 🟡 Warning | Caret ranges on all 34 production dependencies |
| BUILD-003 | 🟡 Warning | `sourceMap: true` in base tsconfig |

### Security (3 findings)
| ID | Severity | Description |
|----|----------|-------------|
| SEC-001 | 🔴 Critical | Inline `onclick` handler incompatible with CSP |
| SEC-002 | 🔴 Critical | CSP missing `script-src` and `style-src` directives |
| SEC-003 | 🔴 Critical | `process.env.GEMINI_API_KEY` exposed in client bundle via Vite `define` |

### Performance (7 findings)
| ID | Severity | Description |
|----|----------|-------------|
| PERF-001 | 🟡 Warning | NotificationContext raw WebSocket without exponential backoff |
| PERF-002 | 🟡 Warning | AudioContext memory leak (never closed) |
| PERF-003 | 🟡 Warning | Stale closures in WebSocket useEffect |
| PERF-004 | 🟢 Improvement | Unoptimized PNG assets in public/ |
| PERF-011 | 🟡 Warning | ExcelJS statically imported (~1.2 MB) |
| PERF-012 | 🟡 Warning | react-pdf statically imported (~400+ KB) |
| PERF-015 | 🟢 Improvement | Dead PdfTemplateEditor with CodeMirror imports |

### Error Handling (5 findings)
| ID | Severity | Description |
|----|----------|-------------|
| ERR-001 | 🟡 Warning | SkeletonLoader dead code (never imported) |
| ERR-002 | 🟡 Warning | Inline ad-hoc spinners instead of shared component |
| ERR-003 | 🟡 Warning | httpClient bypasses retry logic (22+ modules affected) |
| ERR-004 | 🟡 Warning | No third-party error monitoring (Sentry/Bugsnag) |
| ERR-005 | 🟡 Warning | `console.error` stripped in production by Terser |

### Code Quality — Task 7.1 (26 findings)
| ID Range | Severity | Count | Description |
|----------|----------|-------|-------------|
| CQ-001 – CQ-011 | 🟢 Improvement | 11 | Console statements in production code |
| CQ-012 – CQ-026 | 🟡 Warning | 15 | `any` type assertions |

### Code Quality — Task 7.2 (16 findings, after deduplication)
| ID Range | Severity | Count | Description |
|----------|----------|-------|-------------|
| CQ-001 – CQ-003 | 🟡 Warning | 3 | Missing shared types (local types instead of @alsaqi/shared) |
| CQ-004 – CQ-006 | 🟢 Improvement | 3 | Dead code (unused exported interfaces) |
| CQ-007 – CQ-014 | 🟡 Warning | 8 | Test coverage gaps (critical hooks/context untested) |
| CQ-015 | 🟢 Improvement | 1 | No coverage threshold enforcement |
| CQ-018 | 🟢 Improvement | 1 | devDependency caret/tilde ranges |

### RTL & Arabic — Task 8.1 (3 findings)
| ID | Severity | Description |
|----|----------|-------------|
| RTL-001 | 🟡 Warning | Flash-of-wrong-direction for Arabic users |
| RTL-002 | 🟢 Improvement | Duplicate direction-setting logic |
| RTL-003 | 🟢 Improvement | Browser language detection overridden by hardcoded default |

### RTL & Arabic — Task 8.2 (11 findings)
| ID | Severity | Description |
|----|----------|-------------|
| RTL-004 | 🟡 Warning | Fragile hardcoded `right-3` on password toggle |
| RTL-005 | 🟡 Warning | Hardcoded `-mr-16` on decorative element |
| RTL-006 | 🟡 Warning | ArrowRight icon missing RTL mirroring (TopRisksList) |
| RTL-007 | 🟡 Warning | ArrowRight icons missing RTL mirroring (RiskRegister) |
| RTL-008 | 🟡 Warning | ChevronRight missing RTL mirroring (RolePermissions) |
| RTL-009 | 🟡 Warning | ChevronRight static rotation incorrect for RTL (ComplianceMatrix) |
| RTL-010 | 🟡 Warning | Slide animations don't adapt to text direction |
| RTL-011 | 🟡 Warning | Skip-link uses fixed `left` positioning |
| RTL-012 | 🟡 Warning | formatNumber manual digit replacement lacks grouping |
| RTL-013 | 🟡 Warning | formatService.ts same grouping issue as RTL-012 |
| RTL-014 | 🟡 Warning | Health percentage bypasses formatNumber entirely |

---

## 3. Score Calculation

### Formula

```
score = 100 - (critical × 10) - (warning × 3) - (improvement × 1)
```

### Calculation

```
score = 100 - (4 × 10) - (50 × 3) - (20 × 1)
score = 100 - 40 - 150 - 20
score = -110
```

### Clamping (0–100 bounds)

```
score = max(0, min(100, -110))
score = 0
```

### Critical Cap Check

> Rule: If any Critical findings exist, cap score at 70.

4 Critical findings exist → `min(score, 70)` → `min(0, 70)` = **0**

(Cap does not change the result since score is already below 70.)

---

## 4. Final Score

| Metric | Value |
|--------|-------|
| **Readiness Score** | **0 / 100** |
| Critical Findings | 4 |
| Warning Findings | 50 |
| Improvement Findings | 20 |
| Total Findings | 74 |
| Critical Cap Applied | Yes (but already below threshold) |

**Interpretation**: The application has significant production readiness gaps. The combination of 4 critical security/build issues and 50 warnings across multiple categories results in a score that exceeds the maximum penalty. Immediate attention to Critical findings is required before production deployment.

---

## 5. Blockers (All Critical Findings)

All Critical findings must be resolved before production deployment:

| # | ID | File | Summary |
|---|-----|------|---------|
| 1 | BUILD-001 | `apps/web/package.json` (line 14) | Wildcard `*` version for `@alsaqi/shared` — breaking changes propagate silently |
| 2 | SEC-001 | `apps/web/src/api/client.ts` (lines 175–188) | Inline `onclick` handler blocked by CSP — version update button non-functional in production |
| 3 | SEC-002 | `apps/web/Dockerfile` (line 78) | CSP missing `script-src` and `style-src` — potential silent breakage, no violation reporting |
| 4 | SEC-003 | `apps/web/vite.config.ts` (line 29) | `process.env.GEMINI_API_KEY` in Vite `define` — API key exposed in client bundle if set at build time |
