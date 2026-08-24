import {
  isGoogleConversionEvent,
  type GoogleConversionEvent,
} from "@/features/analytics/googleEvents";

const GOOGLE_PUBLIC_PATHNAMES = Object.freeze([
  "/",
  "/services",
  // Local SEO landing pages — the primary Google Ads destinations. They carry
  // fixed public slugs and contact CTAs, so they are safe conversion surfaces.
  "/services/rawatan-telinga-kuantan",
  "/services/minor-surgery-kutil-kuantan",
  "/services/swab-test-demam-kuantan",
  "/services/pengurusan-berat-badan-kuantan",
  "/services/sunat-kuantan",
  "/doctors",
  "/doctor-on-duty",
  // The appointment page pathname itself carries no PII; query strings are
  // still denied unless they contain only safe click identifiers (see below).
  "/appointment",
  "/gallery",
  "/health-tips",
  "/privacy",
  "/terms",
] as const);

export type GooglePublicPathname = (typeof GOOGLE_PUBLIC_PATHNAMES)[number];

export interface GoogleRouteLocation {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}

export type SanitizedGooglePageView = Readonly<{
  pathname: GooglePublicPathname;
}>;

export type SanitizedGoogleConversion = Readonly<{
  event: GoogleConversionEvent;
  pathname: GooglePublicPathname;
}>;

const googlePublicPathnames = new Set<string>(GOOGLE_PUBLIC_PATHNAMES);

/**
 * Query parameters that paid-traffic landing URLs legitimately carry. Every
 * Google Ads click arrives with ?gclid=... (auto-tagging), so rejecting all
 * query strings silently disabled tracking for 100% of ad traffic. These
 * values are never forwarded to Google — only the bare pathname is sent —
 * so allowing them here leaks nothing.
 */
const SAFE_QUERY_PARAMETER_NAMES = Object.freeze(
  new Set([
    // Ad click identifiers
    "gclid",
    "wbraid",
    "gbraid",
    "fbclid",
    "msclkid",
    "ttclid",
    // Referral / campaign attribution
    "ref",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
    // Google Tag Assistant debug parameters (needed to verify the setup live)
    "gtm_debug",
    "gtm_auth",
    "gtm_preview",
    "gtm_cookie_win",
  ]),
);

const SAFE_QUERY_VALUE_PATTERN = /^[A-Za-z0-9._~%+-]{0,128}$/;
const SAFE_SEARCH_MAX_LENGTH = 512;

function isSafeSearch(search: string): boolean {
  if (search === "") return true;
  if (!search.startsWith("?") || search.length > SAFE_SEARCH_MAX_LENGTH) {
    return false;
  }

  return search
    .slice(1)
    .split("&")
    .every((pair) => {
      if (pair === "") return false;
      const separator = pair.indexOf("=");
      const name = separator === -1 ? pair : pair.slice(0, separator);
      const value = separator === -1 ? "" : pair.slice(separator + 1);
      return (
        SAFE_QUERY_PARAMETER_NAMES.has(name.toLowerCase()) &&
        SAFE_QUERY_VALUE_PATTERN.test(value)
      );
    });
}

function getAllowedPathname(location: GoogleRouteLocation): GooglePublicPathname | null {
  if (
    !location ||
    typeof location.pathname !== "string" ||
    !isSafeSearch(location.search) ||
    location.hash !== ""
  ) {
    return null;
  }

  const lowercasePathname = location.pathname.toLowerCase();
  const pathname =
    lowercasePathname === "/" ? lowercasePathname : lowercasePathname.replace(/\/+$/, "");

  return googlePublicPathnames.has(pathname) ? (pathname as GooglePublicPathname) : null;
}

export function getSanitizedGooglePageView(
  location: GoogleRouteLocation,
): SanitizedGooglePageView | null {
  const pathname = getAllowedPathname(location);
  return pathname === null ? null : Object.freeze({ pathname });
}

export function isGooglePageViewAllowed(location: GoogleRouteLocation): boolean {
  return getAllowedPathname(location) !== null;
}

export function getSanitizedGoogleConversion(
  event: unknown,
  location: GoogleRouteLocation,
): SanitizedGoogleConversion | null {
  if (!isGoogleConversionEvent(event)) {
    return null;
  }

  const pathname = getAllowedPathname(location);
  return pathname === null ? null : Object.freeze({ event, pathname });
}

export function isGoogleConversionAllowed(
  event: unknown,
  location: GoogleRouteLocation,
): event is GoogleConversionEvent {
  return isGoogleConversionEvent(event) && getAllowedPathname(location) !== null;
}
