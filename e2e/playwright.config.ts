import { defineConfig } from '@playwright/test';

// Runs against the LOCAL stack only: Angular on 4200, API on 5000, throwaway Mongo on 27018.
// Start order: docker mongo -> seed -> backend (MONGODB_URI override) -> ng serve.
export default defineConfig({
  testDir: '.',
  outputDir: './test-results',
  testMatch: '**/*.spec.ts',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
