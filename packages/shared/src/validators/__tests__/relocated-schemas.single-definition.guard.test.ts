/**
 * Structural guard tests for the FIX-FE-3 schema relocation (task 6.7).
 *
 * These are static/structural assertions (no runtime behavior under test). They
 * lock in the relocation work so the relocated Zod schemas and their endpoint
 * contracts cannot silently drift back into a duplicated / multi-definition
 * state:
 *
 *  - Single-definition guard (Requirement 3.8): for each of the 10 relocated
 *    schemas, exactly ONE canonical `const <Name> = z.object(` definition exists
 *    across the scanned source trees (`apps/web/src` and `packages/shared/src`),
 *    and that single definition lives under `packages/shared/src/validators/`.
 *
 *    The baseline fixture at
 *    `apps/web/src/api/__tests__/fixtures/relocated-schemas.baseline.ts` keeps
 *    INTENTIONAL frozen copies of these schemas under distinct `*Baseline`
 *    names (e.g. `RiskItemSchemaBaseline`). The exact-name boundary in the
 *    detection regex (a `=` must immediately follow the schema name, ignoring
 *    whitespace) means `const RiskItemSchemaBaseline = z.object(` never matches
 *    the canonical `RiskItemSchema` name, so those frozen copies are correctly
 *    NOT counted as duplicate definitions.
 *
 *  - Contract-count guard (Requirement 3.5/3.8): exactly one Endpoint_Contract
 *    interface exists per relocated validator file (`RiskRegisterEndpoints`,
 *    `RegulatoryEndpoints`, `DashboardEndpoints`, `UserManagementEndpoints`),
 *    each declared once under `packages/shared/src/types/endpoints/` and
 *    registered exactly once in `endpoints/index.ts`.
 *
 * Detection strips comments and string/template literals from code before
 * scanning, so an explanatory comment or doc string that merely mentions a
 * schema name is never a false positive.
 *
 * The existing response-validation suites (this file's sibling
 * `validation-schemas.property.test.ts` and the `apps/web` API tests) continue
 * to run unchanged, satisfying Requirement 3.9.
 *
 * Validates: Requirements 3.8, 3.9
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHARED_ROOT = resolve(__dirname, '..', '..', '..'); // packages/shared
const REPO_ROOT = resolve(SHARED_ROOT, '..', '..');
const SHARED_SRC = resolve(SHARED_ROOT, 'src');
const VALIDATORS_DIR = resolve(SHARED_SRC, 'validators');
const ENDPOINTS_DIR = resolve(SHARED_SRC, 'types', 'endpoints');
const ENDPOINTS_INDEX = resolve(ENDPOINTS_DIR, 'index.ts');
const APPS_WEB_SRC = resolve(REPO_ROOT, 'apps', 'web', 'src');

// The 10 relocated schemas (FIX-FE-3, tasks 6.2–6.5). Each must have exactly
// one canonical definition, located under packages/shared/src/validators/.
const RELOCATED_SCHEMA_NAMES = [
  'RiskItemSchema',
  'InstructionSchema',
  'DashboardStatsSchema',
  'AuditProgressByTypeSchema',
  'RiskLevelBreakdownSchema',
  'RoleSchema',
  'PermissionSchema',
  'SessionSchema',
  'SettingsSchema',
  'JobTitleSchema',
] as const;

// One Endpoint_Contract interface per relocated validator file.
const ENDPOINT_CONTRACT_NAMES = [
  'RiskRegisterEndpoints',
  'RegulatoryEndpoints',
  'DashboardEndpoints',
  'UserManagementEndpoints',
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Recursively collect `.ts` files (excluding `.d.ts`), skipping node_modules/dist. */
function collectTsFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = resolve(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectTsFiles(full, acc);
    } else if (/\.ts$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Strip comments and string/template literals from a TypeScript source, blanking
 * them so token-level scans cannot match inside prose or string contents. A
 * small single-pass scanner (mirrors the approach in the FIX-FE-4 guard).
 */
function stripCommentsAndStrings(source: string): string {
  let code = '';
  let state:
    | 'code'
    | 'line'
    | 'block'
    | 'squote'
    | 'dquote'
    | 'tquote' = 'code';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    switch (state) {
      case 'code':
        if (c === '/' && next === '/') {
          state = 'line';
          i += 2;
        } else if (c === '/' && next === '*') {
          state = 'block';
          i += 2;
        } else if (c === "'") {
          state = 'squote';
          code += ' ';
          i += 1;
        } else if (c === '"') {
          state = 'dquote';
          code += ' ';
          i += 1;
        } else if (c === '`') {
          state = 'tquote';
          code += ' ';
          i += 1;
        } else {
          code += c;
          i += 1;
        }
        break;
      case 'line':
        if (c === '\n') {
          state = 'code';
          code += '\n';
        }
        i += 1;
        break;
      case 'block':
        if (c === '*' && next === '/') {
          state = 'code';
          code += ' ';
          i += 2;
        } else {
          i += 1;
        }
        break;
      case 'squote':
        if (c === '\\') i += 2;
        else if (c === "'") {
          state = 'code';
          i += 1;
        } else i += 1;
        break;
      case 'dquote':
        if (c === '\\') i += 2;
        else if (c === '"') {
          state = 'code';
          i += 1;
        } else i += 1;
        break;
      case 'tquote':
        if (c === '\\') i += 2;
        else if (c === '`') {
          state = 'code';
          i += 1;
        } else i += 1;
        break;
    }
  }
  return code;
}

