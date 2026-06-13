/**
 * Property-based tests for the critical-path coverage gate (Stream 7, requirement 7.1).
 *
 * Property 10 — Critical-path coverage (design.md → "Property 10: Critical-path coverage"):
 *   "For any run, per-file coverage for security/observability-critical modules
 *    stays above their tightened thresholds (>= 90% for client.ts,
 *    websocket-client.ts, sentry.ts)."
 *
 * The testable seam is the pass/fail decision inside
 * `checkCoverageThresholds(summary, targets, opts)`. By construction the gate
 * passes iff:
 *   1. every per-file target is PRESENT in the report with a finite line pct, AND
 *   2. every present target meets its tightened per-file threshold (>= 90% lines), AND
 *   3. every global metric (lines/functions/branches/statements) meets the
 *      global floor (>= 70%).
 * Otherwise it fails, reporting the offending path(s) + measured percentage(s).
 *
 * To exercise that boundary deterministically we synthesize `coverage-summary.json`
 * objects with random per-file line percentages for the three critical targets
 * (generated densely around the 90.00 boundary, e.g. 89.99 fails / 90.00 passes)
 * and random global metric percentages (generated around the 70.00 floor). We pass
 * a synthetic `webRoot` and build report keys as absolute paths under it so the
 * script's own `toWebRelative`/`indexSummaryByPath` map them back to the target
 * paths exactly as it would for a real report. We then assert the gate's pass/fail
 * decision and its offending-path bookkeeping match the specification.
 *
 * **Validates: Requirements 7.1**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
// @ts-expect-error - plain ESM JS module without type declarations
import {
  checkCoverageThresholds,
  PER_FILE_TARGETS,
  GLOBAL_METRICS,
  GLOBAL_FLOOR,
} from './check-coverage-thresholds.mjs';

type Target = { path: string; minLines: number };
type GlobalMetrics = { lines: number; functions: number; branches: number; statements: number };

// A synthetic, absolute web-root. Keys are written as absolute paths under it so
// the script's `relative(webRoot, key)` resolves back to the target path.
const WEB_ROOT = resolve(tmpdir(), 'fpr10-coverage-web-root');

const targets = PER_FILE_TARGETS as Target[];

/**
 * Build a coverage-summary object from per-target states and global metrics.
 * A target marked `present: false` is omitted entirely (absent from the report).
 */
function buildSummary(
  states: Array<{ present: boolean; pct: number }>,
  global: GlobalMetrics
): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  targets.forEach((t, i) => {
    const s = states[i];
    if (s.present) {
      summary[join(WEB_ROOT, t.path)] = { lines: { pct: s.pct, total: 100, covered: 0, skipped: 0 } };
    }
  });
  summary.total = {
    lines: { pct: global.lines },
    functions: { pct: global.functions },
    branches: { pct: global.branches },
    statements: { pct: global.statements },
  };
  return summary;
}

// Per-file line pct generated densely around the 90.00 threshold boundary.
const pctArb = fc.oneof(
  fc.constant(89.99), // just below -> fails
  fc.constant(90), // exactly at -> passes (>= is inclusive)
  fc.constant(90.01), // just above -> passes
  fc.constant(0),
  fc.constant(100),
  fc.double({ min: 80, max: 100, noNaN: true })
);

// Global metric pct generated densely around the 70.00 floor boundary.
const globalPctArb = fc.oneof(
  fc.constant(69.99), // just below -> fails
  fc.constant(70), // exactly at -> passes
  fc.constant(70.01), // just above -> passes
  fc.double({ min: 60, max: 100, noNaN: true })
);

const stateArb = fc.record({ present: fc.boolean(), pct: pctArb });
const statesArb = fc.tuple(stateArb, stateArb, stateArb); // exactly 3 critical targets
const globalArb = fc.record({
  lines: globalPctArb,
  functions: globalPctArb,
  branches: globalPctArb,
  statements: globalPctArb,
});

describe('Property 10: Critical-path coverage (requirement 7.1)', () => {
  it('passes iff every target is present and >= 90% lines and the global floor holds', () => {
    fc.assert(
      fc.property(statesArb, globalArb, (states, global) => {
        const summary = buildSummary(states as Array<{ present: boolean; pct: number }>, global);
        const result = checkCoverageThresholds(summary, targets, {
          webRoot: WEB_ROOT,
          globalFloor: GLOBAL_FLOOR,
        });

        const expectedMissing = new Set(
          targets.filter((_, i) => !states[i].present).map((t) => t.path)
        );
        const expectedBelow = new Set(
          targets
            .filter((t, i) => states[i].present && states[i].pct < t.minLines)
            .map((t) => t.path)
        );
        const expectedGlobalFail = new Set(
          (GLOBAL_METRICS as string[]).filter(
            (m) => (global as Record<string, number>)[m] < GLOBAL_FLOOR
          )
        );

        // Pass/fail boundary.
        const expectedPass =
          expectedMissing.size === 0 &&
          expectedBelow.size === 0 &&
          expectedGlobalFail.size === 0;
        expect(result.pass).toBe(expectedPass);

        // Offending-path bookkeeping is exact.
        expect(new Set(result.missing.map((m: { path: string }) => m.path))).toEqual(
          expectedMissing
        );
        expect(new Set(result.below.map((b: { path: string }) => b.path))).toEqual(
          expectedBelow
        );
        expect(
          new Set(result.globalFailures.map((g: { metric: string }) => g.metric))
        ).toEqual(expectedGlobalFail);

        // Each `below` entry echoes the genuine measured pct + the required threshold.
        for (const b of result.below as Array<{
          path: string;
          measuredLines: number;
          minLines: number;
        }>) {
          const idx = targets.findIndex((t) => t.path === b.path);
          expect(b.measuredLines).toBe(states[idx].pct);
          expect(b.minLines).toBe(targets[idx].minLines);
        }
      })
    );
  });

  it('passes at the exact 90.00 per-file boundary and fails just below (89.99)', () => {
    const okGlobal: GlobalMetrics = { lines: 70, functions: 70, branches: 70, statements: 70 };

    const atBoundary = checkCoverageThresholds(
      buildSummary(
        targets.map(() => ({ present: true, pct: 90 })),
        okGlobal
      ),
      targets,
      { webRoot: WEB_ROOT, globalFloor: GLOBAL_FLOOR }
    );
    expect(atBoundary.pass).toBe(true);
    expect(atBoundary.below).toEqual([]);

    // First target just below threshold -> fails and is reported by path.
    const justBelow = checkCoverageThresholds(
      buildSummary(
        targets.map((_, i) => ({ present: true, pct: i === 0 ? 89.99 : 95 })),
        okGlobal
      ),
      targets,
      { webRoot: WEB_ROOT, globalFloor: GLOBAL_FLOOR }
    );
    expect(justBelow.pass).toBe(false);
    expect(justBelow.below.map((b: { path: string }) => b.path)).toEqual([targets[0].path]);
    expect(justBelow.below[0].measuredLines).toBe(89.99);
  });

  it('fails when the global floor is breached just below 70.00 even with all targets >= 90', () => {
    const result = checkCoverageThresholds(
      buildSummary(
        targets.map(() => ({ present: true, pct: 100 })),
        { lines: 69.99, functions: 100, branches: 100, statements: 100 }
      ),
      targets,
      { webRoot: WEB_ROOT, globalFloor: GLOBAL_FLOOR }
    );
    expect(result.pass).toBe(false);
    expect(result.globalFailures.map((g: { metric: string }) => g.metric)).toEqual(['lines']);
  });
});
