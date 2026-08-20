import { defineConfig, devices } from '@playwright/test';

// Cross-browser is where the real codec/API bugs live (Safari/iOS especially).
// Device testing on a genuine mid-range Android phone stays a manual step —
// desktop throttling does not simulate its memory ceiling.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    // NOT `vite preview`: that is an SPA server and would fall back to the
    // home index.html for every prerendered route, so the suite would never see
    // the per-route HTML that actually ships. See scripts/serve-dist.mjs.
    command: 'npm run build && npm run serve',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
