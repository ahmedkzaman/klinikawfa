import type { GoogleTrackingConfig } from "@/features/analytics/config";
import {
  type GoogleConversionEvent,
  isGoogleConversionEvent,
} from "@/features/analytics/googleEvents";
import {
  getSanitizedGoogleConversion,
  getSanitizedGooglePageView,
  type GooglePublicPathname,
} from "@/features/analytics/googleRoutePolicy";

type GoogleConsent = "denied" | "granted";

type ValidGoogleTagConfig = Readonly<{
  adsConversionId: string;
  adsConversionLabels: Readonly<Record<GoogleConversionEvent, string>>;
  measurementId: string;
}>;

const GOOGLE_TAG_ORIGIN = "https://www.googletagmanager.com";
const GOOGLE_TAG_SCRIPT_ID = "klinik-awfa-google-tag";
const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{10}$/;
const ADS_CONVERSION_ID_PATTERN = /^AW-[0-9]{9,12}$/;
const CONVERSION_LABEL_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const CONVERSION_EVENTS = Object.freeze([
  "contact_click",
  "phone_click",
  "whatsapp_click",
] as const satisfies readonly GoogleConversionEvent[]);

const DENIED_CONSENT = Object.freeze({
  ad_personalization: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  analytics_storage: "denied",
});

const GRANTED_CONSENT = Object.freeze({
  ad_personalization: "granted",
  ad_storage: "granted",
  ad_user_data: "granted",
  analytics_storage: "granted",
});

let activeConfig: ValidGoogleTagConfig | null = null;
let configured = false;
let consent: GoogleConsent | null = null;
let defaultsQueued = false;
let disabled = false;
let lastPageView: GooglePublicPathname | null = null;
let scriptFailed = false;
let scriptInjected = false;

