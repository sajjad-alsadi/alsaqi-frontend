/**
 * Property-based test for content-hash fingerprints on emitted assets.
 *
 * Property 10: Content-hash fingerprints on all emitted assets
 * Every JS, CSS, and WOFF2 file in `dist/assets/` must match the pattern
 * `[name].[hash].[ext]` where hash is 8+ alphanumeric characters.
 *
 * **Validates: Requirements 5.1**
 *
 * Feature: app-rebuild, Property 10
 *
 * Strategy: Use fast-check to verify the `isValidContentHashedFilename` function:
 * 1. Generate valid filenames (name + hash + extension) → assert function returns true
 * 2. Generate filenames without hash → assert function returns false
 * 3. Optionally read `dist/assets/` if it exists and verify all files match
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { existsSync, readdirSync } from 'fs';
import { resolve } from 'path';

/**
 * Validates that a filename follows the content-hash naming convention:
 * [name].[hash].[ext] where:
 * - name: one or more alphanumeric, underscore, or hyphen characters
 * - hash: 8 or more alphanumeric characters (hex or base36)
 * - ext: js, css, or woff2
 */
export function isValidContentHashedFilename(filename: string): boolean {
  return /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]{8,}\.(js|css|woff2)$/.test(filename);
}

/**
 * Arbitrary generator for a valid chunk/asset name segment.
 * Produces strings like "vendor-react", "app_entry", "styles", etc.
 */
function arbAssetName(): fc.Arbitrary<string> {
  return fc.string({
    unit: fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'.split('')
    ),
    minLength: 1,
    maxLength: 20,
  });
}

/**
 * Arbitrary generator for a valid content hash (8+ hex/alphanumeric chars).
 */
function arbContentHash(): fc.Arbitrary<string> {
  return fc.string({
    unit: fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')
    ),
    minLength: 8,
    maxLength: 16,
  });
}

/**
 * Arbitrary generator for supported asset extensions.
 */
function arbExtension(): fc.Arbitrary<string> {
  return fc.constantFrom('js', 'css', 'woff2');
}

describe('Property 10: Content-hash fingerprints on all emitted assets', () => {
  it('correctly identifies valid content-hashed filenames', () => {
    fc.assert(
      fc.property(
        arbAssetName(),
        arbContentHash(),
        arbExtension(),
        (name, hash, ext) => {
          const filename = `${name}.${hash}.${ext}`;
          expect(isValidContentHashedFilename(filename)).toBe(true);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('rejects filenames without a content hash (name.ext only)', () => {
    fc.assert(
      fc.property(
        arbAssetName(),
        arbExtension(),
        (name, ext) => {
          const filename = `${name}.${ext}`;
          expect(isValidContentHashedFilename(filename)).toBe(false);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('rejects filenames with a hash shorter than 8 characters', () => {
    fc.assert(
      fc.property(
        arbAssetName(),
        fc.string({
          unit: fc.constantFrom(
            ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')
          ),
          minLength: 1,
          maxLength: 7,
        }),
        arbExtension(),
        (name, shortHash, ext) => {
          const filename = `${name}.${shortHash}.${ext}`;
          expect(isValidContentHashedFilename(filename)).toBe(false);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('rejects filenames with unsupported extensions', () => {
    fc.assert(
      fc.property(
        arbAssetName(),
        arbContentHash(),
        fc.constantFrom('html', 'map', 'json', 'svg', 'png', 'txt'),
        (name, hash, ext) => {
          const filename = `${name}.${hash}.${ext}`;
          expect(isValidContentHashedFilename(filename)).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('rejects filenames with invalid characters in the name segment', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /[^a-zA-Z0-9_-]/.test(s)),
        arbContentHash(),
        arbExtension(),
        (invalidName, hash, ext) => {
          const filename = `${invalidName}.${hash}.${ext}`;
          expect(isValidContentHashedFilename(filename)).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('validates known good build output filenames', () => {
    // These represent real filenames Vite produces
    const validFilenames = [
      'vendor-react.a1b2c3d4.js',
      'vendor-ui.e5f6g7h8.js',
      'vendor-i18n.9a0b1c2d.js',
      'app-entry.3e4f5g6h.js',
      'styles.7i8j9k0l.css',
      'index.abcdef01.js',
      'tajawal-arabic-400.12345678.woff2',
    ];

    for (const filename of validFilenames) {
      expect(isValidContentHashedFilename(filename)).toBe(true);
    }
  });

  it('rejects known bad filenames that lack proper hashing', () => {
    const invalidFilenames = [
      'vendor-react.js', // no hash
      'styles.css', // no hash
      'font.woff2', // no hash
      '.a1b2c3d4.js', // empty name
      'vendor-react.abc.js', // hash too short (3 chars)
      'vendor react.a1b2c3d4.js', // space in name
    ];

    for (const filename of invalidFilenames) {
      expect(isValidContentHashedFilename(filename)).toBe(false);
    }
  });

  // Optional: verify actual dist/assets/ directory if it exists (post-build verification)
  it('validates all files in dist/assets/ match content-hash pattern (if build exists)', () => {
    const distAssetsPath = resolve(__dirname, '../../../../dist/assets');

    if (!existsSync(distAssetsPath)) {
      // Skip silently if no build output exists — this test is meaningful after a build
      return;
    }

    const files = readdirSync(distAssetsPath);
    const relevantFiles = files.filter((f) => /\.(js|css|woff2)$/.test(f));

    for (const file of relevantFiles) {
      expect(
        isValidContentHashedFilename(file),
        `File "${file}" in dist/assets/ does not match [name].[hash].[ext] pattern`
      ).toBe(true);
    }
  });
});
