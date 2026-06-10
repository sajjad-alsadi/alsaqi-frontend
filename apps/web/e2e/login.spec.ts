import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display login form when not authenticated', async ({ page }) => {
    // The login form should be visible with username and password fields
    await expect(page.locator('#login-username')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
  });

  test('should show error on invalid credentials', async ({ page }) => {
    await page.locator('#login-username').fill('invalid-user');
    await page.locator('#login-password').fill('wrong-password');
    await page.locator('button[type="submit"]').click();

    // Expect an error alert to appear
    await expect(page.locator('[role="alert"]')).toBeVisible();
  });

  test('should login successfully and navigate to dashboard', async ({ page }) => {
    // Fill in valid credentials
    await page.locator('#login-username').fill('admin');
    await page.locator('#login-password').fill('admin123');
    await page.locator('button[type="submit"]').click();

    // After successful login, dashboard should load
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await expect(page).toHaveURL(/\/dashboard/);

    // Dashboard content should be visible without errors
    await expect(page.locator('[role="alert"]')).not.toBeVisible();
  });

  test('should support remember me checkbox', async ({ page }) => {
    const rememberMe = page.locator('input[type="checkbox"]');
    await expect(rememberMe).toBeVisible();
    await rememberMe.check();
    await expect(rememberMe).toBeChecked();
  });

  test('should toggle password visibility', async ({ page }) => {
    const passwordInput = page.locator('#login-password');
    await passwordInput.fill('test-password');

    // Initially password type
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click show password button
    const toggleButton = page.getByRole('button', { name: /show password|hide password/i });
    await toggleButton.click();

    // Should now be text type
    await expect(passwordInput).toHaveAttribute('type', 'text');
  });
});
