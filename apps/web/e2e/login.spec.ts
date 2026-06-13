import { test as plainTest, expect as plainExpect } from '@playwright/test';
import { test, expect } from './fixtures/backend';

plainTest.describe('Login Flow', () => {
  plainTest.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  plainTest('should display login form when not authenticated', async ({ page }) => {
    // The login form should be visible with username and password fields
    await plainExpect(page.locator('#login-username')).toBeVisible();
    await plainExpect(page.locator('#login-password')).toBeVisible();
  });

  plainTest('should show error on invalid credentials', async ({ page }) => {
    await page.locator('#login-username').fill('invalid-user');
    await page.locator('#login-password').fill('wrong-password');
    await page.locator('button[type="submit"]').click();

    // Expect an error alert to appear
    await plainExpect(page.locator('[role="alert"]')).toBeVisible();
  });

  plainTest('should login successfully and navigate to dashboard', async ({ page }) => {
    // Fill in valid credentials
    await page.locator('#login-username').fill('admin');
    await page.locator('#login-password').fill('admin123');
    await page.locator('button[type="submit"]').click();

    // After successful login, dashboard should load
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await plainExpect(page).toHaveURL(/\/dashboard/);

    // Dashboard content should be visible without errors
    await plainExpect(page.locator('[role="alert"]')).not.toBeVisible();
  });

  plainTest('should support remember me checkbox', async ({ page }) => {
    const rememberMe = page.locator('input[type="checkbox"]');
    await plainExpect(rememberMe).toBeVisible();
    await rememberMe.check();
    await plainExpect(rememberMe).toBeChecked();
  });

  plainTest('should toggle password visibility', async ({ page }) => {
    const passwordInput = page.locator('#login-password');
    await passwordInput.fill('test-password');

    // Initially password type
    await plainExpect(passwordInput).toHaveAttribute('type', 'password');

    // Click show password button
    const toggleButton = page.getByRole('button', { name: /show password|hide password/i });
    await toggleButton.click();

    // Should now be text type
    await plainExpect(passwordInput).toHaveAttribute('type', 'text');
  });
});

/**
 * Stream 1 — critical path `auth.refresh-401` (Req 1.1, 1.7, 1.8).
 *
 * These specs verify the production `createApiClient` 401→refresh→retry flow
 * (src/api/client.ts) end-to-end against the deterministic mock backend, driven
 * entirely through the real application rather than a re-implementation:
 *
 *  - The app's `httpClient` default export (src/api/httpClient.ts) IS the raw
 *    Axios instance of a real `createApiClient`, so every request it issues runs
 *    through the same single-refresh interceptor under test.
 *  - On boot, `AuthContext` issues exactly one `GET /api/profile` through that
 *    client. Forcing that request to 401 drives the single-401 path (Req 1.1)
 *    and — when `/auth/refresh` is also forced to fail — the failed-refresh /
 *    unauthenticated path (Req 1.8).
 *  - Once authenticated, `NotificationProvider` fires two requests
 *    (`/notifications?…` and `/notifications/unread-count`) back-to-back in the
 *    same effect tick, giving two genuinely in-flight requests. Forcing both to
 *    401 exercises the shared-refresh path (Req 1.7): the module-level
 *    `isRefreshing` guard means the second 401 subscribes to the first's
 *    in-flight refresh instead of starting its own.
 *
 * Each path is made deterministic with `backend.forceStatus`; `/auth/refresh`
 * POSTs and the original requests are counted at the transport level via
 * `page.on('request')` / `page.on('response')`, so the assertions are
 * independent of UI rendering. The API client's base URL in e2e is
 * `http://localhost:3000/api` (VITE_API_URL), so the refresh interceptor posts
 * to `http://localhost:3000/api/auth/refresh`, which the backend fixture
 * intercepts.
 *
 * Mode: `mock` (the default). No request reaches a real backend on :3000
 * (Req 1.5).
 *
 * _Requirements: 1.1, 1.7, 1.8_
 */

/** The API client posts the refresh here: `${VITE_API_URL}/auth/refresh`. */
const REFRESH_RE = /\/api\/auth\/refresh(?:\?|$)/;
/** AuthContext's boot session check: `GET ${VITE_API_URL}/profile`. */
const PROFILE_RE = /\/api\/profile(?:\?|$)/;
/** NotificationProvider's two on-auth fetches (list + unread-count). */
const NOTIFICATIONS_RE = /\/api\/notifications(?:\/unread-count)?(?:\?|$)/;

/** A populated profile body. AuthContext authenticates directly from
 *  `GET /profile` (sets `user` to the response body and `token` to
 *  'authenticated'), which in turn mounts NotificationProvider. The body is
 *  returned un-enveloped, matching how the app reads it. */
