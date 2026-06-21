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
    // Default per-test timeout is 5s. Several property-based suites run hundreds
    // of cases and/or perform real filesystem I/O (e.g. noSourceMaps, contentHash,
    // typedSchemas); under full parallel execution they can momentarily exceed 5s
    // due to CPU contention, producing intermittent timeout-induced failures even
    // though they pass deterministically in isolation. A higher ceiling removes
    // that flakiness without slowing fast tests (the timeout only caps slow ones).
    testTimeout: 20000,
    // Cap worker concurrency. On high-core machines (e.g. 22 cores) Vitest would
    // otherwise spawn one worker per core; dozens of CPU- and memory-heavy suites
    // (jsdom + canvas/PDF + property tests) running at once oversubscribe the
    // machine and intermittently crash a worker mid-run (surfacing as
    // STACK_TRACE_ERROR on unrelated in-flight tests) or starve tests past their
    // timeout. Bounding the pool keeps per-worker CPU/memory stable so the suite
    // runs deterministically, with negligible wall-clock cost.
    poolOptions: {
      forks: { maxForks: 6, minForks: 1 },
      threads: { maxThreads: 6, minThreads: 1 },
    },
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
      // `json-summary` is consumed by scripts/check-coverage-thresholds.mjs to enforce
      // per-file targets and to fail when a target file is missing/absent from the report
      // (Requirement 7.4) — a case Vitest's glob thresholds silently pass.
      reporter: ['text', 'text-summary', 'json', 'json-summary', 'lcov'],
      thresholds: {
        // Global floor: lines/functions/branches/statements must each stay >= 70.00%.
        // (Requirement 7.2 / 7.3 — the per-file gates below are additive and never lower this floor.)
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
        // Existing tightened directory floors (unchanged; never lowered).
        'src/api/**': { lines: 75, functions: 70 },
        'src/context/**': { lines: 75, functions: 70 },
        'src/permissions/**': { lines: 80, functions: 75 },
        // Security- & observability-critical modules: >= 90% line coverage each.
        // Exact-path glob keys make each threshold set resolve to a single file, so the
        // aggregate check behaves per-file. (Requirement 7.1)
        'src/api/client.ts': { lines: 90 },
        'src/api/ws/websocket-client.ts': { lines: 90 },
        'src/utils/sentry.ts': { lines: 90 },
      },
    },
  },
});
