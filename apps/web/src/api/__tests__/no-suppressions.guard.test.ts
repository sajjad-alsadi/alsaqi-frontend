/**
 * Structural guard tests for suppression removal (FIX-FE-4).
 *
 * These are static/structural assertions (no runtime behavior under test). They
 * lock in the de-suppression work so the conflict-masking patterns cannot creep
 * back into the API layer:
 *
 *  - Zero `@ts-expect-error` directives anywhere under `apps/web/src/api`,
 *    except a small, explicit allowlist of modules whose suppressions mask a
 *    *genuine* shared-model divergence (the shared `id?: T` field lacks the
 *    `| undefined` that Zod's `.optional()` infers under
 *    `exactOptionalPropertyTypes`). Those modules cannot be de-suppressed
 *    without editing the frozen `packages/shared` (blocked by FIX-FE-1) or
 *    changing runtime validation (blocked by Req 4.6); the design defers them
 *    to the backend-coordinated schema reconciliation in FIX-FE-3. The guard
 *    still asserts the allowlist does not grow (Requirement 4.3).
 *  - No new `@ts-ignore` directives anywhere under `apps/web/src/api`
 *    (Requirement 4.3 — baseline is zero).
 *  - None of the affected schema modules (`dashboard.ts`, `risk-register.ts`,
 *    `user-management.ts`) carry a manual `: z.ZodType<` schema annotation, and
 *    none of them mask the `exactOptionalPropertyTypes` conflict with an
 *    `as any` / `as unknown` cast (Requirement 4.5).
 *
 * Production source only — test sources (`*.test.ts`, `*.property.test.ts`, and
 * everything under `__tests__/`) are excluded because they legitimately contain
 * these tokens (e.g. `{} as any` axios-response mocks, and this guard file
 * itself names the directives it forbids).
 *
 * Detection strips comments and string/template literals from code before
 * scanning for code-level patterns (`as any`, `as unknown`, `z.ZodType<`) so an
 * explanatory comment that merely mentions `z.ZodType` is not a false positive.
 * The `@ts-expect-error` / `@ts-ignore` directives are matched only inside
 * comment text (where TypeScript honors them), so prose elsewhere cannot match.
 *
 * Validates: Requirements 4.3, 4.5
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..', '..', '..'); // apps/web
const REPO_ROOT = resolve(WEB_ROOT, '..', '..');
const API_DIR = resolve(WEB_ROOT, 'src', 'api');
const MODULES_DIR = resolve(API_DIR, 'modules');

// The three schema modules de-suppressed under tasks 2.1–2.3.
const AFFECTED_SCHEMA_FILES = [
  resolve(MODULES_DIR, 'dashboard.ts'),
  resolve(MODULES_DIR, 'risk-register.ts'),
  resolve(MODULES_DIR, 'user-management.ts'),
];

/**
 * Modules whose `@ts-expect-error` masks a genuine shared-model divergence and
 * are deferred to FIX-FE-3 backend reconciliation (see file header). Tracked as
 * an explicit, frozen allowlist so the guard still fails if any *other* file
 * introduces a suppression. This set must shrink as reconciliation lands, never
 * grow.
 */
const DEFERRED_SUPPRESSION_FILES = new Set(
  ['findings.ts', 'notifications.ts', 'recommendations.ts', 'tasks.ts'].map((f) =>
    resolve(MODULES_DIR, f)
  )
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Recursively collect production `.ts` files (excluding tests and `.d.ts`). */
function collectProductionTsFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === '__tests__') continue; // skip test sources
      collectProductionTsFiles(full, acc);
    } else if (
      /\.ts$/.test(entry) &&
      !/\.test\.ts$/.test(entry) &&
      !/\.d\.ts$/.test(entry)
    ) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Split a TypeScript source into its `code` (comments + string/template
 * literals blanked out) and its `comments` (comment text only). A small
 * single-pass scanner — robust enough for our token-level guards and immune to
 * matches that live inside comments or string literals.
 */
function splitCodeAndComments(source: string): { code: string; comments: string } {
  let code = '';
  let comments = '';
  let state:
    | 'code'
    | 'line'
    | 'block'
    | 'squote'
    | 'dquote'
    | 'tquote' = 'code';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    switch (state) {
      case 'code':
        if (c === '/' && next === '/') {
          state = 'line';
          i += 2;
        } else if (c === '/' && next === '*') {
          state = 'block';
          i += 2;
        } else if (c === "'") {
          state = 'squote';
          code += ' ';
          i += 1;
        } else if (c === '"') {
          state = 'dquote';
          code += ' ';
          i += 1;
        } else if (c === '`') {
          state = 'tquote';
          code += ' ';
          i += 1;
        } else {
          code += c;
          i += 1;
        }
        break;
      case 'line':
        if (c === '\n') {
          state = 'code';
          code += '\n';
          comments += '\n';
          i += 1;
        } else {
          comments += c;
          i += 1;
        }
        break;
      case 'block':
        if (c === '*' && next === '/') {
          state = 'code';
          comments += ' ';
          i += 2;
        } else {
          comments += c;
          i += 1;
        }
        break;
      case 'squote':
        if (c === '\\') {
          i += 2;
        } else if (c === "'") {
          state = 'code';
          i += 1;
        } else {
          i += 1;
        }
        break;
      case 'dquote':
        if (c === '\\') {
          i += 2;
        } else if (c === '"') {
          state = 'code';
          i += 1;
        } else {
          i += 1;
        }
        break;
      case 'tquote':
        if (c === '\\') {
          i += 2;
        } else if (c === '`') {
          state = 'code';
          i += 1;
        } else {
          i += 1;
        }
        break;
    }
  }
  return { code, comments };
}

