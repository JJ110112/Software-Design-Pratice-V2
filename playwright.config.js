// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5500',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: [
    {
      command: 'node server/server.js',
      port: 3333,
      reuseExistingServer: true,
    },
    {
      command: 'npx serve -l 5500',
      port: 5500,
      reuseExistingServer: true,
    },
  ],
});
