/**
 * Coverage Gate — per-file critical-path thresholds (Stream 7 — Coverage Robustness)
 *
 * Enforces the security- & observability-critical per-file coverage targets on top
 * of (and without lowering) the global 70.00% floor that `vitest --coverage` already
 * enforces via `coverage.thresholds` in vitest.config.ts.
 *
 * Why this script exists in addition to the Vitest config:
 *   Vitest's glob thresholds resolve a glob to the set of report files it matches.
 *   When a target file is MISSING or ABSENT from the coverage report, the glob
 *   matches zero files, the aggregate percentage is reported as "Unknown", and the
 *   comparison `"Unknown" < 90` evaluates to `false` — so the threshold is SILENTLY
 *   SKIPPED. Requirement 7.4 forbids exactly that. This gate reads the
 *   `json-summary` report and fails when a target is below threshold, missing, or
 *   absent from the report — reporting the offending paths and measured percentages.
 *
 * The check fails (exits non-zero) when ANY of the following holds:
 *   1. A per-file target's measured line coverage is below its threshold (>= 90%),
 *      reported with the file path and measured percentage. (Requirement 7.1)
 *   2. The global lines/functions/branches/statements coverage falls below the
 *      70.00% floor. (Requirement 7.2 — additive to, never lowering, the floor: Req 7.3)
 *   3. A per-file target is missing or absent from the coverage report, so per-file
 *      thresholds cannot be silently skipped. (Requirement 7.4)
 *
 * Run from anywhere (after `vitest --coverage` has produced the json-summary report):
 *   node apps/web/scripts/check-coverage-thresholds.mjs
 *   node apps/web/scripts/check-coverage-thresholds.mjs <coverage-summary.json>
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 30.1, 30.2, 30.3
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..'); // apps/web
const REPO_ROOT = resolve(WEB_ROOT, '..', '..'); // repository root

export const DEFAULT_SUMMARY_FILE = resolve(WEB_ROOT, 'coverage', 'coverage-summary.json');

/** Global floor, mirrored from vitest.config.ts `coverage.thresholds` (Req 7.2/7.3). */
export const GLOBAL_FLOOR = 70;
export const GLOBAL_METRICS = ['lines', 'functions', 'branches', 'statements'];

/**
 * Security- & observability-critical modules that must each meet a tightened
 * per-file line-coverage threshold. Paths are relative to apps/web. (Req 7.1)
 */
