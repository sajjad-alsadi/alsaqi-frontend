import { test, expect } from '@playwright/test';

test.describe('Correspondence Sending', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.locator('#login-username').fill('admin');
    await page.locator('#login-password').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/dashboard', { timeout: 10000 });
  });

  test('should navigate to correspondence page', async ({ page }) => {
    await page.goto('/cms');

    // The correspondence page should load without errors
    await expect(page.locator('[role="alert"]')).not.toBeVisible();
    await expect(page.locator('main, [role="main"], .min-h-screen')).toBeVisible();
  });

  test('should display correspondence tabs or sections', async ({ page }) => {
    await page.goto('/cms');

    // Wait for content to load
    await page.waitForLoadState('networkidle');

    // Should show tab navigation or section headers (incoming/outgoing/archive)
    const tabsOrSections = page.locator(
      '[role="tablist"], [role="tab"], button:has-text("incoming"), button:has-text("outgoing"), button:has-text("صادر"), button:has-text("وارد")'
    );
    await expect(tabsOrSections.first()).toBeVisible();
  });

  test('should open compose/send correspondence form', async ({ page }) => {
    await page.goto('/cms');

    // Click compose/create/send button
    const composeButton = page.getByRole('button', {
      name: /compose|send|create|new|إنشاء|إرسال|جديد|صادر/i,
    });
    await composeButton.first().click();

    // A form or modal should appear for composing correspondence
    await expect(
      page.locator('[role="dialog"], form')
    ).toBeVisible();
  });

  test('should send a correspondence letter', async ({ page }) => {
    await page.goto('/cms');

    // Open compose form
    const composeButton = page.getByRole('button', {
      name: /compose|send|create|new|إنشاء|إرسال|جديد|صادر/i,
    });
    await composeButton.first().click();

    // Wait for form/modal
    await expect(page.locator('[role="dialog"], form')).toBeVisible();

    // Fill subject/title
    const subjectInput = page.locator(
      'input[name="subject"], input[name="title"], input[placeholder*="subject" i], input[placeholder*="الموضوع" i]'
    );
    if (await subjectInput.isVisible()) {
      await subjectInput.fill('E2E Test Correspondence');
    }

    // Fill recipient
    const recipientInput = page.locator(
      'input[name="recipient"], input[name="to"], input[name="addressee"], input[placeholder*="recipient" i], input[placeholder*="المرسل إليه" i], input[placeholder*="الجهة" i]'
    );
    if (await recipientInput.isVisible()) {
      await recipientInput.fill('Internal Audit Department');
    }

    // Fill body/content
    const bodyInput = page.locator(
      'textarea[name="body"], textarea[name="content"], textarea[name="message"], textarea[placeholder*="content" i], textarea[placeholder*="المحتوى" i], textarea[placeholder*="النص" i]'
    );
    if (await bodyInput.isVisible()) {
      await bodyInput.fill('This is an E2E test correspondence regarding audit findings follow-up.');
    }

    // Select priority if available
    const prioritySelect = page.locator(
      'select[name="priority"], select[name="urgency"]'
    );
    if (await prioritySelect.isVisible()) {
      await prioritySelect.selectOption({ index: 1 });
    }

    // Submit/Send the correspondence
    const sendButton = page.getByRole('button', {
      name: /send|submit|save|إرسال|حفظ/i,
    });
    await sendButton.first().click();

    // After sending, verify no error state is shown
    await expect(page.locator('[role="alert"][aria-live="assertive"]')).not.toBeVisible({
      timeout: 5000,
    });
  });

  test('should display correspondence list without errors', async ({ page }) => {
    await page.goto('/cms');

    // Wait for page to settle
    await page.waitForLoadState('networkidle');

    // No error boundaries should be triggered
    await expect(page.locator('[role="alert"]')).not.toBeVisible();

    // Content should be rendered
    await expect(
      page.locator('table, [role="grid"], [role="list"], .grid, .space-y-4')
    ).toBeVisible();
  });
});
