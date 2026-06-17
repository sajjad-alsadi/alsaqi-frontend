import { describe, it, expect } from 'vitest';
import { modulePreloadPlugin } from './modulePreload';
import type { OutputBundle, OutputChunk, OutputAsset } from 'rollup';

describe('modulePreloadPlugin', () => {
  const plugin = modulePreloadPlugin();

  it('returns a plugin with name "module-preload-hints"', () => {
    expect(plugin.name).toBe('module-preload-hints');
  });

  it('applies only to build', () => {
    expect(plugin.apply).toBe('build');
  });

  it('uses enforce: "post"', () => {
    expect(plugin.enforce).toBe('post');
  });

  describe('transformIndexHtml', () => {
    // Extract the handler from the plugin's transformIndexHtml config
    function getHandler() {
      const transform = plugin.transformIndexHtml as {
        order: string;
        handler: (html: string, ctx: { bundle?: OutputBundle }) => Array<{
          tag: string;
          attrs: Record<string, string>;
          injectTo: string;
        }>;
      };
      return transform.handler;
    }

    function makeChunk(overrides: Partial<OutputChunk> = {}): OutputChunk {
      return {
        type: 'chunk',
        name: 'index',
        fileName: 'assets/index.abc123.js',
        code: '',
        isEntry: false,
        isDynamicEntry: false,
        facadeModuleId: null,
        imports: [],
        dynamicImports: [],
        modules: {},
        exports: [],
        moduleIds: [],
        map: null,
        sourcemapFileName: null,
        preliminaryFileName: 'assets/index.abc123.js',
        ...overrides,
      };
    }

    function makeAsset(overrides: Partial<OutputAsset> = {}): OutputAsset {
      return {
        type: 'asset',
        name: 'style.css',
        fileName: 'assets/style.abc123.css',
        source: '',
        needsCodeReference: false,
        names: [],
        originalFileNames: [],
        ...overrides,
      };
    }

    it('returns empty tags when no bundle is available', () => {
      const handler = getHandler();
      const result = handler('<html></html>', {});
      expect(result).toEqual([]);
    });

    it('emits modulepreload for vendor-react chunk', () => {
      const handler = getHandler();
      const bundle: OutputBundle = {
        'assets/vendor-react.abc123.js': makeChunk({
          name: 'vendor-react',
          fileName: 'assets/vendor-react.abc123.js',
        }),
      };

      const result = handler('<html></html>', { bundle });
      expect(result).toContainEqual({
        tag: 'link',
        attrs: { rel: 'modulepreload', href: '/assets/vendor-react.abc123.js' },
        injectTo: 'head',
      });
    });

    it('emits modulepreload for vendor-ui chunk', () => {
      const handler = getHandler();
      const bundle: OutputBundle = {
        'assets/vendor-ui.def456.js': makeChunk({
          name: 'vendor-ui',
          fileName: 'assets/vendor-ui.def456.js',
        }),
      };

      const result = handler('<html></html>', { bundle });
      expect(result).toContainEqual({
        tag: 'link',
        attrs: { rel: 'modulepreload', href: '/assets/vendor-ui.def456.js' },
        injectTo: 'head',
      });
    });

    it('emits modulepreload for vendor-i18n chunk', () => {
      const handler = getHandler();
      const bundle: OutputBundle = {
        'assets/vendor-i18n.ghi789.js': makeChunk({
          name: 'vendor-i18n',
          fileName: 'assets/vendor-i18n.ghi789.js',
        }),
      };

      const result = handler('<html></html>', { bundle });
      expect(result).toContainEqual({
        tag: 'link',
        attrs: { rel: 'modulepreload', href: '/assets/vendor-i18n.ghi789.js' },
        injectTo: 'head',
      });
    });

    it('emits modulepreload for entry chunks (app entry)', () => {
      const handler = getHandler();
      const bundle: OutputBundle = {
        'assets/index.xyz000.js': makeChunk({
          name: 'index',
          fileName: 'assets/index.xyz000.js',
          isEntry: true,
        }),
      };

      const result = handler('<html></html>', { bundle });
      expect(result).toContainEqual({
        tag: 'link',
        attrs: { rel: 'modulepreload', href: '/assets/index.xyz000.js' },
        injectTo: 'head',
      });
    });

    it('does NOT emit modulepreload for non-critical vendor chunks', () => {
      const handler = getHandler();
      const bundle: OutputBundle = {
        'assets/vendor-charts.aaa111.js': makeChunk({
          name: 'vendor-charts',
          fileName: 'assets/vendor-charts.aaa111.js',
        }),
        'assets/vendor-pdf.bbb222.js': makeChunk({
          name: 'vendor-pdf',
          fileName: 'assets/vendor-pdf.bbb222.js',
        }),
        'assets/vendor-motion.ccc333.js': makeChunk({
          name: 'vendor-motion',
          fileName: 'assets/vendor-motion.ccc333.js',
        }),
      };

      const result = handler('<html></html>', { bundle });
      expect(result).toEqual([]);
    });

    it('does NOT emit modulepreload for asset bundles (CSS, etc.)', () => {
      const handler = getHandler();
      const bundle: OutputBundle = {
        'assets/style.abc123.css': makeAsset({
          name: 'style.css',
          fileName: 'assets/style.abc123.css',
        }),
      };

      const result = handler('<html></html>', { bundle });
      expect(result).toEqual([]);
    });

    it('emits all critical chunks from a full bundle', () => {
      const handler = getHandler();
      const bundle: OutputBundle = {
        'assets/vendor-react.aaa.js': makeChunk({
          name: 'vendor-react',
          fileName: 'assets/vendor-react.aaa.js',
        }),
        'assets/vendor-ui.bbb.js': makeChunk({
          name: 'vendor-ui',
          fileName: 'assets/vendor-ui.bbb.js',
        }),
        'assets/vendor-i18n.ccc.js': makeChunk({
          name: 'vendor-i18n',
          fileName: 'assets/vendor-i18n.ccc.js',
        }),
        'assets/index.ddd.js': makeChunk({
          name: 'index',
          fileName: 'assets/index.ddd.js',
          isEntry: true,
        }),
        'assets/vendor-charts.eee.js': makeChunk({
          name: 'vendor-charts',
          fileName: 'assets/vendor-charts.eee.js',
        }),
        'assets/style.fff.css': makeAsset({
          fileName: 'assets/style.fff.css',
        }),
      };

      const result = handler('<html></html>', { bundle });
      expect(result).toHaveLength(4);
      expect(result.map((t) => t.attrs.href)).toContain('/assets/vendor-react.aaa.js');
      expect(result.map((t) => t.attrs.href)).toContain('/assets/vendor-ui.bbb.js');
      expect(result.map((t) => t.attrs.href)).toContain('/assets/vendor-i18n.ccc.js');
      expect(result.map((t) => t.attrs.href)).toContain('/assets/index.ddd.js');
    });

    it('uses order: "post" for the transformIndexHtml hook', () => {
      const transform = plugin.transformIndexHtml as { order: string };
      expect(transform.order).toBe('post');
    });
  });
});
