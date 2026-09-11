import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/static',
  timeout: 60000,
  workers: 1,
  use: {
    channel: 'chrome',
    baseURL: 'http://127.0.0.1:4175',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: 'npm run preview:static -- --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
  },
});
