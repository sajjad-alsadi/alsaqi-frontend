/**
 * Unified_Source Switch-Over & Teardown Check (FIX-FE-1)
 *
 * Enforces the preconditions that gate switching `@alsaqi/shared` over to the
 * agreed Unified_Source and removing the duplicated local copy at
 * `packages/shared`. This script is an ENFORCING CHECK — it never deletes
 * anything. When all preconditions pass it REPORTS readiness; teardown itself
 * remains a deliberate, separately-performed step.
 *
 * Requirements enforced:
 *   • 1.3 — WHEN a Unified_Source decision is agreed, every `@alsaqi/shared`
 *           import SHALL resolve from the Unified_Source such that zero imports
 *           resolve from the duplicated local copy.
 *   • 1.4 — IF the import switch leaves any `@alsaqi/shared` import unresolved or
 *           failing to build, THEN block removal of the local copy, retain the
 *           local files unchanged, and surface the unresolved imports.
 *   • 1.5 — WHEN every import resolves from the Unified_Source, the type-equality
 *           check passes, and `tsc` reports zero errors and zero local-copy
 *           imports, the duplicated local copy SHALL be removed.
 *
 * ── Marker contract (shared with the FIX-FE-1 freeze guard) ─────────────────────
 *
 *   Unified_Source decision agreed (un-gates teardown evaluation):
 *     • Environment variable:  SHARED_UNIFIED_SOURCE_AGREED=true
 *     • OR approval file:      .kiro/approvals/unified-source.json   (file presence)
 *
 *   The approval file MAY describe the agreed Unified_Source so this check can
 *   verify imports no longer resolve from the local copy. Recognized shape
 *   (all fields optional; presence of the file alone is sufficient to un-gate):
 *     {
 *       "source": "npm" | "git-submodule" | "workspace",
 *       "specifier": "@alsaqi/shared",
 *       "localCopyPath": "packages/shared"   // path that must no longer be imported
 *     }
 *
 *   Optional command overrides (defaults shown):
 *     • TEARDOWN_TYPECHECK_CMD   (default: `npm run typecheck -w @alsaqi/web`)
 *     • TEARDOWN_EQUALITY_CMD    (default: `npm run typecheck -w @alsaqi/shared`)
 *
 * ── Exit-code semantics ─────────────────────────────────────────────────────────
 *
 *   exit 0  →  Safe state. EITHER teardown is correctly gated (no decision yet, the
 *              local copy is retained), OR all preconditions pass and the repo is
 *              READY for teardown (reported, not performed).
 *   exit 1  →  A decision IS agreed but one or more preconditions FAILED. Removal is
 *              blocked, the local copy is retained unchanged, and the specific
 *              unresolved imports / failures are surfaced above.
 *
 * Run with:  node scripts/check-unified-source-teardown.mjs
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ─── Configuration ──────────────────────────────────────────────────────────

/** The duplicated local copy that teardown would eventually remove. */
const LOCAL_COPY_PATH = 'packages/shared';

/** The package specifier consumers import. */
const SHARED_SPECIFIER = '@alsaqi/shared';

/** Approval-file location (relative to repo root). Shared with the freeze guard. */
const UNIFIED_SOURCE_APPROVAL_FILE = '.kiro/approvals/unified-source.json';

/** tsconfig files that may carry a `@alsaqi/shared` path alias. */
const TSCONFIG_CANDIDATES = [
  'tsconfig.base.json',
  'tsconfig.json',
  'apps/web/tsconfig.json',
  'apps/web/tsconfig.node.json',
];

/** Roots scanned for source imports (the local copy itself is excluded). */
const IMPORT_SCAN_ROOTS = ['apps'];

/** Directories never worth scanning. */
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];

// ─── Generic helpers ────────────────────────────────────────────────────────

function rel(absPath) {
  return relative(REPO_ROOT, absPath).split('\\').join('/');
}

function envIsTrue(value) {
  return typeof value === 'string' && /^(1|true|yes)$/i.test(value.trim());
}

