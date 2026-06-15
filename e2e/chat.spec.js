'use strict';

const { test, expect } = require('@playwright/test');

test.describe('AI Assistant', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-app-ready]');
    await page.getByRole('tab', { name: /ai assistant/i }).click();
  });

  test('chat tab becomes active', async ({ page }) => {
    const tab = page.getByRole('tab', { name: /ai assistant/i });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  test('greeting message is visible', async ({ page }) => {
    await expect(page.locator('.bot-message')).toContainText(/EcoSage/i);
  });

  test('chat input is visible and focusable', async ({ page }) => {
    const input = page.locator('#chat-input');
    await expect(input).toBeVisible();
    await input.focus();
    await expect(input).toBeFocused();
  });

  test('sending a message displays it as user bubble', async ({ page }) => {
    await page.fill('#chat-input', 'What is my carbon footprint?');
    await page.click('#chat-send');
    await expect(page.locator('.user-message')).toContainText('What is my carbon footprint?');
  });

  test('bot responds with a reply', async ({ page }) => {
    await page.fill('#chat-input', 'Hello EcoSage');
    await page.click('#chat-send');
    // Wait for bot reply (demo mode is instant)
    await expect(page.locator('.bot-message').nth(1)).toBeVisible({ timeout: 8000 });
  });
});
