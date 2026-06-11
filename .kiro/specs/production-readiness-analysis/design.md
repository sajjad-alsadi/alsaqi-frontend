# Design Document: Production Readiness Analysis

## Overview

This feature produces a standalone `PRODUCTION_READINESS_REPORT.md` file by manually auditing the Al-Saqi web frontend codebase (`apps/web/src/`) across six categories. The "Analyzer" is the developer or agent performing the audit — this is not an automated tool or runtime script. The output is a single Markdown document placed in the project root.

The audit is a read-only inspection process that:
1. Traverses all source files in scope
2. Applies category-specific checklists to each file
3. Records findings with severity, location, and remediation
4. Computes a readiness score and identifies blockers
5. Writes the structured report

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Audit Process                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. File Discovery                                       │
│     └─ Enumerate all .ts, .tsx, .html, .env files       │
│        in apps/web/src/ + config files at project level  │
│                                                          │
│  2. Category Inspection (per file)                       │
│     ├─ Build Settings (config files only)               │
│     ├─ Security (all source files)                      │
│     ├─ Performance (components, hooks, contexts)        │
│     ├─ Error Handling/UX (components, API modules)      │
│     ├─ Code Quality/Stability (all source files)        │
│     └─ RTL/Arabic Support (components, i18n config)     │
│                                                          │
│  3. Findings Collection                                  │
│     └─ Each finding: severity, file, line, description, │
│        impact, fix                                       │
│                                                          │
│  4. Score Calculation                                    │
│     └─ Weighted penalty formula with critical cap        │
│                                                          │
│  5. Report Generation                                    │
│     └─ Assemble Markdown with executive summary,        │
│        categorized findings, infrastructure recs         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### File Discovery Scope

- **Source files**: `apps/web/src/**/*.ts`, `apps/web/src/**/*.tsx`
- **Configuration files**: `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/package.json`
- **HTML files**: `apps/web/index.html`
- **Environment files**: `apps/web/.env`, `apps/web/.env.example`

The total count of inspected files is recorded in the report header.

### Audit Category Checklists

| Category | Applicable File Types | Key Checks |
|----------|----------------------|------------|
| Build Settings | `vite.config.ts`, `tsconfig.json`, `package.json` | Terser options, sourcemaps, chunk splitting, env leakage, strict mode |
| Security | All `.ts`/`.tsx` source files | Token storage, CSRF, hardcoded secrets, CSP, Zod validation, XSS, auth guards |
| Performance | Components, hooks, contexts, API modules | Lazy loading, memoization, React Query config, bundle deps, re-renders, WebSocket |
| Error Handling/UX | Components, API modules, routing | ErrorBoundary coverage, async error handling, loading states, localized errors, retry/backoff, 401 flow |
| Code Quality | All source files, `package.json` | Console statements, `any` casts, TODO/FIXME, shared types, dead code, test coverage, pinned deps |
| RTL/Arabic | Components, i18n config, CSS/styles | i18next config, logical CSS properties, `dir` attribute, icon mirroring, form RTL, locale formatting |

### Readiness Score Algorithm

The score starts at 100 and applies weighted penalties:

```typescript
function calculateReadinessScore(findings: Finding[]): number {
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const warningCount = findings.filter(f => f.severity === 'warning').length;
  const improvementCount = findings.filter(f => f.severity === 'improvement').length;

  let score = 100
    - (criticalCount * 10)
    - (warningCount * 3)
    - (improvementCount * 1);

  // Clamp to bounds
  score = Math.max(0, Math.min(100, score));

  // Apply critical cap
  if (criticalCount > 0) {
    score = Math.min(score, 70);
  }

  return score;
}
```

### Report Output Structure

The generated `PRODUCTION_READINESS_REPORT.md` follows this layout:

```markdown
# Production Readiness Report — Al-Saqi Web Frontend

**Generated**: {date}
**Files Inspected**: {count}

## Executive Summary

### Readiness Score
{score_emoji} **{score}%** Production Ready

### Findings Summary
| Severity | Count |
|----------|-------|
| 🔴 Critical | {n} |
| 🟡 Warning | {n} |
| 🟢 Improvement | {n} |

### Blockers
{blocker_list_or_ready_message}

---

## Build Settings
{findings ordered by severity}

## Security
{findings ordered by severity}

## Performance
{findings ordered by severity}

## Error Handling & UX
{findings ordered by severity}

## Code Quality & Stability
{findings ordered by severity}

## RTL & Arabic Support
{findings ordered by severity}

---

## Infrastructure Recommendations
{list of missing production tooling}
```

### Severity Classification Rules

| Category | Default Severity | Notes |
|----------|-----------------|-------|
| Security | 🔴 Critical | All security findings are critical per Requirement 3.8 |
| Build Settings | 🟡 Warning (default) | Critical if secrets are exposed |
| Performance | 🟡 Warning (default) | Critical if memory leaks detected |
| Error Handling | 🟡 Warning (default) | Critical if no error boundaries at all |
| Code Quality | 🟢 Improvement (default) | Warning for `any` casts, Critical for no tests on auth logic |
| RTL/Arabic | 🟡 Warning (default) | Critical if `dir` attribute not set |

### Blocker Entry Format

Each blocker entry in the executive summary:

```markdown
- **{file_path}** — {one_line_summary} → [See Finding {id}](#{anchor})
```

### Infrastructure Recommendations Checklist

The report includes recommendations for production tooling not found in the codebase:

