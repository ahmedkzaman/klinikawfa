import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: false, // chaos cases mutate shared rows
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.STAGING_PREVIEW_URL,
    headless: true,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
