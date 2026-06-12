/**
 * Duplicate-Type Inventory (FIX-FE-2, requirement 2.4)
 *
 * Emits a list of `{ typeName, filePath, status }` records for every Local_Type
 * defined under `apps/web/src/api/modules/` or `apps/web/src/types` (i.e.
 * `apps/web/src/types.ts` and any files under an `apps/web/src/types/` directory)
 * that ALSO exists as an exported type in the `@alsaqi/shared` package.
 *
 * Each record is classified as one of:
 *   • `duplicate-removable`             — the Local_Type is structurally identical
 *                                         to its Shared_Type counterpart (same
 *                                         member names, same optionality, and
 *                                         mutually-assignable member types). It is
 *                                         safe to delete and replace with an import
 *                                         from `@alsaqi/shared`.
 *   • `divergent-needs-reconciliation`  — the Local_Type drifts from the Shared_Type
 *                                         (extra/missing members, changed optionality,
 *                                         or a narrowed/widened member type — e.g.
 *                                         local `AuditFinding` adds `title?`, local
 *                                         `Recommendation` adds `plan_id`/`rec_number`,
 *                                         local `AuditPlan.type` is a narrower literal
 *                                         union than the shared enum-derived type).
 *                                         These MUST NOT be silently deleted; the extra
 *                                         field is reconciled into the Shared_Type as
 *                                         part of FIX-FE-1 / FIX-FE-3.
 *
 * Classification is computed from the real TypeScript types via the compiler API
 * (using the project's own `tsconfig.json`, so `exactOptionalPropertyTypes` and the
 * `@alsaqi/shared` path mapping are honored). This means enum-derived shared types
 * such as `type: `${AuditType}`` are compared against the local literal unions by
 * actual type identity, not by text — so a local union that exactly matches the enum
 * values is correctly reported as `duplicate-removable`, while a narrower one is
 * reported as `divergent-needs-reconciliation`.
 *
 * Usage (from repo root or anywhere):
 *   node apps/web/scripts/duplicate-type-inventory.mjs            # human + JSON to stdout
 *   node apps/web/scripts/duplicate-type-inventory.mjs --json     # JSON only to stdout
 *   node apps/web/scripts/duplicate-type-inventory.mjs --write    # also write the JSON artifact
 *
 * Requirements: 2.4
 */

import ts from 'typescript';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..'); // apps/web
const REPO_ROOT = resolve(WEB_ROOT, '..', '..'); // repository root
const TSCONFIG = resolve(WEB_ROOT, 'tsconfig.json');
const SHARED_INDEX = resolve(REPO_ROOT, 'packages', 'shared', 'src', 'index.ts');

const LOCAL_TYPES_FILE = resolve(WEB_ROOT, 'src', 'types.ts');
const LOCAL_TYPES_DIR = resolve(WEB_ROOT, 'src', 'types');
const MODULES_DIR = resolve(WEB_ROOT, 'src', 'api', 'modules');

const ARTIFACT_PATH = resolve(__dirname, 'duplicate-type-inventory.json');

export const STATUS = {
  REMOVABLE: 'duplicate-removable',
  DIVERGENT: 'divergent-needs-reconciliation',
};

// ─── tsconfig loading (honors `extends`, `paths`, exactOptionalPropertyTypes) ───

function loadCompilerOptions() {
  /** @type {ts.ParseConfigFileHost} */
  const host = {
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(
        ts.flattenDiagnosticMessageText(d.messageText, '\n')
      );
    },
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(TSCONFIG, {}, host);
  if (!parsed) {
    throw new Error(`Failed to parse tsconfig at ${TSCONFIG}`);
  }
  // We never emit; just analyze types.
  return { ...parsed.options, noEmit: true, incremental: false, composite: false };
}

// ─── File collection ────────────────────────────────────────────────────────

function collectTsFiles(dir, acc) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
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

/** All local files in scope: `src/types.ts` (+ `src/types/`) and `src/api/modules/`. */
function collectLocalSourceFiles() {
  const files = new Set();
  if (existsSync(LOCAL_TYPES_FILE)) files.add(LOCAL_TYPES_FILE);
  if (existsSync(LOCAL_TYPES_DIR) && statSync(LOCAL_TYPES_DIR).isDirectory()) {
    for (const f of collectTsFiles(LOCAL_TYPES_DIR, [])) files.add(f);
  }
  for (const f of collectTsFiles(MODULES_DIR, [])) files.add(f);
  return [...files];
}

// ─── Symbol / type helpers ────────────────────────────────────────────────────

function isTypeDeclarationSymbol(symbol) {
  const decls = symbol.declarations ?? [];
  return decls.some(
    (d) => ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d)
  );
}

function isOptionalProp(propSymbol) {
  return (propSymbol.flags & ts.SymbolFlags.Optional) !== 0;
}

function getPropType(checker, propSymbol) {
  const decl =
    propSymbol.valueDeclaration ?? propSymbol.declarations?.[0] ?? undefined;
  if (decl) {
    return checker.getTypeOfSymbolAtLocation(propSymbol, decl);
  }
  // Fallback for synthesized symbols.
  return checker.getDeclaredTypeOfSymbol(propSymbol);
}

function mutuallyAssignable(checker, a, b) {
  // `isTypeAssignableTo` is an internal-but-runtime-available checker API used by
  // many tooling packages. Fall back to structural string comparison if absent.
  if (typeof checker.isTypeAssignableTo === 'function') {
    return (
      checker.isTypeAssignableTo(a, b) && checker.isTypeAssignableTo(b, a)
    );
  }
  const fmt =
    ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType;
  return checker.typeToString(a, undefined, fmt) ===
    checker.typeToString(b, undefined, fmt);
}

