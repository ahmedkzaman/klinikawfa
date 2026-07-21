import { expect, test } from "@playwright/test";

test.describe("consent-gated Google tracking (local IDs only)", () => {
  test("does not request Google before consent", async ({ page }) => {
    const googleRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("googletagmanager.com") || request.url().includes("google-analytics.com")) {
        googleRequests.push(request.url());
      }
    });
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    await page.waitForTimeout(750);
    expect(googleRequests).toEqual([]);
  });

  test("never sends Google requests from protected or query routes", async ({ page }) => {
    const googleRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("googletagmanager.com") || request.url().includes("google-analytics.com")) {
        googleRequests.push(request.url());
      }
    });
    await page.goto("/appointment?fixture=1");
    await page.waitForTimeout(750);
    expect(googleRequests).toEqual([]);
  });
});
