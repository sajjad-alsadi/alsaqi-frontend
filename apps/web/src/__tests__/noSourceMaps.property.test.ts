/**
 * Property 9: No source maps shipped (Stream 6, Component 6).
 *
 * For ANY production build, `dist/` contains zero `.map` files — whether or not
 * the Sentry source-map upload ran. This file establishes that invariant from
 * two independent angles with fast-check:
 *
 *   • Detection (req 6.2): `noSourceMapsInDist(distDir)` returns `true` iff zero
 *     `.map` files exist anywhere in an arbitrary nested `dist/` tree, and
 *     `false` the moment any `.map` (top-level or deeply nested) appears. We
 *     materialize randomly-generated trees to real temp dirs so the filesystem
 *     walk is exercised for real (no mocking).
 *   • Release gate (req 6.4 / 6.5): for ANY combination of build mode + Sentry
 *     credentials, `resolveSourcemapSetting(isSentrySourceMapUploadEnabled(env))`
 *     yields only `'hidden'` (maps emitted then deleted via SOURCEMAP_DELETE_GLOB)
 *     or `false` (no maps emitted) — never a setting that ships `.map` files.
 *
 * Validates: Requirements 6.2
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import fc from 'fast-check';

import { noSourceMapsInDist } from '../utils/observability';
import {
  isSentrySourceMapUploadEnabled,
  resolveSourcemapSetting,
  SOURCEMAP_DELETE_GLOB,
  type SourcemapReleaseEnv,
} from '../build/sourcemap-release';

// ─── Temp-dir lifecycle ───────────────────────────────────────────────────────

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function makeDist(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'nomap-dist-'));
  tempDirs.push(dir);
  return dir;
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** A safe path segment: lowercase letters + digits, never empty, no separators. */
const segmentArb = fc
  .stringMatching(/^[a-z0-9]{1,8}$/)
  .filter((s) => s.length > 0);

/** Non-`.map` file extensions a real Vite build emits. */
const nonMapExtArb = fc.constantFrom('.js', '.css', '.html', '.txt', '.json', '.woff2');

/**
 * A single file in the generated dist tree. `isMap` records the ground truth so
 * the test never re-derives "is this a map?" from the same logic under test.
 */
interface GenFile {
  segments: string[];
  base: string;
  isMap: boolean;
}

const fileArb: fc.Arbitrary<GenFile> = fc
  .record({
    segments: fc.array(segmentArb, { minLength: 0, maxLength: 3 }),
    base: segmentArb,
    isMap: fc.boolean(),
    // For non-map files, pick a benign extension.
    ext: nonMapExtArb,
    // For map files, a real source map is e.g. `index.js.map`; a plain map is `foo.map`.
    mapPrefix: fc.constantFrom('.js', '.css', ''),
  })
  .map(({ segments, base, isMap, ext, mapPrefix }) => ({
    segments,
    base: isMap ? `${base}${mapPrefix}.map` : `${base}${ext}`,
    isMap,
  }));

/** A whole dist tree: a set of files keyed by their relative path (dedup’d). */
const treeArb: fc.Arbitrary<GenFile[]> = fc
  .array(fileArb, { minLength: 0, maxLength: 12 })
  .map((files) => {
    const byPath = new Map<string, GenFile>();
    for (const f of files) {
      byPath.set([...f.segments, f.base].join('/'), f);
    }
    return [...byPath.values()];
  });

/** Materialize a generated tree into a fresh temp dist dir. */
async function writeTree(files: GenFile[]): Promise<string> {
  const dist = await makeDist();
  for (const f of files) {
    const full = join(dist, ...f.segments, f.base);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, '// built artifact');
  }
  return dist;
}

// ─── Property: detection is exact ───────────────────────────────────────────────

describe('Property 9: noSourceMapsInDist detects .map files iff present (req 6.2)', () => {
  it('returns true iff the tree contains zero .map files, anywhere', async () => {
    await fc.assert(
      fc.asyncProperty(treeArb, async (files) => {
        const expectedClean = files.every((f) => !f.isMap);
        const dist = await writeTree(files);
        const clean = await noSourceMapsInDist(dist);
        expect(clean).toBe(expectedClean);
      }),
      { numRuns: 120 },
    );
  });

  it('returns false whenever at least one .map exists, even if deeply nested', async () => {
    await fc.assert(
      fc.asyncProperty(
        treeArb,
        // A guaranteed map file placed at an arbitrary depth.
        fc.array(segmentArb, { minLength: 0, maxLength: 4 }),
        segmentArb,
        async (files, mapSegments, mapBase) => {
          const withMap: GenFile[] = [
            ...files,
            { segments: mapSegments, base: `${mapBase}.js.map`, isMap: true },
          ];
          const dist = await writeTree(withMap);
          const clean = await noSourceMapsInDist(dist);
          expect(clean).toBe(false);
        },
      ),
      { numRuns: 80 },
    );
  });
});

// ─── Property: the release gate never ships maps ────────────────────────────────

describe('Property 9: resolveSourcemapSetting never ships .map files (req 6.2)', () => {
  const envArb: fc.Arbitrary<SourcemapReleaseEnv> = fc.record({
    mode: fc.constantFrom('production', 'development', 'test', ''),
    authToken: fc.option(fc.string(), { nil: undefined }),
    org: fc.option(fc.string(), { nil: undefined }),
    project: fc.option(fc.string(), { nil: undefined }),
  });

  it('always resolves to hidden-then-deleted or no-maps for any credential combo', () => {
    fc.assert(
      fc.property(envArb, (env) => {
        const uploadEnabled = isSentrySourceMapUploadEnabled(env);
        const setting = resolveSourcemapSetting(uploadEnabled);

        // Only two outcomes are possible, and neither ships a .map to dist/.
        expect(setting === 'hidden' || setting === false).toBe(true);

        if (uploadEnabled) {
          // Gate is on ONLY when production + all three creds non-empty.
          expect(env.mode).toBe('production');
          expect(env.authToken).toBeTruthy();
          expect(env.org).toBeTruthy();
          expect(env.project).toBeTruthy();
          // Maps are emitted hidden, then deleted by this glob -> dist ships none.
          expect(setting).toBe('hidden');
          expect(SOURCEMAP_DELETE_GLOB).toBe('./dist/**/*.map');
        } else {
          // Gate off -> no maps emitted at all.
          expect(setting).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });
});