function hasBrowserGlobals(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function queueCommand(command: GoogleDataLayerEntry): void {
  if (!hasBrowserGlobals()) return;
  window.dataLayer ??= [];
  window.dataLayer.push(command);
}

function ensureDeniedDefaults(): void {
  if (defaultsQueued || !hasBrowserGlobals()) return;
  queueCommand(["consent", "default", DENIED_CONSENT]);
  defaultsQueued = true;
}

function validateConfig(config: GoogleTrackingConfig): ValidGoogleTagConfig | null {
  if (
    !config ||
    config.provider !== "google_tag" ||
    config.enabled !== true ||
    typeof config.measurementId !== "string" ||
    !MEASUREMENT_ID_PATTERN.test(config.measurementId) ||
    typeof config.adsConversionId !== "string" ||
    !ADS_CONVERSION_ID_PATTERN.test(config.adsConversionId) ||
    !config.adsConversionLabels ||
    typeof config.adsConversionLabels !== "object" ||
    Array.isArray(config.adsConversionLabels)
  ) {
    return null;
  }

  const labelKeys = Object.keys(config.adsConversionLabels);
  if (
    labelKeys.length !== CONVERSION_EVENTS.length ||
    !labelKeys.every((key) => isGoogleConversionEvent(key))
  ) {
    return null;
  }

  const labels = {} as Record<GoogleConversionEvent, string>;
  for (const event of CONVERSION_EVENTS) {
    const label = config.adsConversionLabels[event];
    if (typeof label !== "string" || !CONVERSION_LABEL_PATTERN.test(label)) {
      return null;
    }
    labels[event] = label;
  }

  return Object.freeze({
    adsConversionId: config.adsConversionId,
    adsConversionLabels: Object.freeze(labels),
    measurementId: config.measurementId,
  });
}

function configsMatch(
  current: ValidGoogleTagConfig,
  next: ValidGoogleTagConfig,
): boolean {
  return (
    current.adsConversionId === next.adsConversionId &&
    current.measurementId === next.measurementId &&
    CONVERSION_EVENTS.every(
      (event) =>
        current.adsConversionLabels[event] === next.adsConversionLabels[event],
    )
  );
}

function injectGoogleTag(measurementId: string): boolean {
  if (!hasBrowserGlobals() || scriptFailed) return false;

  const src = `${GOOGLE_TAG_ORIGIN}/gtag/js?id=${measurementId}`;
  const existing = document.getElementById(GOOGLE_TAG_SCRIPT_ID);
  if (existing) {
    if (existing instanceof HTMLScriptElement && existing.src === src) {
      scriptInjected = true;
      return true;
    }
    scriptFailed = true;
    return false;
  }

  if (scriptInjected) return true;

  const script = document.createElement("script");
  script.id = GOOGLE_TAG_SCRIPT_ID;
  script.async = true;
  script.referrerPolicy = "no-referrer";
  script.src = src;
  script.addEventListener(
    "error",
    () => {
      scriptFailed = true;
      lastPageView = null;
    },
    { once: true },
  );

  scriptInjected = true;
  try {
    document.head.appendChild(script);
    return true;
  } catch {
    scriptFailed = true;
    return false;
  }
}

function configureGoogleTag(): void {
  if (
    disabled ||
    configured ||
    consent !== "granted" ||
    !activeConfig ||
    scriptFailed
  ) {
    return;
  }

  queueCommand(["js", new Date()]);
  queueCommand([
    "config",
    activeConfig.measurementId,
    Object.freeze({ send_page_view: false }),
  ]);
  queueCommand(["config", activeConfig.adsConversionId]);
  configured = injectGoogleTag(activeConfig.measurementId);
}

function canDispatch(): activeConfig is ValidGoogleTagConfig {
  return (
    !disabled &&
    !scriptFailed &&
    scriptInjected &&
    configured &&
    consent === "granted" &&
    activeConfig !== null
  );
}

export function initializeGoogleTag(config: GoogleTrackingConfig): void {
  if (disabled) return;
  ensureDeniedDefaults();

  const validated = validateConfig(config);
  if (!validated) {
    activeConfig = null;
    return;
  }

  if (activeConfig && !configsMatch(activeConfig, validated)) {
    disableGoogleTracking();
    return;
  }

  activeConfig = validated;
  configureGoogleTag();
}

export function updateGoogleConsent(nextConsent: GoogleConsent): void {
  if (disabled || (nextConsent !== "denied" && nextConsent !== "granted")) return;
  ensureDeniedDefaults();
  if (consent === nextConsent) return;

  consent = nextConsent;
  queueCommand([
    "consent",
    "update",
    nextConsent === "granted" ? GRANTED_CONSENT : DENIED_CONSENT,
  ]);

  if (nextConsent === "denied") {
    lastPageView = null;
    return;
  }
  configureGoogleTag();
}

export function trackGooglePageView(pathname: GooglePublicPathname): void {
  if (!canDispatch()) return;

  const sanitized = getSanitizedGooglePageView({
    hash: "",
    pathname,
    search: "",
  });
  if (!sanitized || sanitized.pathname === lastPageView) return;

  queueCommand([
    "event",
    "page_view",
    Object.freeze({
      page_path: sanitized.pathname,
      send_to: activeConfig.measurementId,
    }),
  ]);
  lastPageView = sanitized.pathname;
}

export function trackGoogleConversion(
  event: GoogleConversionEvent,
  pathname: GooglePublicPathname,
): void {
  if (!canDispatch()) return;

  const sanitized = getSanitizedGoogleConversion(event, {
    hash: "",
    pathname,
    search: "",
  });
  if (!sanitized) return;

  queueCommand([
    "event",
    sanitized.event,
    Object.freeze({
      send_to: `${activeConfig.adsConversionId}/${
        activeConfig.adsConversionLabels[sanitized.event]
      }`,
    }),
  ]);
}

export function disableGoogleTracking(): void {
  if (disabled) return;
  ensureDeniedDefaults();
  queueCommand(["consent", "update", DENIED_CONSENT]);
  consent = "denied";
  activeConfig = null;
  lastPageView = null;
  disabled = true;
}
