import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3001',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm start',
    url: 'http://localhost:3001/demo',
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'production',
      PORT: '3001',
      NOTICETV_ORIGIN: 'http://localhost:3001',
      NOTICETV_DATA_DIR: '.test-data',
      NOTICETV_EDITOR_KEY: 'noticetv-browser-test-fixture-only',
    },
  },
});