1. **Error Monitoring** — Sentry, Bugsnag, or equivalent
2. **Content Security Policy** — CSP headers in deployment config
3. **Health Checks** — Endpoint for uptime monitoring
4. **Feature Flags** — LaunchDarkly, Unleash, or equivalent
5. **Rate Limiting** — API request throttling
6. **Performance Monitoring** — Web Vitals reporting
7. **Log Aggregation** — Structured logging pipeline

## Components and Interfaces

### Input Interface

The Analyzer reads files from the filesystem. No runtime APIs are consumed.

```typescript
interface AuditInput {
  /** Root directory of the project */
  projectRoot: string;
  /** Source directory to scan */
  sourceDir: 'apps/web/src/';
  /** Config files at project/app level */
  configFiles: string[];
}
```

### Output Interface

A single Markdown file written to the project root:

```typescript
interface AuditOutput {
  /** Output file path */
  filePath: 'PRODUCTION_READINESS_REPORT.md';
  /** All findings collected during audit */
  findings: Finding[];
  /** Computed readiness score */
  readinessScore: number;
  /** Subset of findings where severity === 'critical' */
  blockers: Finding[];
  /** Infrastructure recommendations */
  infrastructureRecs: string[];
  /** Total files inspected */
  filesInspected: number;
}
```

## Data Models

### Finding

```typescript
interface Finding {
  /** Unique identifier within the report (e.g., "SEC-001") */
  id: string;
  /** Which audit domain this belongs to */
  category: AuditCategory;
  /** Severity classification */
  severity: 'critical' | 'warning' | 'improvement';
  /** Relative path from project root */
  filePath: string;
  /** Line number where the issue occurs */
  lineNumber: number;
  /** Clear description of what's wrong */
  problem: string;
  /** What happens in production if not fixed */
  impact: string;
  /** How to resolve the issue */
  suggestedFix: string;
}
```

### Audit Category

```typescript
type AuditCategory =
  | 'Build Settings'
  | 'Security'
  | 'Performance'
  | 'Error Handling/UX'
  | 'Code Quality/Stability'
  | 'RTL/Arabic Support';
```

### Score Calculation Parameters

```typescript
interface ScoreCalculation {
  baseScore: 100;
  penalties: {
    critical: number;   // -10 points per finding
    warning: number;    // -3 points per finding
    improvement: number; // -1 point per finding
  };
  cap: {
    /** If any critical findings exist, max score is 70 */
    criticalCap: 70;
  };
  bounds: {
    min: 0;
    max: 100;
  };
}
```

## Error Handling

Since this is a manual audit process (not a runtime tool), error handling applies to the audit methodology:

- **File not found**: Skip and note in report that file was inaccessible
- **Ambiguous findings**: Default to higher severity (Warning over Improvement)
- **Conflicting patterns**: Document both observations in the finding description

## Testing Strategy

Since this feature produces a static Markdown report through manual code inspection, testing focuses on verifying the **report structure** and **score calculation logic** rather than the audit inspection process itself.

### Unit Tests (Example-Based)

- Verify the score calculation function produces correct output for known inputs
- Verify report template contains all required sections
- Verify blocker extraction correctly filters critical findings
- Verify finding formatting includes all five required fields

### Property Tests

- Score calculation maintains correct bounds and cap behavior across random finding sets
- Severity ordering is preserved after sorting any arbitrary findings list
- Blockers list bijects with critical findings for any input

### Integration Tests

- Generate a report from a known test fixture directory and verify structure
- Verify file count matches actual files in test fixture

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Finding Completeness

For any finding generated by the Analyzer, the finding SHALL contain all five required fields: file path, line number, problem description, production impact statement, and suggested fix. No field may be empty or omitted.

**Validates: Requirements 2.6, 8.4**

### Property 2: Security Findings are Critical

For any finding classified under the Security audit category, its severity SHALL be 🔴 Critical. No security finding may be classified as Warning or Improvement.

**Validates: Requirements 3.8**

### Property 3: Dependency Version Pinning

For any dependency listed in `package.json` (dependencies or devDependencies), its version specifier SHALL NOT use open ranges (no `*`, no `>=`, no unpinned `latest`). Caret (`^`) and tilde (`~`) ranges are flagged as warnings.

**Validates: Requirements 6.7**

### Property 4: Severity Ordering Within Categories

For any two adjacent findings within the same Audit_Category section of the report, the first finding's severity SHALL be greater than or equal to the second finding's severity (Critical ≥ Warning ≥ Improvement).

**Validates: Requirements 8.5**

### Property 5: Weighted Severity Penalty

For any two sets of findings where Set A contains more 🔴 Critical findings than Set B (with all else equal), the readiness score for Set A SHALL be lower than the score for Set B. Similarly, more Warnings produce a lower score than more Improvements (given equal counts of higher-severity findings).

**Validates: Requirements 9.2**

### Property 6: Critical Cap at 70%

For any findings set that contains one or more 🔴 Critical findings, the calculated Readiness_Score SHALL be less than or equal to 70.

**Validates: Requirements 9.3**

### Property 7: Blockers List Completeness

For any findings set, the Blockers list SHALL contain exactly the set of findings with 🔴 Critical severity — no Critical finding is omitted from blockers, and no non-Critical finding appears in blockers.

**Validates: Requirements 10.1**

### Property 8: Zero Criticals Produces Ready Message

For any findings set where the count of 🔴 Critical findings is zero, the Blockers section SHALL display "No Blockers — Ready for Production" instead of a findings list.

**Validates: Requirements 10.3**