/**
 * Compare a Local_Type symbol against its Shared_Type symbol.
 * Returns `duplicate-removable` when structurally identical, else
 * `divergent-needs-reconciliation`.
 */
function classify(checker, localSymbol, sharedSymbol) {
  const localType = checker.getDeclaredTypeOfSymbol(localSymbol);
  const sharedType = checker.getDeclaredTypeOfSymbol(sharedSymbol);

  const localProps = new Map(
    checker.getPropertiesOfType(localType).map((p) => [p.getName(), p])
  );
  const sharedProps = new Map(
    checker.getPropertiesOfType(sharedType).map((p) => [p.getName(), p])
  );

  // Member name sets must be identical.
  if (localProps.size !== sharedProps.size) return STATUS.DIVERGENT;
  for (const name of localProps.keys()) {
    if (!sharedProps.has(name)) return STATUS.DIVERGENT;
  }

  for (const [name, localProp] of localProps) {
    const sharedProp = sharedProps.get(name);
    // Optionality must match exactly (exactOptionalPropertyTypes-aware).
    if (isOptionalProp(localProp) !== isOptionalProp(sharedProp)) {
      return STATUS.DIVERGENT;
    }
    const localPropType = getPropType(checker, localProp);
    const sharedPropType = getPropType(checker, sharedProp);
    if (!mutuallyAssignable(checker, localPropType, sharedPropType)) {
      return STATUS.DIVERGENT;
    }
  }

  return STATUS.REMOVABLE;
}

// ─── Core ──────────────────────────────────────────────────────────────────────

/**
 * @returns {{ inventory: Array<{ typeName: string, filePath: string, status: string }>, sharedTypeNames: string[] }}
 */
export function generateDuplicateTypeInventory() {
  const options = loadCompilerOptions();
  const localFiles = collectLocalSourceFiles();
  const rootNames = [...localFiles, SHARED_INDEX];

  const program = ts.createProgram({ rootNames, options });
  const checker = program.getTypeChecker();

  // Build the set of exported type names from `@alsaqi/shared`.
  const sharedSource = program.getSourceFile(SHARED_INDEX);
  if (!sharedSource) {
    throw new Error(`Could not load @alsaqi/shared entry point: ${SHARED_INDEX}`);
  }
  const sharedModuleSymbol = checker.getSymbolAtLocation(sharedSource);
  if (!sharedModuleSymbol) {
    throw new Error('Could not resolve the @alsaqi/shared module symbol.');
  }

  /** @type {Map<string, ts.Symbol>} */
  const sharedTypeByName = new Map();
  for (const exp of checker.getExportsOfModule(sharedModuleSymbol)) {
    let resolved = exp;
    if (resolved.flags & ts.SymbolFlags.Alias) {
      resolved = checker.getAliasedSymbol(resolved);
    }
    if (isTypeDeclarationSymbol(resolved)) {
      sharedTypeByName.set(exp.getName(), resolved);
    }
  }

  /** @type {Array<{ typeName: string, filePath: string, status: string }>} */
  const inventory = [];
  const seen = new Set(); // dedupe by typeName + filePath

  for (const file of localFiles) {
    const source = program.getSourceFile(file);
    if (!source) continue;

    const visit = (node) => {
      if (
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node)
      ) {
        const typeName = node.name.getText(source);
        const sharedSymbol = sharedTypeByName.get(typeName);
        if (sharedSymbol) {
          const localSymbol = checker.getSymbolAtLocation(node.name);
          if (localSymbol) {
            const filePath = relative(REPO_ROOT, file).split('\\').join('/');
            const key = `${typeName}::${filePath}`;
            if (!seen.has(key)) {
              seen.add(key);
              inventory.push({
                typeName,
                filePath,
                status: classify(checker, localSymbol, sharedSymbol),
              });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(source, visit);
  }

  inventory.sort(
    (a, b) =>
      a.filePath.localeCompare(b.filePath) ||
      a.typeName.localeCompare(b.typeName)
  );

  return { inventory, sharedTypeNames: [...sharedTypeByName.keys()].sort() };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes('--json');
  const write = args.includes('--write');

  const { inventory } = generateDuplicateTypeInventory();

  if (write) {
    writeFileSync(ARTIFACT_PATH, JSON.stringify(inventory, null, 2) + '\n', 'utf-8');
  }

  if (jsonOnly) {
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    return;
  }

  const removable = inventory.filter((r) => r.status === STATUS.REMOVABLE);
  const divergent = inventory.filter((r) => r.status === STATUS.DIVERGENT);

  console.log('📋 Duplicate-Type Inventory (FIX-FE-2, requirement 2.4)');
  console.log('─'.repeat(72));
  console.log(
    `Found ${inventory.length} Local_Type(s) that also exist in @alsaqi/shared:\n`
  );

  const pad = (s, n) => s.padEnd(n);
  const nameW = Math.max(8, ...inventory.map((r) => r.typeName.length));
  const statusW = STATUS.DIVERGENT.length;
  console.log(
    `  ${pad('TYPE', nameW)}  ${pad('STATUS', statusW)}  FILE`
  );
  console.log(
    `  ${pad('-'.repeat(nameW), nameW)}  ${pad('-'.repeat(statusW), statusW)}  ${'-'.repeat(4)}`
  );
  for (const r of inventory) {
    console.log(
      `  ${pad(r.typeName, nameW)}  ${pad(r.status, statusW)}  ${r.filePath}`
    );
  }

  console.log('');
  console.log(
    `Summary: ${removable.length} duplicate-removable, ${divergent.length} divergent-needs-reconciliation.`
  );
  if (write) console.log(`Artifact written to ${relative(REPO_ROOT, ARTIFACT_PATH).split('\\').join('/')}`);
  console.log('');
  // Always emit machine-readable JSON last for piping/consumption.
  process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
