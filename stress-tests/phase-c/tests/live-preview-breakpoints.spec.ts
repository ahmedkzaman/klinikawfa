import { expect, test } from "@playwright/test";

test("the production LivePreview owns its viewport, styles, and theme", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    "/stress-tests/phase-c/fixtures/live-preview/index.html",
    { waitUntil: "domcontentloaded" },
  );
  await expect(
    page.getByRole("heading", { name: "LivePreview production harness" }),
  ).toBeVisible();

  const preview = page.getByTestId("live-preview-frame");
  await expect(preview).toHaveAttribute("data-preview-mode", "desktop");
  const handle = await preview.elementHandle();
  const frame = await handle?.contentFrame();
  expect(frame).not.toBeNull();

  await expect.poll(() => frame!.evaluate(() => window.innerWidth)).toBe(1280);
  await expect
    .poll(() =>
      frame!
        .locator("#tailwind-breakpoint-probe")
        .evaluate((node) => getComputedStyle(node).display),
    )
    .toBe("block");
  await expect
    .poll(() =>
      frame!
        .locator("#cloned-style-probe")
        .evaluate((node) => getComputedStyle(node).borderTopColor),
    )
    .toBe("rgb(12, 34, 56)");
  await expect
    .poll(() =>
      frame!
        .locator('style[data-live-preview-style="true"]')
        .count(),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      frame!.evaluate(() =>
        document.documentElement.getAttribute("data-harness-theme"),
      ),
    )
    .toBe("clinic");

  await page.getByRole("button", { name: "Mobile 390 px" }).click();
  await expect(preview).toHaveAttribute("data-preview-mode", "mobile");
  await expect.poll(() => frame!.evaluate(() => window.innerWidth)).toBe(390);
  await expect
    .poll(() =>
      frame!
        .locator("#tailwind-breakpoint-probe")
        .evaluate((node) => getComputedStyle(node).display),
    )
    .toBe("none");

  await page.getByRole("button", { name: "Update parent theme" }).click();
  await expect
    .poll(() =>
      frame!.evaluate(() =>
        document.documentElement.getAttribute("data-harness-theme"),
      ),
    )
    .toBe("night");

  await page.getByRole("button", { name: "Desktop 1280 px" }).click();
  await expect(preview).toHaveAttribute("data-preview-mode", "desktop");
  await expect.poll(() => frame!.evaluate(() => window.innerWidth)).toBe(1280);
  await expect
    .poll(() =>
      frame!
        .locator("#tailwind-breakpoint-probe")
        .evaluate((node) => getComputedStyle(node).display),
    )
    .toBe("block");
});
