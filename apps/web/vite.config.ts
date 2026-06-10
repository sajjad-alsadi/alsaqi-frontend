import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { envValidatorPlugin } from './src/plugins/envValidator';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const analyze = process.env.ANALYZE === 'true';
  return {
    plugins: [
      react(),
      tailwindcss(),
      envValidatorPlugin(),
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
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(''),
    },
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
      sourcemap: 'hidden',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // Core React runtime, routing, animation, and HTTP (eagerly loaded)
              if (
                id.includes('react-dom') ||
                id.includes('react-router-dom') ||
                id.includes('/react/') ||
                id.includes('/scheduler/') ||
                id.includes('framer-motion') ||
                id.includes('/motion/') ||
                id.includes('node_modules/motion') ||
                id.includes('/axios/') ||
                id.includes('react-hot-toast') ||
                id.includes('/goober/')
              ) {
                return 'vendor-react';
              }
              // Data fetching layer
              if (id.includes('@tanstack/react-query')) {
                return 'vendor-query';
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
              // Internationalization
              if (
                id.includes('i18next') ||
                id.includes('react-i18next') ||
                id.includes('i18next-browser-languagedetector') ||
                id.includes('i18next-http-backend')
              ) {
                return 'vendor-i18n';
              }
              // Form handling and validation
              if (
                id.includes('react-hook-form') ||
                id.includes('@hookform/resolvers') ||
                id.includes('/zod/')
              ) {
                return 'vendor-forms';
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
