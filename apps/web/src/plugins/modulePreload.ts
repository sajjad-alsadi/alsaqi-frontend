import type { Plugin, IndexHtmlTransformResult } from 'vite';

/**
 * Vite plugin that emits `<link rel="modulepreload">` hints for critical-path
 * chunks at build time. This allows the browser to begin fetching vendor-react,
 * vendor-ui, vendor-i18n, and the main app entry in parallel with parsing the
 * HTML document, reducing time to interactive.
 *
 * Uses `transformIndexHtml` with `order: 'post'` so it runs after the build
 * has resolved chunk filenames (including content hashes).
 *
 * @see Requirements 2.2, 2.3
 */

/** Chunk name patterns to match for modulepreload hints */
const CRITICAL_CHUNKS = ['vendor-react', 'vendor-ui', 'vendor-i18n'];

export function modulePreloadPlugin(): Plugin {
  return {
    name: 'module-preload-hints',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const tags: IndexHtmlTransformResult = [];

        if (!ctx.bundle) return tags;

        for (const [fileName, chunk] of Object.entries(ctx.bundle)) {
          if (chunk.type !== 'chunk') continue;

          const isCriticalVendor = CRITICAL_CHUNKS.some(
            (name) => chunk.name === name || fileName.includes(name)
          );
          const isEntry = chunk.isEntry;

          if (isCriticalVendor || isEntry) {
            tags.push({
              tag: 'link',
              attrs: {
                rel: 'modulepreload',
                href: `/${fileName}`,
              },
              injectTo: 'head',
            });
          }
        }

        return tags;
      },
    },
  };
}
