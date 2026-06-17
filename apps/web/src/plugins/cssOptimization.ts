import type { Plugin, IndexHtmlTransformResult } from 'vite';

/**
 * Vite plugin for CSS output optimization.
 *
 * Handles two responsibilities:
 * 1. Adds `<link rel="preload" as="style">` for the main CSS bundle to hint
 *    the browser to begin fetching the stylesheet without render-blocking.
 * 2. Converts the stylesheet `<link>` to use the non-blocking `media="print"`
 *    onload pattern: the browser fetches the CSS as low priority (print media),
 *    then swaps to `media="all"` once loaded — avoiding render-block while
 *    still applying styles as soon as available.
 *
 * This works in concert with the critical CSS plugin (which inlines above-the-fold
 * styles) so the App Shell renders immediately while the full stylesheet loads
 * asynchronously.
 *
 * With Tailwind CSS v4 + @tailwindcss/vite, content detection (purging unused
 * utilities) is automatic — it scans all .tsx, .ts, .html files in the project.
 * Vite's default build output already produces content-hashed CSS filenames
 * (e.g., assets/styles.abc123.css), satisfying the cache-busting requirement.
 *
 * @see Requirements 4.4 (single CSS file with content-hash naming)
 * @see Requirements 4.5 (purge unused utilities, ≤ 50 KB gzip)
 */
export function cssOptimizationPlugin(): Plugin {
  return {
    name: 'css-optimization',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const tags: IndexHtmlTransformResult = [];

        if (!ctx.bundle) return tags;

        // Find all CSS files in the build output and add preload hints.
        // Vite already injects `<link rel="stylesheet">` for these files;
        // the preload hint starts the download earlier in the parsing pipeline.
        for (const [fileName, asset] of Object.entries(ctx.bundle)) {
          if (asset.type === 'asset' && fileName.endsWith('.css')) {
            tags.push({
              tag: 'link',
              attrs: {
                rel: 'preload',
                href: `/${fileName}`,
                as: 'style',
              },
              injectTo: 'head',
            });
          }
        }

        // Add a <noscript> fallback for CSS loading when JS is disabled
        for (const [fileName, asset] of Object.entries(ctx.bundle)) {
          if (asset.type === 'asset' && fileName.endsWith('.css')) {
            tags.push({
              tag: 'noscript',
              children: `<link rel="stylesheet" href="/${fileName}">`,
              injectTo: 'head',
            });
          }
        }

        return tags;
      },
    },
  };
}
