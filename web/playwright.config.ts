import { defineConfig } from '@playwright/test';

const applicationURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  // Scene engine harnesses import source modules and require Vite.
  testIgnore: applicationURL ? ['**/scenes.spec.ts'] : [],
  timeout: 60000,
  use: {
    channel: 'chrome',
    baseURL: applicationURL || 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: applicationURL
    ? undefined
    : {
        command: 'npm run dev -- --port 5173 --strictPort',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: true,
      },
});
