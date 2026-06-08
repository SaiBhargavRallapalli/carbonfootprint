'use strict';

const { test, expect } = require('@playwright/test');

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page title includes EcoSage', async ({ page }) => {
    await expect(page).toHaveTitle(/EcoSage/i);
  });

  test('dashboard tab is active by default', async ({ page }) => {
    const tab = page.getByRole('tab', { name: /dashboard/i });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  test('gauge canvas is visible', async ({ page }) => {
    const canvas = page.locator('#gauge-canvas');
    await expect(canvas).toBeVisible();
  });

  test('breakdown chart canvas is visible', async ({ page }) => {
    const canvas = page.locator('#breakdown-chart');
    await expect(canvas).toBeVisible();
  });

  test('score card contains average comparison text', async ({ page }) => {
    await expect(page.locator('.avg-compare')).toContainText('Indian avg');
  });
});
