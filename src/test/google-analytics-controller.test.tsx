import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import type { GoogleTrackingConfig } from "@/features/analytics/config";

const config: GoogleTrackingConfig = {
  provider: "google_tag",
  enabled: true,
  measurementId: "G-ABC123DEF4",
  adsConversionId: "AW-123456789",
  adsConversionLabels: {
    contact_click: "ContactLabel_123",
    phone_click: "PhoneLabel_123",
    whatsapp_click: "WhatsAppLabel_123",
  },
  consentVersion: 2,
};

const fetchConfig = vi.fn();
const initializeGoogleTag = vi.fn();
const updateGoogleConsent = vi.fn();
const trackGooglePageView = vi.fn();
const trackGoogleConversion = vi.fn();

vi.mock("@/features/analytics/config", () => ({
  fetchGoogleTrackingConfig: fetchConfig,
}));
vi.mock("@/features/analytics/googleTag", () => ({
  initializeGoogleTag,
  updateGoogleConsent,
  trackGooglePageView,
  trackGoogleConversion,
}));
vi.mock("@/components/consent/ConsentBanner", () => ({
  ConsentBanner: ({ onConsentChange }: { onConsentChange: (value: unknown) => void }) => (
    <button type="button" onClick={() => onConsentChange({ status: "known", marketing: "accepted", version: 2, updatedAt: new Date().toISOString() })}>
      accept
    </button>
  ),
}));

describe("GoogleAnalyticsController", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchConfig.mockResolvedValue(config);
  });

  afterEach(() => vi.clearAllMocks());

  it("keeps tracking disabled until consent, then sends one allowed page view", async () => {
    const { GoogleAnalyticsController } = await import("@/features/analytics/GoogleAnalyticsController");
    render(
      <MemoryRouter initialEntries={["/services"]}>
        <GoogleAnalyticsController />
        <Routes><Route path="*" element={<span>page</span>} /></Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(fetchConfig).toHaveBeenCalledTimes(1));
    expect(initializeGoogleTag).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "accept" }));
    await waitFor(() => expect(initializeGoogleTag).toHaveBeenCalledWith(config));
    expect(updateGoogleConsent).toHaveBeenCalledWith("granted");
    expect(trackGooglePageView).toHaveBeenCalledWith("/services");
  });

  it("does not fetch or initialize on protected, unknown, or query routes", async () => {
    const { GoogleAnalyticsController } = await import("@/features/analytics/GoogleAnalyticsController");
    for (const entry of ["/clinic/patients", "/not-a-route", "/services?patient=123"]) {
      fetchConfig.mockClear();
      render(<MemoryRouter initialEntries={[entry]}><GoogleAnalyticsController /></MemoryRouter>);
      await act(async () => {});
      expect(fetchConfig).not.toHaveBeenCalled();
    }
  });

  it("tracks only safe public contact intents", async () => {
    const { GoogleAnalyticsController } = await import("@/features/analytics/GoogleAnalyticsController");
    const stopNavigation = (event: ReactMouseEvent<HTMLAnchorElement>) => event.preventDefault();
    render(<MemoryRouter initialEntries={["/"]}><GoogleAnalyticsController /><a href="tel:+60123456789" onClick={stopNavigation}>call</a><a href="https://wa.me/60123456789" onClick={stopNavigation}>wa</a><a href="/appointment" onClick={stopNavigation}>appointment</a></MemoryRouter>);
    await waitFor(() => expect(fetchConfig).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "accept" }));
    await waitFor(() => {
      expect(initializeGoogleTag).toHaveBeenCalled();
      expect(trackGooglePageView).toHaveBeenCalledWith("/");
    });
    // Consent changes trigger the delegated listener in a follow-up effect.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(screen.getByRole("link", { name: "call" }));
    fireEvent.click(screen.getByRole("link", { name: "wa" }));
    fireEvent.click(screen.getByRole("link", { name: "appointment" }));
    await waitFor(() => {
      expect(trackGoogleConversion).toHaveBeenCalledWith("phone_click", "/");
      expect(trackGoogleConversion).toHaveBeenCalledWith("whatsapp_click", "/");
      expect(trackGoogleConversion).toHaveBeenCalledTimes(2);
    });
  });
});
