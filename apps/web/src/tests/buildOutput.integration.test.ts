/**
 * Integration tests for build output verification.
 *
 * These post-build tests validate the production dist/ directory:
 * 1. Expected vendor chunk names exist (3-tier model)
 * 2. All JS/CSS files use content-hash filenames
 * 3. bundle-stats.json conforms to the BundleStats schema
 *
 * Tests gracefully skip if dist/ does not exist (no build has been run).
 *
 * **Validates: Requirements 1.1, 1.3, 5.1, 6.4**
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DIST_DIR = path.resolve(__dirname, '../../dist');
const ASSETS_DIR = path.join(DIST_DIR, 'assets');
const BUNDLE_STATS_PATH = path.join(DIST_DIR, 'bundle-stats.json');

const distExists = existsSync(DIST_DIR);

/**
 * Expected vendor chunk names from the 3-tier manualChunks configuration.
 * Requirement 1.1: 3-tier chunk splitting strategy
 * Requirement 1.3: Heavy libraries isolated into separate vendor chunks
 *
 * Tier 1 (Critical Path) and Tier 2 (Deferred) are always present in the build.
 * Tier 3 (On-Demand) chunks only appear if the corresponding dependency is actually
 * imported somewhere in the codebase — we verify they exist IF present.
 */
const ALWAYS_PRESENT_VENDOR_CHUNKS = [
  'vendor-react',
  'vendor-ui',
  'vendor-i18n',
  'vendor-query',
  'vendor-forms',
  'vendor-motion',
  'vendor-toast',
] as const;

/**
 * Tier 3 on-demand chunks — only emitted when corresponding route uses the library.
 * We verify naming convention if they exist, but don't require their presence.
 */
const ON_DEMAND_VENDOR_CHUNKS = [
  'vendor-charts',
  'vendor-pdf',
  'vendor-excel',
  'vendor-editor',
] as const;

const ALL_VENDOR_CHUNKS = [...ALWAYS_PRESENT_VENDOR_CHUNKS, ...ON_DEMAND_VENDOR_CHUNKS] as const;

/**
 * Content-hash filename pattern: [name].[hash].[ext]
 * The hash is an alphanumeric string (Rollup uses base64url characters).
 * Requirement 5.1: Content-hash fingerprints on all emitted assets
 */
const CONTENT_HASH_PATTERN = /^.+\.[A-Za-z0-9_-]+\.(js|css|mjs)$/;

/**
 * ISO 8601 date pattern for buildTime validation.
 */
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

