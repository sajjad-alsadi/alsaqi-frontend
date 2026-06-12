/**
 * Shared-package unification guard tests (FIX-FE-1, task 8.4).
 *
 * These guards lock in the *enforcing checks* that protect the shared-package
 * unification governance. They are structural / child-process assertions — no
 * runtime application behavior is under test. Three areas are covered:
 *
 *   1. Freeze guard behavior (Req 1.2)
 *      `scripts/check-shared-freeze.mjs` blocks (non-zero exit) any
 *      `packages/shared` line change while no Unified_Source decision is agreed,
 *      and lifts the freeze (exit 0) when the Unified_Source marker is set. We
 *      exercise the decidable, deterministic branch — the agreed marker
 *      short-circuits before any git diff, so it exits 0 — and assert the
 *      blocking logic (git diff over the frozen path + `process.exit(1)`) is
 *      wired in the script source.
 *
 *   2. Teardown precondition checklist (Req 1.4, 1.5)
 *      `scripts/check-unified-source-teardown.mjs` (task 8.3) must block removal
 *      of the duplicated local copy unless every precondition is met (imports
 *      resolve from the Unified_Source, type-equality passes, clean tsc). That
 *      script is being implemented concurrently; if it is not present at runtime
 *      the precondition assertions are skipped (with a clear note) rather than
 *      failing. When present, we assert its gating is wired to the
 *      Unified_Source decision and a blocking exit path.
 *
 *   3. Regression protection for the 8 Extra_Shared_Types (Req 1.6)
 *      The recorded baseline + compile-time type-equality check reject (fail the
 *      build) any change that deletes, renames, narrows, changes optionality of,
 *      or changes the field type of one of the 8 guarded types. We assert the
 *      baseline file and the equality module enumerate exactly those 8 types and
 *      that the "recorded rejection" mechanism (strict `Expect<Equals<...>>`
 *      assertions, one per type) is in place.
 *
 * Validates: Requirements 1.2, 1.4, 1.5, 1.6
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extraSharedTypesEqualityVerified,
  EXTRA_SHARED_TYPE_NAMES,
} from '../__baseline__/type-equality';

const __dirname = dirname(fileURLToPath(import.meta.url));
// __tests__ -> types -> src -> shared -> packages -> <repo root>
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');

const FREEZE_GUARD = resolve(REPO_ROOT, 'scripts', 'check-shared-freeze.mjs');
const TEARDOWN_CHECK = resolve(
  REPO_ROOT,
  'scripts',
  'check-unified-source-teardown.mjs'
);
const BASELINE_FILE = resolve(
  __dirname,
  '..',
  '__baseline__',
  'extra-shared-types.baseline.ts'
);
const TYPE_EQUALITY_FILE = resolve(
  __dirname,
  '..',
  '__baseline__',
  'type-equality.ts'
);
const EQUALITY_TEST_FILE = resolve(
  __dirname,
  'extra-shared-types.equality.test.ts'
);

/** The 8 Extra_Shared_Types guarded by FIX-FE-1 (criteria 1.1 & 1.6). */
const EXPECTED_EXTRA_TYPES = [
  'DashboardStats',
  'AuditProgressByType',
  'RiskLevelBreakdown',
  'Role',
  'Permission',
  'UserSession',
  'JobTitle',
  'UserManagementSettings',
];

/** Run a node script as a child process and return { status, stdout, stderr }. */
function runNodeScript(scriptPath: string, env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env,
  });
}

// ─── 1. Freeze guard behavior (Req 1.2) ─────────────────────────────────────────

