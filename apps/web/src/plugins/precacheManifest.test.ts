import { describe, it, expect } from 'vitest';
import { buildManifest, serializeManifest, type PrecacheEntry } from './precacheManifest';

describe('precacheManifest plugin', () => {
  const defaultConfig = {
    criticalChunks: ['vendor-react', 'vendor-ui', 'vendor-i18n'],
    includeCss: true,
    fonts: [
      '/fonts/tajawal-arabic-400.woff2',
      '/fonts/tajawal-arabic-700.woff2',
      '/fonts/tajawal-arabic-800.woff2',
    ],
  };

  describe('buildManifest', () => {
    it('includes index.html with build hash as revision', () => {
      const manifest = buildManifest([], defaultConfig, 'abc12345');
      const indexEntry = manifest.find((e) => e.url === '/index.html');
      expect(indexEntry).toBeDefined();
      expect(indexEntry!.revision).toBe('abc12345');
    });

    it('includes critical-path JS chunks with null revision', () => {
      const outputFiles = [
        { fileName: 'assets/vendor-react.a1b2c3d4.js', name: 'vendor-react', type: 'chunk' as const },
        { fileName: 'assets/vendor-ui.e5f6g7h8.js', name: 'vendor-ui', type: 'chunk' as const },
        { fileName: 'assets/vendor-i18n.i9j0k1l2.js', name: 'vendor-i18n', type: 'chunk' as const },
        { fileName: 'assets/vendor-charts.m3n4o5p6.js', name: 'vendor-charts', type: 'chunk' as const },
      ];

      const manifest = buildManifest(outputFiles, defaultConfig, 'abc12345');

      expect(manifest).toContainEqual({ url: '/assets/vendor-react.a1b2c3d4.js', revision: null });
      expect(manifest).toContainEqual({ url: '/assets/vendor-ui.e5f6g7h8.js', revision: null });
      expect(manifest).toContainEqual({ url: '/assets/vendor-i18n.i9j0k1l2.js', revision: null });
      // Non-critical chunks should not be included
      expect(manifest.find((e) => e.url.includes('vendor-charts'))).toBeUndefined();
    });

    it('includes the app entry chunk (named "index")', () => {
      const outputFiles = [
        { fileName: 'assets/index.q7r8s9t0.js', name: 'index', type: 'chunk' as const },
      ];

      const manifest = buildManifest(outputFiles, defaultConfig, 'abc12345');
      expect(manifest).toContainEqual({ url: '/assets/index.q7r8s9t0.js', revision: null });
    });

    it('includes CSS assets with null revision when includeCss is true', () => {
      const outputFiles = [
        { fileName: 'assets/styles.u1v2w3x4.css', name: 'styles', type: 'asset' as const },
      ];

      const manifest = buildManifest(outputFiles, defaultConfig, 'abc12345');
      expect(manifest).toContainEqual({ url: '/assets/styles.u1v2w3x4.css', revision: null });
    });

    it('excludes CSS assets when includeCss is false', () => {
      const outputFiles = [
        { fileName: 'assets/styles.u1v2w3x4.css', name: 'styles', type: 'asset' as const },
      ];

      const config = { ...defaultConfig, includeCss: false };
      const manifest = buildManifest(outputFiles, config, 'abc12345');
      expect(manifest.find((e) => e.url.includes('.css'))).toBeUndefined();
    });

    it('includes configured font files with null revision', () => {
      const manifest = buildManifest([], defaultConfig, 'abc12345');

      expect(manifest).toContainEqual({ url: '/fonts/tajawal-arabic-400.woff2', revision: null });
      expect(manifest).toContainEqual({ url: '/fonts/tajawal-arabic-700.woff2', revision: null });
      expect(manifest).toContainEqual({ url: '/fonts/tajawal-arabic-800.woff2', revision: null });
    });

    it('excludes non-critical Tier 2 and Tier 3 chunks', () => {
      const outputFiles = [
        { fileName: 'assets/vendor-react.abc.js', name: 'vendor-react', type: 'chunk' as const },
        { fileName: 'assets/vendor-query.def.js', name: 'vendor-query', type: 'chunk' as const },
        { fileName: 'assets/vendor-forms.ghi.js', name: 'vendor-forms', type: 'chunk' as const },
        { fileName: 'assets/vendor-motion.jkl.js', name: 'vendor-motion', type: 'chunk' as const },
        { fileName: 'assets/vendor-pdf.mno.js', name: 'vendor-pdf', type: 'chunk' as const },
      ];

      const manifest = buildManifest(outputFiles, defaultConfig, 'abc12345');

      // Only vendor-react should be included
      const jsEntries = manifest.filter((e) => e.url.endsWith('.js'));
      expect(jsEntries).toHaveLength(1);
      expect(jsEntries[0]!.url).toContain('vendor-react');
    });

    it('handles empty output gracefully', () => {
      const manifest = buildManifest([], defaultConfig, 'abc12345');

      // Should still have index.html + 3 fonts = 4 entries
      expect(manifest).toHaveLength(4);
      expect(manifest[0]).toEqual({ url: '/index.html', revision: 'abc12345' });
    });
  });

  describe('serializeManifest', () => {
    it('produces valid JavaScript variable declaration', () => {
      const entries: PrecacheEntry[] = [
        { url: '/index.html', revision: 'abc12345' },
        { url: '/assets/vendor-react.a1b2c3d4.js', revision: null },
        { url: '/fonts/tajawal-arabic-400.woff2', revision: null },
      ];

      const result = serializeManifest(entries);

      expect(result).toContain('var PRECACHE_MANIFEST = [');
      expect(result).toContain("{ url: '/index.html', revision: 'abc12345' }");
      expect(result).toContain("{ url: '/assets/vendor-react.a1b2c3d4.js', revision: null }");
      expect(result).toContain("{ url: '/fonts/tajawal-arabic-400.woff2', revision: null }");
      expect(result.endsWith('];')).toBe(true);
    });

    it('handles empty manifest', () => {
      const result = serializeManifest([]);
      expect(result).toBe('var PRECACHE_MANIFEST = [\n\n];');
    });

    it('formats entries as comma-separated lines', () => {
      const entries: PrecacheEntry[] = [
        { url: '/a.js', revision: null },
        { url: '/b.js', revision: null },
      ];

      const result = serializeManifest(entries);
      const lines = result.split('\n');

      // First line: var declaration
      expect(lines[0]).toBe('var PRECACHE_MANIFEST = [');
      // Middle lines: entries with commas
      expect(lines[1]).toContain("{ url: '/a.js', revision: null }");
      // Last line: closing bracket
      expect(lines[lines.length - 1]).toBe('];');
    });
  });
});