describe('Build Output Verification', () => {
  beforeAll(() => {
    if (!distExists) {
      console.warn(
        '[buildOutput.integration] dist/ directory not found — skipping integration tests. Run `npm run build` first.'
      );
    }
  });

  describe('Vendor chunk names (Requirements 1.1, 1.3)', () => {
    it.skipIf(!distExists)(
      'all Tier 1 and Tier 2 vendor chunks exist in dist/assets/',
      () => {
        const assetFiles = readdirSync(ASSETS_DIR);

        for (const chunkName of ALWAYS_PRESENT_VENDOR_CHUNKS) {
          const chunkFile = assetFiles.find(
            (file) => file.startsWith(`${chunkName}.`) && file.endsWith('.js')
          );
          expect(
            chunkFile,
            `Expected vendor chunk "${chunkName}" to exist in dist/assets/`
          ).toBeDefined();
        }
      }
    );

    it.skipIf(!distExists)(
      'Tier 3 on-demand vendor chunks use correct naming when present',
      () => {
        const assetFiles = readdirSync(ASSETS_DIR);

        for (const chunkName of ON_DEMAND_VENDOR_CHUNKS) {
          const chunkFile = assetFiles.find(
            (file) => file.startsWith(`${chunkName}.`) && file.endsWith('.js')
          );
          if (chunkFile) {
            const pattern = new RegExp(`^${chunkName}\\.[A-Za-z0-9_-]+\\.js$`);
            expect(chunkFile).toMatch(pattern);
          }
        }
      }
    );

    it.skipIf(!distExists)(
      'all vendor chunk filenames follow the [name].[hash].js pattern',
      () => {
        const assetFiles = readdirSync(ASSETS_DIR);

        for (const chunkName of ALL_VENDOR_CHUNKS) {
          const chunkFile = assetFiles.find(
            (file) => file.startsWith(`${chunkName}.`) && file.endsWith('.js')
          );
          if (chunkFile) {
            // Pattern: vendor-react.DUd9gkbS.js
            const pattern = new RegExp(`^${chunkName}\\.[A-Za-z0-9_-]+\\.js$`);
            expect(chunkFile).toMatch(pattern);
          }
        }
      }
    );
  });

  describe('Content-hash filenames (Requirement 5.1)', () => {
    it.skipIf(!distExists)(
      'all JS files in dist/assets/ have content-hash filenames matching [name].[hash].js',
      () => {
        const assetFiles = readdirSync(ASSETS_DIR);
        const jsFiles = assetFiles.filter(
          (file) => file.endsWith('.js') || file.endsWith('.mjs')
        );

        expect(jsFiles.length).toBeGreaterThan(0);

        for (const file of jsFiles) {
          expect(file, `JS file "${file}" should match content-hash pattern`).toMatch(
            CONTENT_HASH_PATTERN
          );
        }
      }
    );

    it.skipIf(!distExists)(
      'all CSS files in dist/assets/ have content-hash filenames matching [name].[hash].css',
      () => {
        const assetFiles = readdirSync(ASSETS_DIR);
        const cssFiles = assetFiles.filter((file) => file.endsWith('.css'));

        expect(cssFiles.length).toBeGreaterThan(0);

        for (const file of cssFiles) {
          expect(file, `CSS file "${file}" should match content-hash pattern`).toMatch(
            CONTENT_HASH_PATTERN
          );
        }
      }
    );
  });

  describe('bundle-stats.json schema compliance (Requirement 6.4)', () => {
    it.skipIf(!distExists)('bundle-stats.json exists in dist/', () => {
      expect(existsSync(BUNDLE_STATS_PATH)).toBe(true);
    });

    it.skipIf(!distExists)('has a valid buildTime (ISO 8601 string)', () => {
      const stats = JSON.parse(readFileSync(BUNDLE_STATS_PATH, 'utf-8'));

      expect(stats).toHaveProperty('buildTime');
      expect(typeof stats.buildTime).toBe('string');
      expect(stats.buildTime).toMatch(ISO_8601_PATTERN);

      // Verify it parses to a valid Date
      const parsed = new Date(stats.buildTime);
      expect(parsed.getTime()).not.toBeNaN();
    });

    it.skipIf(!distExists)('has a valid commitHash (string)', () => {
      const stats = JSON.parse(readFileSync(BUNDLE_STATS_PATH, 'utf-8'));

      expect(stats).toHaveProperty('commitHash');
      expect(typeof stats.commitHash).toBe('string');
      expect(stats.commitHash.length).toBeGreaterThan(0);
    });

    it.skipIf(!distExists)(
      'has chunks array with correct ChunkInfo schema',
      () => {
        const stats = JSON.parse(readFileSync(BUNDLE_STATS_PATH, 'utf-8'));

        expect(stats).toHaveProperty('chunks');
        expect(Array.isArray(stats.chunks)).toBe(true);
        expect(stats.chunks.length).toBeGreaterThan(0);

        for (const chunk of stats.chunks) {
          // name: string
          expect(chunk).toHaveProperty('name');
          expect(typeof chunk.name).toBe('string');
          expect(chunk.name.length).toBeGreaterThan(0);

          // fileName: string
          expect(chunk).toHaveProperty('fileName');
          expect(typeof chunk.fileName).toBe('string');
          expect(chunk.fileName.length).toBeGreaterThan(0);

          // rawSize: number (positive)
          expect(chunk).toHaveProperty('rawSize');
          expect(typeof chunk.rawSize).toBe('number');
          expect(chunk.rawSize).toBeGreaterThan(0);

          // gzipSize: number (positive, smaller than or equal to raw)
          expect(chunk).toHaveProperty('gzipSize');
          expect(typeof chunk.gzipSize).toBe('number');
          expect(chunk.gzipSize).toBeGreaterThan(0);

          // brotliSize: number (positive)
          expect(chunk).toHaveProperty('brotliSize');
          expect(typeof chunk.brotliSize).toBe('number');
          expect(chunk.brotliSize).toBeGreaterThan(0);

          // isInitial: boolean
          expect(chunk).toHaveProperty('isInitial');
          expect(typeof chunk.isInitial).toBe('boolean');

          // modules: string[]
          expect(chunk).toHaveProperty('modules');
          expect(Array.isArray(chunk.modules)).toBe(true);
          for (const mod of chunk.modules) {
            expect(typeof mod).toBe('string');
          }
        }
      }
    );

    it.skipIf(!distExists)(
      'has totals object with rawSize, gzipSize, brotliSize',
      () => {
        const stats = JSON.parse(readFileSync(BUNDLE_STATS_PATH, 'utf-8'));

        expect(stats).toHaveProperty('totals');
        expect(typeof stats.totals).toBe('object');
        expect(stats.totals).not.toBeNull();

        // rawSize: number (positive)
        expect(stats.totals).toHaveProperty('rawSize');
        expect(typeof stats.totals.rawSize).toBe('number');
        expect(stats.totals.rawSize).toBeGreaterThan(0);

        // gzipSize: number (positive)
        expect(stats.totals).toHaveProperty('gzipSize');
        expect(typeof stats.totals.gzipSize).toBe('number');
        expect(stats.totals.gzipSize).toBeGreaterThan(0);

        // brotliSize: number (positive)
        expect(stats.totals).toHaveProperty('brotliSize');
        expect(typeof stats.totals.brotliSize).toBe('number');
        expect(stats.totals.brotliSize).toBeGreaterThan(0);
      }
    );

    it.skipIf(!distExists)(
      'totals are consistent with sum of individual chunks',
      () => {
        const stats = JSON.parse(readFileSync(BUNDLE_STATS_PATH, 'utf-8'));

        const computedRaw = stats.chunks.reduce(
          (sum: number, c: { rawSize: number }) => sum + c.rawSize,
          0
        );
        const computedGzip = stats.chunks.reduce(
          (sum: number, c: { gzipSize: number }) => sum + c.gzipSize,
          0
        );
        const computedBrotli = stats.chunks.reduce(
          (sum: number, c: { brotliSize: number }) => sum + c.brotliSize,
          0
        );

        expect(stats.totals.rawSize).toBe(computedRaw);
        expect(stats.totals.gzipSize).toBe(computedGzip);
        expect(stats.totals.brotliSize).toBe(computedBrotli);
      }
    );
  });
});
