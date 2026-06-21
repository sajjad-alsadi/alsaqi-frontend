import type { Plugin } from 'vite';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

/**
 * A precache manifest entry for the service worker.
 * - `url`: The asset URL relative to the origin root.
 * - `revision`: A content hash or build hash for cache-busting.
 *   `null` when the URL already contains a content hash (immutable).
 */
export interface PrecacheEntry {
  url: string;
  revision: string | null;
}

/**
 * Configuration for the precache manifest plugin.
 */
export interface PrecacheManifestConfig {
  /**
   * Chunk name prefixes to include in the precache manifest.
   * These are matched against output chunk names (e.g., 'vendor-react', 'vendor-ui').
   * Defaults to critical-path chunks: vendor-react, vendor-ui, vendor-i18n, and the app entry.
   */
  criticalChunks?: string[];

  /**
   * Whether to include CSS assets in the manifest.
   * Defaults to true.
   */
  includeCss?: boolean;

  /**
   * Font file paths (relative to root) to include in the manifest.
   * These are files in the public/ directory that aren't processed by Vite's pipeline.
   * Defaults to critical Tajawal Arabic fonts.
   */
  fonts?: string[];
}

const DEFAULT_CRITICAL_CHUNKS = ['vendor-react', 'vendor-ui', 'vendor-i18n'];

const DEFAULT_FONTS = [
  '/fonts/tajawal-arabic-400.woff2',
  '/fonts/tajawal-arabic-700.woff2',
  '/fonts/tajawal-arabic-800.woff2',
];

/**
 * Resolves a short build hash from the current git commit or environment.
 * Used as a revision identifier for assets without content-hash filenames.
 */
function getBuildHash(): string {
  const githubSha = process.env['GITHUB_SHA'];
  if (githubSha) {
    return githubSha.slice(0, 8);
  }
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    // Fallback: timestamp-based hash
    return Date.now().toString(36);
  }
}

/**
 * Builds the precache manifest entries from Rollup bundle output.
 * Exported for unit testing.
 *
 * @param outputFiles - Map of fileName → chunk/asset type info
 * @param config - Plugin configuration
 * @param buildHash - Build hash for non-hashed assets
 * @returns Array of PrecacheEntry objects
 */
export function buildManifest(
  outputFiles: Array<{ fileName: string; name?: string; type: 'chunk' | 'asset' }>,
  config: Required<PrecacheManifestConfig>,
  buildHash: string
): PrecacheEntry[] {
  const entries: PrecacheEntry[] = [];

  // 1. index.html — always included, uses build hash as revision
  entries.push({ url: '/index.html', revision: buildHash });

  // 2. Critical-path JS chunks — URL contains content hash, revision is null
  for (const file of outputFiles) {
    if (file.type !== 'chunk') continue;

    const name = file.name || path.basename(file.fileName, path.extname(file.fileName));
    const isCritical = config.criticalChunks.some(
      (prefix) => name === prefix || name.startsWith(prefix)
    );

    // Also include the app entry chunk (typically named "index" by Vite)
    const isEntry = name === 'index' || name === 'app-entry';

    if (isCritical || isEntry) {
      entries.push({
        url: '/' + file.fileName,
        revision: null, // content hash is in the filename
      });
    }
  }

  // 3. CSS assets — content-hashed filenames
  if (config.includeCss) {
    for (const file of outputFiles) {
      if (file.type !== 'asset') continue;
      if (file.fileName.endsWith('.css')) {
        entries.push({
          url: '/' + file.fileName,
          revision: null, // content hash is in the filename
        });
      }
    }
  }

  // 4. Font files — static assets from public/, use build hash as revision
  for (const fontPath of config.fonts) {
    entries.push({
      url: fontPath,
      revision: null, // fonts are static, cache-bust via SW version
    });
  }

  return entries;
}

/**
 * Serializes the manifest entries into a JavaScript variable declaration
 * suitable for injection into sw.js.
 */
export function serializeManifest(entries: PrecacheEntry[]): string {
  const lines = entries.map((entry) => {
    const revision = entry.revision === null ? 'null' : `'${entry.revision}'`;
    return `  { url: '${entry.url}', revision: ${revision} }`;
  });

  return `var PRECACHE_MANIFEST = [\n${lines.join(',\n')}\n];`;
}

/**
 * Vite plugin that generates and injects a precache manifest into the service worker.
 *
 * At build time, this plugin:
 * 1. Collects App Shell asset filenames with content hashes from the Rollup output
 * 2. Builds a precache manifest from critical-path chunks, CSS, and font files
 * 3. Replaces the placeholder `PRECACHE_MANIFEST` in dist/sw.js with the real manifest
 *
 * The service worker (public/sw.js) contains a placeholder `var PRECACHE_MANIFEST = [...]`
 * block. After the build copies it to dist/sw.js, this plugin replaces the entire
 * block with actual hashed filenames.
 *
 * @see Requirements 5.2 — Precache App Shell assets during service worker install phase
 */
export function precacheManifestPlugin(config?: PrecacheManifestConfig): Plugin {
  const resolvedConfig: Required<PrecacheManifestConfig> = {
    criticalChunks: config?.criticalChunks ?? DEFAULT_CRITICAL_CHUNKS,
    includeCss: config?.includeCss ?? true,
    fonts: config?.fonts ?? DEFAULT_FONTS,
  };

  let outDir: string;
  let manifest: PrecacheEntry[] = [];

  return {
    name: 'precache-manifest',
    apply: 'build',
    // Run after other plugins (especially after assets are finalized)
    enforce: 'post',

    configResolved(viteConfig) {
      outDir = viteConfig.build.outDir;
    },

    generateBundle(_options, bundle) {
      // Collect output files information
      const outputFiles: Array<{ fileName: string; name?: string; type: 'chunk' | 'asset' }> = [];

      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type === 'chunk') {
          outputFiles.push({
            fileName,
            name: output.name,
            type: 'chunk',
          });
        } else {
          const assetName = output.names?.[0] ?? output.name;
          outputFiles.push({
            fileName,
            ...(assetName !== undefined ? { name: assetName } : {}),
            type: 'asset',
          });
        }
      }

      const buildHash = getBuildHash();
      manifest = buildManifest(outputFiles, resolvedConfig, buildHash);
    },

    writeBundle() {
      // After the build writes files to dist/, modify sw.js in place
      const swPath = path.resolve(outDir, 'sw.js');

      if (!existsSync(swPath)) {
        this.warn(
          '[precache-manifest] sw.js not found in output directory. ' +
            'Ensure public/sw.js exists so it gets copied to dist/.'
        );
        return;
      }

      let swContent = readFileSync(swPath, 'utf-8');

      // Replace the placeholder PRECACHE_MANIFEST block
      // Match from `var PRECACHE_MANIFEST = [` to the closing `];`
      const manifestRegex = /var PRECACHE_MANIFEST\s*=\s*\[[\s\S]*?\];/;

      if (!manifestRegex.test(swContent)) {
        this.warn(
          '[precache-manifest] Could not find PRECACHE_MANIFEST placeholder in sw.js. ' +
            'The service worker may not precache assets correctly.'
        );
        return;
      }

      const serialized = serializeManifest(manifest);
      swContent = swContent.replace(manifestRegex, serialized);

      writeFileSync(swPath, swContent, 'utf-8');

      // Log the manifest for visibility
      const assetCount = manifest.length;
      const urls = manifest.map((e) => e.url).join(', ');
      console.log(
        `[precache-manifest] Injected ${assetCount} entries into sw.js: ${urls}`
      );
    },
  };
}
