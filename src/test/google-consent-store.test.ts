import { fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConsentBanner } from "@/components/consent/ConsentBanner";
import {
  CONSENT_STORAGE_KEY,
  readMarketingConsent,
  withdrawMarketingConsent,
  writeMarketingConsent,
} from "@/features/consent/consentStore";

describe("versioned Google marketing consent", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T08:30:00.000Z"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns unknown for missing, malformed, or stale consent", () => {
    expect(readMarketingConsent(2)).toEqual({ status: "unknown" });

    for (const malformed of [
      "bad-json",
      JSON.stringify(null),
      JSON.stringify({
        marketing: "accepted",
        updatedAt: "2026-07-21T08:30:00.000Z",
        version: "2",
      }),
      JSON.stringify({
        marketing: "granted",
        updatedAt: "2026-07-21T08:30:00.000Z",
        version: 2,
      }),
      JSON.stringify({
        marketing: "accepted",
        updatedAt: "not-a-date",
        version: 2,
      }),
      JSON.stringify({
        email: "must-not-be-stored@example.com",
        marketing: "accepted",
        updatedAt: "2026-07-21T08:30:00.000Z",
        version: 2,
      }),
    ]) {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, malformed);
      expect(readMarketingConsent(2)).toEqual({ status: "unknown" });
    }

    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({
        marketing: "accepted",
        updatedAt: "2026-07-20T00:00:00.000Z",
        version: 1,
      }),
    );
    expect(readMarketingConsent(2)).toEqual({ status: "unknown" });
  });

  it.each(["accepted", "rejected"] as const)(
    "persists only the versioned %s choice",
    (marketing) => {
      expect(writeMarketingConsent({ marketing, version: 3 })).toEqual({
        marketing,
        status: "known",
        updatedAt: "2026-07-21T08:30:00.000Z",
        version: 3,
      });

      const persisted = JSON.parse(
        window.localStorage.getItem(CONSENT_STORAGE_KEY) ?? "null",
      );
      expect(persisted).toEqual({
        marketing,
        updatedAt: "2026-07-21T08:30:00.000Z",
        version: 3,
      });
      expect(Object.keys(persisted).sort()).toEqual([
        "marketing",
        "updatedAt",
        "version",
      ]);
      expect(readMarketingConsent(3)).toEqual({
        marketing,
        status: "known",
        updatedAt: "2026-07-21T08:30:00.000Z",
        version: 3,
      });
    },
  );

  it("requires a fresh choice after a consent version bump", () => {
    writeMarketingConsent({ marketing: "accepted", version: 3 });

    expect(readMarketingConsent(3)).toMatchObject({
      marketing: "accepted",
      status: "known",
    });
    expect(readMarketingConsent(4)).toEqual({ status: "unknown" });
  });

  it("withdraws consent locally and returns to unknown", () => {
    writeMarketingConsent({ marketing: "accepted", version: 3 });

    expect(withdrawMarketingConsent()).toEqual({ status: "unknown" });
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
    expect(readMarketingConsent(3)).toEqual({ status: "unknown" });
  });

  it("fails closed without throwing when browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(readMarketingConsent(1)).toEqual({ status: "unknown" });

    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(
      writeMarketingConsent({ marketing: "accepted", version: 1 }),
    ).toEqual({ status: "unknown" });

    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(() => withdrawMarketingConsent()).not.toThrow();
  });

  it("stays withdrawn for the session when removal fails", () => {
    writeMarketingConsent({ marketing: "accepted", version: 1 });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    withdrawMarketingConsent();

    expect(readMarketingConsent(1)).toEqual({ status: "unknown" });
  });

  it("offers equally clear BM and English accept, reject, and settings actions", () => {
    render(createElement(ConsentBanner, { consentVersion: 2 }));

    expect(
      screen.getByRole("button", {
        name: "Terima pemasaran / Accept marketing",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Tolak pemasaran / Reject marketing",
      }),
    ).toBeVisible();
    const settings = screen.getByRole("button", {
      name: "Tetapan kuki / Cookie settings",
    });
    expect(settings).toBeVisible();

    fireEvent.click(settings);
    const dialog = screen.getByRole("dialog", {
        name: "Tetapan kuki pemasaran / Marketing cookie settings",
      });
    expect(dialog).toBeVisible();
    expect(
      within(dialog).getByText(/Google Analytics dan Google Ads/),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/Google Analytics and Google Ads/),
    ).toBeVisible();
  });

  it("persists a banner choice before notifying its consumer", () => {
    const order: string[] = [];
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      key,
      value,
    ) {
      order.push("stored");
      originalSetItem.call(this, key, value);
    });

    render(
      createElement(ConsentBanner, {
        consentVersion: 2,
        onConsentChange: () => order.push("notified"),
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Terima pemasaran / Accept marketing",
      }),
    );

    expect(order).toEqual(["stored", "notified"]);
    expect(readMarketingConsent(2)).toMatchObject({
      marketing: "accepted",
      status: "known",
    });
  });

  it("keeps marketing disabled and explains the fallback after a failed write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    const onConsentChange = vi.fn();

    render(
      createElement(ConsentBanner, {
        consentVersion: 2,
        onConsentChange,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Terima pemasaran / Accept marketing",
      }),
    );

    expect(onConsentChange).toHaveBeenCalledWith({ status: "unknown" });
    expect(
      screen.getByText(
        /Kuki pemasaran kekal dimatikan.*Marketing cookies remain off/i,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Terima pemasaran / Accept marketing",
      }),
    ).toBeVisible();
  });
});
