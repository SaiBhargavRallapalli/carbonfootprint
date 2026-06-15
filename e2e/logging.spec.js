'use strict';

const { test, expect } = require('@playwright/test');

test.describe('Log Activity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-app-ready]');
    await page.getByRole('tab', { name: /log activity/i }).click();
    await page.waitForSelector('#panel-log:not([hidden])');
  });

  test('log tab becomes active on click', async ({ page }) => {
    const tab = page.getByRole('tab', { name: /log activity/i });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  test('category dropdown is visible', async ({ page }) => {
    await expect(page.locator('#log-category')).toBeVisible();
  });

  test('type dropdown is disabled before category selected', async ({ page }) => {
    await expect(page.locator('#log-type')).toBeDisabled();
  });

  test('type dropdown enables when category is chosen', async ({ page }) => {
    await page.selectOption('#log-category', 'transport');
    await expect(page.locator('#log-type')).toBeEnabled();
  });

  test('CO2 preview appears after valid inputs', async ({ page }) => {
    await page.waitForSelector('body[data-emission-factors-ready]');
    await page.selectOption('#log-category', 'transport');
    await page.selectOption('#log-type', 'petrol_car');
    await page.fill('#log-quantity', '10');
    await expect(page.locator('#co2-preview')).toBeVisible();
    await expect(page.locator('#co2-preview')).toContainText('kg CO₂e');
  });

  test('submitting a valid activity shows success feedback', async ({ page }) => {
    await page.selectOption('#log-category', 'food');
    await page.selectOption('#log-type', 'veg_meal');
    await page.fill('#log-quantity', '3');
    await page.click('#log-submit');
    await expect(page.locator('#log-feedback')).toContainText(/logged|error/i, { timeout: 5000 });
  });
});
