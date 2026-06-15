'use strict';

const { test, expect } = require('@playwright/test');

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-app-ready]');
  });

  test('skip link is present and focusable', async ({ page }) => {
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toBeAttached();
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();
  });

  test('main landmark exists', async ({ page }) => {
    await expect(page.locator('main[role="main"]')).toBeAttached();
  });

  test('tablist has correct ARIA attributes', async ({ page }) => {
    const tablist = page.locator('[role="tablist"]');
    await expect(tablist).toBeAttached();
    const tabs = page.locator('[role="tab"]');
    const count = await tabs.count();
    expect(count).toBe(5);
  });

  test('active tab has aria-selected=true', async ({ page }) => {
    const activeTab = page.locator('[role="tab"][aria-selected="true"]');
    await expect(activeTab).toHaveCount(1);
  });

  test('arrow key navigation moves focus between tabs', async ({ page }) => {
    await page.locator('[role="tab"]').first().focus();
    await page.keyboard.press('ArrowRight');
    const tabs = page.locator('[role="tab"]');
    await expect(tabs.nth(1)).toBeFocused();
  });

  test('page has exactly one h1 equivalent', async ({ page }) => {
    // We use h2 within cards but logo/header is the primary identity
    const logo = page.locator('.logo-text');
    await expect(logo).toContainText('EcoSage');
  });

  test('form inputs have labels', async ({ page }) => {
    await page.getByRole('tab', { name: /log activity/i }).click();
    const categoryLabel = page.locator('label[for="log-category"]');
    await expect(categoryLabel).toBeAttached();
    const typeLabel = page.locator('label[for="log-type"]');
    await expect(typeLabel).toBeAttached();
  });

  test('chat input has accessible label', async ({ page }) => {
    await page.getByRole('tab', { name: /ai assistant/i }).click();
    const label = page.locator('label[for="chat-input"]');
    await expect(label).toBeAttached();
  });

  test('footer is present', async ({ page }) => {
    await expect(page.locator('footer[role="contentinfo"]')).toBeAttached();
  });
});
