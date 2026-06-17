import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { envValidatorPlugin } from './src/plugins/envValidator';
import { modulePreloadPlugin } from './src/plugins/modulePreload';
import { criticalCssPlugin } from './src/plugins/criticalCss';
import { bundleBudgetPlugin } from './src/plugins/bundleBudget';
import { cssOptimizationPlugin } from './src/plugins/cssOptimization';
import { precacheManifestPlugin } from './src/plugins/precacheManifest';
import { isSentrySourceMapUploadEnabled } from './src/build/sourcemap-release';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const analyze = process.env.ANALYZE === 'true';

  // Sentry source map upload is enabled only for production builds that supply
  // an auth token + org + project (typically CI). Local/dev builds without
  // these credentials skip the plugin entirely so the build never fails.
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
  const sentryOrg = process.env.SENTRY_ORG;
  const sentryProject = process.env.SENTRY_PROJECT;
  const sentryUploadEnabled = isSentrySourceMapUploadEnabled({
    mode,
    authToken: sentryAuthToken,
    org: sentryOrg,
    project: sentryProject,
  });

  return {
    plugins: [
      // Plugin ordering: React → Tailwind → env validator → modulePreload →
      // criticalCss → cssOptimization → bundleBudget → precacheManifest →
      // visualizer → Sentry (Sentry must be LAST)
      react(),
      tailwindcss(),
      envValidatorPlugin(),
      modulePreloadPlugin(),
      criticalCssPlugin(),
      cssOptimizationPlugin(),
      bundleBudgetPlugin({
        maxChunkGzip: 153600, // 150 KB
        maxInitialGzip: 256000, // 250 KB
        initialChunks: ['vendor-react', 'vendor-ui', 'vendor-i18n'],
        failOnOverage: !!process.env.CI,
      }),
      precacheManifestPlugin(),
      ...(analyze
        ? [
            visualizer({
              open: false,
              filename: 'dist/bundle-stats.html',
              gzipSize: true,
              brotliSize: true,
            }),
          ]
        : []),
      // The Sentry plugin must be listed LAST so it can attach to the final
      // build output. It uploads source maps to Sentry, then deletes the emitted
      // .map files from dist/ so no source maps are ever served (Req 1.5, 7.3).
      ...(sentryUploadEnabled
        ? [
            sentryVitePlugin({
              authToken: sentryAuthToken,
              org: sentryOrg,
              project: sentryProject,
              release: {
                name: process.env.VITE_APP_VERSION || undefined,
              },
              sourcemaps: {
                // Upload then delete the maps post-upload. In @sentry/vite-plugin
                // v3+ this option is `filesToDeleteAfterUpload` (formerly
                // `deleteFilesAfterUpload`); deleting the .map files keeps dist/
                // free of source maps while still giving Sentry deobfuscation.
                filesToDeleteAfterUpload: ['./dist/**/*.map'],
              },
            }),
          ]
        : []),
    ],
    define: {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      hmr: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
      // WebSocket proxy is handled by Vite automatically when proxying to the backend
      // The browser connects to ws://localhost:5173 and Vite upgrades to ws://localhost:3000
    },
    optimizeDeps: {
      force: true,
    },
    build: {
      // Production source maps are disabled by default so dist/ emits no .map
      // files (Req 1.5, 1.6). When Sentry source map upload is enabled (CI with
      // auth token), we switch to 'hidden' so maps are generated WITHOUT a
      // sourceMappingURL comment in the JS; the Sentry plugin then uploads them
      // and deletes the .map files via sourcemaps.filesToDeleteAfterUpload, so
      // dist/ still ships zero .map files — preserving Req 1.5.
      sourcemap: sentryUploadEnabled ? 'hidden' : false,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          passes: 2,
        },
      },
      rollupOptions: {
        output: {
          // Ensure JS chunks use content-hash naming for long-term caching
          chunkFileNames: 'assets/[name].[hash].js',
          entryFileNames: 'assets/[name].[hash].js',
          // CSS and other assets use content-hash naming (Req 4.4, 5.1)
          // CSS files get "styles" prefix for clarity; other assets keep name
          assetFileNames(assetInfo) {
            if (assetInfo.names?.[0]?.endsWith('.css') || assetInfo.name?.endsWith('.css')) {
              return 'assets/styles.[hash][extname]';
            }
            return 'assets/[name].[hash][extname]';
          },
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // ─── Tier 1: Critical Path (eagerly loaded) ───────────────────
              // Core React runtime and routing
              if (
                id.includes('react-dom') ||
                id.includes('react-router-dom') ||
                id.includes('/react/') ||
                id.includes('/scheduler/')
              ) {
                return 'vendor-react';
              }
              // UI utilities (eagerly loaded via Layout)
              if (
                id.includes('lucide-react') ||
                id.includes('class-variance-authority') ||
                id.includes('/clsx/') ||
                id.includes('tailwind-merge') ||
                id.includes('@radix-ui')
              ) {
                return 'vendor-ui';
              }
              // Internationalization
              if (
                id.includes('i18next') ||
                id.includes('react-i18next') ||
                id.includes('i18next-browser-languagedetector') ||
                id.includes('i18next-http-backend')
              ) {
                return 'vendor-i18n';
              }

              // ─── Tier 2: Deferred (loaded on first authenticated route) ──
              // Data fetching layer
              if (id.includes('@tanstack/react-query')) {
                return 'vendor-query';
              }
              // Form handling and validation
              if (
                id.includes('react-hook-form') ||
                id.includes('@hookform/resolvers') ||
                id.includes('/zod/')
              ) {
                return 'vendor-forms';
              }
              // Animation library
              if (
                id.includes('framer-motion') ||
                id.includes('/motion/') ||
                id.includes('node_modules/motion')
              ) {
                return 'vendor-motion';
              }
              // Toast notifications
              if (id.includes('react-hot-toast') || id.includes('/goober/')) {
                return 'vendor-toast';
              }

              // ─── Tier 3: On-Demand (loaded only when consuming route activates) ──
              // Charts (lazy-loaded with Dashboard)
              if (id.includes('recharts') || id.includes('/d3-') || id.includes('/victory-')) {
                return 'vendor-charts';
              }
              // PDF generation and viewing
              if (
                id.includes('jspdf') ||
                id.includes('jspdf-autotable') ||
                id.includes('react-pdf')
              ) {
                return 'vendor-pdf';
              }
              // Excel/spreadsheet generation
              if (id.includes('exceljs')) {
                return 'vendor-excel';
              }
              // Code editor
              if (id.includes('codemirror') || id.includes('@codemirror/')) {
                return 'vendor-editor';
              }

              // Do NOT add a catch-all here — let Rollup split remaining
              // vendor modules into the chunks that import them, enabling
              // proper lazy-loading and tree-shaking.
            }
          },
        },
      },
    },
  };
});
