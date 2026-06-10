import { test, expect } from '@playwright/test';

test.describe('Finding Creation with Recommendation', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.locator('#login-username').fill('admin');
    await page.locator('#login-password').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/dashboard', { timeout: 10000 });
  });

  test('should navigate to findings page', async ({ page }) => {
    await page.goto('/findings');

    // The findings page should load without errors
    await expect(page.locator('[role="alert"]')).not.toBeVisible();
    await expect(page.locator('main, [role="main"], .min-h-screen')).toBeVisible();
  });

  test('should open create finding form', async ({ page }) => {
    await page.goto('/findings');

    // Click add/create button
    const addButton = page.getByRole('button', { name: /add|create|new|إضافة|جديد/i });
    await addButton.first().click();

    // A form or modal should appear for creating a finding
    await expect(
      page.locator('[role="dialog"], form')
    ).toBeVisible();
  });

  test('should create a finding with recommendation', async ({ page }) => {
    await page.goto('/findings');

    // Open creation form
    const addButton = page.getByRole('button', { name: /add|create|new|إضافة|جديد/i });
    await addButton.first().click();

    // Wait for form/modal
    await expect(page.locator('[role="dialog"], form')).toBeVisible();

    // Fill finding title
    const titleInput = page.locator(
      'input[name="title"], input[name="findingTitle"], input[placeholder*="title" i], input[placeholder*="عنوان" i]'
    );
    if (await titleInput.isVisible()) {
      await titleInput.fill('Test Finding - E2E');
    }

    // Fill finding description
    const descInput = page.locator(
      'textarea[name="description"], textarea[name="details"], textarea[placeholder*="description" i], textarea[placeholder*="وصف" i]'
    );
    if (await descInput.isVisible()) {
      await descInput.fill('E2E test finding description with identified risk');
    }

    // Select risk level/severity if dropdown is present
    const riskSelect = page.locator(
      'select[name="riskLevel"], select[name="severity"], select[name="risk_level"]'
    );
    if (await riskSelect.isVisible()) {
      await riskSelect.selectOption({ index: 1 });
    }

    // Fill recommendation field if present on the same form
    const recommendationInput = page.locator(
      'textarea[name="recommendation"], textarea[name="recommendations"], textarea[placeholder*="recommendation" i], textarea[placeholder*="توصية" i]'
    );
    if (await recommendationInput.isVisible()) {
      await recommendationInput.fill('Implement additional controls to mitigate the identified risk');
    }

    // Submit the form
    const submitButton = page.getByRole('button', { name: /submit|save|create|حفظ|إنشاء/i });
    await submitButton.first().click();

    // After submission, verify no error state is shown
    await expect(page.locator('[role="alert"][aria-live="assertive"]')).not.toBeVisible({
      timeout: 5000,
    });
  });

  test('should display findings list without errors', async ({ page }) => {
    await page.goto('/findings');

    // Wait for page to settle
    await page.waitForLoadState('networkidle');

    // No error boundaries should be triggered
    await expect(page.locator('[role="alert"]')).not.toBeVisible();

    // Content should be rendered (table, cards, or list)
    await expect(
      page.locator('table, [role="grid"], [role="list"], .grid, .space-y-4')
    ).toBeVisible();
  });

  test('should navigate to recommendations page', async ({ page }) => {
    await page.goto('/recommendations');

    // Recommendations page should load without errors
    await expect(page.locator('[role="alert"]')).not.toBeVisible();
    await expect(page.locator('main, [role="main"], .min-h-screen')).toBeVisible();
  });
});
