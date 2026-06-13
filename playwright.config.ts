import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for AL-SAQI E2E tests.
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  /* Build and serve the production preview before starting the tests, so e2e
     runs against the built output rather than the dev server (Req 1.5). The
     preview port is pinned to 5173 to match `baseURL`; `vite preview` would
     otherwise default to 4173. */
  webServer: {
    command: 'npm run build && npm run preview -- --port 5173 --strictPort',
    cwd: 'apps/web',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
