import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import alSaqiOptimizer from './vite-plugin-optimizer.js';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      (alSaqiOptimizer as any)({
        images: true,
        svgs: true,
        code: true,
        report: true
      })
    ],
    define: {
      // SECURITY: GEMINI_API_KEY is now proxied through the server API
      // Do NOT expose API keys to the client bundle
      'process.env.GEMINI_API_KEY': JSON.stringify(''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: true,
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
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom') || id.includes('framer-motion') || id.includes('motion')) {
                return 'vendor-react';
              }
              if (id.includes('jspdf') || id.includes('xlsx') || id.includes('docx') || id.includes('react-pdf')) {
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
          }
        }
      }
    },
  };
});
