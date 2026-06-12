/**
 * Smoke checks for build configuration safety (Area A).
 *
 * These tests read the on-disk build configuration files and assert that the
 * dependency specifiers in package.json are pinned (no caret/tilde ranges and
 * no wildcard for the workspace package) and that the Vite production build
 * disables source maps by default.
 *
 * Validates: Requirements 1.2, 1.6
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/web root is two levels up from src/__tests__/
const webRoot = path.resolve(__dirname, '..', '..');

function readWebFile(relativePath: string): string {
  return readFileSync(path.join(webRoot, relativePath), 'utf-8');
}

describe('package.json dependency pinning (Requirement 1.2, 1.1, 1.3)', () => {
  const pkg = JSON.parse(readWebFile('package.json')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  // Matches an exact semver version like "1.2.3" (optionally with a prerelease
  // / build suffix) — i.e. no leading range operator such as ^, ~, >=, etc.
  const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:[-+].*)?$/;

  it.each([
    'react',
    'react-dom',
    'react-router-dom',
    '@tanstack/react-query',
    'axios',
    'zod',
  ])('pins runtime dependency "%s" to an exact version (no caret range)', (dep) => {
    const spec = pkg.dependencies[dep];
    expect(spec, `${dep} must be present in dependencies`).toBeDefined();
    expect(spec.startsWith('^'), `${dep} must not use a caret (^) range`).toBe(false);
    expect(spec, `${dep} must be an exact semver version`).toMatch(EXACT_SEMVER);
  });

  it('pins "typescript" devDependency to an exact version (no tilde range)', () => {
    const spec = pkg.devDependencies.typescript;
    expect(spec, 'typescript must be present in devDependencies').toBeDefined();
    expect(spec.startsWith('~'), 'typescript must not use a tilde (~) range').toBe(false);
    expect(spec).toMatch(EXACT_SEMVER);
  });

  it('constrains the "@alsaqi/shared" workspace dependency (not the wildcard "*")', () => {
    const spec = pkg.dependencies['@alsaqi/shared'];
    expect(spec, '@alsaqi/shared must be present in dependencies').toBeDefined();
    expect(spec, '@alsaqi/shared must not be the wildcard "*"').not.toBe('*');
    // Accept either an explicit semver or the workspace protocol.
    const isConstrained = EXACT_SEMVER.test(spec) || spec.startsWith('workspace:');
    expect(isConstrained, `@alsaqi/shared specifier "${spec}" must be constrained`).toBe(true);
  });
});

describe('vite.config.ts production source maps (Requirement 1.6)', () => {
  const viteConfig = readWebFile('vite.config.ts');

  it('disables production source maps by default (sourcemap false fallback)', () => {
    // The config sets `sourcemap: sentryUploadEnabled ? 'hidden' : false`, so the
    // default (non-Sentry) production build must fall back to `false`.
    const sourcemapSetting = viteConfig.match(/sourcemap:\s*([^\n,]+)/);
    expect(sourcemapSetting, 'a sourcemap setting must exist in vite.config.ts').not.toBeNull();

    const value = sourcemapSetting![1].trim();
    // The default/false case must be present in the sourcemap expression.
    expect(value.includes('false'), `sourcemap setting "${value}" must default to false`).toBe(true);
    // Guard against an unconditional `sourcemap: true`.
    expect(value).not.toBe('true');
  });
});
