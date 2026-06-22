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

// ════════════════════════════════════════════════════════════════════════════
// Consolidation invariants guard (Task 15.3)
//
// Static/structural assertions that the HTTP/hook/auth consolidation
// (Epic 15) holds and cannot silently regress:
//   1. No source file under `apps/web/src` imports a REMOVED legacy data hook
//      from the legacy `src/hooks/*` location. Imports are resolved to absolute
//      paths so the valid `src/api/hooks/*` layer (and the `api/index.ts`
//      `export * from './hooks/useAuditPlans'` barrel re-export) are NOT false
//      positives. (Req 3.1, 3.2)
//   2. No source file performs a raw `fetch('/api/auth/login')` (or any fetch to
//      that login path); login must flow through the Auth_Module. (Req 4.1, 4.2, 4.3)
//   3. No data-operation hook name is exported by more than one file across the
//      `src/hooks/*` and `src/api/hooks/*` layers (no two same-named hooks with
//      divergent behavior). (Req 3.6)
//
// Validates: Requirements 3.1, 3.2, 3.6, 4.1, 4.2, 4.3
// ════════════════════════════════════════════════════════════════════════════

const SRC_ROOT = resolve(WEB_ROOT, 'src');
const LEGACY_HOOKS_DIR = resolve(SRC_ROOT, 'hooks');
const API_HOOKS_DIR = resolve(SRC_ROOT, 'api', 'hooks');

/**
 * Legacy data hooks that Epic 15.2 removed from `src/hooks/*`. Their consumers
 * were migrated to the equivalent `src/api/hooks/*` Query_Hook. No source file
 * may import these names from the legacy `src/hooks/` location any longer.
 */
const REMOVED_LEGACY_DATA_HOOKS = [
  'useAuditPlans',
  'useAuditFindings',
  'useCorrespondence',
  'useRisks',
  'useUserManagement',
  'useDashboardStats',
  'useDepartments',
  'useLookups',
] as const;

/** Recursively collect `.ts`/`.tsx` source files, excluding tests and `.d.ts`. */
function collectAllSourceFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules' || entry === 'dist') {
        continue;
      }
      collectAllSourceFiles(full, acc);
    } else if (
      /\.tsx?$/.test(entry) &&
      !/\.test\.tsx?$/.test(entry) &&
      !/\.d\.ts$/.test(entry)
    ) {
      acc.push(full);
    }
  }
  return acc;
}

/** Extract every module specifier referenced by an import/export-from/side-effect statement. */
function extractModuleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  // `import ... from '...'` and `export ... from '...'`
  const fromRe = /(?:import|export)\b[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g;
  // Bare side-effect imports: `import '...'`
  const sideEffectRe = /import\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(source)) !== null) specifiers.push(m[1]);
  while ((m = sideEffectRe.exec(source)) !== null) specifiers.push(m[1]);
  return specifiers;
}

const stripModuleExt = (p: string) => p.replace(/\.(tsx?|jsx?)$/, '');

/**
 * Resolve a module specifier from a source file to an absolute, extension-less
 * path. Returns `null` for package/bare specifiers that do not resolve into the
 * local `src` tree. Handles relative (`./`, `../`) and the `@/*` alias
 * (`@/* -> ./src/*`).
 */
function resolveLocalSpecifier(fromFile: string, specifier: string): string | null {
  let abs: string;
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    abs = resolve(dirname(fromFile), specifier);
  } else if (specifier.startsWith('@/')) {
    abs = resolve(SRC_ROOT, specifier.slice(2));
  } else {
    return null;
  }
  return stripModuleExt(abs);
}

describe('Epic 15: consolidation invariants guard (Req 3.1, 3.2, 3.6, 4.1, 4.2, 4.3)', () => {
  const allSourceFiles = collectAllSourceFiles(SRC_ROOT);

  it('finds source files to inspect', () => {
    // Sanity guard so the assertions below cannot silently pass on an empty set.
    expect(allSourceFiles.length).toBeGreaterThan(0);
  });

  it('has no import of a removed legacy data hook from the legacy src/hooks path (Req 3.1, 3.2)', () => {
    // The exact absolute (extension-less) paths that are now forbidden.
    const forbiddenTargets = new Set(
      REMOVED_LEGACY_DATA_HOOKS.map((name) => resolve(LEGACY_HOOKS_DIR, name))
    );

    const violations: string[] = [];
    for (const file of allSourceFiles) {
      const source = readFileSync(file, 'utf-8');
      for (const specifier of extractModuleSpecifiers(source)) {
        const resolved = resolveLocalSpecifier(file, specifier);
        if (resolved && forbiddenTargets.has(resolved)) {
          violations.push(
            `${repoRel(file)}: imports removed legacy data hook via "${specifier}" (resolves to ${repoRel(resolved)})`
          );
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('has no raw fetch to /api/auth/login anywhere in src (Req 4.1, 4.2, 4.3)', () => {
    // Match a `fetch(...)` whose URL argument references the legacy login path,
    // and, independently, any occurrence of the raw `/api/auth/login` literal.
    // The Auth_Module targets `/auth/login`, which this guard does not match.
    const fetchLoginRe = /fetch\s*\(\s*[^)]*\/api\/auth\/login/;
    const rawPathRe = /['"`][^'"`]*\/api\/auth\/login/;

    const violations: string[] = [];
    for (const file of allSourceFiles) {
      const source = readFileSync(file, 'utf-8');
      if (fetchLoginRe.test(source) || rawPathRe.test(source)) {
        violations.push(`${repoRel(file)}: references raw "/api/auth/login"`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});

describe('Epic 15: at most one hook per data-operation name across hook layers (Req 3.6)', () => {
  /** Collect exported hook declarations (names matching `use[A-Z]...`) per file. */
  function collectExportedHooks(dir: string): Map<string, string[]> {
    const byName = new Map<string, string[]>();
    if (!existsSync(dir)) return byName;
    const files: string[] = [];
    const walk = (d: string) => {
      for (const entry of readdirSync(d)) {
        const full = resolve(d, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          if (entry === '__tests__') continue;
          walk(full);
        } else if (
          /\.tsx?$/.test(entry) &&
          !/\.test\.tsx?$/.test(entry) &&
          !/\.d\.ts$/.test(entry) &&
          entry !== 'index.ts' // skip barrels to avoid double-counting re-exports
        ) {
          files.push(full);
        }
      }
    };
    walk(dir);

    const declRe =
      /export\s+(?:async\s+)?(?:function|const)\s+(use[A-Z]\w*)/g;
    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      let m: RegExpExecArray | null;
      while ((m = declRe.exec(source)) !== null) {
        const name = m[1];
        const list = byName.get(name) ?? [];
        list.push(file);
        byName.set(name, list);
      }
    }
    return byName;
  }

  it('exports each hook name from exactly one file across src/hooks and src/api/hooks', () => {
    const combined = new Map<string, string[]>();
    for (const dir of [LEGACY_HOOKS_DIR, API_HOOKS_DIR]) {
      for (const [name, files] of collectExportedHooks(dir)) {
        const existing = combined.get(name) ?? [];
        combined.set(name, [...existing, ...files]);
      }
    }

    // Sanity: the api/hooks layer must actually contribute hooks.
    expect(combined.size).toBeGreaterThan(0);

    const duplicates: string[] = [];
    for (const [name, files] of combined) {
      if (files.length > 1) {
        duplicates.push(
          `${name} declared in ${files.length} files:\n${files
            .map((f) => `    - ${repoRel(f)}`)
            .join('\n')}`
        );
      }
    }
    expect(duplicates, duplicates.join('\n')).toEqual([]);
  });
});
