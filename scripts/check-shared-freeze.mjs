/**
 * packages/shared Freeze Guard (FIX-FE-1)
 *
 * Enforces requirement 1.2: while no Unified_Source decision has been agreed with
 * the Backend_Team, the Frontend_Repo SHALL make zero local edits to any file under
 * `packages/shared`, verified by a version-control diff producing no changed lines
 * under that path.
 *
 * Behavior:
 *   1. Runs a version-control (git) diff over `packages/shared` against a base ref.
 *   2. FAILS the build (exit 1) if any line changed under `packages/shared`.
 *   3. Exemptions (allow changes to pass):
 *      a. Unified_Source agreed  -> freeze is lifted entirely.
 *      b. FIX-FE-3 relocation under recorded Backend_Team approval -> changes confined
 *         to the relocation target paths (validators / endpoint contracts) are exempt,
 *         but any other changed file under `packages/shared` still fails.
 *
 * ── Exemption markers (documented contract) ─────────────────────────────────────
 *
 *   Unified_Source decision agreed (lifts the freeze completely):
 *     • Environment variable:  SHARED_UNIFIED_SOURCE_AGREED=true
 *     • OR approval file:      .kiro/approvals/unified-source.json   (file presence)
 *
 *   FIX-FE-3 relocation backend approval (exempts only the relocation target paths):
 *     • Environment variable:  FIX_FE3_BACKEND_APPROVAL=true
 *     • OR approval file:      .kiro/approvals/fix-fe-3-backend-approval.json
 *
 *   Base ref for the diff (optional override):
 *     • Environment variable:  SHARED_FREEZE_BASE_REF=<git ref>
 *     • In GitHub Actions PRs the base is auto-detected from GITHUB_BASE_REF.
 *     • Otherwise falls back to origin/main, origin/master, main, master.
 *
 * Requirements: 1.2
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ─── Configuration ──────────────────────────────────────────────────────────

/** Path (relative to repo root) that is frozen. */
const FROZEN_PATH = 'packages/shared';

/**
 * Paths (relative to repo root) into which FIX-FE-3 is explicitly allowed to write
 * code *under recorded Backend_Team approval*. Changes confined to these paths are
 * exempt when the FIX-FE-3 approval marker is present.
 */
const FIX_FE3_EXEMPT_PREFIXES = [
  'packages/shared/src/validators/',
  'packages/shared/src/types/endpoints/',
];

