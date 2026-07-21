import {
  isGoogleConversionEvent,
  type GoogleConversionEvent,
} from "@/features/analytics/googleEvents";

const GOOGLE_PUBLIC_PATHNAMES = Object.freeze([
  "/",
  "/services",
  "/doctors",
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

function getAllowedPathname(location: GoogleRouteLocation): GooglePublicPathname | null {
  if (
    !location ||
    typeof location.pathname !== "string" ||
    location.search !== "" ||
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
