/**
 * Bundle-Size Budget Check (Stream 4 — Performance Baseline)
 *
 * Measures the gzip size of every budgeted `manualChunks` group in the
 * production `dist/` and compares it against committed per-group ceilings
 * (kilobytes) defined in `bundle-budget.json`. Mirrors the design's
 * "Bundle-size budget check" pseudocode and Correctness Property 8.
 *
 * The check fails (exits non-zero) when ANY of the following holds:
 *   1. A budgeted group's measured gzip size exceeds its committed ceiling.
 *      Each violation is reported with its measured and committed sizes.
 *      (Requirement 4.1)
 *   2. The committed ceilings violate the eager-vs-lazy invariant: every
 *      eagerly-loaded chunk (`vendor-react`, `vendor-ui`, `vendor-query`)
 *      ceiling must be <= every lazy-loaded group ceiling. (Requirement 4.5)
 *   3. A budgeted group's output file cannot be resolved in `dist/`.
 *      The unresolved group is identified. (Requirement 4.6)
 *
 * Run from anywhere:
 *   node apps/web/scripts/check-bundle-budget.mjs            # uses apps/web/dist
 *   node apps/web/scripts/check-bundle-budget.mjs <distDir>  # custom dist dir
 *
 * Requirements: 4.1, 4.5, 4.6
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..'); // apps/web
const REPO_ROOT = resolve(WEB_ROOT, '..', '..'); // repository root

export const BUDGET_FILE = resolve(__dirname, 'bundle-budget.json');
export const DEFAULT_DIST_DIR = resolve(WEB_ROOT, 'dist');

/** The set of chunks that are loaded on initial page load (Req 4.5). */
export const EAGER_CHUNKS = ['vendor-react', 'vendor-ui', 'vendor-query'];

// ─── Budget loading ───────────────────────────────────────────────────────────

/**
 * Read and normalize the committed budget entries.
 * @param {string} [budgetFile]
 * @returns {Array<{ chunk: string, eager: boolean, maxGzipKb: number }>}
 */
export function loadBudgets(budgetFile = BUDGET_FILE) {
  const raw = JSON.parse(readFileSync(budgetFile, 'utf-8'));
  const budgets = Array.isArray(raw) ? raw : raw.budgets;
  if (!Array.isArray(budgets)) {
    throw new Error(`Malformed budget file (expected a "budgets" array): ${budgetFile}`);
  }
  return budgets.map((b) => ({
    chunk: b.chunk,
    // Fall back to the canonical eager list if the entry omits the flag.
    eager: typeof b.eager === 'boolean' ? b.eager : EAGER_CHUNKS.includes(b.chunk),
    maxGzipKb: b.maxGzipKb,
  }));
}

// ─── Measurement helpers ──────────────────────────────────────────────────────

/**
 * Resolve the emitted output file(s) for a `manualChunks` group inside dist/.
 * Chunks are emitted as `assets/<chunk>-<hash>.js`. Returns the absolute paths
 * of every matching JS file (normally exactly one), or an empty array when the
 * group produced no resolvable output.
 *
 * @param {string} distDir
 * @param {string} chunk
 * @returns {string[]}
 */
