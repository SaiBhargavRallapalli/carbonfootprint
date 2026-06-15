'use strict';

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir:   './e2e',
  fullyParallel: false,
  retries:   1,
  workers:   1,
  reporter:  'list',
  use: {
    baseURL:     'http://localhost:8080',
    trace:       'on-first-retry',
    screenshot:  'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command:              'npm run build && node dist/server.js',
    url:                  'http://localhost:8080/api/health',
    reuseExistingServer: !process.env.CI,
    timeout:             60_000,
  },
});
