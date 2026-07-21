import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = 4179;
const baseURL = `http://${host}:${port}`;
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "live-preview-breakpoints.spec.ts",
    "editor-dirty-navigation-history.spec.ts",
  ],
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  webServer: {
    command: `"${process.execPath}" node_modules/vite/bin/vite.js --mode development --host ${host} --port ${port} --strictPort`,
    cwd: repositoryRoot,
    reuseExistingServer: false,
    timeout: 120_000,
    url: baseURL,
  },
  use: {
    baseURL,
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROME_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH }
      : undefined,
    trace: "off",
    video: "off",
  },
});
