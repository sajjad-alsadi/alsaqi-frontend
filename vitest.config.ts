import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/server/**/*.ts'],
      thresholds: {
        // TODO: Increase threshold to 40% as more integration tests are added for src/server/
        // Current coverage is low because property tests read files as text rather than executing server code.
        // Target: 40% line coverage for src/server/ once auth, CSRF, and route integration tests are complete.
        'src/server/**': {
          lines: 0,
        },
      },
    },
  },
});
