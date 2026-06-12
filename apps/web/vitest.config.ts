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
