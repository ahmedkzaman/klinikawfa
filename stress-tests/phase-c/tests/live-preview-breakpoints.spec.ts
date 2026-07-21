import { expect, test } from "@playwright/test";

const previewDocument = `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      #probe { background-color: rgb(220, 38, 38); }
      @media (min-width: 768px) {
        #probe { background-color: rgb(37, 99, 235); }
      }
    </style>
  </head>
  <body><div id="probe">breakpoint probe</div></body>
</html>`;

test("390 and 1280 preview frames evaluate their own viewport breakpoints", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(
    '<iframe id="preview" sandbox="allow-same-origin" style="border:0;width:390px;height:400px"></iframe>',
  );

  const preview = page.locator("#preview");
  await preview.evaluate((node, srcDoc) => {
    (node as HTMLIFrameElement).srcdoc = srcDoc;
  }, previewDocument);
  const handle = await preview.elementHandle();
  const frame = await handle?.contentFrame();
  expect(frame).not.toBeNull();

  await expect.poll(() => frame!.evaluate(() => window.innerWidth)).toBe(390);
  await expect
    .poll(() =>
      frame!.locator("#probe").evaluate((node) => getComputedStyle(node).backgroundColor),
    )
    .toBe("rgb(220, 38, 38)");

  await preview.evaluate((node) => {
    (node as HTMLIFrameElement).style.width = "1280px";
  });

  await expect.poll(() => frame!.evaluate(() => window.innerWidth)).toBe(1280);
  await expect
    .poll(() =>
      frame!.locator("#probe").evaluate((node) => getComputedStyle(node).backgroundColor),
    )
    .toBe("rgb(37, 99, 235)");
});
