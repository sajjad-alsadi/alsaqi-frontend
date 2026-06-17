import type { Plugin } from 'vite';
import { gzipSync, brotliCompressSync } from 'zlib';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

/**
 * Configuration for the bundle budget enforcement plugin.
 */
export interface BudgetConfig {
  /** Maximum gzip size in bytes for any single chunk. Default: 153600 (150 KB) */
  maxChunkGzip: number;
  /** Maximum gzip size in bytes for combined initial payload. Default: 256000 (250 KB) */
  maxInitialGzip: number;
  /** Chunk names that compose the initial payload (critical path). */
  initialChunks: string[];
  /** When true, budget overages cause build failure. Typically true in CI. */
  failOnOverage: boolean;
}

/**
 * Information about a single output chunk.
 */
export interface ChunkInfo {
  /** Logical chunk name, e.g., 'vendor-react' */
  name: string;
  /** Output filename, e.g., 'vendor-react.a1b2c3d4.js' */
  fileName: string;
  /** Raw (uncompressed) size in bytes */
  rawSize: number;
  /** Gzip-compressed size in bytes */
  gzipSize: number;
  /** Brotli-compressed size in bytes */
  brotliSize: number;
  /** Whether this chunk is part of the critical initial payload */
  isInitial: boolean;
  /** Top-level module identifiers in this chunk */
  modules: string[];
}

/**
 * Machine-readable bundle statistics written to dist/bundle-stats.json.
 */
export interface BundleStats {
  /** ISO 8601 timestamp of when the build occurred */
  buildTime: string;
  /** Git commit hash (from GITHUB_SHA or git rev-parse HEAD) */
  commitHash: string;
  /** Per-chunk size information */
  chunks: ChunkInfo[];
  /** Aggregated totals across all chunks */
  totals: {
    rawSize: number;
    gzipSize: number;
    brotliSize: number;
  };
}

/**
 * Result of a budget check — exported for unit testing.
 */
export interface BudgetCheckResult {
  /** Whether any budget was exceeded */
  exceeded: boolean;
  /** Individual chunk violations */
  chunkViolations: Array<{
    name: string;
    gzipSize: number;
    limit: number;
  }>;
  /** Initial payload violation (if any) */
  initialPayloadViolation: {
    totalGzipSize: number;
    limit: number;
  } | null;
}

/**
 * Pure function that checks chunk sizes against budget thresholds.
 * Exported separately for unit testing without running a build.
 */
export function checkBudget(
  chunks: ChunkInfo[],
  config: Pick<BudgetConfig, 'maxChunkGzip' | 'maxInitialGzip'>
): BudgetCheckResult {
  const chunkViolations: BudgetCheckResult['chunkViolations'] = [];

  for (const chunk of chunks) {
    if (chunk.gzipSize > config.maxChunkGzip) {
      chunkViolations.push({
        name: chunk.name,
        gzipSize: chunk.gzipSize,
        limit: config.maxChunkGzip,
      });
    }
  }

  const initialChunks = chunks.filter((c) => c.isInitial);
  const initialTotalGzip = initialChunks.reduce((sum, c) => sum + c.gzipSize, 0);

  const initialPayloadViolation =
    initialTotalGzip > config.maxInitialGzip
      ? { totalGzipSize: initialTotalGzip, limit: config.maxInitialGzip }
      : null;

  return {
    exceeded: chunkViolations.length > 0 || initialPayloadViolation !== null,
    chunkViolations,
    initialPayloadViolation,
  };
}

/**
 * Resolves the current git commit hash.
 * Checks GITHUB_SHA env var first, then falls back to `git rev-parse HEAD`.
 */
