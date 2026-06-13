/**
 * Property-based tests for the lint warning ratchet (Stream 3, requirement 3.1).
 *
 * Property 7 — Lint monotonicity (design.md → "Property 7: Lint monotonicity"):
 *   "For any commit, the ESLint warning count is ≤ the committed ceiling, and the
 *    ceiling never increases."
 *
 * This is exercised at the pure-decision boundary (`evaluateRatchet`) and at the
 * one-way write (`ratchetDown`):
 *   • evaluateRatchet PASSES iff measured === ceiling
 *   • evaluateRatchet FAILS (increased) when measured > ceiling
 *   • evaluateRatchet FAILS (below)     when measured < ceiling
 *   • ratchetDown can only ever lower (never raise) the committed ceiling
 *
 * **Validates: Requirements 3.1**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error - plain ESM JS module without type declarations
import { evaluateRatchet, ratchetDown, RESULT } from './lint-ratchet.mjs';

// Non-negative integer warning counts / ceilings (warning counts are never negative).
const count = fc.nat({ max: 100_000 });
const ceiling = fc.nat({ max: 100_000 });

describe('Property 7: Lint monotonicity (requirement 3.1)', () => {
  it('evaluateRatchet passes iff count === ceiling, and classifies the boundary', () => {
    fc.assert(
      fc.property(count, ceiling, (c, ceil) => {
        const outcome = evaluateRatchet(c, ceil);

        // pass-boundary: PASS happens exactly when measured equals the ceiling.
        expect(outcome.pass).toBe(c === ceil);

        if (c > ceil) {
          // A regression (more warnings than allowed) must fail as "increased".
          expect(outcome.pass).toBe(false);
          expect(outcome.result).toBe(RESULT.FAIL_INCREASED);
        } else if (c < ceil) {
          // An improvement must fail as "below" so the ceiling is lowered explicitly.
          expect(outcome.pass).toBe(false);
          expect(outcome.result).toBe(RESULT.FAIL_BELOW);
        } else {
          expect(outcome.pass).toBe(true);
          expect(outcome.result).toBe(RESULT.PASS);
        }

        // The outcome always echoes its inputs unchanged.
        expect(outcome.count).toBe(c);
        expect(outcome.ceiling).toBe(ceil);
      })
    );
  });

  it('ratchetDown never raises the committed ceiling (one-way / non-increasing)', () => {
    fc.assert(
      fc.property(ceiling, count, (current, next) => {
        // Each example uses an isolated temp ceiling file so the committed
        // apps/web/.lint-ceiling.json is never touched.
        const dir = mkdtempSync(join(tmpdir(), 'lint-ratchet-'));
        const ceilingPath = join(dir, '.lint-ceiling.json');
        try {
          writeFileSync(ceilingPath, JSON.stringify({ ceiling: current }) + '\n', 'utf-8');

          if (next > current) {
            // Refuses to raise the ceiling — the file is left unchanged.
            expect(() => ratchetDown(next, ceilingPath)).toThrow();
            const after = JSON.parse(readFileSync(ceilingPath, 'utf-8')).ceiling;
            expect(after).toBe(current);
          } else {
            // A lower-or-equal count is written through.
            ratchetDown(next, ceilingPath);
            const after = JSON.parse(readFileSync(ceilingPath, 'utf-8')).ceiling;
            expect(after).toBe(next);
          }

          // Invariant in all cases: the resulting ceiling never exceeds the original.
          const resulting = JSON.parse(readFileSync(ceilingPath, 'utf-8')).ceiling;
          expect(resulting).toBeLessThanOrEqual(current);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      })
    );
  });
});
