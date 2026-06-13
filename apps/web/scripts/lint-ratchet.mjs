/**
 * Lint warning ratchet (Stream 3, Type-Safety Debt Reduction).
 *
 * Enforces a one-way, monotonically non-increasing ESLint `--max-warnings`
 * ceiling. The committed ceiling lives in `apps/web/.lint-ceiling.json` and is
 * seeded at exactly 522 (the current measured warning count).
 *
 * Semantics (see design.md → "Lint warning ratchet" and Property 7):
 *   • measured > ceiling  → FAIL  (warnings increased; build is blocked)
 *   • measured < ceiling  → FAIL  (the developer reduced warnings; the ceiling
 *                                  must be lowered to the new count with an
 *                                  explicit, reviewable edit to the ceiling file)
 *   • measured === ceiling → PASS
 *
 * The ceiling can therefore only ever move down, never up: a regression that
 * raises the count fails, and a reduction is not silently accepted — it
 * requires an explicit `--write` ratchet-down so the change is reviewable.
 *
 * Usage (from repo root or anywhere):
 *   node apps/web/scripts/lint-ratchet.mjs            # run eslint, compare to ceiling
 *   node apps/web/scripts/lint-ratchet.mjs --json     # machine-readable result
 *   node apps/web/scripts/lint-ratchet.mjs --write     # lower the ceiling to the
 *                                                       # measured count (one-way)
 *
 * Exit code is 0 on PASS and 1 on FAIL, so this is a CI gate.
 *
 * Requirements: 3.1, 3.3, 3.4
 */

import { ESLint } from 'eslint';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..'); // apps/web
const REPO_ROOT = resolve(WEB_ROOT, '..', '..'); // repository root

/** The committed ceiling file, seeded at exactly 522. */
export const CEILING_PATH = resolve(WEB_ROOT, '.lint-ceiling.json');

/** The directory eslint lints, relative to {@link WEB_ROOT}. */
export const LINT_TARGET = 'src/';

export const RESULT = {
  PASS: 'pass',
  FAIL_INCREASED: 'fail-increased',
  FAIL_BELOW: 'fail-below',
};

// ─── Ceiling file I/O ─────────────────────────────────────────────────────────

/**
 * Read the committed ceiling. Throws a clear error if the file is missing or
 * does not contain a non-negative integer `ceiling`.
 * @returns {number}
 */
export function readCommittedCeiling(ceilingPath = CEILING_PATH) {
  if (!existsSync(ceilingPath)) {
    throw new Error(
      `Lint ceiling file not found at ${ceilingPath}. ` +
        'The ratchet requires a committed ceiling (seeded at 522).'
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(ceilingPath, 'utf-8'));
  } catch (err) {
    throw new Error(
      `Failed to parse lint ceiling file ${ceilingPath}: ${err.message}`
    );
  }
  const ceiling = parsed?.ceiling;
  if (!Number.isInteger(ceiling) || ceiling < 0) {
    throw new Error(
      `Invalid ceiling in ${ceilingPath}: expected a non-negative integer, got ${JSON.stringify(
        ceiling
      )}.`
    );
  }
  return ceiling;
}

/**
 * Lower the committed ceiling to `count`. This is a one-way ratchet: it refuses
 * to raise the ceiling, so a regression can never be "ratcheted away".
 * @param {number} count the new (lower-or-equal) ceiling
 */
export function ratchetDown(count, ceilingPath = CEILING_PATH) {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Refusing to write a non-integer/negative ceiling: ${count}.`);
  }
  const current = readCommittedCeiling(ceilingPath);
  if (count > current) {
    throw new Error(
      `Refusing to raise the lint ceiling from ${current} to ${count}. ` +
        'The ratchet is one-way (non-increasing).'
    );
  }
  writeFileSync(ceilingPath, JSON.stringify({ ceiling: count }, null, 2) + '\n', 'utf-8');
}

// ─── Pure ratchet decision (testable in isolation) ─────────────────────────────

/**
 * Decide pass/fail purely from the measured count and the ceiling. No I/O.
 * @param {number} count measured ESLint warning count
 * @param {number} ceiling committed ceiling
 * @returns {{ count: number, ceiling: number, pass: boolean, result: string, message: string }}
 */
export function evaluateRatchet(count, ceiling) {
  if (count > ceiling) {
    return {
      count,
      ceiling,
      pass: false,
      result: RESULT.FAIL_INCREASED,
      message: `Lint warnings increased: ${count} > ceiling ${ceiling}. Fix the new warnings.`,
    };
  }
  if (count < ceiling) {
    return {
      count,
      ceiling,
      pass: false,
      result: RESULT.FAIL_BELOW,
      message:
        `Lint warnings dropped to ${count} (ceiling ${ceiling}). ` +
        `Lower the ceiling to ${count} (run with --write) to lock in the improvement.`,
    };
  }
  return {
    count,
    ceiling,
    pass: true,
    result: RESULT.PASS,
    message: `Lint warnings at ceiling: ${count} === ${ceiling}.`,
  };
}

// ─── ESLint invocation ─────────────────────────────────────────────────────────

/**
 * Run ESLint over {@link LINT_TARGET} and return the total warning count.
 * Honors the repo-root flat config (discovered from {@link WEB_ROOT} upward),
 * matching `npm run lint` (`eslint src/`).
 * @returns {Promise<number>}
 */
export async function runEslint() {
  const eslint = new ESLint({ cwd: WEB_ROOT });
  const results = await eslint.lintFiles([LINT_TARGET]);
  return results.reduce((sum, r) => sum + r.warningCount, 0);
}

/**
 * Run eslint, read the ceiling, and evaluate.
 * @returns {Promise<{ count: number, ceiling: number, pass: boolean, result: string, message: string }>}
 */
export async function check() {
  const ceiling = readCommittedCeiling();
  const count = await runEslint();
  return evaluateRatchet(count, ceiling);
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes('--json');
  const write = args.includes('--write');

  const ceiling = readCommittedCeiling();
  const count = await runEslint();
  const outcome = evaluateRatchet(count, ceiling);

  if (write) {
    if (count > ceiling) {
      // Never allow the ceiling to increase, even on an explicit --write.
      console.error(
        `Refusing to raise the lint ceiling from ${ceiling} to ${count}. ` +
          'The ratchet is one-way (non-increasing). Fix the new warnings instead.'
      );
      process.exitCode = 1;
      return;
    }
    if (count < ceiling) {
      ratchetDown(count);
      const rel = relative(REPO_ROOT, CEILING_PATH).split('\\').join('/');
      console.log(`Lowered lint ceiling from ${ceiling} to ${count} (${rel}).`);
    } else {
      console.log(`Lint ceiling already at the measured count (${count}); nothing to write.`);
    }
    return;
  }

  if (jsonOnly) {
    process.stdout.write(JSON.stringify(outcome, null, 2) + '\n');
  } else {
    const icon = outcome.pass ? '✅' : '❌';
    console.log(`${icon} Lint ratchet: ${outcome.message}`);
  }

  process.exitCode = outcome.pass ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
