import { test, expect } from "@playwright/test";

test.describe("UI chaos", () => {
  test("double-click Pay fires exactly once", async ({ page }) => {
    let payCalls = 0;
    page.on("request", (r) => { if (/checkout_visit/.test(r.url())) payCalls++; });
    await page.goto("/clinic/dispense-checkout/sample");
    const btn = page.getByRole("button", { name: /pay/i });
    await Promise.all([btn.click(), btn.click()]);
    await page.waitForTimeout(2000);
    expect(payCalls).toBe(1);
  });

  test("offline mid-checkout shows recoverable toast", async ({ page, context }) => {
    await page.goto("/clinic/dispense-checkout/sample");
    await context.setOffline(true);
    await page.getByRole("button", { name: /pay/i }).click();
    await expect(page.getByText(/network|offline|retry/i)).toBeVisible({ timeout: 8000 });
    await context.setOffline(false);
  });

  test("MyKad bridge offline → red dot + manual entry works", async ({ page, context }) => {
    await context.route("http://127.0.0.1:8787/**", (route) => route.abort());
    await page.goto("/clinic/register");
    // Bridge dot should go red within polling interval (~12s)
    await expect(page.locator('[data-testid="mykad-bridge-dot"]')).toHaveAttribute("data-status", "disconnected", { timeout: 15_000 });
    // Manual IC entry still works
    await page.fill('input[name="national_id"]', "900101015555");
    await expect(page.locator('input[name="national_id"]')).toHaveValue("900101015555");
  });

  test("two tabs same queue entry — loser gets clean message", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    await Promise.all([
      p1.goto("/clinic/visit/sample"),
      p2.goto("/clinic/visit/sample"),
    ]);
    await Promise.all([
      p1.getByRole("button", { name: /complete|checkout/i }).click(),
      p2.getByRole("button", { name: /complete|checkout/i }).click(),
    ]);
    // At least one tab should show ALREADY_COMPLETED or equivalent
    const messages = await Promise.all([
      p1.getByText(/already|completed|conflict/i).first().textContent().catch(() => null),
      p2.getByText(/already|completed|conflict/i).first().textContent().catch(() => null),
    ]);
    expect(messages.some(Boolean)).toBe(true);
  });
});
