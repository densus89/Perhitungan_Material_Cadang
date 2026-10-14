import { defineConfig, devices } from "@playwright/test";

const localBaseUrl = "http://127.0.0.1:3000";
const externalBaseUrl = process.env.E2E_BASE_URL?.trim();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  globalSetup: "./tests/e2e/auth.setup.ts",
  globalTeardown: "./tests/e2e/auth.teardown.ts",
  retries: process.env.CI ? 2 : 0,
  reporter: [["line"], ["html", { open: "never" }]],
  use: {
    baseURL: externalBaseUrl || localBaseUrl,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalBaseUrl ? undefined : {
    command: process.env.CI ? "pnpm start" : "pnpm dev",
    url: localBaseUrl,
    reuseExistingServer: false,
  },
});
