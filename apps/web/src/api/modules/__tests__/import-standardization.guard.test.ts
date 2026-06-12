/**
 * Structural guard tests for type-import standardization (FIX-FE-2).
 *
 * These are static/structural assertions (no runtime behavior under test):
 *  - No file under `apps/web/src/api/modules/` imports an `@alsaqi/shared`-exported
 *    type name via a relative path (any specifier beginning with `./` or `../`),
 *    and none of those shared names are locally re-declared (interface/type alias)
 *    within that directory.
 *  - No duplicate Local_Type for a shared name remains under `apps/web/src/types`
 *    (i.e. no entry classified `duplicate-removable` by the duplicate-type
 *    inventory). Intentionally-divergent local types (`divergent-needs-reconciliation`)
 *    and `export type { ... } from "@alsaqi/shared"` re-exports are allowed.
 *
 * Validates: Requirements 2.1, 2.2, 2.3
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateDuplicateTypeInventory,
  STATUS,
} from '../../../../scripts/duplicate-type-inventory.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..', '..', '..', '..'); // apps/web
const REPO_ROOT = resolve(WEB_ROOT, '..', '..');
const MODULES_DIR = resolve(WEB_ROOT, 'src', 'api', 'modules');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Recursively collect `.ts` source files (excluding tests and `.d.ts`). */
function collectTsFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === '__tests__') continue; // skip test sources
      collectTsFiles(full, acc);
    } else if (
      /\.ts$/.test(entry) &&
      !/\.test\.ts$/.test(entry) &&
      !/\.d\.ts$/.test(entry)
    ) {
      acc.push(full);
    }
  }
  return acc;
}

/** A single imported binding parsed from a named import clause. */
interface ParsedImport {
  /** The original exported name (before any `as` alias), with a leading `type ` stripped. */
  name: string;
  /** The module specifier the binding was imported from. */
  specifier: string;
}

/**
 * Parse named imports/exports-with-source from a TS source string.
 * Captures both `import { ... } from '...'` and `import type { ... } from '...'`,
 * as well as `export { ... } from '...'` re-exports, returning each bound name
 * together with its source specifier.
 */
function parseNamedImports(source: string): ParsedImport[] {
  const results: ParsedImport[] = [];
  const re =
    /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const clause = m[1];
    const specifier = m[2];
    for (const raw of clause.split(',')) {
      const piece = raw.trim();
      if (!piece) continue;
      // Strip per-binding `type ` prefix and any `as alias`.
      const name = piece
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
        .trim();
      if (name) results.push({ name, specifier });
    }
  }
  return results;
}

const isRelative = (specifier: string) =>
  specifier.startsWith('./') || specifier.startsWith('../');

const repoRel = (p: string) => relative(REPO_ROOT, p).split('\\').join('/');

// The set of type names exported by `@alsaqi/shared`, derived from the inventory
// generator (which loads them via the TypeScript compiler API).
const { sharedTypeNames } = generateDuplicateTypeInventory();
const sharedTypeNameSet = new Set<string>(sharedTypeNames);

describe('FIX-FE-2: type-import standardization guard', () => {
  const moduleFiles = collectTsFiles(MODULES_DIR);

  it('finds module source files to inspect', () => {
    // Sanity check so the guard cannot silently pass on an empty file set.
    expect(moduleFiles.length).toBeGreaterThan(0);
    expect(sharedTypeNameSet.size).toBeGreaterThan(0);
  });

  it('has no relative-path import of an @alsaqi/shared-exported type under api/modules (Req 2.1, 2.2)', () => {
    const violations: string[] = [];
    for (const file of moduleFiles) {
      const source = readFileSync(file, 'utf-8');
      for (const imp of parseNamedImports(source)) {
        if (isRelative(imp.specifier) && sharedTypeNameSet.has(imp.name)) {
          violations.push(
            `${repoRel(file)}: imports shared type "${imp.name}" via relative path "${imp.specifier}"`
          );
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('has no local re-declaration of an @alsaqi/shared-exported type under api/modules (Req 2.2)', () => {
    const violations: string[] = [];
    for (const file of moduleFiles) {
      const source = readFileSync(file, 'utf-8');
      for (const name of sharedTypeNameSet) {
        // Match a local `interface Name` or `type Name =` declaration.
        const declRe = new RegExp(
          `\\b(?:interface|type)\\s+${name}\\b(?:\\s*<[^=]*?>)?\\s*(?:=|\\{|extends)`
        );
        if (declRe.test(source)) {
          violations.push(
            `${repoRel(file)}: locally re-declares shared type "${name}"`
          );
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});

describe('FIX-FE-2: no removable duplicate Local_Type under src/types (Req 2.3)', () => {
  it('leaves only divergent-needs-reconciliation local types (no duplicate-removable)', () => {
    const { inventory } = generateDuplicateTypeInventory();
    const underTypes = inventory.filter((r) =>
      r.filePath.startsWith('apps/web/src/types')
    );
    const removable = underTypes.filter((r) => r.status === STATUS.REMOVABLE);
    expect(
      removable,
      `Removable duplicate Local_Types still present under src/types:\n${removable
        .map((r) => `  ${r.typeName} (${r.filePath})`)
        .join('\n')}`
    ).toEqual([]);

    // Any remaining local definition of a shared name must be an explicitly
    // divergent type pending reconciliation (FIX-FE-1 / FIX-FE-3).
    for (const r of underTypes) {
      expect(r.status).toBe(STATUS.DIVERGENT);
    }
  });
});
