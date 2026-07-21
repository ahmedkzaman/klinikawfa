import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const host = "127.0.0.1";
const port = 4181;

export default defineConfig({
  testDir: "./tests",
  testMatch: "google-tracking.spec.ts",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  webServer: {
    command: `"${process.execPath}" node_modules/vite/bin/vite.js --mode development --host ${host} --port ${port} --strictPort`,
    cwd: root,
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://${host}:${port}`,
  },
  use: {
    baseURL: `http://${host}:${port}`,
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROME_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH }
      : undefined,
    trace: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
