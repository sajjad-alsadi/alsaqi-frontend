import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    hookTimeout: 30000,
    setupFiles: ['./src/test/setup.ts'],
    // Playwright end-to-end specs live under e2e/ and must run via the Playwright
    // runner (`npm run test:e2e`), not Vitest. Excluding them here (in addition to
    // Vitest's defaults) keeps `npm run test` focused on unit/integration tests.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'e2e/**',
      '**/*.e2e.{test,spec}.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'lcov'],
      thresholds: {
        lines: 70,
        'src/api/**': { lines: 75, functions: 70 },
        'src/context/**': { lines: 75, functions: 70 },
        'src/permissions/**': { lines: 80, functions: 75 },
      },
    },
  },
});
