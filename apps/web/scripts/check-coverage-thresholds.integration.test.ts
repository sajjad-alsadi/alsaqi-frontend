/**
 * Integration test for the coverage gate's handling of the export-file tier
 * (Stream — Requirement 30: elevate export files to the per-file coverage tier).
 *
 * Requirement 30.1: `csvExport.ts` is in `PER_FILE_TARGETS` at the 90% tier.
 * Requirement 30.2: the PDF & DOCX export files are in `PER_FILE_TARGETS` at 90%.
 * Requirement 30.3: IF an export file falls below its 90% per-file target, THEN the
 *                   Coverage_Checker fails the coverage check.
 *
 * Unlike the unit/property tests (which call the pure `checkCoverageThresholds`
 * function in-process with a synthetic `webRoot`), this test drives the gate as an
 * INTEGRATION through its real CLI entry point: it writes a real
 * `coverage-summary.json` to a temp file, spawns
 * `node check-coverage-thresholds.mjs <file>`, and asserts the PROCESS EXIT CODE.
 * Report keys are absolute paths under the script's real `WEB_ROOT` (apps/web), so
 * the CLI's own default targets resolve exactly as they would for a real report.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error - plain ESM JS module without type declarations
import { checkCoverageThresholds, PER_FILE_TARGETS } from './check-coverage-thresholds.mjs';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(SCRIPTS_DIR, 'check-coverage-thresholds.mjs');
// The real web root the CLI resolves against (apps/web). Report keys are written as
// absolute paths under this root so the CLI's default PER_FILE_TARGETS match.
const WEB_ROOT = resolve(SCRIPTS_DIR, '..');

type Target = { path: string; minLines: number };

/** A json-summary file entry with the given line pct for every metric. */
function fileEntry(pct: number) {
  return {
    lines: { pct },
    statements: { pct },
    functions: { pct },
    branches: { pct },
  };
}

/** A passing `total` aggregate (above the 70% global floor for every metric). */
function passingTotal() {
  return fileEntry(80);
}

/**
 * Build a realistic json-summary object keyed by ABSOLUTE paths under WEB_ROOT,
 * giving EVERY default per-file target a passing (>= 90%) line pct, then applying
 * the provided per-target overrides (relative path -> line pct).
 */
function buildFullSummary(overrides: Record<string, number> = {}) {
  const summary: Record<string, unknown> = { total: passingTotal() };
  for (const target of PER_FILE_TARGETS as Target[]) {
    const pct = overrides[target.path] ?? 95;
    summary[resolve(WEB_ROOT, target.path)] = fileEntry(pct);
  }
  return summary;
}

/** Write a summary to a temp file and run the CLI; return its numeric exit code. */
function runGateCli(summary: Record<string, unknown>): number {
  const dir = mkdtempSync(join(tmpdir(), 'cov-gate-'));
  const file = join(dir, 'coverage-summary.json');
  writeFileSync(file, JSON.stringify(summary), 'utf-8');
  try {
    execFileSync('node', [SCRIPT, file], { stdio: 'pipe' });
    return 0; // execFileSync only returns normally on a 0 exit code
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    return typeof status === 'number' ? status : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const EXPORT_FILES = [
  'src/utils/csvExport.ts', // Req 30.1
  'src/utils/pdfExport.ts', // Req 30.2
  'src/utils/docxExport.ts', // Req 30.2
];

describe('coverage gate — export files held to the 90% per-file tier (Req 30)', () => {
  it('lists every export file in PER_FILE_TARGETS at the 90% tier (Req 30.1, 30.2)', () => {
    for (const path of EXPORT_FILES) {
      const target = (PER_FILE_TARGETS as Target[]).find((t) => t.path === path);
      expect(target, `${path} must be a per-file target`).toBeDefined();
      expect(target!.minLines).toBe(90);
    }
  });

  it('CLI exits non-zero when an export file is below the 90% tier (Req 30.3)', () => {
    // csvExport.ts at 80% lines (< 90), all other targets and the global floor pass.
    const summary = buildFullSummary({ 'src/utils/csvExport.ts': 80 });

    const exitCode = runGateCli(summary);

    expect(exitCode).not.toBe(0);
  });

  it('checkCoverageThresholds fails with the export file in `below` (Req 30.3)', () => {
    const summary = buildFullSummary({ 'src/utils/pdfExport.ts': 82 });

    const result = checkCoverageThresholds(summary);

    expect(result.pass).toBe(false);
    expect(result.below.map((b: { path: string }) => b.path)).toContain(
      'src/utils/pdfExport.ts'
    );
    // It is a `below` failure (present but under threshold), not `missing`.
    expect(result.missing.map((m: { path: string }) => m.path)).not.toContain(
      'src/utils/pdfExport.ts'
    );
  });

  it('CLI exits zero and the gate passes when every export file meets the tier', () => {
    // All targets >= 90%, global floor satisfied.
    const summary = buildFullSummary();

    expect(runGateCli(summary)).toBe(0);

    const result = checkCoverageThresholds(summary);
    expect(result.pass).toBe(true);
    expect(result.below).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it('reports an absent export file as `missing` and fails the gate (Req 30.3)', () => {
    // Build a full summary, then delete the docxExport.ts entry so it is absent.
    const summary = buildFullSummary();
    delete summary[resolve(WEB_ROOT, 'src/utils/docxExport.ts')];

    const result = checkCoverageThresholds(summary);

    expect(result.pass).toBe(false);
    expect(result.missing.map((m: { path: string }) => m.path)).toContain(
      'src/utils/docxExport.ts'
    );
  });
});