const repoRel = (p: string) => relative(REPO_ROOT, p).split('\\').join('/');
const isUnder = (file: string, dir: string) =>
  !relative(dir, file).startsWith('..');

/**
 * Find every canonical `(export) const <Name> = z.object(` definition for a
 * schema name across a set of source files. The `\s*=` immediately after the
 * exact name means `<Name>Baseline` (and any other suffixed identifier) cannot
 * match, so frozen baseline copies are not counted.
 */
function findSchemaDefinitions(name: string, files: string[]): string[] {
  const re = new RegExp(
    `(?:export\\s+)?const\\s+${name}\\s*=\\s*z\\s*\\.\\s*object\\s*\\(`
  );
  const hits: string[] = [];
  for (const file of files) {
    const code = stripCommentsAndStrings(readFileSync(file, 'utf-8'));
    if (re.test(code)) hits.push(file);
  }
  return hits;
}

// Build the scanned file set once: both source trees.
const scannedFiles = [
  ...collectTsFiles(APPS_WEB_SRC),
  ...collectTsFiles(SHARED_SRC),
];

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('FIX-FE-3: relocated schemas have exactly one definition in shared/validators (Req 3.8)', () => {
  it('finds source files to inspect in both trees', () => {
    // Sanity check so the guard cannot silently pass on an empty file set.
    expect(existsSync(APPS_WEB_SRC), `expected ${repoRel(APPS_WEB_SRC)} to exist`).toBe(true);
    expect(existsSync(SHARED_SRC), `expected ${repoRel(SHARED_SRC)} to exist`).toBe(true);
    expect(scannedFiles.length).toBeGreaterThan(0);
  });

  it.each(RELOCATED_SCHEMA_NAMES)(
    '%s is defined exactly once, under packages/shared/src/validators/',
    (name) => {
      const defs = findSchemaDefinitions(name, scannedFiles);
      const defsRel = defs.map(repoRel);

      expect(
        defs.length,
        `Expected exactly ONE canonical definition of ${name} repo-wide, found ${defs.length}:\n${defsRel
          .map((d) => `  ${d}`)
          .join('\n')}`
      ).toBe(1);

      expect(
        isUnder(defs[0], VALIDATORS_DIR),
        `The single definition of ${name} must live under packages/shared/src/validators/, but is at: ${repoRel(
          defs[0]
        )}`
      ).toBe(true);
    }
  );

  it('does not count *Baseline frozen fixture copies as canonical definitions', () => {
    // Guard the guard: the baseline fixture must exist and the exact-name regex
    // must NOT match its distinctly-named copies.
    const baselineFile = resolve(
      APPS_WEB_SRC,
      'api',
      '__tests__',
      'fixtures',
      'relocated-schemas.baseline.ts'
    );
    expect(existsSync(baselineFile), `expected ${repoRel(baselineFile)} to exist`).toBe(true);
    for (const name of RELOCATED_SCHEMA_NAMES) {
      const defs = findSchemaDefinitions(name, [baselineFile]);
      expect(
        defs,
        `Baseline fixture should not register a canonical ${name} definition`
      ).toEqual([]);
    }
  });
});

describe('FIX-FE-3: exactly one Endpoint_Contract per relocated validator (Req 3.5/3.8)', () => {
  const endpointFiles = collectTsFiles(ENDPOINTS_DIR);

  it('the endpoints directory and index exist', () => {
    expect(existsSync(ENDPOINTS_DIR), `expected ${repoRel(ENDPOINTS_DIR)} to exist`).toBe(true);
    expect(existsSync(ENDPOINTS_INDEX), `expected ${repoRel(ENDPOINTS_INDEX)} to exist`).toBe(true);
  });

  it.each(ENDPOINT_CONTRACT_NAMES)(
    '%s interface is declared exactly once under endpoints/',
    (name) => {
      const re = new RegExp(`export\\s+interface\\s+${name}\\b`);
      const hits: string[] = [];
      for (const file of endpointFiles) {
        const code = stripCommentsAndStrings(readFileSync(file, 'utf-8'));
        // Count occurrences within the file too (defensive against duplicates).
        const matches = code.match(new RegExp(re.source, 'g'));
        if (matches) {
          for (let k = 0; k < matches.length; k++) hits.push(file);
        }
      }
      const hitsRel = hits.map(repoRel);
      expect(
        hits.length,
        `Expected exactly ONE declaration of interface ${name} under endpoints/, found ${hits.length}:\n${hitsRel
          .map((d) => `  ${d}`)
          .join('\n')}`
      ).toBe(1);
    }
  );

  it.each(ENDPOINT_CONTRACT_NAMES)(
    '%s is registered exactly once in endpoints/index.ts',
    (name) => {
      const code = stripCommentsAndStrings(readFileSync(ENDPOINTS_INDEX, 'utf-8'));
      const re = new RegExp(`\\b${name}\\b`, 'g');
      const matches = code.match(re) ?? [];
      expect(
        matches.length,
        `Expected ${name} to be registered exactly once in endpoints/index.ts, found ${matches.length} reference(s)`
      ).toBe(1);
    }
  );
});
