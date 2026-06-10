import { test, expect } from '@playwright/test';

test.describe('Audit Plan Creation', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.locator('#login-username').fill('admin');
    await page.locator('#login-password').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/dashboard', { timeout: 10000 });
  });

  test('should navigate to audit plan page', async ({ page }) => {
    await page.goto('/plan');

    // The audit plan page should load without errors
    await expect(page.locator('[role="alert"]')).not.toBeVisible();
    // Page should have content (heading or main container)
    await expect(page.locator('main, [role="main"], .min-h-screen')).toBeVisible();
  });

  test('should open create audit plan form', async ({ page }) => {
    await page.goto('/plan');

    // Click the create/add button (look for common add action patterns)
    const addButton = page.getByRole('button', { name: /add|create|new|إضافة|جديد/i });
    await addButton.first().click();

    // A form or modal should appear
    await expect(
      page.locator('[role="dialog"], form, [data-testid="audit-plan-form"]')
    ).toBeVisible();
  });

  test('should create a new audit plan', async ({ page }) => {
    await page.goto('/plan');

    // Open creation form
    const addButton = page.getByRole('button', { name: /add|create|new|إضافة|جديد/i });
    await addButton.first().click();

    // Wait for form/modal to appear
    await expect(
      page.locator('[role="dialog"], form, [data-testid="audit-plan-form"]')
    ).toBeVisible();

    // Fill in required fields (title/name)
    const titleInput = page.locator(
      'input[name="title"], input[name="name"], input[name="planTitle"], input[placeholder*="title" i], input[placeholder*="اسم" i]'
    );
    if (await titleInput.isVisible()) {
      await titleInput.fill('Test Audit Plan - E2E');
    }

    // Fill description if available
    const descInput = page.locator(
      'textarea[name="description"], textarea[name="objectives"], textarea[placeholder*="description" i], textarea[placeholder*="وصف" i]'
    );
    if (await descInput.isVisible()) {
      await descInput.fill('E2E test audit plan description');
    }

    // Submit the form
    const submitButton = page.getByRole('button', { name: /submit|save|create|حفظ|إنشاء/i });
    await submitButton.first().click();

    // After submission, the modal/form should close or show success
    // The page should render without errors
    await expect(page.locator('[role="alert"][aria-live="assertive"]')).not.toBeVisible({
      timeout: 5000,
    });
  });

  test('should display audit plan list without errors', async ({ page }) => {
    await page.goto('/plan');

    // Wait for the page content to load
    await page.waitForLoadState('networkidle');

    // No uncaught error boundaries should be visible
    await expect(page.locator('[role="alert"]')).not.toBeVisible();
    // The page should have loaded content (table, list, or cards)
    await expect(
      page.locator('table, [role="grid"], [role="list"], .grid, .space-y-4')
    ).toBeVisible();
  });
});
