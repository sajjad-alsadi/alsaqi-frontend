/**
 * CI Bundle Delta Comparison Script
 *
 * Compares the current build's total gzip size (from dist/bundle-stats.json)
 * against the stored baseline (.bundle-baseline.json). Fails if the total
 * gzip size increases by more than 5 KB without BUDGET_OVERRIDE=true.
 *
 * Requirements: 6.5
 *
 * Usage:
 *   node scripts/check-bundle-delta.mjs
 *
 * Environment variables:
 *   BUDGET_OVERRIDE=true  — bypass the 5 KB delta limit
 *
 * Exit codes:
 *   0 — within budget (or override active, or no baseline yet)
 *   1 — budget exceeded
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

const MAX_DELTA_BYTES = 5120; // 5 KB

const statsPath = resolve(root, 'dist/bundle-stats.json');
const baselinePath = resolve(root, '.bundle-baseline.json');

// Check that bundle-stats.json exists (must run after build)
if (!existsSync(statsPath)) {
  console.error('❌ dist/bundle-stats.json not found. Run a production build first.');
  process.exit(1);
}

// Handle missing baseline gracefully (first run)
if (!existsSync(baselinePath)) {
  console.warn('⚠️  No .bundle-baseline.json found — skipping delta check (first run).');
  console.log('   Run the build and copy dist/bundle-stats.json to .bundle-baseline.json to establish a baseline.');
  process.exit(0);
}

const current = JSON.parse(readFileSync(statsPath, 'utf-8'));
const baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));

const currentTotal = current.chunks.reduce((sum, c) => sum + c.gzipSize, 0);
const baselineTotal = baseline.chunks.reduce((sum, c) => sum + c.gzipSize, 0);
const delta = currentTotal - baselineTotal;

const hasOverride = process.env.BUDGET_OVERRIDE === 'true';

if (delta > MAX_DELTA_BYTES && !hasOverride) {
  console.error(`❌ Bundle size increased by ${(delta / 1024).toFixed(1)} KB gzip (limit: 5 KB).`);
  console.error('   Set BUDGET_OVERRIDE=true to bypass this check.');
  process.exit(1);
}

const sign = delta >= 0 ? '+' : '';
const status = hasOverride ? '(override active)' : '— within budget';
console.log(`✅ Bundle delta: ${sign}${(delta / 1024).toFixed(1)} KB gzip ${status}`);
