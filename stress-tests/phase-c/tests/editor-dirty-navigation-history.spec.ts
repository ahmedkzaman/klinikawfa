import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __dirtyNavigationAcceptedKey: string | null;
    __dirtyNavigationUnmounts: number;
    __dirtyNavigationVisits: Array<{
      key: string | null;
      state: unknown;
      url: string;
    }>;
  }
}

for (const direction of ["back", "forward"] as const) {
  const label = direction === "back" ? "Back" : "Forward";

  test(`cancelled legacy ${label} returns to the exact dirty editor entry`, async ({
    page,
  }) => {
    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.type());
      await dialog.dismiss();
    });

    await page.goto(
      `/stress-tests/phase-c/fixtures/dirty-navigation/index.html?scenario=${direction}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(
      page.getByRole("heading", { name: "Dirty navigation history harness" }),
    ).toBeVisible();

    const acceptedKey = await page.evaluate(
      () => window.__dirtyNavigationAcceptedKey,
    );
    expect(acceptedKey).toBeTruthy();

    await page.getByRole("button", { name: `Attempt ${label}` }).click();

    await expect.poll(() => dialogs).toEqual(["confirm"]);
    await expect
      .poll(() =>
        page.evaluate(() => ({
          currentKey:
            (
              window as unknown as {
                navigation?: { currentEntry?: { key?: string } | null };
              }
            ).navigation?.currentEntry?.key ?? null,
          entry: new URLSearchParams(window.location.search).get("entry"),
        })),
      )
      .toEqual({ currentKey: acceptedKey, entry: "editor" });

    const proof = await page.evaluate(() => ({
      unmounts: window.__dirtyNavigationUnmounts,
      visits: window.__dirtyNavigationVisits,
    }));
    expect(proof.unmounts).toBe(0);
    const legacyVisit = proof.visits.find((visit) =>
      visit.url.includes(`legacy-${direction}`),
    );
    expect(legacyVisit?.state).toBeNull();
  });
}