const repoRel = (p: string) => relative(REPO_ROOT, p).split('\\').join('/');

// ─── Suite ──────────────────────────────────────────────────────────────────

const apiFiles = collectProductionTsFiles(API_DIR);

describe('FIX-FE-4: zero suppressions across apps/web/src/api (Req 4.3)', () => {
  it('finds production source files to inspect', () => {
    // Sanity check so the guard cannot silently pass on an empty file set.
    expect(apiFiles.length).toBeGreaterThan(0);
  });

  it('has zero @ts-expect-error directives under apps/web/src/api outside the deferred allowlist (Req 4.3)', () => {
    const violations: string[] = [];
    const allowlistedWithSuppression = new Set<string>();
    for (const file of apiFiles) {
      const { comments } = splitCodeAndComments(readFileSync(file, 'utf-8'));
      if (/@ts-expect-error\b/.test(comments)) {
        if (DEFERRED_SUPPRESSION_FILES.has(file)) {
          allowlistedWithSuppression.add(file);
        } else {
          violations.push(repoRel(file));
        }
      }
    }
    expect(
      violations,
      `@ts-expect-error directives must not exist under apps/web/src/api outside the deferred allowlist:\n${violations
        .map((v) => `  ${v}`)
        .join('\n')}`
    ).toEqual([]);

    // The allowlist must not contain stale entries: every deferred file is
    // expected to still carry the justified suppression until reconciliation
    // lands. If one was cleaned up, remove it from DEFERRED_SUPPRESSION_FILES so
    // the guard tightens automatically.
    const staleAllowlist = [...DEFERRED_SUPPRESSION_FILES]
      .filter((f) => !allowlistedWithSuppression.has(f))
      .map((f) => repoRel(f));
    expect(
      staleAllowlist,
      `These files no longer carry a @ts-expect-error and should be removed from the deferred allowlist:\n${staleAllowlist
        .map((v) => `  ${v}`)
        .join('\n')}`
    ).toEqual([]);
  });

  it('has no @ts-ignore directives under apps/web/src/api (Req 4.3)', () => {
    const violations: string[] = [];
    for (const file of apiFiles) {
      const { comments } = splitCodeAndComments(readFileSync(file, 'utf-8'));
      if (/@ts-ignore\b/.test(comments)) {
        violations.push(repoRel(file));
      }
    }
    expect(
      violations,
      `@ts-ignore directives must not exist under apps/web/src/api:\n${violations
        .map((v) => `  ${v}`)
        .join('\n')}`
    ).toEqual([]);
  });
});

describe('FIX-FE-4: affected schemas carry no annotation/cast masking (Req 4.5)', () => {
  it('the affected schema files exist', () => {
    for (const file of AFFECTED_SCHEMA_FILES) {
      expect(existsSync(file), `expected ${repoRel(file)} to exist`).toBe(true);
    }
  });

  it('no affected schema carries a manual `: z.ZodType<` annotation (Req 4.5)', () => {
    const violations: string[] = [];
    for (const file of AFFECTED_SCHEMA_FILES) {
      const { code } = splitCodeAndComments(readFileSync(file, 'utf-8'));
      if (/\bz\s*\.\s*ZodType\s*</.test(code)) {
        violations.push(repoRel(file));
      }
    }
    expect(
      violations,
      `Affected schema modules must not annotate schemas as z.ZodType<...>:\n${violations
        .map((v) => `  ${v}`)
        .join('\n')}`
    ).toEqual([]);
  });

  it('no affected schema masks the conflict with `as any` / `as unknown` (Req 4.5)', () => {
    const violations: string[] = [];
    for (const file of AFFECTED_SCHEMA_FILES) {
      const { code } = splitCodeAndComments(readFileSync(file, 'utf-8'));
      const match = code.match(/\bas\s+(any|unknown)\b/);
      if (match) {
        violations.push(`${repoRel(file)}: uses "as ${match[1]}"`);
      }
    }
    expect(
      violations,
      `Affected schema modules must not mask the conflict with as any / as unknown:\n${violations
        .map((v) => `  ${v}`)
        .join('\n')}`
    ).toEqual([]);
  });
});
