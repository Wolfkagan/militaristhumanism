import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: "./tests/e2e/global-setup.mjs",
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.CI ? undefined : "chrome",
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:8789",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command: "npm run dev:e2e",
    // Health probes D1 without depending on migrated authentication tables.
    url: "http://127.0.0.1:8789/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
});