/** Run a command, returning { ok, output }. Never throws. */
function runCmd(cmd) {
  try {
    const output = execSync(cmd, {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, output: output ?? '' };
  } catch (err) {
    const output = `${err.stdout ?? ''}${err.stderr ?? ''}` || String(err.message ?? err);
    return { ok: false, output };
  }
}

/** Tolerant JSON-with-comments reader for tsconfig files. */
function readJsonc(absPath) {
  try {
    const raw = readFileSync(absPath, 'utf-8');
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

/** Recursively collect source files under a directory. */
function collectSourceFiles(absDir, acc) {
  let entries;
  try {
    entries = readdirSync(absDir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(absDir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      acc.push(full);
    }
  }
  return acc;
}

// ─── Marker / decision detection ──────────────────────────────────────────────

function readUnifiedSourceApproval() {
  if (envIsTrue(process.env.SHARED_UNIFIED_SOURCE_AGREED)) {
    return { agreed: true, viaEnv: true, config: null };
  }
  const file = resolve(REPO_ROOT, UNIFIED_SOURCE_APPROVAL_FILE);
  if (existsSync(file)) {
    const config = readJsonc(file);
    return { agreed: true, viaEnv: false, config };
  }
  return { agreed: false, viaEnv: false, config: null };
}

// ─── Precondition (a): zero imports resolve from the local copy ────────────────
//
// The local copy is wired two ways: a tsconfig `paths` alias mapping
// `@alsaqi/shared` -> `packages/shared/src/...`, and possibly direct relative
// imports reaching into `packages/shared`. After switching to the Unified_Source,
// neither should remain.

function findLocalCopyAliasPointers() {
  const pointers = [];
  for (const candidate of TSCONFIG_CANDIDATES) {
    const abs = resolve(REPO_ROOT, candidate);
    if (!existsSync(abs)) continue;
    const json = readJsonc(abs);
    const paths = json?.compilerOptions?.paths;
    if (!paths || typeof paths !== 'object') continue;
    for (const [alias, targets] of Object.entries(paths)) {
      if (!alias.startsWith(SHARED_SPECIFIER)) continue;
      const targetList = Array.isArray(targets) ? targets : [targets];
      for (const target of targetList) {
        if (typeof target === 'string' && target.includes(LOCAL_COPY_PATH)) {
          pointers.push({ file: candidate, alias, target });
        }
      }
    }
  }
  return pointers;
}

const RELATIVE_IMPORT_RE =
  /(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function findRelativeLocalCopyImports() {
  const localCopyAbs = resolve(REPO_ROOT, LOCAL_COPY_PATH);
  const hits = [];

  for (const root of IMPORT_SCAN_ROOTS) {
    const absRoot = resolve(REPO_ROOT, root);
    if (!existsSync(absRoot)) continue;
    const files = collectSourceFiles(absRoot, []);
    for (const file of files) {
      // Never flag files that live inside the local copy itself.
      if (file.startsWith(localCopyAbs)) continue;
      let contents;
      try {
        contents = readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      RELATIVE_IMPORT_RE.lastIndex = 0;
      let match;
      while ((match = RELATIVE_IMPORT_RE.exec(contents)) !== null) {
        const spec = match[1] ?? match[2] ?? match[3];
        if (!spec || !(spec.startsWith('./') || spec.startsWith('../'))) continue;
        const resolved = resolve(dirname(file), spec);
        if (resolved.startsWith(localCopyAbs)) {
          hits.push({ file: rel(file), specifier: spec });
        }
      }
    }
  }
  return hits;
}

function checkNoLocalCopyImports() {
  const aliasPointers = findLocalCopyAliasPointers();
  const relativeImports = findRelativeLocalCopyImports();
  const ok = aliasPointers.length === 0 && relativeImports.length === 0;
  return { ok, aliasPointers, relativeImports };
}

// ─── Precondition (b): type-equality check passes ──────────────────────────────
//
// The Extra_Shared_Types equality guard is a compile-time check in
// `packages/shared/src/types/__baseline__/type-equality.ts`; type-checking the
// shared package exercises it.

function checkTypeEquality() {
  const cmd =
    process.env.TEARDOWN_EQUALITY_CMD || 'npm run typecheck -w @alsaqi/shared';
  const { ok, output } = runCmd(cmd);
  return { ok, cmd, output };
}

// ─── Precondition (c): tsc reports zero errors ─────────────────────────────────

function checkTscZeroErrors() {
  const cmd =
    process.env.TEARDOWN_TYPECHECK_CMD || 'npm run typecheck -w @alsaqi/web';
  const { ok, output } = runCmd(cmd);
  return { ok, cmd, output };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('🔁 Unified_Source Switch-Over & Teardown Check (FIX-FE-1)');
  console.log('   Requirements 1.3 / 1.4 / 1.5');
  console.log('─'.repeat(64));

  const decision = readUnifiedSourceApproval();

  // ── Gate: no Unified_Source decision yet → teardown is blocked by definition.
  // "Not removing" is the correct safe behavior, so this is a passing CI state.
  if (!decision.agreed) {
    console.log('🚧 Teardown is GATED — no Unified_Source decision is recorded.');
    console.log('');
    console.log(`   The duplicated local copy at \`${LOCAL_COPY_PATH}\` is retained unchanged.`);
    console.log('   This is the expected current state (requirement 1.2 keeps the copy frozen,');
    console.log('   and requirements 1.3–1.5 only apply once a decision is agreed).');
    console.log('');
    console.log('   To un-gate this check once the Backend_Team agrees a Unified_Source:');
    console.log(`     • set SHARED_UNIFIED_SOURCE_AGREED=true, or`);
    console.log(`     • add ${UNIFIED_SOURCE_APPROVAL_FILE}`);
    console.log('');
    console.log('✅ Correctly blocked: nothing removed, local copy intact.\n');
    process.exit(0);
  }

  console.log(
    `📌 Unified_Source decision is recorded (${
      decision.viaEnv ? 'env marker' : UNIFIED_SOURCE_APPROVAL_FILE
    }).`
  );
  if (decision.config && typeof decision.config === 'object') {
    const { source, specifier } = decision.config;
    if (source) console.log(`   Source kind: ${source}`);
    if (specifier) console.log(`   Specifier:   ${specifier}`);
  }
  console.log('   Evaluating teardown preconditions (1.3 / 1.4 / 1.5)…\n');

  const failures = [];

  // (a) zero imports resolve from the local copy ─────────────────────────────
  const imports = checkNoLocalCopyImports();
  if (imports.ok) {
    console.log('✅ (a) No `@alsaqi/shared` imports resolve from the local copy.');
  } else {
    console.log('❌ (a) `@alsaqi/shared` imports still resolve from the local copy:');
    for (const p of imports.aliasPointers) {
      console.log(
        `     • tsconfig alias "${p.alias}" -> "${p.target}" in ${p.file} (repoint to the Unified_Source)`
      );
    }
    for (const h of imports.relativeImports) {
      console.log(`     • ${h.file} imports "${h.specifier}" (reaches into ${LOCAL_COPY_PATH})`);
    }
    failures.push('local-copy imports still present (req 1.3/1.4)');
  }

  // (b) type-equality check passes ───────────────────────────────────────────
  const equality = checkTypeEquality();
  if (equality.ok) {
    console.log('✅ (b) Extra_Shared_Types type-equality check passes.');
  } else {
    console.log(`❌ (b) Type-equality check FAILED (\`${equality.cmd}\`):`);
    console.log(indent(equality.output));
    failures.push('type-equality check failed (req 1.5)');
  }

  // (c) tsc reports zero errors ──────────────────────────────────────────────
  const tsc = checkTscZeroErrors();
  if (tsc.ok) {
    console.log('✅ (c) TypeScript build reports zero errors.');
  } else {
    console.log(`❌ (c) TypeScript build reported errors (\`${tsc.cmd}\`):`);
    console.log(indent(tsc.output));
    failures.push('tsc reported errors / unresolved imports (req 1.4/1.5)');
  }

  console.log('\n' + '─'.repeat(64));

  if (failures.length > 0) {
    console.log('🛑 Teardown BLOCKED — removal of the local copy is not permitted.');
    console.log('   Per requirement 1.4, the local files are RETAINED UNCHANGED.');
    console.log('   Unmet preconditions:');
    for (const f of failures) console.log(`     • ${f}`);
    console.log('\n   Resolve the issues above, then re-run this check.\n');
    process.exit(1);
  }

  // All preconditions pass. Per the design, REPORT readiness rather than delete.
  console.log('🎉 All teardown preconditions PASS (requirement 1.5):');
  console.log('     • zero imports resolve from the local copy');
  console.log('     • type-equality check passes');
  console.log('     • tsc reports zero errors');
  console.log('');
  console.log(`✅ READY FOR TEARDOWN: \`${LOCAL_COPY_PATH}\` can now be safely removed.`);
  console.log('   (This check does not delete anything — perform removal deliberately,');
  console.log('    e.g. `git rm -r packages/shared`, then re-run the full build.)\n');
  process.exit(0);
}

function indent(text) {
  return String(text)
    .split('\n')
    .map((line) => (line ? `       ${line}` : line))
    .join('\n')
    .replace(/\n+$/, '');
}

main();