const PROFILE_BODY = {
  id: 'e2e-user',
  username: 'e2e',
  name: 'E2E Tester',
  email: 'e2e@test.local',
  role: 'admin',
  job_title: 'QA',
  is_active: true,
} as const;

test.describe('401 token-refresh critical path', () => {
  test('a single 401 triggers exactly one /auth/refresh and exactly one retry, with no further refresh (Req 1.1)', async ({
    page,
    backend,
  }) => {
    test.setTimeout(30_000);

    let refreshCount = 0;
    let profileCount = 0;
    page.on('request', (req) => {
      const url = req.url();
      if (req.method() === 'POST' && REFRESH_RE.test(url)) refreshCount += 1;
      if (PROFILE_RE.test(url)) profileCount += 1;
    });

    // Force ONLY the first /profile to 401; its retry (and everything else) then
    // passes through to the mock's default 200 handler. /auth/refresh is NOT
    // forced, so the fixture answers it 200 and the refresh succeeds.
    await backend.forceStatus(PROFILE_RE, 401, 1);

    await page.goto('/');

    // The 401 must drive exactly one refresh, after which the original request
    // is retried exactly once (profile requested twice total).
    await expect.poll(() => refreshCount, { timeout: 15_000 }).toBe(1);
    await expect.poll(() => profileCount, { timeout: 15_000 }).toBe(2);

    // Settle: the retried request (carrying __isRetryAfterRefresh) must NOT
    // trigger another refresh, and no further /profile attempt is made.
    await page.waitForTimeout(1_500);
    expect(refreshCount).toBe(1);
    expect(profileCount).toBe(2);
  });

  test('concurrent in-flight 401s share a single /auth/refresh (Req 1.7)', async ({
    page,
    backend,
  }) => {
    test.setTimeout(30_000);

    let refreshCount = 0;
    let notif401Count = 0;
    page.on('request', (req) => {
      if (req.method() === 'POST' && REFRESH_RE.test(req.url())) refreshCount += 1;
    });
    page.on('response', (res) => {
      if (res.status() === 401 && NOTIFICATIONS_RE.test(res.url())) notif401Count += 1;
    });

    // Authenticate from /profile so NotificationProvider mounts and fires its two
    // requests in the same tick (genuinely concurrent in-flight requests).
    await page.route(PROFILE_RE, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PROFILE_BODY),
      }),
    );

    // Widen the in-flight refresh window so both 401s are guaranteed to overlap:
    // the first starts the refresh (isRefreshing=true) and the second must find
    // it in progress and subscribe rather than start its own. A delayed 200
    // keeps the refresh in flight while both 401 handlers run.
    await page.route(REFRESH_RE, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: null, meta: {} }),
      });
    });

    // Force the next two notification requests (the two concurrent on-auth
    // fetches) to 401; their post-refresh retries then pass through to 200.
    await backend.forceStatus(NOTIFICATIONS_RE, 401, 2);

    await page.goto('/');

    // Both concurrent requests must have been 401'd...
    await expect.poll(() => notif401Count, { timeout: 15_000 }).toBe(2);
    // ...yet they share exactly ONE /auth/refresh round-trip.
    await expect.poll(() => refreshCount, { timeout: 15_000 }).toBe(1);

    // Settle: no additional refresh is triggered by the retries.
    await page.waitForTimeout(1_500);
    expect(refreshCount).toBe(1);
  });

  test('a failed /auth/refresh abandons the original request and transitions to unauthenticated (Req 1.8)', async ({
    page,
    backend,
  }) => {
    test.setTimeout(30_000);

    let refreshCount = 0;
    let profileCount = 0;
    page.on('request', (req) => {
      const url = req.url();
      if (req.method() === 'POST' && REFRESH_RE.test(url)) refreshCount += 1;
      if (PROFILE_RE.test(url)) profileCount += 1;
    });

    // First /profile → 401, and the resulting /auth/refresh → 401 (fails). The
    // client must then abandon the original request (no retry) and the app must
    // transition to the unauthenticated state.
    await backend.forceStatus(PROFILE_RE, 401, 1);
    await backend.forceStatus(REFRESH_RE, 401, 1);

    await page.goto('/');

    // Exactly one refresh attempt was made and it failed...
    await expect.poll(() => refreshCount, { timeout: 15_000 }).toBe(1);

    // ...the original /profile request is abandoned WITHOUT a retry...
    await page.waitForTimeout(1_500);
    expect(profileCount).toBe(1);
    expect(refreshCount).toBe(1);

    // ...and the app transitions to unauthenticated: the login form is shown.
    await expect(page.locator('#login-username')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#login-password')).toBeVisible();
  });
});
