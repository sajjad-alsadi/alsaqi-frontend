/**
 * Tests for the coverage gate (Stream 7 — Coverage Robustness, requirement 7.4).
 *
 * Requirement 7.4: the per-file coverage gate MUST fail when a per-file target is
 * below threshold, MISSING, or ABSENT from the json-summary report — so per-file
 * thresholds can never be silently skipped (the "Unknown" < 90 === false trap).
 *
 * These tests exercise the exported pure function `checkCoverageThresholds` with
 * synthesized coverage-summary objects, so no real `vitest --coverage` run is
 * required. Target keys are written as absolute paths under a chosen `webRoot`
 * (mirroring real json-summary keys, which are absolute) and the same `webRoot`
 * is passed to the gate so paths resolve deterministically on any OS.
 */
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
// @ts-expect-error - plain ESM JS module without type declarations
import {
  checkCoverageThresholds,
  PER_FILE_TARGETS,
  GLOBAL_FLOOR,
} from './check-coverage-thresholds.mjs';

type Target = { path: string; minLines: number };

// A stable, absolute web root used to synthesize absolute json-summary keys.
const WEB_ROOT = resolve('/synthetic/apps/web');

/** A json-summary file entry with the given line pct for every metric. */
function fileEntry(pct: number | string) {
  return {
    lines: { pct },
    statements: { pct },
    functions: { pct },
    branches: { pct },
  };
}

/** A passing `total` aggregate (above the global floor for every metric). */
function passingTotal() {
  const pct = GLOBAL_FLOOR + 10;
  return {
    lines: { pct },
    statements: { pct },
    functions: { pct },
    branches: { pct },
  };
}

/**
 * Build a json-summary object. `targetPcts` maps a web-root-relative target path
 * to either a numeric pct, the string "Unknown" (present-but-unusable), or the
 * sentinel `undefined` meaning "omit this file from the report entirely".
 */
function buildSummary(targetPcts: Record<string, number | string | undefined>) {
  const summary: Record<string, unknown> = { total: passingTotal() };
  for (const [relPath, pct] of Object.entries(targetPcts)) {
    if (pct === undefined) continue; // absent from the report
    summary[resolve(WEB_ROOT, relPath)] = fileEntry(pct);
  }
  return summary;
}

const opts = { webRoot: WEB_ROOT };

describe('coverage gate — missing / absent per-file targets (requirement 7.4)', () => {
  it('passes when every per-file target is present and meets its threshold', () => {
    const summary = buildSummary({
      'src/api/client.ts': 95,
      'src/api/ws/websocket-client.ts': 91,
      'src/utils/sentry.ts': 90, // exactly at the >= 90 threshold
    });

    const result = checkCoverageThresholds(summary, PER_FILE_TARGETS, opts);

    expect(result.pass).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.below).toEqual([]);
    expect(result.globalFailures).toEqual([]);
  });

  it('FAILS and reports the path when a per-file target is absent from the report', () => {
    // src/utils/sentry.ts is omitted entirely — the glob would match zero files
    // and be silently skipped. The gate must catch this.
    const summary = buildSummary({
      'src/api/client.ts': 95,
      'src/api/ws/websocket-client.ts': 92,
      // 'src/utils/sentry.ts' intentionally absent
    });

    const result = checkCoverageThresholds(summary, PER_FILE_TARGETS, opts);

    expect(result.pass).toBe(false);
    expect(result.missing.map((m: { path: string }) => m.path)).toContain(
      'src/utils/sentry.ts'
    );
    // It is reported as missing, not as "below" (no measured pct exists).
    expect(result.below.map((b: { path: string }) => b.path)).not.toContain(
      'src/utils/sentry.ts'
    );
  });

  it('FAILS and reports the path when a target is present but its pct is "Unknown"', () => {
    // Present in the report but with an unusable (non-finite) pct — this is the
    // exact "Unknown" < 90 === false trap requirement 7.4 forbids.
    const summary = buildSummary({
      'src/api/client.ts': 95,
      'src/api/ws/websocket-client.ts': 'Unknown',
      'src/utils/sentry.ts': 93,
    });

    const result = checkCoverageThresholds(summary, PER_FILE_TARGETS, opts);

    expect(result.pass).toBe(false);
    expect(result.missing.map((m: { path: string }) => m.path)).toContain(
      'src/api/ws/websocket-client.ts'
    );
  });

  it('reports EVERY missing target, not just the first', () => {
    const summary = buildSummary({
      'src/api/client.ts': 95,
      // both others absent
    });

    const result = checkCoverageThresholds(summary, PER_FILE_TARGETS, opts);

    expect(result.pass).toBe(false);
    const missingPaths = result.missing.map((m: { path: string }) => m.path);
    expect(missingPaths).toContain('src/api/ws/websocket-client.ts');
    expect(missingPaths).toContain('src/utils/sentry.ts');
    expect(result.missing).toHaveLength(2);
  });

  it('still classifies a present-but-below target as "below", not "missing"', () => {
    // Sanity contrast: a present file under threshold is a `below` failure (Req 7.1),
    // distinct from the missing/absent case (Req 7.4).
    const summary = buildSummary({
      'src/api/client.ts': 95,
      'src/api/ws/websocket-client.ts': 92,
      'src/utils/sentry.ts': 80, // present but below the 90 threshold
    });

    const result = checkCoverageThresholds(summary, PER_FILE_TARGETS, opts);

    expect(result.pass).toBe(false);
    expect(result.below.map((b: { path: string }) => b.path)).toContain(
      'src/utils/sentry.ts'
    );
    expect(result.missing).toEqual([]);
  });

  it('treats an empty report (no target files at all) as all-missing', () => {
    const summary = { total: passingTotal() };

    const result = checkCoverageThresholds(summary, PER_FILE_TARGETS as Target[], opts);

    expect(result.pass).toBe(false);
    expect(result.missing).toHaveLength(PER_FILE_TARGETS.length);
  });
});
