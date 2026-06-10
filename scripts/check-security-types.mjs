/**
 * Security-Critical Module Type Safety Checker
 *
 * Scans security-critical files for unsafe TypeScript patterns:
 * - Explicit `any` type annotations (`: any`, `<any>`)
 * - `@ts-ignore` directives
 * - `as any` type assertions
 *
 * Security-critical files:
 * - src/api/client.ts
 * - src/api/hooks/useAuth.ts
 * - Any file matching *Security*Provider* or *Auth*Provider* under src/
 *
 * Fails the build (exits with code 1) if any violations are found.
 *
 * Requirements: 10.4, 10.5
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Configuration ────────────────────────────────────────────────────────────

const WEB_SRC_DIR = resolve(__dirname, '..', 'apps', 'web', 'src');

/** Explicitly listed security-critical files (relative to apps/web/src) */
const EXPLICIT_FILES = ['api/client.ts', 'api/hooks/useAuth.ts'];

/** Glob-like patterns for additional security-critical files (filename/path matching) */
const FILE_PATTERNS = [/Security.*Provider/i, /Auth.*Provider/i, /AuthContext/i];

/** Patterns to detect violations */
const VIOLATION_PATTERNS = [
  { regex: /:\s*any\b/, label: 'explicit `any` type' },
  { regex: /<any\b/, label: 'generic `any` type' },
  { regex: /\bas\s+any\b/, label: '`as any` type assertion' },
  { regex: /@ts-ignore\b/, label: '`@ts-ignore` directive' },
  { regex: /@ts-nocheck\b/, label: '`@ts-nocheck` directive' },
];

// ─── File Discovery ───────────────────────────────────────────────────────────

/**
 * Recursively find files matching the Security/Auth Provider patterns.
 */
function findMatchingFiles(dir, patterns) {
  const results = [];

  function walk(currentDir) {
    let entries;
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      // Skip node_modules, dist, test directories
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;

      const fullPath = join(currentDir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && /\.(ts|tsx)$/.test(entry)) {
        // Skip test files — only production source is security-critical
        if (/\.(test|spec)\.(ts|tsx)$/.test(entry) || currentDir.includes('__tests__')) continue;

        const relativePath = relative(WEB_SRC_DIR, fullPath);
        if (patterns.some((p) => p.test(relativePath) || p.test(entry))) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return results;
}

// ─── Scanning ─────────────────────────────────────────────────────────────────

/**
 * Scan a single file for type-safety violations.
 */
function scanFile(filePath) {
  const violations = [];
  let content;

  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    console.warn(`⚠️  Could not read file: ${filePath}`);
    return violations;
  }

  const lines = content.split('\n');
  const projectRoot = resolve(WEB_SRC_DIR, '..', '..', '..');
  const relPath = relative(projectRoot, filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // For comment lines, only check for @ts-ignore/@ts-nocheck directives
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      for (const pattern of VIOLATION_PATTERNS) {
        if (pattern.label.includes('@ts-ignore') || pattern.label.includes('@ts-nocheck')) {
          const match = pattern.regex.exec(line);
          if (match) {
            violations.push({
              file: relPath,
              line: lineNum,
              column: match.index + 1,
              text: trimmed,
              label: pattern.label,
            });
          }
        }
      }
      continue;
    }

    for (const pattern of VIOLATION_PATTERNS) {
      const match = pattern.regex.exec(line);
      if (match) {
        violations.push({
          file: relPath,
          line: lineNum,
          column: match.index + 1,
          text: trimmed,
          label: pattern.label,
        });
      }
    }
  }

  return violations;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('🔒 Security-Critical Module Type Safety Check');
  console.log('─'.repeat(60));

  // Collect all security-critical files
  const filesToScan = new Set();

  // Add explicitly listed files
  for (const relFile of EXPLICIT_FILES) {
    const fullPath = resolve(WEB_SRC_DIR, relFile);
    filesToScan.add(fullPath);
  }

  // Find pattern-matched files
  const patternMatched = findMatchingFiles(WEB_SRC_DIR, FILE_PATTERNS);
  for (const f of patternMatched) {
    filesToScan.add(f);
  }

  const projectRoot = resolve(WEB_SRC_DIR, '..', '..', '..');
  console.log(`\nScanning ${filesToScan.size} security-critical file(s):`);
  for (const f of filesToScan) {
    const relPath = relative(projectRoot, f);
    console.log(`  • ${relPath}`);
  }
  console.log('');

  // Scan all files
  const allViolations = [];
  for (const file of filesToScan) {
    const violations = scanFile(file);
    allViolations.push(...violations);
  }

  // Report results
  if (allViolations.length === 0) {
    console.log('✅ No type-safety violations found in security-critical modules.\n');
    process.exit(0);
  }

  console.log(`❌ Found ${allViolations.length} violation(s) in security-critical modules:\n`);

  for (const v of allViolations) {
    console.log(`  ${v.file}:${v.line}:${v.column}`);
    console.log(`    ${v.label}`);
    console.log(`    > ${v.text}`);
    console.log('');
  }

  console.log('─'.repeat(60));
  console.log(
    'Security-critical modules must not contain explicit `any`, `@ts-ignore`, or `as any`.'
  );
  console.log(`Fix all ${allViolations.length} violation(s) above to pass this check.\n`);

  process.exit(1);
}

main();
