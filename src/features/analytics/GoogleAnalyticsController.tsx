import { type ReactNode, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { ConsentBanner } from "@/components/consent/ConsentBanner";
import {
  fetchGoogleTrackingConfig,
  type GoogleTrackingConfig,
} from "@/features/analytics/config";
import {
  getSanitizedGooglePageView,
  type GoogleRouteLocation,
} from "@/features/analytics/googleRoutePolicy";
import {
  trackGoogleConversion,
  trackGooglePageView,
  initializeGoogleTag,
  updateGoogleConsent,
} from "@/features/analytics/googleTag";
import {
  readMarketingConsent,
} from "@/features/consent/consentStore";
import type { MarketingConsent } from "@/features/consent/types";

function asRouteLocation(location: ReturnType<typeof useLocation>): GoogleRouteLocation {
  return {
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
  };
}

function getContactEvent(anchor: HTMLAnchorElement): "phone_click" | "whatsapp_click" | "contact_click" | null {
  const href = anchor.getAttribute("href")?.trim().toLowerCase() ?? "";
  if (href.startsWith("tel:")) return "phone_click";
  if (href.startsWith("https://wa.me/") || href.startsWith("https://api.whatsapp.com/")) {
    return "whatsapp_click";
  }
  if (href.startsWith("mailto:")) return "contact_click";
  return null;
}

export function GoogleAnalyticsController({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const route = asRouteLocation(location);
  const publicPage = getSanitizedGooglePageView(route);
  const publicPathname = publicPage?.pathname;
  const [config, setConfig] = useState<GoogleTrackingConfig | null | undefined>(undefined);
  const [consent, setConsent] = useState<MarketingConsent>({ status: "unknown" });
  const configRef = useRef(config);
  const consentRef = useRef(consent);
  const pageRef = useRef(publicPage);
  configRef.current = config;
  consentRef.current = consent;
  pageRef.current = publicPage;

  useEffect(() => {
    if (!publicPathname || config !== undefined) return;
    let cancelled = false;
    void fetchGoogleTrackingConfig()
      .then((nextConfig) => {
        if (!cancelled) setConfig(nextConfig);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, [config, publicPathname]);

  useEffect(() => {
    if (!publicPathname || !config?.enabled) return;
    const storedConsent = readMarketingConsent(config.consentVersion);
    setConsent(storedConsent);
    if (storedConsent.status !== "known") return;
    updateGoogleConsent(storedConsent.marketing === "accepted" ? "granted" : "denied");
    if (storedConsent.marketing !== "accepted") return;
    initializeGoogleTag(config);
    trackGooglePageView(publicPathname);
  }, [config, publicPathname]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      // Conversion classification intentionally stays limited to safe public anchors.
      const currentConfig = configRef.current;
      const currentConsent = consentRef.current;
      const currentPage = pageRef.current;
      if (!currentPage || !currentConfig?.enabled || currentConsent.status !== "known" || currentConsent.marketing !== "accepted") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      const conversion = getContactEvent(anchor);
      if (conversion) trackGoogleConversion(conversion, currentPage.pathname);
    };
    document.addEventListener("click", onDocumentClick, { capture: true, passive: true });
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, []);

  const handleConsentChange = (nextConsent: MarketingConsent) => {
    setConsent(nextConsent);
    if (!config?.enabled || nextConsent.status !== "known") return;
    updateGoogleConsent(nextConsent.marketing === "accepted" ? "granted" : "denied");
    if (nextConsent.marketing !== "accepted" || !publicPage) return;
    initializeGoogleTag(config);
    trackGooglePageView(publicPage.pathname);
  };

  if (!publicPage || !config?.enabled) return children ?? null;
  return (
    <>
      <ConsentBanner
        consentVersion={config.consentVersion}
        onConsentChange={handleConsentChange}
      />
      {children}
    </>
  );
}