function getCommitHash(): string {
  const githubSha = process.env['GITHUB_SHA'];
  if (githubSha) {
    return githubSha;
  }
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Vite plugin that enforces bundle size budgets post-build.
 *
 * - Iterates output chunks and computes gzip/brotli sizes
 * - Compares against configured thresholds
 * - Writes dist/bundle-stats.json for CI comparison
 * - Emits warnings (local) or errors (CI) on budget overages
 */
export function bundleBudgetPlugin(config: BudgetConfig): Plugin {
  let outDir: string;

  return {
    name: 'bundle-budget',
    apply: 'build',

    configResolved(resolvedConfig) {
      outDir = resolvedConfig.build.outDir;
    },

    generateBundle(_options, bundle) {
      const chunks: ChunkInfo[] = [];

      for (const [fileName, output] of Object.entries(bundle)) {
        // Only process JS chunks (not assets like CSS, images, etc.)
        if (output.type !== 'chunk') continue;

        const code = output.code;
        const rawSize = Buffer.byteLength(code, 'utf-8');
        const gzipSize = gzipSync(Buffer.from(code, 'utf-8')).length;
        const brotliSize = brotliCompressSync(Buffer.from(code, 'utf-8')).length;

        // Determine logical chunk name
        const name = output.name || path.basename(fileName, path.extname(fileName));

        // Check if this chunk is part of the initial payload
        const isInitial = config.initialChunks.some(
          (initialName) => name === initialName || fileName.startsWith(initialName)
        );

        // Extract top-level module identifiers (package names from node_modules)
        const modules = Object.keys(output.modules)
          .filter((m) => m.includes('node_modules'))
          .map((m) => {
            const parts = m.split('node_modules/');
            const pkg = parts[parts.length - 1];
            if (!pkg) return undefined;
            // Handle scoped packages (@org/pkg)
            if (pkg.startsWith('@')) {
              const segments = pkg.split('/');
              return segments[0] && segments[1] ? `${segments[0]}/${segments[1]}` : segments[0];
            }
            return pkg.split('/')[0];
          })
          .filter((value): value is string => value !== undefined)
          .filter((value, index, self) => self.indexOf(value) === index); // deduplicate

        chunks.push({
          name,
          fileName,
          rawSize,
          gzipSize,
          brotliSize,
          isInitial,
          modules,
        });
      }

      // Compute totals
      const totals = chunks.reduce(
        (acc, chunk) => ({
          rawSize: acc.rawSize + chunk.rawSize,
          gzipSize: acc.gzipSize + chunk.gzipSize,
          brotliSize: acc.brotliSize + chunk.brotliSize,
        }),
        { rawSize: 0, gzipSize: 0, brotliSize: 0 }
      );

      // Build the stats object
      const stats: BundleStats = {
        buildTime: new Date().toISOString(),
        commitHash: getCommitHash(),
        chunks,
        totals,
      };

      // Write bundle-stats.json
      const distDir = path.resolve(outDir);
      if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
      }
      writeFileSync(
        path.join(distDir, 'bundle-stats.json'),
        JSON.stringify(stats, null, 2),
        'utf-8'
      );

      // Check budgets
      const result = checkBudget(chunks, config);

      if (result.exceeded) {
        const messages: string[] = [];

        for (const violation of result.chunkViolations) {
          messages.push(
            `[bundle-budget] Chunk "${violation.name}" is ${formatSize(violation.gzipSize)} gzip ` +
              `(limit: ${formatSize(violation.limit)}). Overage: +${formatSize(violation.gzipSize - violation.limit)}`
          );
        }

        if (result.initialPayloadViolation) {
          messages.push(
            `[bundle-budget] Initial payload is ${formatSize(result.initialPayloadViolation.totalGzipSize)} gzip ` +
              `(limit: ${formatSize(result.initialPayloadViolation.limit)}). ` +
              `Overage: +${formatSize(result.initialPayloadViolation.totalGzipSize - result.initialPayloadViolation.limit)}`
          );
        }

        const fullMessage = messages.join('\n');

        if (config.failOnOverage) {
          this.error(fullMessage);
        } else {
          this.warn(fullMessage);
        }
      }
    },
  };
}

/**
 * Formats bytes into a human-readable KB string.
 */
function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