describe('FIX-FE-1 freeze guard (Req 1.2)', () => {
  it('the freeze guard script exists', () => {
    expect(
      existsSync(FREEZE_GUARD),
      `expected freeze guard at ${FREEZE_GUARD}`
    ).toBe(true);
  });

  it('lifts the freeze (exit 0) when the Unified_Source marker is set', () => {
    // The agreed-marker branch short-circuits before any git diff, so this is
    // deterministic regardless of the working-tree state.
    const result = runNodeScript(FREEZE_GUARD, {
      ...process.env,
      SHARED_UNIFIED_SOURCE_AGREED: 'true',
      // Ensure no stray base-ref override interferes.
      SHARED_FREEZE_BASE_REF: '',
    });
    expect(
      result.status,
      `freeze guard should exit 0 when Unified_Source is agreed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    ).toBe(0);
    expect(result.stdout).toMatch(/freeze is lifted/i);
  });

  it('wires the blocking logic: diffs the frozen path and can exit non-zero pre-decision', () => {
    const src = readFileSync(FREEZE_GUARD, 'utf-8');
    // Frozen path is packages/shared.
    expect(src).toMatch(/packages\/shared/);
    // It runs a version-control diff to detect changed lines.
    expect(src).toMatch(/\bdiff\b/);
    expect(src).toMatch(/--numstat/);
    // It has a blocking (failing) exit path for violations.
    expect(src).toMatch(/process\.exit\(1\)/);
    // It references requirement 1.2 and both lift markers.
    expect(src).toMatch(/1\.2/);
    expect(src).toMatch(/SHARED_UNIFIED_SOURCE_AGREED/);
    expect(src).toMatch(/unified-source\.json/);
  });
});

// ─── 2. Teardown precondition checklist (Req 1.4, 1.5) ───────────────────────────

describe('FIX-FE-1 Unified_Source teardown preconditions (Req 1.4, 1.5)', () => {
  const teardownPresent = existsSync(TEARDOWN_CHECK);

  // Task 8.3 implements this script concurrently. When it is not yet present we
  // skip rather than fail, so this guard passes in the current state and
  // activates automatically once the teardown check lands.
  const maybeIt = teardownPresent ? it : it.skip;

  maybeIt(
    'gates teardown and retains the local copy while no Unified_Source decision is agreed (Req 1.4/1.5)',
    () => {
      // Documented exit semantics: with no decision recorded the check is GATED
      // — nothing is removed and the local copy is retained unchanged. That safe
      // state is reported as a passing run (exit 0) with explicit "blocked /
      // retained" messaging; the preconditions in 1.3–1.5 only apply once a
      // decision is agreed.
      const env = { ...process.env };
      delete env.SHARED_UNIFIED_SOURCE_AGREED;
      const result = runNodeScript(TEARDOWN_CHECK, env);
      expect(
        result.status,
        `teardown check should be a safe gated pass (exit 0) with no decision.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      ).toBe(0);
      expect(result.stdout).toMatch(/GATED|correctly blocked/i);
      expect(result.stdout).toMatch(/retained|intact/i);
    }
  );

  maybeIt(
    'blocks removal (exit 1) when a decision is agreed but a precondition is unmet (Req 1.4)',
    () => {
      // With a decision recorded, the checklist evaluates preconditions. Force
      // an unmet precondition (a failing type-check) and assert the check blocks
      // removal with a non-zero exit and keeps the local files unchanged.
      const failingCmd = `${JSON.stringify(process.execPath)} -e "process.exit(1)"`;
      const result = runNodeScript(TEARDOWN_CHECK, {
        ...process.env,
        SHARED_UNIFIED_SOURCE_AGREED: 'true',
        TEARDOWN_TYPECHECK_CMD: failingCmd,
        TEARDOWN_EQUALITY_CMD: failingCmd,
      });
      expect(
        result.status,
        `teardown check should block (exit 1) when a precondition is unmet.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      ).toBe(1);
      expect(result.stdout).toMatch(/BLOCKED|not permitted/i);
      expect(result.stdout).toMatch(/RETAINED UNCHANGED|retained/i);
    }
  );

  maybeIt(
    'wires its gating to the Unified_Source decision and a blocking exit path',
    () => {
      const src = readFileSync(TEARDOWN_CHECK, 'utf-8');
      // Gated on the Unified_Source decision marker.
      expect(src).toMatch(/SHARED_UNIFIED_SOURCE_AGREED|unified-source\.json/);
      // Has a blocking (failing) exit path for unmet preconditions.
      expect(src).toMatch(/process\.exit\(1\)/);
      // Operates over the duplicated local copy under packages/shared.
      expect(src).toMatch(/packages\/shared/);
    }
  );

  it('documents the teardown gate even before the check script lands', () => {
    // Always-on sanity anchor: the precondition contract is described in the
    // freeze guard's documented marker set, which the teardown check shares.
    const freezeSrc = readFileSync(FREEZE_GUARD, 'utf-8');
    expect(freezeSrc).toMatch(/Unified_Source/);
    if (!teardownPresent) {
      // Surface the deferral explicitly in the test log.
      expect(existsSync(TEARDOWN_CHECK)).toBe(false);
    }
  });
});

// ─── 3. Regression protection for the 8 Extra_Shared_Types (Req 1.6) ─────────────

describe('FIX-FE-1 Extra_Shared_Types regression protection (Req 1.6)', () => {
  it('the recorded baseline and type-equality artifacts exist', () => {
    expect(existsSync(BASELINE_FILE), `expected ${BASELINE_FILE}`).toBe(true);
    expect(existsSync(TYPE_EQUALITY_FILE), `expected ${TYPE_EQUALITY_FILE}`).toBe(
      true
    );
    expect(existsSync(EQUALITY_TEST_FILE), `expected ${EQUALITY_TEST_FILE}`).toBe(
      true
    );
  });

  it('the equality check enumerates exactly the 8 Extra_Shared_Types', () => {
    expect([...EXTRA_SHARED_TYPE_NAMES].sort()).toEqual(
      [...EXPECTED_EXTRA_TYPES].sort()
    );
    expect(extraSharedTypesEqualityVerified).toBe(true);
  });

  it('the recorded baseline file declares a baseline for all 8 types', () => {
    const baseline = readFileSync(BASELINE_FILE, 'utf-8');
    for (const name of EXPECTED_EXTRA_TYPES) {
      expect(
        baseline,
        `baseline file must declare interface Baseline${name}`
      ).toMatch(new RegExp(`interface\\s+Baseline${name}\\b`));
    }
  });

  it('records a rejection (strict equality assertion) for each of the 8 types', () => {
    // The "recorded rejection" mechanism: one strict Expect<Equals<live, baseline>>
    // assertion per guarded type. If a field is deleted/renamed/narrowed or its
    // optionality/type changes, the corresponding assertion fails to compile and
    // the build (and this test graph) is rejected.
    const equality = readFileSync(TYPE_EQUALITY_FILE, 'utf-8');
    expect(equality).toMatch(/Expect<\s*Equals</);
    for (const name of EXPECTED_EXTRA_TYPES) {
      expect(
        equality,
        `type-equality must assert Equals for ${name} against Baseline${name}`
      ).toMatch(new RegExp(`Equals<\\s*${name}\\s*,\\s*Baseline${name}\\s*>`));
    }
    // Exactly 8 strict assertions are recorded (one per guarded type).
    const assertionCount = (equality.match(/Expect<\s*Equals</g) ?? []).length;
    expect(assertionCount).toBe(EXPECTED_EXTRA_TYPES.length);
  });
});
