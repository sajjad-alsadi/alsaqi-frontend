/**
 * Post-Build Source Map Guard
 *
 * Scans the production build output directory (apps/web/dist) for any
 * `.map` source map files. Production bundles must never ship source maps,
 * so this guard fails the build (exits with code 1) if any `.map` file is
 * found under dist/.
 *
 * This runs AFTER `vite build` (see apps/web build script) so it inspects
 * the emitted output, complementing the pre-build security/type guard.
 *
 * Requirements: 1.5
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Configuration ────────────────────────────────────────────────────────────

const DIST_DIR = resolve(__dirname, '..', 'apps', 'web', 'dist');
const PROJECT_ROOT = resolve(__dirname, '..');

// ─── File Discovery ───────────────────────────────────────────────────────────

/**
 * Recursively collect all `.map` files under the given directory.
 */
function findSourceMaps(dir) {
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
      } else if (stat.isFile() && entry.endsWith('.map')) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('🗺️  Post-Build Source Map Guard');
  console.log('─'.repeat(60));
  console.log(`\nScanning for .map files in: ${relative(PROJECT_ROOT, DIST_DIR) || DIST_DIR}\n`);

  if (!existsSync(DIST_DIR)) {
    console.error(`❌ Build output directory not found: ${DIST_DIR}`);
    console.error('   Expected `vite build` to run before this guard.');
    process.exit(1);
  }

  const sourceMaps = findSourceMaps(DIST_DIR);

  if (sourceMaps.length === 0) {
    console.log('✅ No .map source map files found in dist/.\n');
    process.exit(0);
  }

  console.log(`❌ Found ${sourceMaps.length} source map file(s) in dist/:\n`);
  for (const f of sourceMaps) {
    console.log(`  • ${relative(PROJECT_ROOT, f)}`);
  }

  console.log('');
  console.log('─'.repeat(60));
  console.log('Production builds must not ship source maps.');
  console.log("Set `build.sourcemap` to `false` in apps/web/vite.config.ts");
  console.log('(or delete .map files post-upload when using Sentry).\n');

  process.exit(1);
}

main();
