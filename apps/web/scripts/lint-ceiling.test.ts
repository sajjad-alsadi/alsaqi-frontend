/**
 * Integration test for the lint warning ceiling (Stream 3, requirement 19).
 *
 * Requirement 19 (Lint_Config):
 *   • 19.1 THE Lint_Config SHALL enforce a maximum warning count during
 *          `npm run lint` so that exceeding the configured ceiling fails the
 *          command.
 *   • 19.2 WHEN the number of lint warnings exceeds the configured ceiling in
 *          `.lint-ceiling.json`, THE lint command SHALL exit with a non-zero
 *          status.
 *
 * The `lint()` entry point in `lint.mjs` runs real ESLint over `src/`, which is
 * slow and depends on the live source tree. The ceiling-enforcement *decision*
 * is extracted into the pure `evaluateCeiling(warningCount, errorCount, ceiling)`
 * helper, which returns the exact process exit code `lint()` uses. We exercise
 * that decision with warning counts above and below the ceiling (plus the error
 * path and the boundary) and assert the resulting exit codes, and we verify the
 * decision reads the committed ceiling via `readCommittedCeiling`.
 *
 * Validates: Requirements 19.1, 19.2
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error - plain ESM JS module without type declarations
import { evaluateCeiling } from './lint.mjs';
// @ts-expect-error - plain ESM JS module without type declarations
import { readCommittedCeiling } from './lint-ratchet.mjs';

describe('Lint ceiling enforcement (requirements 19.1, 19.2)', () => {
  const CEILING = 50;

  it('exits non-zero when warnings exceed the configured ceiling (19.1, 19.2)', () => {
    const outcome = evaluateCeiling(CEILING + 1, 0, CEILING);
    expect(outcome.code).toBe(1);
    expect(outcome.reason).toBe('ceiling-exceeded');
  });

  it('exits non-zero for a large regression above the ceiling', () => {
    const outcome = evaluateCeiling(CEILING + 500, 0, CEILING);
    expect(outcome.code).toBe(1);
    expect(outcome.reason).toBe('ceiling-exceeded');
  });

  it('exits zero when warnings are below the ceiling', () => {
    const outcome = evaluateCeiling(CEILING - 1, 0, CEILING);
    expect(outcome.code).toBe(0);
    expect(outcome.reason).toBe('pass');
  });

  it('exits zero when warnings exactly equal the ceiling (boundary)', () => {
    const outcome = evaluateCeiling(CEILING, 0, CEILING);
    expect(outcome.code).toBe(0);
    expect(outcome.reason).toBe('pass');
  });

  it('exits zero when there are zero warnings', () => {
    const outcome = evaluateCeiling(0, 0, CEILING);
    expect(outcome.code).toBe(0);
    expect(outcome.reason).toBe('pass');
  });

  it('exits non-zero when ESLint reports errors, regardless of the ceiling', () => {
    // Errors always fail lint even when the warning count is within the ceiling.
    const outcome = evaluateCeiling(0, 1, CEILING);
    expect(outcome.code).toBe(1);
    expect(outcome.reason).toBe('errors');
  });

  it('reports the warning count and ceiling in the failure message', () => {
    const outcome = evaluateCeiling(CEILING + 3, 0, CEILING);
    expect(outcome.message).toContain(String(CEILING + 3));
    expect(outcome.message).toContain(String(CEILING));
  });

  it('enforces the ceiling read from a committed .lint-ceiling.json', () => {
    // Drive the decision with a ceiling sourced from an isolated ceiling file so
    // the committed apps/web/.lint-ceiling.json is never touched.
    const dir = mkdtempSync(join(tmpdir(), 'lint-ceiling-'));
    const ceilingPath = join(dir, '.lint-ceiling.json');
    try {
      writeFileSync(ceilingPath, JSON.stringify({ ceiling: 10 }) + '\n', 'utf-8');
      const ceiling = readCommittedCeiling(ceilingPath);
      expect(ceiling).toBe(10);

      // One warning over the committed ceiling fails; at/under passes.
      expect(evaluateCeiling(ceiling + 1, 0, ceiling).code).toBe(1);
      expect(evaluateCeiling(ceiling, 0, ceiling).code).toBe(0);
      expect(evaluateCeiling(ceiling - 1, 0, ceiling).code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