export function findChunkFiles(distDir, chunk) {
  const assetsDir = join(distDir, 'assets');
  const searchDir = existsSync(assetsDir) && statSync(assetsDir).isDirectory() ? assetsDir : distDir;
  if (!existsSync(searchDir)) return [];

  // Match `<chunk>-<hash>.js` exactly so that e.g. `vendor-pdf` never matches a
  // longer-named sibling. Hash is rollup's base64url-ish token (no extra dash
  // segment that would extend the logical chunk name).
  const pattern = new RegExp(`^${escapeRegExp(chunk)}-[^/]+\\.js$`);
  return readdirSync(searchDir)
    .filter((f) => pattern.test(f))
    .map((f) => join(searchDir, f));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Gzip size, in KB, of one or more files (summed). Uses a fixed compression
 * level so measurements are deterministic across machines/CI.
 * @param {string[]} files
 * @returns {number}
 */
export function gzipSizeKb(files) {
  let total = 0;
  for (const file of files) {
    total += gzipSync(readFileSync(file), { level: 9 }).length;
  }
  return total / 1024;
}

// ─── Invariant: eager ceilings <= every lazy ceiling (Req 4.5) ─────────────────

/**
 * Validate that every eager chunk's committed ceiling is <= every lazy group's
 * committed ceiling. Returns the list of offending (eager, lazy) ceiling pairs;
 * an empty list means the invariant holds.
 *
 * @param {Array<{ chunk: string, eager: boolean, maxGzipKb: number }>} budgets
 * @returns {Array<{ eagerChunk: string, eagerKb: number, lazyChunk: string, lazyKb: number }>}
 */
export function findEagerInvariantBreaches(budgets) {
  const eager = budgets.filter((b) => b.eager);
  const lazy = budgets.filter((b) => !b.eager);
  const breaches = [];
  for (const e of eager) {
    for (const l of lazy) {
      if (e.maxGzipKb > l.maxGzipKb) {
        breaches.push({
          eagerChunk: e.chunk,
          eagerKb: e.maxGzipKb,
          lazyChunk: l.chunk,
          lazyKb: l.maxGzipKb,
        });
      }
    }
  }
  return breaches;
}

// ─── Core check ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} BudgetResult
 * @property {boolean} pass
 * @property {Array<{ chunk: string, measuredGzipKb: number, maxGzipKb: number }>} violations
 * @property {Array<{ chunk: string, maxGzipKb: number }>} unresolved
 * @property {Array<{ eagerChunk: string, eagerKb: number, lazyChunk: string, lazyKb: number }>} eagerBreaches
 * @property {Array<{ chunk: string, eager: boolean, measuredGzipKb: number, maxGzipKb: number }>} measured
 */

/**
 * Check the production dist/ against the committed budgets.
 *
 * Loop invariant (mirrors design pseudocode): after processing the first i
 * entries, `violations` holds exactly the over-budget groups among those i, and
 * `unresolved` holds exactly the groups among those i with no resolvable file.
 *
 * @param {string} distDir
 * @param {Array<{ chunk: string, eager: boolean, maxGzipKb: number }>} budgets
 * @returns {BudgetResult}
 */
export function checkBundleBudget(distDir, budgets) {
  const violations = [];
  const unresolved = [];
  const measured = [];

  // Req 4.5: the committed ceilings themselves must satisfy the eager<=lazy
  // invariant regardless of measured sizes.
  const eagerBreaches = findEagerInvariantBreaches(budgets);

  for (const entry of budgets) {
    const files = findChunkFiles(distDir, entry.chunk);
    if (files.length === 0) {
      // Req 4.6: budgeted group whose output file cannot be resolved.
      unresolved.push({ chunk: entry.chunk, maxGzipKb: entry.maxGzipKb });
      continue;
    }
    const measuredGzipKb = gzipSizeKb(files);
    measured.push({
      chunk: entry.chunk,
      eager: entry.eager,
      measuredGzipKb,
      maxGzipKb: entry.maxGzipKb,
    });
    if (measuredGzipKb > entry.maxGzipKb) {
      // Req 4.1: over-budget group, recorded with measured + committed sizes.
      violations.push({ chunk: entry.chunk, measuredGzipKb, maxGzipKb: entry.maxGzipKb });
    }
  }

  const pass =
    violations.length === 0 && unresolved.length === 0 && eagerBreaches.length === 0;
  return { pass, violations, unresolved, eagerBreaches, measured };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function fmtKb(kb) {
  return `${kb.toFixed(2)} KB`;
}

function main() {
  const arg = process.argv[2];
  const distDir = arg ? resolve(process.cwd(), arg) : DEFAULT_DIST_DIR;

  console.log('📦 Bundle-Size Budget Check');
  console.log('─'.repeat(64));
  console.log(`\nDist directory: ${relative(REPO_ROOT, distDir) || distDir}`);

  if (!existsSync(distDir)) {
    console.error(`\n❌ Build output directory not found: ${distDir}`);
    console.error('   Expected `vite build` to run before this check.');
    process.exit(1);
  }

  let budgets;
  try {
    budgets = loadBudgets();
  } catch (err) {
    console.error(`\n❌ Could not load budget file: ${err.message}`);
    process.exit(1);
  }

  console.log(`Budgeted groups: ${budgets.length}\n`);

  const result = checkBundleBudget(distDir, budgets);

  // Per-group measured table (only for resolved groups).
  if (result.measured.length > 0) {
    const nameW = Math.max(8, ...result.measured.map((m) => m.chunk.length));
    console.log(
      `  ${'GROUP'.padEnd(nameW)}  ${'KIND'.padEnd(5)}  ${'MEASURED'.padStart(11)}  ${'CEILING'.padStart(10)}`
    );
    console.log(`  ${'-'.repeat(nameW)}  ${'-'.repeat(5)}  ${'-'.repeat(11)}  ${'-'.repeat(10)}`);
    for (const m of result.measured) {
      const flag = m.measuredGzipKb > m.maxGzipKb ? ' ❌' : '';
      console.log(
        `  ${m.chunk.padEnd(nameW)}  ${(m.eager ? 'eager' : 'lazy').padEnd(5)}  ${fmtKb(m.measuredGzipKb).padStart(11)}  ${fmtKb(m.maxGzipKb).padStart(10)}${flag}`
      );
    }
    console.log('');
  }

  if (result.eagerBreaches.length > 0) {
    console.error('❌ Eager-vs-lazy ceiling invariant violated (Req 4.5):');
    console.error('   Every eager chunk ceiling must be <= every lazy group ceiling.');
    for (const b of result.eagerBreaches) {
      console.error(
        `   • eager ${b.eagerChunk} (${fmtKb(b.eagerKb)}) > lazy ${b.lazyChunk} (${fmtKb(b.lazyKb)})`
      );
    }
    console.error('');
  }

  if (result.unresolved.length > 0) {
    console.error('❌ Budgeted group(s) with no resolvable output file in dist/ (Req 4.6):');
    for (const u of result.unresolved) {
      console.error(`   • ${u.chunk} (committed ceiling ${fmtKb(u.maxGzipKb)}) — no matching chunk emitted`);
    }
    console.error('');
  }

  if (result.violations.length > 0) {
    console.error('❌ Group(s) over their committed gzip ceiling (Req 4.1):');
    for (const v of result.violations) {
      console.error(
        `   • ${v.chunk}: measured ${fmtKb(v.measuredGzipKb)} > committed ${fmtKb(v.maxGzipKb)}`
      );
    }
    console.error('');
  }

  if (result.pass) {
    console.log('✅ All budgeted chunks are within their committed gzip ceilings.\n');
    process.exit(0);
  }

  console.log('─'.repeat(64));
  console.log('Bundle-size budget check failed. Code-split, lazy-load, or justify');
  console.log('and raise the ceiling in apps/web/scripts/bundle-budget.json.\n');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