/** Approval-file locations (relative to repo root). */
const UNIFIED_SOURCE_APPROVAL_FILE = '.kiro/approvals/unified-source.json';
const FIX_FE3_APPROVAL_FILE = '.kiro/approvals/fix-fe-3-backend-approval.json';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function git(args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function gitSafe(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function refExists(ref) {
  return gitSafe(['rev-parse', '--verify', '--quiet', ref]) !== null;
}

/** Resolve the base ref to diff `packages/shared` against. */
function resolveBaseRef() {
  const explicit = process.env.SHARED_FREEZE_BASE_REF;
  if (explicit && explicit.trim()) return explicit.trim();

  // GitHub Actions pull_request context.
  const ghBase = process.env.GITHUB_BASE_REF;
  if (ghBase && ghBase.trim()) {
    const candidate = `origin/${ghBase.trim()}`;
    if (refExists(candidate)) return candidate;
    if (refExists(ghBase.trim())) return ghBase.trim();
  }

  for (const ref of ['origin/main', 'origin/master', 'main', 'master']) {
    if (refExists(ref)) return ref;
  }

  return null;
}

function isUnifiedSourceAgreed() {
  const env = process.env.SHARED_UNIFIED_SOURCE_AGREED;
  if (env && /^(1|true|yes)$/i.test(env.trim())) return true;
  return existsSync(resolve(REPO_ROOT, UNIFIED_SOURCE_APPROVAL_FILE));
}

function isFixFe3Approved() {
  const env = process.env.FIX_FE3_BACKEND_APPROVAL;
  if (env && /^(1|true|yes)$/i.test(env.trim())) return true;
  return existsSync(resolve(REPO_ROOT, FIX_FE3_APPROVAL_FILE));
}

function isFixFe3ExemptPath(path) {
  return FIX_FE3_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Collect changed files (with line-change counts) under `packages/shared`,
 * comparing the base ref against the current working tree, plus untracked files.
 *
 * Returns an array of { path, added, removed, untracked }.
 */
function collectChangedFiles(baseRef) {
  const changes = new Map();

  // Tracked changes (committed + uncommitted) between base and working tree.
  if (baseRef) {
    const numstat = gitSafe(['diff', '--numstat', baseRef, '--', FROZEN_PATH]);
    if (numstat) {
      for (const line of numstat.split('\n')) {
        if (!line.trim()) continue;
        const [addedRaw, removedRaw, ...pathParts] = line.split('\t');
        const path = pathParts.join('\t');
        if (!path) continue;
        // Binary files report "-" for counts; treat as 1 change.
        const added = addedRaw === '-' ? 1 : Number.parseInt(addedRaw, 10) || 0;
        const removed = removedRaw === '-' ? 1 : Number.parseInt(removedRaw, 10) || 0;
        changes.set(path, { path, added, removed, untracked: false });
      }
    }
  }

  // Untracked (new, not-yet-committed) files under the frozen path.
  const untracked = gitSafe([
    'ls-files',
    '--others',
    '--exclude-standard',
    '--',
    FROZEN_PATH,
  ]);
  if (untracked) {
    for (const path of untracked.split('\n')) {
      if (!path.trim()) continue;
      if (!changes.has(path)) {
        changes.set(path, { path, added: 1, removed: 0, untracked: true });
      }
    }
  }

  return [...changes.values()];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('🧊 packages/shared Freeze Guard (FIX-FE-1, requirement 1.2)');
  console.log('─'.repeat(60));

  // Not a git repository -> cannot run a version-control diff. Fail loud.
  if (gitSafe(['rev-parse', '--is-inside-work-tree']) !== 'true') {
    console.error('❌ Not inside a git work tree; cannot run the freeze diff.');
    process.exit(1);
  }

  // Exemption (a): Unified_Source agreed -> freeze lifted entirely.
  if (isUnifiedSourceAgreed()) {
    console.log('✅ Unified_Source decision is recorded — the freeze is lifted.');
    console.log('   (marker: SHARED_UNIFIED_SOURCE_AGREED or ' + UNIFIED_SOURCE_APPROVAL_FILE + ')');
    process.exit(0);
  }

  const baseRef = resolveBaseRef();
  if (!baseRef) {
    console.warn(
      '⚠️  Could not resolve a base ref (set SHARED_FREEZE_BASE_REF). ' +
        'Comparing against HEAD for uncommitted + untracked changes only.'
    );
  } else {
    console.log(`Base ref for diff: ${baseRef}`);
  }

  const changed = collectChangedFiles(baseRef ?? 'HEAD');

  if (changed.length === 0) {
    console.log(`✅ No changed lines under \`${FROZEN_PATH}\`. Freeze intact.\n`);
    process.exit(0);
  }

  const fix3Approved = isFixFe3Approved();
  if (fix3Approved) {
    console.log(
      '🔓 FIX-FE-3 backend approval recorded — relocation target paths are exempt:'
    );
    for (const p of FIX_FE3_EXEMPT_PREFIXES) console.log(`     • ${p}`);
    console.log('');
  }

  const exempt = [];
  const violations = [];
  for (const change of changed) {
    if (fix3Approved && isFixFe3ExemptPath(change.path)) {
      exempt.push(change);
    } else {
      violations.push(change);
    }
  }

  if (exempt.length > 0) {
    console.log(`Exempt (FIX-FE-3 relocation under approval): ${exempt.length} file(s)`);
    for (const c of exempt) {
      console.log(`  • ${c.path} (+${c.added} -${c.removed})`);
    }
    console.log('');
  }

  if (violations.length === 0) {
    console.log(
      `✅ All ${changed.length} changed file(s) under \`${FROZEN_PATH}\` are covered ` +
        'by the FIX-FE-3 relocation exemption. Freeze respected.\n'
    );
    process.exit(0);
  }

  console.log(
    `❌ ${violations.length} file(s) under \`${FROZEN_PATH}\` changed while no ` +
      'Unified_Source decision is agreed (requirement 1.2):\n'
  );
  for (const c of violations) {
    const tag = c.untracked ? ' [untracked]' : '';
    console.log(`  • ${c.path} (+${c.added} -${c.removed})${tag}`);
  }

  console.log('\n' + '─'.repeat(60));
  console.log('packages/shared is frozen until a Unified_Source decision is agreed.');
  console.log('To proceed, do one of the following:');
  console.log('  • Record the Unified_Source decision');
  console.log(`    (set SHARED_UNIFIED_SOURCE_AGREED=true or add ${UNIFIED_SOURCE_APPROVAL_FILE}).`);
  console.log('  • For FIX-FE-3 schema relocation under recorded Backend_Team approval,');
  console.log(`    set FIX_FE3_BACKEND_APPROVAL=true or add ${FIX_FE3_APPROVAL_FILE},`);
  console.log('    and confine changes to the relocation target paths.');
  console.log('  • Otherwise, revert the changes under packages/shared.\n');

  process.exit(1);
}

main();
