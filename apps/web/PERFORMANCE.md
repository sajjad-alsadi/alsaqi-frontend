# Performance Baseline

This document is the published performance baseline for the AL-SAQI frontend
(`apps/web`). It captures three things:

1. **Bundle composition** — what each `manualChunks` vendor group contains and why.
2. **Per-chunk gzip baseline** — the measured gzip size of every `manualChunks`
   group from a real production build, plus the committed CI ceilings.
3. **Core Web Vitals targets** — the field/lab thresholds the production preview
   build is held to.

It complements the automated guardrails:

- **Bundle-size budget** — `scripts/check-bundle-budget.mjs` enforces the
  per-chunk gzip ceilings in `scripts/bundle-budget.json` against the production
  `dist/`. It fails CI when any group exceeds its ceiling, when a budgeted group
  has no resolvable output file, or when the eager-vs-lazy ceiling invariant is
  violated.
- **Load tests** — `load-tests/workflow.js` (k6) exercises the
  login → audit-plan list → finding workflow. See `load-tests/README.md`. These
  are backend-dependent and run out of the CI critical path (scheduled /
  on-demand), so they are tracked for regressions rather than gating PRs.

> Sizes below are gzip kilobytes measured from a production `vite build`.
> Regenerate with `ANALYZE=true npm run build` (writes `dist/bundle-stats.html`)
> and re-measure with `node scripts/check-bundle-budget.mjs`.

---

## 1. Bundle composition

Code splitting is driven by the `manualChunks` function in `vite.config.ts`. No
vendor catch-all is used, so any module not matched below is split by Rollup into
the route/component chunk that imports it — preserving lazy-loading and
tree-shaking. Chunks are tagged **eager** (loaded on initial page load, so they
directly affect LCP/INP) or **lazy** (pulled in only when the relevant
route/feature is visited).

| Chunk            | Load  | Contents                                                                                          | Why it is grouped                                                              |
| ---------------- | ----- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `vendor-react`   | eager | `react`, `react-dom`, `react-router-dom`, `scheduler`, `framer-motion`/`motion`, `axios`, `react-hot-toast`, `goober` | Core runtime, routing, animation, and HTTP — needed before first paint.        |
| `vendor-query`   | eager | `@tanstack/react-query`                                                                            | Data-fetching layer wired in at the app root.                                  |
| `vendor-ui`      | eager | `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/*`               | Shared UI primitives/utilities used by the always-mounted Layout.              |
| `vendor-charts`  | lazy  | `recharts`, `d3-*`, `victory-*`                                                                    | Charting, loaded only with the Dashboard.                                      |
| `vendor-pdf`     | lazy  | `jspdf`, `jspdf-autotable`, `react-pdf`                                                            | PDF generation/viewing, loaded only when exporting/previewing PDFs.            |
| `vendor-excel`   | lazy  | `exceljs`                                                                                          | Spreadsheet export, loaded only on Excel export.                               |
| `vendor-editor`  | lazy  | `codemirror`, `@codemirror/*`                                                                      | Code editor; declared but **not currently emitted** (see note below).          |
| `vendor-i18n`    | lazy  | `i18next`, `react-i18next`, `i18next-browser-languagedetector`, `i18next-http-backend`            | Internationalization runtime + language detection/backend.                     |
| `vendor-forms`   | lazy  | `react-hook-form`, `@hookform/resolvers`, `zod`                                                    | Form handling and schema validation, loaded with form-heavy routes.            |

**Note on `vendor-editor`:** the group is defined in `manualChunks` but
CodeMirror is not currently reachable from the production entry graph, so no
`vendor-editor-*.js` file is emitted. It is therefore intentionally **not
budgeted** — budgeting a group with no resolvable output file would (correctly)
fail the budget check. If CodeMirror becomes part of the production output, add a
`vendor-editor` entry to `bundle-budget.json`.

---

## 2. Per-chunk gzip baseline

Measured from a production build, sorted by size. The **Ceiling** column is the
committed gzip budget in `scripts/bundle-budget.json` enforced by
`scripts/check-bundle-budget.mjs`. Ceilings are seeded from these measurements
with roughly 15% headroom.

| Chunk            | Load  | Measured gzip | Committed ceiling |
| ---------------- | ----- | ------------: | ----------------: |
| `vendor-excel`   | lazy  |    255.99 KB  |         295 KB    |
| `vendor-react`   | eager |    158.84 KB  |         185 KB    |
| `vendor-pdf`     | lazy  |    122.62 KB  |         185 KB    |
| `vendor-charts`  | lazy  |    107.66 KB  |         185 KB    |
| `vendor-forms`   | lazy  |     28.75 KB  |         185 KB    |
| `vendor-i18n`    | lazy  |     17.80 KB  |         185 KB    |
| `vendor-ui`      | eager |     17.22 KB  |          25 KB    |
| `vendor-query`   | eager |     10.45 KB  |          15 KB    |
| `vendor-editor`  | lazy  |   not emitted |     (unbudgeted)  |

**Eager-vs-lazy ceiling invariant.** Every eagerly-loaded chunk's ceiling
(`vendor-react` 185 KB, `vendor-ui` 25 KB, `vendor-query` 15 KB) is ≤ every
lazy group's ceiling. The lazy groups therefore share a 185 KB floor set by the
largest eager chunk (`vendor-react`), except `vendor-excel`, whose 295 KB
ceiling sits above that floor (it is lazy, so this does not affect initial-load
budgets). This keeps the initial-load surface tightly bounded while leaving
deferred features room to grow. The budget check fails if this invariant is ever
broken.

### How to regenerate

```bash
# From the repository root
ANALYZE=true npm --prefix apps/web run build   # emits dist/ + dist/bundle-stats.html
node apps/web/scripts/check-bundle-budget.mjs   # prints measured vs. committed per chunk
```

---

## 3. Core Web Vitals targets

Measured against the production preview build (`npm run preview`). These are the
thresholds the frontend is held to; regressions beyond them are treated as
performance defects.

| Metric                              | Target      | Notes                                            |
| ----------------------------------- | ----------- | ------------------------------------------------ |
| **LCP** (Largest Contentful Paint)  | ≤ 2500 ms   | Time to render the largest above-the-fold element. |
| **INP** (Interaction to Next Paint) | ≤ 200 ms    | Responsiveness to user interaction.              |
| **CLS** (Cumulative Layout Shift)   | ≤ 0.1       | Visual stability (unitless score).               |

These targets correspond to the "good" thresholds in the Web Vitals program. The
eagerly-loaded chunks (`vendor-react`, `vendor-ui`, `vendor-query`) are budgeted
most tightly precisely because they determine the initial-load cost that drives
LCP and INP.
