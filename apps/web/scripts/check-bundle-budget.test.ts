/**
 * Property-based tests for the bundle-size budget check (Stream 4, requirement 4.1).
 *
 * Property 8 — Bundle budget (design.md → "Property 8: Bundle budget"):
 *   "For any production build, no `manualChunks` group exceeds its committed
 *    gzip ceiling."
 *
 * The most testable seam is the measured-vs-ceiling comparison inside
 * `checkBundleBudget(distDir, budgets)`:
 *
 *     measuredGzipKb > entry.maxGzipKb   ⇒  violation
 *
 * which means a group PASSES iff `measured <= ceiling`. To exercise that
 * boundary deterministically we synthesize a temporary `dist/` directory,
 * write real chunk files (so the gzip measurement is genuine, not mocked),
 * measure each group's actual gzip size with the script's own `findChunkFiles`
 * + `gzipSizeKb`, and then generate committed ceilings positioned around each
 * measured size (below, exactly at, and above). We then assert that
 * `checkBundleBudget` reports violations for exactly the over-ceiling groups
 * and for no others.
 *
 * All synthesized budgets are marked `eager: false` so the eager-vs-lazy
 * ceiling invariant (Req 4.5) never fires — isolating the Req 4.1 boundary —
 * and every group always has a resolvable file so the unresolved path (Req 4.6)
 * never fires either. Thus `pass` depends solely on the measured-vs-ceiling
 * comparison under test.
 *
 * **Validates: Requirements 4.1**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error - plain ESM JS module without type declarations
import { checkBundleBudget, findChunkFiles, gzipSizeKb } from './check-bundle-budget.mjs';

type Budget = { chunk: string; eager: boolean; maxGzipKb: number };

/**
 * Write a synthetic emitted chunk file (`assets/<chunk>-<hash>.js`) into a dist
 * dir and return its genuine measured gzip size in KB.
 */
function writeChunk(distDir: string, chunk: string, content: Uint8Array): number {
  const assetsDir = join(distDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  // A rollup-style hash token with no extra dash segment (matches the script's
  // `^<chunk>-<hash>.js$` resolver).
  writeFileSync(join(assetsDir, `${chunk}-abcd1234.js`), Buffer.from(content));
  return gzipSizeKb(findChunkFiles(distDir, chunk));
}

// Random byte content so the measured gzip size varies meaningfully per group.
const contentArb = fc.uint8Array({ minLength: 64, maxLength: 8192 });

// Ceiling offset (KB) relative to the measured size. Includes the exact-equality
// boundary (0) plus values that straddle it in both directions.
const offsetArb = fc.oneof(
  fc.constant(0), // ceiling === measured  → must PASS (measured <= ceiling)
  fc.double({ min: 0.0001, max: 4, noNaN: true }), // ceiling above  → PASS
  fc.double({ min: -4, max: -0.0001, noNaN: true }) // ceiling below → VIOLATION
);

describe('Property 8: Bundle budget (requirement 4.1)', () => {
  it('reports a violation for a group iff its measured gzip exceeds the ceiling', () => {
    fc.assert(
      fc.property(contentArb, offsetArb, (content, offset) => {
        const dir = mkdtempSync(join(tmpdir(), 'bundle-budget-'));
        try {
          const measured = writeChunk(dir, 'vendor-charts', content);
          const ceiling = measured + offset;
          const budgets: Budget[] = [
            { chunk: 'vendor-charts', eager: false, maxGzipKb: ceiling },
          ];

          const result = checkBundleBudget(dir, budgets);

          const expectViolation = measured > ceiling;
          // Boundary: PASS iff measured <= ceiling.
          expect(result.pass).toBe(!expectViolation);
          expect(result.violations.map((v: { chunk: string }) => v.chunk)).toEqual(
            expectViolation ? ['vendor-charts'] : []
          );
          // No eager chunks and a resolvable file ⇒ those failure paths stay clear.
          expect(result.eagerBreaches).toEqual([]);
          expect(result.unresolved).toEqual([]);
          // The violation, when present, echoes the genuine measured + committed sizes.
          if (expectViolation) {
            expect(result.violations[0].measuredGzipKb).toBeCloseTo(measured, 10);
            expect(result.violations[0].maxGzipKb).toBe(ceiling);
          }
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      })
    );
  });

  it('reports violations for exactly the over-ceiling groups across many groups', () => {
    const groupArb = fc.record({ content: contentArb, offset: offsetArb });

    fc.assert(
      fc.property(fc.array(groupArb, { minLength: 1, maxLength: 6 }), (groups) => {
        const dir = mkdtempSync(join(tmpdir(), 'bundle-budget-'));
        try {
          const budgets: Budget[] = [];
          const expectedViolations = new Set<string>();

          groups.forEach((g, i) => {
            const chunk = `vendor-grp${i}`;
            const measured = writeChunk(dir, chunk, g.content);
            const ceiling = measured + g.offset;
            budgets.push({ chunk, eager: false, maxGzipKb: ceiling });
            if (measured > ceiling) expectedViolations.add(chunk);
          });

          const result = checkBundleBudget(dir, budgets);

          const actualViolations = new Set(
            result.violations.map((v: { chunk: string }) => v.chunk)
          );
          // The violation set is exactly the set of over-ceiling groups.
          expect(actualViolations).toEqual(expectedViolations);
          // Every budgeted group resolved and none were eager.
          expect(result.measured.length).toBe(groups.length);
          expect(result.unresolved).toEqual([]);
          expect(result.eagerBreaches).toEqual([]);
          // Overall pass iff no group is over its ceiling.
          expect(result.pass).toBe(expectedViolations.size === 0);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      })
    );
  });

  it('passes at the exact equality boundary (measured === ceiling)', () => {
    // A deterministic example pinning the inclusive boundary: a group exactly at
    // its ceiling is within budget (measured <= ceiling), not a violation.
    const dir = mkdtempSync(join(tmpdir(), 'bundle-budget-'));
    try {
      const content = new Uint8Array(2048).map((_, i) => (i * 31 + 7) & 0xff);
      const measured = writeChunk(dir, 'vendor-pdf', content);
      const result = checkBundleBudget(dir, [
        { chunk: 'vendor-pdf', eager: false, maxGzipKb: measured },
      ]);
      expect(result.pass).toBe(true);
      expect(result.violations).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
