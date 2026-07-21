import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GoogleTrackingConfig } from "@/features/analytics/config";

type GoogleTagModule = typeof import("@/features/analytics/googleTag");

const validConfig: GoogleTrackingConfig = {
  adsConversionId: "AW-123456789",
  adsConversionLabels: {
    contact_click: "ContactLabel_123",
    phone_click: "PhoneLabel_123",
    whatsapp_click: "WhatsAppLabel_123",
  },
  consentVersion: 2,
  enabled: true,
  measurementId: "G-ABC123DEF4",
  provider: "google_tag",
};

let googleTag: GoogleTagModule;

function dataLayerCommands(): unknown[][] {
  return (window.dataLayer ?? []).map((entry) => Array.from(entry));
}

function commandNames(): unknown[] {
  return dataLayerCommands().map(([command]) => command);
}

function scripts(): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      'script[src^="https://www.googletagmanager.com/gtag/js"]',
    ),
  );
}

describe("consent-aware Google tag loader", () => {
  beforeEach(async () => {
    vi.resetModules();
    document.head.replaceChildren();
    document.body.replaceChildren();
    delete window.dataLayer;
    googleTag = await import("@/features/analytics/googleTag");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queues all four denied defaults locally before any config or event", () => {
    googleTag.initializeGoogleTag(validConfig);

    expect(dataLayerCommands()).toEqual([
      [
        "consent",
        "default",
        {
          ad_personalization: "denied",
          ad_storage: "denied",
          ad_user_data: "denied",
          analytics_storage: "denied",
        },
      ],
    ]);
    expect(scripts()).toHaveLength(0);
    expect(commandNames()).not.toContain("config");
    expect(commandNames()).not.toContain("event");
    expect((window as unknown as Record<string, unknown>).gtag).toBeUndefined();
  });

  it.each([
    ["disabled config", { enabled: false }],
    ["wrong provider", { provider: "other" }],
    ["invalid measurement ID", { measurementId: "UA-12345" }],
    ["invalid Ads ID", { adsConversionId: "AW-bad" }],
    [
      "missing fixed label",
      {
        adsConversionLabels: {
          contact_click: "ContactLabel_123",
          phone_click: "PhoneLabel_123",
        },
      },
    ],
    [
      "arbitrary label key",
      {
        adsConversionLabels: {
          ...validConfig.adsConversionLabels,
          patient_registered: "PatientLabel",
        },
      },
    ],
    [
      "invalid label characters",
      {
        adsConversionLabels: {
          ...validConfig.adsConversionLabels,
          contact_click: "contact/label?patient=123",
        },
      },
    ],
  ])("fails closed for a %s", (_name, override) => {
    googleTag.initializeGoogleTag({
      ...validConfig,
      ...override,
    } as GoogleTrackingConfig);
    googleTag.updateGoogleConsent("granted");
    googleTag.trackGooglePageView("/services");

    expect(scripts()).toHaveLength(0);
    expect(commandNames()).not.toContain("config");
    expect(commandNames()).not.toContain("event");
  });

  it("injects the official tag once and deduplicates configuration", () => {
    googleTag.initializeGoogleTag(validConfig);
    googleTag.initializeGoogleTag(validConfig);
    googleTag.updateGoogleConsent("granted");
    googleTag.updateGoogleConsent("granted");
    googleTag.initializeGoogleTag(validConfig);

    expect(scripts()).toHaveLength(1);
    expect(scripts()[0]).toMatchObject({
      async: true,
      referrerPolicy: "no-referrer",
      src: "https://www.googletagmanager.com/gtag/js?id=G-ABC123DEF4",
    });

    const commands = dataLayerCommands();
    expect(commands[0]).toEqual([
      "consent",
      "default",
      {
        ad_personalization: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        analytics_storage: "denied",
      },
    ]);
    expect(commands.filter(([command]) => command === "consent")).toEqual([
      commands[0],
      [
        "consent",
        "update",
        {
          ad_personalization: "granted",
          ad_storage: "granted",
          ad_user_data: "granted",
          analytics_storage: "granted",
        },
      ],
    ]);
    expect(commands.filter(([command]) => command === "js")).toHaveLength(1);
    expect(commands.filter(([command]) => command === "config")).toEqual([
      ["config", "G-ABC123DEF4", { send_page_view: false }],
      ["config", "AW-123456789"],
    ]);
  });

  it("dispatches one pathname-only page view for each consecutive public route", () => {
    googleTag.initializeGoogleTag(validConfig);
    googleTag.updateGoogleConsent("granted");

    googleTag.trackGooglePageView("/services");
    googleTag.trackGooglePageView("/services");
    googleTag.trackGooglePageView("/doctors");
    googleTag.trackGooglePageView("/services?patient=123" as "/services");
    googleTag.trackGooglePageView("/privacy#form" as "/privacy");
    googleTag.trackGooglePageView("/clinic/patients" as "/services");

    expect(
      dataLayerCommands().filter(
        ([command, event]) => command === "event" && event === "page_view",
      ),
    ).toEqual([
      [
        "event",
        "page_view",
        { page_path: "/services", send_to: "G-ABC123DEF4" },
      ],
      [
        "event",
        "page_view",
        { page_path: "/doctors", send_to: "G-ABC123DEF4" },
      ],
    ]);
  });

  it("dispatches Ads conversions with only the fixed event and send_to label", () => {
    googleTag.initializeGoogleTag(validConfig);
    googleTag.updateGoogleConsent("granted");

    googleTag.trackGoogleConversion("contact_click", "/services");
    googleTag.trackGoogleConversion(
      "patient_registered" as "contact_click",
      "/services",
    );
    googleTag.trackGoogleConversion("phone_click", "/privacy?patient=123" as "/privacy");
    googleTag.trackGoogleConversion("whatsapp_click", "/clinic/patients" as "/privacy");

    const conversions = dataLayerCommands().filter(
      ([command, event]) => command === "event" && event !== "page_view",
    );
    expect(conversions).toEqual([
      [
        "event",
        "contact_click",
        { send_to: "AW-123456789/ContactLabel_123" },
      ],
    ]);
    expect(Object.keys(conversions[0][2] as object)).toEqual(["send_to"]);
  });

  it("queues denied withdrawal and permanently blocks future calls after disable", () => {
    googleTag.initializeGoogleTag(validConfig);
    googleTag.updateGoogleConsent("granted");
    googleTag.trackGooglePageView("/services");

    googleTag.disableGoogleTracking();
    const commandsAfterDisable = dataLayerCommands();
    expect(commandsAfterDisable.at(-1)).toEqual([
      "consent",
      "update",
      {
        ad_personalization: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        analytics_storage: "denied",
      },
    ]);

    googleTag.updateGoogleConsent("granted");
    googleTag.initializeGoogleTag(validConfig);
    googleTag.trackGooglePageView("/doctors");
    googleTag.trackGoogleConversion("phone_click", "/doctors");

    expect(dataLayerCommands()).toEqual(commandsAfterDisable);
    expect(scripts()).toHaveLength(1);
  });

  it("exposes only the five narrow tracking operations", () => {
    expect(Object.keys(googleTag).sort()).toEqual([
      "disableGoogleTracking",
      "initializeGoogleTag",
      "trackGoogleConversion",
      "trackGooglePageView",
      "updateGoogleConsent",
    ]);
  });
});
