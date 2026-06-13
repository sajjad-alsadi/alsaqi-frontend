/**
 * Source-map release-hardening verification (Stream 6, Component 6).
 *
 * Proves the credential-gated source-map wiring that keeps `dist/` free of
 * `.map` files on BOTH paths, and that the build chain + CI surface the guard:
 *
 *   • Credential-present path (req 6.4): a production build with
 *     SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT all present enables the
 *     gate, so maps are emitted as `hidden`, uploaded, then deleted via
 *     `SOURCEMAP_DELETE_GLOB` (`./dist/**\/*.map`).
 *   • Credential-absent path (req 6.5): when any of the three is absent/empty
 *     (or the build is not in production mode) the gate is off and
 *     `build.sourcemap` resolves to `false`, so no `.map` files are ever emitted.
 *   • The build chain runs `check-dist-sourcemaps.mjs` after `vite build`, and
 *     CI runs that chain, so `dist/` shipping any `.map` fails the build (req 6.2).
 *
 * The gate logic asserted here is the exact module `vite.config.ts` consumes.
 * The real Sentry upload is not exercised (it needs live credentials + network),
 * but the deterministic config wiring that governs the no-`.map` invariant on
 * both paths is fully covered.
 *
 * Validates: Requirements 6.2, 6.4, 6.5
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isSentrySourceMapUploadEnabled,
  resolveSourcemapSetting,
  SOURCEMAP_DELETE_GLOB,
} from '../build/sourcemap-release';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/web root is two levels up from src/__tests__/
const webRoot = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(webRoot, '..', '..');

const ALL_CREDS = {
  mode: 'production' as const,
  authToken: 'token-xyz',
  org: 'al-saqi',
  project: 'web',
};

describe('source-map upload gate (req 6.4 / 6.5)', () => {
  it('enables upload + hidden maps when production and all credentials present (req 6.4)', () => {
    expect(isSentrySourceMapUploadEnabled(ALL_CREDS)).toBe(true);
    // 'hidden' emits maps WITHOUT a sourceMappingURL comment so the JS never
    // references them; the Sentry plugin uploads then deletes the .map files.
    expect(resolveSourcemapSetting(true)).toBe('hidden');
  });

  it.each(['authToken', 'org', 'project'] as const)(
    'disables upload when %s is absent (req 6.5)',
    (missingKey) => {
      const creds = { ...ALL_CREDS };
      delete (creds as Record<string, unknown>)[missingKey];
      expect(isSentrySourceMapUploadEnabled(creds)).toBe(false);
      // No maps generated at all -> dist/ ships zero .map files.
      expect(resolveSourcemapSetting(false)).toBe(false);
    }
  );

  it.each(['authToken', 'org', 'project'] as const)(
    'treats an empty-string %s as absent (req 6.5)',
    (emptyKey) => {
      const creds = { ...ALL_CREDS, [emptyKey]: '' };
      expect(isSentrySourceMapUploadEnabled(creds)).toBe(false);
    }
  );

  it('disables upload outside production even with all credentials present (req 6.5)', () => {
    expect(isSentrySourceMapUploadEnabled({ ...ALL_CREDS, mode: 'development' })).toBe(false);
    expect(resolveSourcemapSetting(false)).toBe(false);
  });

  it('exposes the delete glob covering every emitted map under dist/ (req 6.4)', () => {
    expect(SOURCEMAP_DELETE_GLOB).toBe('./dist/**/*.map');
  });
});

describe('source-map guard chain & CI surfacing (req 6.2)', () => {
  it('vite.config.ts uses the gate and deletes emitted maps post-upload (req 6.4)', () => {
    const viteConfig = readFileSync(path.join(webRoot, 'vite.config.ts'), 'utf-8');
    // Gate is single-sourced from the tested module.
    expect(viteConfig).toContain('isSentrySourceMapUploadEnabled');
    // 'hidden' when uploading, false otherwise — neither ships a .map.
    expect(viteConfig).toMatch(/sourcemap:\s*sentryUploadEnabled\s*\?\s*'hidden'\s*:\s*false/);
    // Post-upload deletion keeps dist/ free of .map files.
    expect(viteConfig).toContain("filesToDeleteAfterUpload: ['./dist/**/*.map']");
  });

  it('the build script runs check-dist-sourcemaps after vite build (req 6.2)', () => {
    const pkg = JSON.parse(readFileSync(path.join(webRoot, 'package.json'), 'utf-8')) as {
      scripts: Record<string, string>;
    };
    const build = pkg.scripts.build;
    expect(build).toContain('vite build');
    expect(build).toContain('check-dist-sourcemaps.mjs');
    // The guard must run AFTER the build so it inspects the emitted output.
    expect(build.indexOf('check-dist-sourcemaps.mjs')).toBeGreaterThan(build.indexOf('vite build'));
  });

  it('CI runs the production build so the source-map guard gates the pipeline (req 6.2)', () => {
    const ci = readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf-8');
    expect(ci).toMatch(/npm run build --workspace=@alsaqi\/web/);
  });
});
