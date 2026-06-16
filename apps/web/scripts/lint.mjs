/**
 * `npm run lint` entry point with an enforced maximum warning ceiling.
 *
 * Requirement 19 (Lint_Config) — design.md → "Lint_Config":
 *   • 19.1 THE Lint_Config SHALL enforce a maximum warning count during
 *          `npm run lint` so that exceeding the configured ceiling fails the
 *          command.
 *   • 19.2 WHEN the number of lint warnings exceeds the configured ceiling in
 *          `.lint-ceiling.json`, THE lint command SHALL exit with a non-zero
 *          status.
 *
 * This wrapper runs ESLint over `src/` exactly like the bare `eslint src/`
 * invocation (same flat config discovered from `apps/web` upward), prints the
 * standard "stylish" report, and then enforces the ceiling:
 *
 *   • any ESLint error            → exit 1 (ESLint errors always fail lint)
 *   • warningCount > ceiling      → exit 1 (Req 19.1 / 19.2 — ceiling exceeded)
 *   • warningCount <= ceiling     → exit 0
 *
 * Note: unlike `lint:ratchet`, this command does NOT fail when the warning
 * count drops *below* the ceiling — lowering the ceiling is the ratchet's job
 * (Req 19.4). `npm run lint` only blocks regressions past the ceiling, which is
 * the `--max-warnings <ceiling>` semantic mandated by Req 19.1 / 19.2.
 *
 * The ceiling is read from `apps/web/.lint-ceiling.json` so that `npm run lint`
 * and `npm run lint:ratchet` share a single source of truth.
 *
 * Usage:
 *   node scripts/lint.mjs
 *
 * Requirements: 19.1, 19.2
 */

import { ESLint } from 'eslint';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCommittedCeiling, LINT_TARGET } from './lint-ratchet.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..'); // apps/web

/**
 * Pure ceiling-enforcement decision for `npm run lint` (no I/O, no ESLint).
 *
 * Encodes the exact `lint()` semantics so it can be unit/integration tested in
 * isolation without running real ESLint:
 *   • any ESLint error        → exit 1 (errors always fail lint)
 *   • warningCount > ceiling  → exit 1 (Req 19.1 / 19.2 — ceiling exceeded)
 *   • warningCount <= ceiling → exit 0
 *
 * @param {number} warningCount measured ESLint warning count
 * @param {number} errorCount measured ESLint error count
 * @param {number} ceiling committed warning ceiling
 * @returns {{ code: number, reason: 'errors' | 'ceiling-exceeded' | 'pass', message: string }}
 */
export function evaluateCeiling(warningCount, errorCount, ceiling) {
  if (errorCount > 0) {
    return {
      code: 1,
      reason: 'errors',
      message: `\n✖ Lint failed: ${errorCount} error(s). Fix errors before committing.`,
    };
  }

  if (warningCount > ceiling) {
    return {
      code: 1,
      reason: 'ceiling-exceeded',
      message:
        `\n✖ Lint failed: ${warningCount} warning(s) exceed the configured ceiling of ${ceiling} ` +
        `(.lint-ceiling.json). Fix the new warnings to bring the count back to <= ${ceiling}.`,
    };
  }

  return {
    code: 0,
    reason: 'pass',
    message: `\n✔ Lint passed: ${warningCount} warning(s) within the ceiling of ${ceiling} (.lint-ceiling.json).`,
  };
}

/**
 * Run ESLint over {@link LINT_TARGET} and enforce the committed warning ceiling.
 * @returns {Promise<number>} process exit code (0 = pass, 1 = fail)
 */
export async function lint() {
  const ceiling = readCommittedCeiling();

  const eslint = new ESLint({ cwd: WEB_ROOT });
  const results = await eslint.lintFiles([LINT_TARGET]);

  const errorCount = results.reduce((sum, r) => sum + r.errorCount, 0);
  const warningCount = results.reduce((sum, r) => sum + r.warningCount, 0);

  // Print the standard ESLint report so the output matches `eslint src/`.
  const formatter = await eslint.loadFormatter('stylish');
  const output = await formatter.format(results);
  if (output.trim().length > 0) {
    process.stdout.write(output.endsWith('\n') ? output : output + '\n');
  }

  const { code, message } = evaluateCeiling(warningCount, errorCount, ceiling);
  if (code === 0) {
    console.log(message);
  } else {
    console.error(message);
  }
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  lint()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    });
}
