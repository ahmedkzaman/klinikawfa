import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

type GoogleTagModule = typeof import("@/features/analytics/googleTag");
let googleTag: GoogleTagModule;

const scriptRequests: string[] = [];

function commands(): unknown[][] {
  return (window.dataLayer ?? []).map((entry) => Array.from(entry));
}

function googleScripts(): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      'script[src^="https://www.googletagmanager.com/gtag/js"]',
    ),
  );
}

describe("Google tracking end-to-end safety gate", () => {
  beforeEach(async () => {
    vi.resetModules();
    document.head.replaceChildren();
    document.body.replaceChildren();
    delete window.dataLayer;
    scriptRequests.length = 0;
    const originalAppend = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLScriptElement) scriptRequests.push(node.src);
      return originalAppend(node);
    });
    googleTag = await import("@/features/analytics/googleTag");
  });

  afterEach(() => vi.restoreAllMocks());

  it("keeps Google completely quiet before acceptance and after rejection", () => {
    googleTag.initializeGoogleTag(config);
    googleTag.updateGoogleConsent("denied");
    googleTag.trackGooglePageView("/services");
    googleTag.trackGoogleConversion("contact_click", "/services");

    expect(googleScripts()).toHaveLength(0);
    expect(scriptRequests).toEqual([]);
    expect(commands().filter(([command]) => command === "event")).toEqual([]);
    expect(commands()[0]).toEqual([
      "consent",
      "default",
      {
        ad_personalization: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        analytics_storage: "denied",
      },
    ]);
  });

  it("loads one tag after acceptance and sends only sanitized public signals", () => {
    googleTag.initializeGoogleTag(config);
    googleTag.updateGoogleConsent("granted");
    googleTag.trackGooglePageView("/services");
    googleTag.trackGooglePageView("/services");
    googleTag.trackGooglePageView("/services?fixture=1" as "/services");
    googleTag.trackGoogleConversion("phone_click", "/services");
    googleTag.trackGoogleConversion("contact_click", "/appointment" as "/services");

    expect(googleScripts()).toHaveLength(1);
    expect(scriptRequests).toEqual([
      "https://www.googletagmanager.com/gtag/js?id=G-ABC123DEF4",
    ]);
    expect(
      commands().filter(
        ([command, event]) => command === "event" && event === "page_view",
      ),
    ).toEqual([["event", "page_view", { page_path: "/services", send_to: "G-ABC123DEF4" }]]);
    expect(
      commands().filter(
        ([command, event]) => command === "event" && event !== "page_view",
      ),
    ).toEqual([["event", "phone_click", { send_to: "AW-123456789/PhoneLabel_123" }]]);
    expect(Object.keys(commands().at(-1)?.[2] as object)).toEqual(["send_to"]);
  });

  it("stops future requests and events when tracking is withdrawn", () => {
    googleTag.initializeGoogleTag(config);
    googleTag.updateGoogleConsent("granted");
    googleTag.trackGooglePageView("/");
    googleTag.disableGoogleTracking();
    const before = commands();
    googleTag.updateGoogleConsent("granted");
    googleTag.trackGooglePageView("/doctors");
    googleTag.trackGoogleConversion("whatsapp_click", "/");

    expect(commands()).toEqual(before);
    expect(googleScripts()).toHaveLength(1);
    expect(commands().at(-1)).toEqual([
      "consent",
      "update",
      {
        ad_personalization: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        analytics_storage: "denied",
      },
    ]);
  });
});
