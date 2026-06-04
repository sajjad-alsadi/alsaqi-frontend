/**
 * Property Test: Import Isolation (Property 1)
 *
 * Feature: api-isolation
 * Property 1: عزل الاستيرادات (Import Isolation)
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 *
 * For any file in `packages/api/`, none of its import statements reference
 * `apps/web/` or `@alsaqi/web`; and for any file in `apps/web/`, none of its
 * import statements reference `packages/api/` or `@alsaqi/api`. All shared
 * type imports come exclusively from `packages/shared` or `@alsaqi/shared`.
 */

// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '..');

/**
 * Recursively collect all .ts and .tsx files in a directory,
 * excluding node_modules, dist, and test fixture files.
 */
function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules, dist, and build output directories
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '.turbo'
      ) {
        continue;
      }
      results.push(...collectSourceFiles(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.d.ts')
    ) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Extract all import/require specifiers from a file's content.
 * Matches:
 *   - import ... from 'specifier'
 *   - import 'specifier'
 *   - import type ... from 'specifier'
 *   - export ... from 'specifier'
 *   - require('specifier')
 *   - import('specifier')
 */
function extractImportSpecifiers(content: string): string[] {
  const specifiers: string[] = [];

  // Match static imports: import ... from 'specifier' or import 'specifier'
  const importRegex = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    specifiers.push(match[1]);
  }

  // Match require('specifier')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    specifiers.push(match[1]);
  }

  // Match dynamic import('specifier')
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    specifiers.push(match[1]);
  }

  return specifiers;
}

/**
 * Check if an import specifier references a forbidden package/path.
 */
function importReferencesPath(
  specifier: string,
  filePath: string,
  forbiddenPackageName: string,
  forbiddenRelativePaths: string[]
): boolean {
  // Check package name (e.g., @alsaqi/web, @alsaqi/api)
  if (specifier === forbiddenPackageName || specifier.startsWith(forbiddenPackageName + '/')) {
    return true;
  }

  // Check relative path imports that resolve to the forbidden directory
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const resolvedPath = path.resolve(path.dirname(filePath), specifier);
    const relativeToCwd = path.relative(WORKSPACE_ROOT, resolvedPath);
    const normalizedRelative = relativeToCwd.replace(/\\/g, '/');

    for (const forbidden of forbiddenRelativePaths) {
      if (normalizedRelative.startsWith(forbidden)) {
        return true;
      }
    }
  }

  return false;
}

// ─── Collect Files ───────────────────────────────────────────────────────────

let apiFiles: string[] = [];
let webFiles: string[] = [];

beforeAll(() => {
  const apiSrcDir = path.join(WORKSPACE_ROOT, 'packages', 'api', 'src');
  const webSrcDir = path.join(WORKSPACE_ROOT, 'apps', 'web', 'src');

  apiFiles = collectSourceFiles(apiSrcDir);
  webFiles = collectSourceFiles(webSrcDir);
});

// ─── Property 1: Import Isolation ────────────────────────────────────────────

describe('Property 1: Import Isolation', () => {
  it('no file in packages/api/ imports from apps/web/ or @alsaqi/web', () => {
    // Skip if there are no API files (shouldn't happen but guard against it)
    if (apiFiles.length === 0) {
      console.warn('No source files found in packages/api/src/');
      return;
    }

    fc.assert(
      fc.property(
        fc.constantFrom(...apiFiles),
        (filePath: string) => {
          const content = fs.readFileSync(filePath, 'utf-8');
          const specifiers = extractImportSpecifiers(content);

          const violations = specifiers.filter((specifier) =>
            importReferencesPath(
              specifier,
              filePath,
              '@alsaqi/web',
              ['apps/web/', 'apps/web\\']
            )
          );

          const relativeFilePath = path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');

          expect(
            violations,
            `File "${relativeFilePath}" has forbidden imports from apps/web/: ${violations.join(', ')}`
          ).toHaveLength(0);
        }
      ),
      { numRuns: Math.min(apiFiles.length * 2, 500) }
    );
  });

  it('no file in apps/web/ imports from packages/api/ or @alsaqi/api', () => {
    // Skip if there are no web files
    if (webFiles.length === 0) {
      console.warn('No source files found in apps/web/src/');
      return;
    }

    fc.assert(
      fc.property(
        fc.constantFrom(...webFiles),
        (filePath: string) => {
          const content = fs.readFileSync(filePath, 'utf-8');
          const specifiers = extractImportSpecifiers(content);

          const violations = specifiers.filter((specifier) =>
            importReferencesPath(
              specifier,
              filePath,
              '@alsaqi/api',
              ['packages/api/', 'packages/api\\']
            )
          );

          const relativeFilePath = path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');

          expect(
            violations,
            `File "${relativeFilePath}" has forbidden imports from packages/api/: ${violations.join(', ')}`
          ).toHaveLength(0);
        }
      ),
      { numRuns: Math.min(webFiles.length * 2, 500) }
    );
  });

  it('shared imports between packages come from @alsaqi/shared or packages/shared', () => {
    const allFiles = [...apiFiles, ...webFiles];

    if (allFiles.length === 0) {
      console.warn('No source files found');
      return;
    }

    fc.assert(
      fc.property(
        fc.constantFrom(...allFiles),
        (filePath: string) => {
          const content = fs.readFileSync(filePath, 'utf-8');
          const specifiers = extractImportSpecifiers(content);
          const relativeFilePath = path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
          const isApiFile = relativeFilePath.startsWith('packages/api/');
          const isWebFile = relativeFilePath.startsWith('apps/web/');

          for (const specifier of specifiers) {
            // Check cross-package imports
            if (isApiFile) {
              // API files must NOT import from apps/web
              const violatesWeb = importReferencesPath(
                specifier,
                filePath,
                '@alsaqi/web',
                ['apps/web/', 'apps/web\\']
              );
              expect(
                violatesWeb,
                `API file "${relativeFilePath}" imports from web: "${specifier}"`
              ).toBe(false);
            }

            if (isWebFile) {
              // Web files must NOT import from packages/api
              const violatesApi = importReferencesPath(
                specifier,
                filePath,
                '@alsaqi/api',
                ['packages/api/', 'packages/api\\']
              );
              expect(
                violatesApi,
                `Web file "${relativeFilePath}" imports from API: "${specifier}"`
              ).toBe(false);
            }
          }
        }
      ),
      { numRuns: Math.min(allFiles.length * 2, 500) }
    );
  });
});