export const PER_FILE_TARGETS = [
  { path: 'src/api/client.ts', minLines: 90 },
  { path: 'src/api/ws/websocket-client.ts', minLines: 90 },
  { path: 'src/utils/sentry.ts', minLines: 90 },
  // Export utilities held to the higher per-file tier so critical export logic
  // stays well tested. (Req 30.1: csvExport; Req 30.2: PDF & DOCX exports)
  { path: 'src/utils/csvExport.ts', minLines: 90 },
  { path: 'src/utils/pdfExport.ts', minLines: 90 },
  { path: 'src/utils/docxExport.ts', minLines: 90 },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Normalize a (possibly absolute) report key to a web-root-relative POSIX path. */
export function toWebRelative(key, webRoot = WEB_ROOT) {
  // json-summary keys are absolute paths; `total` is the only non-path key.
  const rel = key.includes('/') || key.includes('\\') ? relative(webRoot, key) : key;
  return rel.replace(/\\/g, '/');
}

/**
 * Build a map of web-root-relative path -> file coverage entry from a json-summary
 * object (skipping the special `total` aggregate key).
 * @param {Record<string, unknown>} summary
 * @param {string} [webRoot]
 * @returns {Map<string, any>}
 */
export function indexSummaryByPath(summary, webRoot = WEB_ROOT) {
  const byPath = new Map();
  for (const [key, value] of Object.entries(summary)) {
    if (key === 'total') continue;
    byPath.set(toWebRelative(key, webRoot), value);
  }
  return byPath;
}

/** A line pct is usable only when it is a finite number; "Unknown" / undefined are not. */
function isUsablePct(pct) {
  return typeof pct === 'number' && Number.isFinite(pct);
}

// ─── Core check ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} CoverageGateResult
 * @property {boolean} pass
 * @property {Array<{ path: string }>} missing            Targets absent from the report (Req 7.4)
 * @property {Array<{ path: string, measuredLines: number, minLines: number }>} below  Below per-file threshold (Req 7.1)
 * @property {Array<{ path: string, measuredLines: number, minLines: number }>} measured  All resolved targets
 * @property {Array<{ metric: string, measured: (number|string), floor: number }>} globalFailures  Global floor breaches (Req 7.2)
 */

/**
 * Evaluate the coverage gate against a parsed json-summary object.
 *
 * @param {Record<string, any>} summary  Parsed coverage-summary.json
 * @param {Array<{ path: string, minLines: number }>} [targets]
 * @param {{ webRoot?: string, globalFloor?: number }} [opts]
 * @returns {CoverageGateResult}
 */
export function checkCoverageThresholds(summary, targets = PER_FILE_TARGETS, opts = {}) {
  const webRoot = opts.webRoot ?? WEB_ROOT;
  const globalFloor = opts.globalFloor ?? GLOBAL_FLOOR;

  const byPath = indexSummaryByPath(summary, webRoot);

  const missing = [];
  const below = [];
  const measured = [];

  for (const target of targets) {
    const entry = byPath.get(target.path);
    // Req 7.4: a target that is missing or absent from the report fails the gate so
    // per-file thresholds can never be silently skipped.
    if (!entry || !entry.lines || !isUsablePct(entry.lines.pct)) {
      missing.push({ path: target.path });
      continue;
    }
    const measuredLines = entry.lines.pct;
    measured.push({ path: target.path, measuredLines, minLines: target.minLines });
    if (measuredLines < target.minLines) {
      // Req 7.1: below the tightened per-file line threshold.
      below.push({ path: target.path, measuredLines, minLines: target.minLines });
    }
  }

  // Req 7.2: the global floor must hold for every metric.
  const globalFailures = [];
  const total = summary.total;
  if (total) {
    for (const metric of GLOBAL_METRICS) {
      const pct = total[metric]?.pct;
      if (!isUsablePct(pct) || pct < globalFloor) {
        globalFailures.push({ metric, measured: pct ?? 'Unknown', floor: globalFloor });
      }
    }
  }

  const pass =
    missing.length === 0 && below.length === 0 && globalFailures.length === 0;
  return { pass, missing, below, measured, globalFailures };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function fmtPct(pct) {
  return typeof pct === 'number' ? `${pct.toFixed(2)}%` : String(pct);
}

function main() {
  const arg = process.argv[2];
  const summaryFile = arg ? resolve(process.cwd(), arg) : DEFAULT_SUMMARY_FILE;

  console.log('🛡  Coverage Gate — critical-path per-file thresholds');
  console.log('─'.repeat(64));
  console.log(`\nReport: ${relative(REPO_ROOT, summaryFile) || summaryFile}`);

  if (!existsSync(summaryFile)) {
    console.error(`\n❌ Coverage summary not found: ${summaryFile}`);
    console.error('   Run `vitest --coverage` (json-summary reporter) before this gate.');
    process.exit(1);
  }

  let summary;
  try {
    summary = JSON.parse(readFileSync(summaryFile, 'utf-8'));
  } catch (err) {
    console.error(`\n❌ Could not parse coverage summary: ${err.message}`);
    process.exit(1);
  }

  const result = checkCoverageThresholds(summary);

  // Per-file measured table (resolved targets only).
  if (result.measured.length > 0) {
    const nameW = Math.max(4, ...result.measured.map((m) => m.path.length));
    console.log(
      `\n  ${'FILE'.padEnd(nameW)}  ${'MEASURED'.padStart(10)}  ${'REQUIRED'.padStart(10)}`
    );
    console.log(`  ${'-'.repeat(nameW)}  ${'-'.repeat(10)}  ${'-'.repeat(10)}`);
    for (const m of result.measured) {
      const flag = m.measuredLines < m.minLines ? ' ❌' : '';
      console.log(
        `  ${m.path.padEnd(nameW)}  ${fmtPct(m.measuredLines).padStart(10)}  ${`>= ${m.minLines}%`.padStart(10)}${flag}`
      );
    }
  }
  console.log('');

  if (result.globalFailures.length > 0) {
    console.error('❌ Global coverage floor breached (Req 7.2):');
    for (const g of result.globalFailures) {
      console.error(`   • ${g.metric}: ${fmtPct(g.measured)} < ${g.floor}%`);
    }
    console.error('');
  }

  if (result.missing.length > 0) {
    console.error('❌ Per-file target missing or absent from the coverage report (Req 7.4):');
    for (const m of result.missing) {
      console.error(`   • ${m.path} — not present in the report (cannot be silently skipped)`);
    }
    console.error('');
  }

  if (result.below.length > 0) {
    console.error('❌ Per-file line coverage below threshold (Req 7.1):');
    for (const b of result.below) {
      console.error(
        `   • ${b.path}: measured ${fmtPct(b.measuredLines)} < required ${b.minLines}%`
      );
    }
    console.error('');
  }

  if (result.pass) {
    console.log('✅ Global floor holds and all critical-path files meet their per-file thresholds.\n');
    process.exit(0);
  }

  console.log('─'.repeat(64));
  console.log('Coverage gate failed. Add tests to raise the offending file(s) to their');
  console.log('per-file threshold (>= 90% lines) and keep global coverage >= 70%.\n');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
