import { describe, expect, it } from "vitest";

import {
  GOOGLE_CONVERSION_EVENT_NAMES,
  type GoogleConversionEvent,
} from "@/features/analytics/googleEvents";
import {
  getSanitizedGoogleConversion,
  getSanitizedGooglePageView,
  isGoogleConversionAllowed,
  isGooglePageViewAllowed,
} from "@/features/analytics/googleRoutePolicy";

const PUBLIC_PATHS = [
  "/",
  "/services",
  "/doctors",
  "/gallery",
  "/health-tips",
  "/privacy",
  "/terms",
] as const;

function location(pathname: string, search = "", hash = "") {
  return { pathname, search, hash };
}

describe("Google route policy", () => {
  it("allows only the seven exact public pathnames", () => {
    for (const pathname of PUBLIC_PATHS) {
      expect(isGooglePageViewAllowed(location(pathname))).toBe(true);
      expect(getSanitizedGooglePageView(location(pathname))).toEqual({ pathname });
    }
  });

  it("normalizes only pathname casing and trailing slashes", () => {
    expect(getSanitizedGooglePageView(location("/SERVICES///"))).toEqual({
      pathname: "/services",
    });
    expect(getSanitizedGooglePageView(location("/HEALTH-TIPS/"))).toEqual({
      pathname: "/health-tips",
    });

    for (const pathname of [
      " /services",
      "/services/child",
      "/services/.",
      "/services%2f",
      "//services",
      "https://klinikawfa.example/services",
    ]) {
      expect(isGooglePageViewAllowed(location(pathname))).toBe(false);
    }
  });

  it("denies details, dynamic pages, and doctor-on-duty", () => {
    for (const pathname of [
      "/services/fever",
      "/health-tips/diabetes",
      "/pages/privacy",
      "/pages/terms",
      "/doctor-on-duty",
    ]) {
      expect(isGooglePageViewAllowed(location(pathname))).toBe(false);
    }
  });

  it("denies appointment, auth, staff, clinic, editor, payment, callback, and unknown routes", () => {
    for (const pathname of [
      "/appointment",
      "/appointment/confirmation",
      "/auth",
      "/auth/callback",
      "/reset-password",
      "/staff",
      "/staff/dashboard",
      "/clinic",
      "/clinic/appointments",
      "/editor",
      "/editor/analytics",
      "/payment",
      "/payments/callback",
      "/callback",
      "/video-call",
      "/contact",
      "/not-a-route",
    ]) {
      expect(isGooglePageViewAllowed(location(pathname))).toBe(false);
    }
  });

  it("denies every non-empty query string or fragment", () => {
    for (const [search, hash] of [
      ["?utm_source=private", ""],
      ["?", ""],
      ["", "#contact"],
      ["", "#"],
      ["?patient=123", "#appointment"],
    ]) {
      expect(isGooglePageViewAllowed(location("/services", search, hash))).toBe(false);
      expect(getSanitizedGooglePageView(location("/services", search, hash))).toBeNull();
    }
  });

  it("returns a pathname-only page-view object without reading or copying extra data", () => {
    let referrerRead = false;
    const unsafeLocation = Object.defineProperty(
      {
        pathname: "/SERVICES/",
        search: "",
        hash: "",
        formData: { symptom: "private" },
        patientId: "patient-123",
      },
      "referrer",
      {
        enumerable: true,
        get: () => {
          referrerRead = true;
          return "https://example.test/private";
        },
      },
    );

    expect(getSanitizedGooglePageView(unsafeLocation)).toEqual({
      pathname: "/services",
    });
    expect(referrerRead).toBe(false);
  });
});

describe("Google conversion policy", () => {
  it("exposes exactly the three typed generic contact-intent event names", () => {
    const typedNames: readonly GoogleConversionEvent[] = GOOGLE_CONVERSION_EVENT_NAMES;

    expect(typedNames).toEqual([
      "contact_click",
      "phone_click",
      "whatsapp_click",
    ]);
  });

  it("allows fixed contact-intent conversions only on allowed clean public routes", () => {
    for (const event of GOOGLE_CONVERSION_EVENT_NAMES) {
      expect(isGoogleConversionAllowed(event, location("/PRIVACY/"))).toBe(true);
      expect(getSanitizedGoogleConversion(event, location("/PRIVACY/"))).toEqual({
        event,
        pathname: "/privacy",
      });
      expect(isGoogleConversionAllowed(event, location("/appointment"))).toBe(false);
      expect(isGoogleConversionAllowed(event, location("/privacy", "?patient=123"))).toBe(
        false,
      );
      expect(isGoogleConversionAllowed(event, location("/privacy", "", "#form"))).toBe(false);
    }
  });

  it("denies healthcare, operational, identifier-bearing, and arbitrary events", () => {
    for (const event of [
      "appointment_booked",
      "appointment_submitted",
      "patient_registered",
      "symptom_selected",
      "service_selected",
      "diagnosis_recorded",
      "prescription_created",
      "payment_completed",
      "login",
      "staff_punch",
      "editor_publish",
      "contact_click_patient_123",
      "custom_event",
      "",
      null,
      { event: "contact_click", patientId: "patient-123" },
    ]) {
      expect(isGoogleConversionAllowed(event, location("/"))).toBe(false);
      expect(getSanitizedGoogleConversion(event, location("/"))).toBeNull();
    }
  });

  it("returns only a fixed event name and sanitized pathname", () => {
    const input = {
      pathname: "/GALLERY/",
      search: "",
      hash: "",
      referrer: "https://example.test/appointment?patient=123",
      formData: { message: "private" },
      email: "patient@example.test",
    };

    expect(getSanitizedGoogleConversion("contact_click", input)).toEqual({
      event: "contact_click",
      pathname: "/gallery",
    });
  });
});
