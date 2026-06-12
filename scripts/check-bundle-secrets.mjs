/**
 * Post-Build Bundle Secret Guard
 *
 * Scans the production build output directory (apps/web/dist) for any
 * embedded, non-empty `GEMINI_API_KEY` value. The Gemini key must never be
 * baked into the shipped frontend bundle, so this guard fails the build
 * (exits with code 1) if a non-empty value is found embedded in any
 * `dist/**\/*.js` file.
 *
 * This runs AFTER `vite build` (see apps/web build script) so it inspects
 * the emitted output, complementing the post-build source map guard.
 *
 * Detection strategy: locate textual occurrences of `GEMINI_API_KEY` within
 * the emitted JS and inspect the immediately-following assignment/value. An
 * empty string assignment (e.g. `GEMINI_API_KEY:""` or `GEMINI_API_KEY=""`)
 * is allowed; any non-empty literal value fails the build.
 *
 * Requirements: 2.8
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Configuration ────────────────────────────────────────────────────────────

const DIST_DIR = resolve(__dirname, '..', 'apps', 'web', 'dist');
const PROJECT_ROOT = resolve(__dirname, '..');

const SECRET_NAME = 'GEMINI_API_KEY';

// Match `GEMINI_API_KEY` followed by an assignment/property operator (`:`, `=`,
// or `:=`) and a quoted string literal, capturing the literal's contents. This
// covers the common ways a bundler embeds a define replacement value.
const ASSIGNMENT_REGEX = new RegExp(
  `${SECRET_NAME}\\s*[:=]\\s*(["'\`])((?:\\\\.|(?!\\1).)*)\\1`,
  'g'
);

// ─── File Discovery ───────────────────────────────────────────────────────────

/**
 * Recursively collect all `.js` files under the given directory.
 */
function findJsFiles(dir) {
  const results = [];

  function walk(currentDir) {
    let entries;
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && entry.endsWith('.js')) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

// ─── Scanning ─────────────────────────────────────────────────────────────────

/**
 * Scan a single file for an embedded, non-empty GEMINI_API_KEY value.
 * Returns an array of { value } findings (empty when none).
 */
function scanFile(filePath) {
  const findings = [];
  let content;

  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    console.warn(`⚠️  Could not read file: ${filePath}`);
    return findings;
  }

  ASSIGNMENT_REGEX.lastIndex = 0;
  let match;
  while ((match = ASSIGNMENT_REGEX.exec(content)) !== null) {
    const value = match[2];
    // An empty value (the safe default) is allowed; any non-empty value fails.
    if (value && value.length > 0) {
      findings.push({ value });
    }
  }

  return findings;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('🔑 Post-Build Bundle Secret Guard');
  console.log('─'.repeat(60));
  console.log(
    `\nScanning for embedded ${SECRET_NAME} values in: ${
      relative(PROJECT_ROOT, DIST_DIR) || DIST_DIR
    }\n`
  );

  if (!existsSync(DIST_DIR)) {
    console.error(`❌ Build output directory not found: ${DIST_DIR}`);
    console.error('   Expected `vite build` to run before this guard.');
    process.exit(1);
  }

  const jsFiles = findJsFiles(DIST_DIR);
  const offenders = [];

  for (const file of jsFiles) {
    const findings = scanFile(file);
    if (findings.length > 0) {
      offenders.push({ file, findings });
    }
  }

  if (offenders.length === 0) {
    console.log(`✅ No embedded ${SECRET_NAME} value found in dist/ JavaScript.\n`);
    process.exit(0);
  }

  const total = offenders.reduce((sum, o) => sum + o.findings.length, 0);
  console.log(
    `❌ Detected ${total} embedded ${SECRET_NAME} value(s) in ${offenders.length} bundle file(s):\n`
  );
  for (const { file } of offenders) {
    console.log(`  • ${relative(PROJECT_ROOT, file)}`);
  }

  console.log('');
  console.log('─'.repeat(60));
  console.log(`A secret key value (${SECRET_NAME}) was detected in the production bundle.`);
  console.log(`Remove any \`${SECRET_NAME}\` reference from the Vite \`define\` block`);
  console.log('in apps/web/vite.config.ts and ensure the key is never embedded at build time.\n');

  process.exit(1);
}

main();
