import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { envValidatorPlugin } from './vite-env-validator';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), envValidatorPlugin()],
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
      sourcemap: process.env.NODE_ENV === 'production' ? 'hidden' : true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (
                id.includes('react') ||
                id.includes('react-dom') ||
                id.includes('react-router-dom') ||
                id.includes('framer-motion') ||
                id.includes('motion')
              ) {
                return 'vendor-react';
              }
              if (
                id.includes('jspdf') ||
                id.includes('xlsx') ||
                id.includes('docx') ||
                id.includes('react-pdf')
              ) {
                return 'vendor-export';
              }
              if (id.includes('recharts') || id.includes('lucide-react')) {
                return 'vendor-charts';
              }
              if (id.includes('@tanstack/react-query')) {
                return 'vendor-query';
              }
              if (id.includes('@google/genai') || id.includes('magika')) {
                return 'vendor-ai';
              }
              return 'vendor-others';
            }
          },
        },
      },
    },
  };
});
