# Consent-Gated Meta Pixel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Administrator-controlled Meta Pixel that stays disabled by default, loads only after explicit Marketing consent, and sends parameter-free PageView events only from generic non-sensitive public routes.

**Architecture:** A first-party consent store, strict route classifier, idempotent Meta loader, and React controller remain separate modules. The controller combines public configuration, consent, and route state; any missing/invalid condition fails closed. A bilingual banner/settings dialog manages consent, while an Administrator-only editor page manages Pixel ID, enabled state, and consent version.

**Tech Stack:** React 18, React Router 6, TypeScript 5, TanStack Query, Supabase Postgres/RLS, Vitest, Testing Library, GitHub Pages.

## Global Constraints

- Meta's script and `noscript` image are absent from static HTML.
- Tracking configuration starts with `enabled=false` and `pixel_id=NULL`.
- Consent must be explicit, version-matched, and changeable; rejection is as prominent as acceptance.
- Consent is stored only in `localStorage` under `klinikawfa.consent`; it is never sent to Supabase.
- Only parameter-free `PageView` exists in the initial adapter. No Contact, Schedule, Lead, custom, conversion, advanced-matching, automatic-event, or custom-data call is implemented.
- Generic allowlist: `/`, `/services`, `/doctors`, `/gallery`, `/health-tips`, `/privacy`, `/terms`.
- Deny service/article/details, doctor duty, general-page slugs, appointments, auth, staff, clinic, editor, video, TV, payment, callbacks, reset, locum registration, every unrecognized route, and every URL with a query string.
- Never read or transmit form state, medical/service/article details, names, emails, phones, IDs, search terms, free text, or URL parameters.
- Website Editor cannot view or update analytics controls.
- Tracking failure never blocks page rendering, navigation, phone/WhatsApp links, or appointments.
- No Pixel ID entry, analytics enablement, production migration, or deployment occurs without its separate checkpoint.

---

### Task 1: Add public-safe tracking configuration API and Administrator editor

**Files:**
- Create: `src/features/analytics/config.ts`
- Create: `src/pages/editor/AnalyticsSettings.tsx`
- Create: `src/test/analytics-settings.test.tsx`
- Create via CLI: `supabase/migrations/*_stamp_website_tracking_settings.sql`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces `TrackingConfig = { provider: "meta_pixel"; enabled: boolean; pixelId: string | null; consentVersion: number }`.
- Produces `fetchTrackingConfig()` and `updateTrackingConfig(input)`.
- Route `/editor/analytics` remains inside `EditorProtectedRoute requireAnalyticsAdmin`.

- [ ] **Step 1: Write failing API/UI tests**

```ts
it("maps only public-safe columns", async () => {
  await fetchTrackingConfig();
  expect(selectMock).toHaveBeenCalledWith("provider,enabled,pixel_id,consent_version");
});

it("rejects invalid Pixel IDs before a request", async () => {
  await expect(updateTrackingConfig({ enabled: true, pixelId: "abc", consentVersion: 1 }))
    .rejects.toThrow("Pixel ID must contain 5 to 32 digits");
  await expect(updateTrackingConfig({ enabled: true, pixelId: null, consentVersion: 1 }))
    .rejects.toThrow("Pixel ID is required before enabling");
  expect(updateMock).not.toHaveBeenCalled();
});

it("does not render analytics settings for website_editor", () => {
  expect(renderAnalyticsRoute("website_editor").getByTestId("location"))
    .toHaveTextContent("/editor");
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npx vitest run src/test/analytics-settings.test.tsx`

Expected: FAIL because the config module and editor page do not exist.

- [ ] **Step 3: Add database-side audit stamping**

Run: `npx supabase migration new stamp_website_tracking_settings`

Add a private trigger function that rejects non-admin updates, assigns `NEW.updated_by := auth.uid()` and `NEW.updated_at := now()`, and leaves `provider` immutable. Revoke direct updates to `provider`, `updated_by`, and `updated_at`. Keep RLS `USING` and `WITH CHECK` from the foundation migration.

- [ ] **Step 4: Implement the public-safe configuration API**

```ts
const pixelIdPattern = /^[0-9]{5,32}$/;

export async function fetchTrackingConfig(): Promise<TrackingConfig | null> {
  const { data, error } = await supabase
    .from("website_tracking_settings")
    .select("provider,enabled,pixel_id,consent_version")
    .eq("provider", "meta_pixel")
    .maybeSingle();
  if (error || !data) return null;
  if (data.pixel_id !== null && !pixelIdPattern.test(data.pixel_id)) return null;
  return {
    provider: "meta_pixel",
    enabled: data.enabled,
    pixelId: data.pixel_id,
    consentVersion: data.consent_version,
  };
}
```

`updateTrackingConfig` requires a valid ID before enabling, positive integer consent version, and updates only `enabled`, `pixel_id`, `consent_version`.

- [ ] **Step 5: Build the Administrator-only settings page**

Provide fields for Pixel ID, enabled state, and consent version. Explain that the Pixel ID is public when active, tracking is PageView-only, detail/appointment routes are excluded, and increasing consent version asks visitors again. Require a confirmation dialog before changing disabled to enabled. Do not add a “test event” button because it could bypass normal visitor consent.

- [ ] **Step 6: Run tests and commit**

Run:

```powershell
npx vitest run src/test/analytics-settings.test.tsx src/test/editor-route-guard.test.tsx
npx tsc --noEmit
```

Expected: PASS.

```powershell
git add src/features/analytics/config.ts src/pages/editor/AnalyticsSettings.tsx src/test/analytics-settings.test.tsx src/App.tsx supabase/migrations
git commit -m "Add administrator analytics settings"
```

---

### Task 2: Implement the versioned first-party consent store

**Files:**
- Create: `src/features/consent/consentStore.ts`
- Create: `src/features/consent/types.ts`
- Create: `src/test/consent-store.test.ts`

**Interfaces:**
- Produces `readConsent(requiredVersion)`, `writeConsent(marketing, version)`, `clearConsent()`, `ConsentChoice`.

- [ ] **Step 1: Write failing storage tests**

```ts
it("returns unknown for missing, malformed, or stale consent", () => {
  expect(readConsent(2)).toEqual({ status: "unknown" });
  localStorage.setItem("klinikawfa.consent", "bad-json");
  expect(readConsent(2)).toEqual({ status: "unknown" });
  localStorage.setItem("klinikawfa.consent", JSON.stringify({ version: 1, marketing: "accepted", updatedAt: "2026-07-20T00:00:00.000Z" }));
  expect(readConsent(2)).toEqual({ status: "unknown" });
});

it.each(["accepted", "rejected"] as const)("persists %s", (choice) => {
  writeConsent(choice, 3);
  expect(readConsent(3)).toMatchObject({ status: "known", marketing: choice, version: 3 });
});

it("fails safely when localStorage throws", () => {
  mockStorageFailure();
  expect(readConsent(1)).toEqual({ status: "unknown" });
  expect(() => writeConsent("rejected", 1)).not.toThrow();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/test/consent-store.test.ts`

Expected: FAIL because the consent modules do not exist.

- [ ] **Step 3: Implement strict parsing and fail-safe writes**

```ts
export const CONSENT_STORAGE_KEY = "klinikawfa.consent";

export type MarketingConsent = "accepted" | "rejected";
export type ConsentRecord = {
  version: number;
  marketing: MarketingConsent;
  updatedAt: string;
};

export function readConsent(requiredVersion: number): ConsentChoice {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return { status: "unknown" };
    const value = JSON.parse(raw) as Partial<ConsentRecord>;
    if (
      value.version !== requiredVersion ||
      (value.marketing !== "accepted" && value.marketing !== "rejected") ||
      typeof value.updatedAt !== "string"
    ) return { status: "unknown" };
    return { status: "known", ...value } as ConsentChoice;
  } catch {
    return { status: "unknown" };
  }
}
```

Writes catch storage errors. The React provider keeps the explicit current-session choice in memory so consent works for that tab even when persistence is unavailable.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run src/test/consent-store.test.ts`

Expected: PASS.

```powershell
git add src/features/consent src/test/consent-store.test.ts
git commit -m "Add versioned marketing consent storage"
```

---

### Task 3: Implement the healthcare-safe route classifier

**Files:**
- Create: `src/features/analytics/routePolicy.ts`
- Create: `src/test/meta-route-policy.test.ts`

**Interfaces:**
- Produces `isMetaPageViewAllowed(location: Pick<Location,"pathname"|"search">): boolean`.

- [ ] **Step 1: Write the complete allow/deny table**

```ts
const allowed = ["/", "/services", "/doctors", "/gallery", "/health-tips", "/privacy", "/terms"];
const denied = [
  "/services/rawatan-umum",
  "/health-tips/denggi",
  "/doctor-on-duty",
  "/pages/about",
  "/appointment",
  "/auth",
  "/staff/dashboard",
  "/clinic/queue",
  "/editor",
  "/video-call",
  "/tv",
  "/reset-password",
  "/locum-register",
  "/unknown",
];

it.each(allowed)("allows %s without query", (pathname) => {
  expect(isMetaPageViewAllowed({ pathname, search: "" })).toBe(true);
});

it.each(denied)("denies %s", (pathname) => {
  expect(isMetaPageViewAllowed({ pathname, search: "" })).toBe(false);
});

it.each(allowed)("denies query string on %s", (pathname) => {
  expect(isMetaPageViewAllowed({ pathname, search: "?utm_source=meta" })).toBe(false);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/test/meta-route-policy.test.ts`

Expected: FAIL because `routePolicy.ts` does not exist.

- [ ] **Step 3: Implement exact-match fail-closed classification**

```ts
const META_GENERIC_ROUTES = new Set([
  "/",
  "/services",
  "/doctors",
  "/gallery",
  "/health-tips",
  "/privacy",
  "/terms",
]);

export function isMetaPageViewAllowed(location: { pathname: string; search: string }): boolean {
  return location.search === "" && META_GENERIC_ROUTES.has(location.pathname);
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run src/test/meta-route-policy.test.ts`

Expected: PASS.

```powershell
git add src/features/analytics/routePolicy.ts src/test/meta-route-policy.test.ts
git commit -m "Add healthcare safe Meta route policy"
```

---

### Task 4: Implement the idempotent parameter-free Meta loader

**Files:**
- Create: `src/features/analytics/metaPixel.ts`
- Create: `src/features/analytics/metaPixel-globals.d.ts`
- Create: `src/test/meta-pixel.test.ts`

**Interfaces:**
- Produces `initializeMetaPixel(pixelId)`, `trackMetaPageView()`, `revokeMetaConsent()`, `removeFirstPartyMetaCookies()`.
- No exported generic `track(name, data)` function exists.

- [ ] **Step 1: Write failing loader tests**

Test valid digit ID, one script node after repeated initialization, exact source `https://connect.facebook.net/en_US/fbevents.js`, no automatic advanced-matching object, disabled automatic configuration, only `PageView` with no third argument, revoke behavior, and removal attempts for `_fbp` and `_fbc` only.

Also assert source text contains no `trackCustom`, no event-name string literals `"Contact"`, `"Schedule"`, `"Lead"`, or `"Purchase"`, no advanced-matching keys matching `/["'](?:em|ph|fn|ln)["']/`, and no `noscript` image.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/test/meta-pixel.test.ts`

Expected: FAIL because `metaPixel.ts` does not exist.

- [ ] **Step 3: Implement one narrow adapter**

In `metaPixel-globals.d.ts`, declare the narrow browser API without exposing a generic application tracking function:

```ts
type KlinikAwfaFbq = ((command: string, ...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  loaded?: boolean;
  version?: string;
};

interface Window {
  fbq?: KlinikAwfaFbq;
  _fbq?: KlinikAwfaFbq;
}
```

In `metaPixel.ts`, implement only the consent-aware loader and parameter-free PageView call:

```ts
const initializedPixelIds = new Set<string>();

function createQueuedFbq(): KlinikAwfaFbq {
  const fbq = ((...args: unknown[]) => {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue?.push(args);
  }) as KlinikAwfaFbq;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  return fbq;
}

export function initializeMetaPixel(pixelId: string): boolean {
  if (!/^[0-9]{5,32}$/.test(pixelId)) return false;
  if (!window.fbq) window.fbq = createQueuedFbq();
  if (!document.querySelector('script[data-klinik-awfa-meta="true"]')) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.dataset.klinikAwfaMeta = "true";
    document.head.appendChild(script);
  }
  window.fbq("consent", "grant");
  if (!initializedPixelIds.has(pixelId)) {
    window.fbq("set", "autoConfig", false, pixelId);
    window.fbq("init", pixelId);
    initializedPixelIds.add(pixelId);
  }
  return true;
}

export function trackMetaPageView(): void {
  window.fbq?.("track", "PageView");
}

export function revokeMetaConsent(): void {
  window.fbq?.("consent", "revoke");
}

export function removeFirstPartyMetaCookies(): void {
  for (const name of ["_fbp", "_fbc"] as const) {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    if (location.hostname === "klinikawfa.com" || location.hostname.endsWith(".klinikawfa.com")) {
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.klinikawfa.com; SameSite=Lax`;
    }
  }
}
```

Do not accept an event payload. Guard repeated initialization by Pixel ID and deduplicate PageView in the controller, not by permitting arbitrary event keys. Immediately before implementation, compare the `set`/`init` sequence with Meta's current manual-install guidance; if disabling automatic configuration before initialization is no longer supported, stop rather than silently enabling automatic events.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run src/test/meta-pixel.test.ts`

Expected: PASS.

```powershell
git add src/features/analytics/metaPixel.ts src/features/analytics/metaPixel-globals.d.ts src/test/meta-pixel.test.ts
git commit -m "Add minimal consent aware Meta loader"
```

---

### Task 5: Combine configuration, consent, and routing in one controller

**Files:**
- Create: `src/features/analytics/AnalyticsController.tsx`
- Create: `src/features/consent/ConsentProvider.tsx`
- Create: `src/test/analytics-controller.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces `useConsent()` with `choice`, `acceptMarketing`, `rejectMarketing`, `withdrawMarketing`, `openSettings`.
- Controller renders no visible UI and emits at most one PageView per allowed pathname.

- [ ] **Step 1: Write the state-matrix tests**

Assert zero initialization when config is missing/disabled/invalid, consent unknown/rejected, route denied, or query present. Assert one initialization and PageView after accepted current-version consent on an allowed route. Assert SPA dedupe, denied-route revocation, return-to-allowed grant/PageView, and withdrawal stops calls and triggers a tracking-disabled reload.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/test/analytics-controller.test.tsx`

Expected: FAIL because providers do not exist.

- [ ] **Step 3: Implement fail-closed orchestration**

```tsx
const allowed = isMetaPageViewAllowed({ pathname: location.pathname, search: location.search });
const active = Boolean(
  config?.enabled &&
  config.pixelId &&
  consent.status === "known" &&
  consent.marketing === "accepted" &&
  consent.version === config.consentVersion &&
  allowed,
);

useEffect(() => {
  if (!active || !config?.pixelId) {
    revokeMetaConsent();
    return;
  }
  if (!initializeMetaPixel(config.pixelId)) return;
  const key = location.pathname;
  if (lastPageView.current !== key) {
    trackMetaPageView();
    lastPageView.current = key;
  }
}, [active, config?.pixelId, location.pathname]);
```

Mount `ConsentProvider` and `AnalyticsController` inside `BrowserRouter`, after configuration/query providers, and outside public page components. Catch all analytics errors internally.

- [ ] **Step 4: Run tests and commit**

Run:

```powershell
npx vitest run src/test/analytics-controller.test.tsx src/test/meta-route-policy.test.ts src/test/meta-pixel.test.ts
npx tsc --noEmit
```

Expected: PASS.

```powershell
git add src/features/analytics/AnalyticsController.tsx src/features/consent/ConsentProvider.tsx src/App.tsx src/test/analytics-controller.test.tsx
git commit -m "Gate Meta PageView by consent and route"
```

---

### Task 6: Add bilingual consent UI, privacy notice, and withdrawal control

**Files:**
- Create: `src/components/consent/ConsentBanner.tsx`
- Create: `src/components/consent/ConsentSettingsDialog.tsx`
- Create: `src/features/consent/legalDefaults.ts`
- Create: `src/pages/Privacy.tsx`
- Create: `src/pages/Terms.tsx`
- Create: `src/test/consent-ui.test.tsx`
- Create: `src/test/legal-content-seed.test.ts`
- Create via CLI: `supabase/migrations/*_seed_privacy_terms_content.sql`
- Modify: `src/components/layout/Footer.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Banner appears only when tracking is configured/enabled and current-version choice is unknown.
- Footer “Cookie settings / Tetapan kuki” always reopens settings when the feature exists.

- [ ] **Step 1: Write failing consent UI tests**

Test equal prominence for Necessary only and Accept marketing, BM/English copy, keyboard/focus behavior, no default acceptance, settings reopening, withdrawal, disabled feature behavior, and no event/test request from the dialog.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/test/consent-ui.test.tsx`

Expected: FAIL because consent components/pages do not exist.

- [ ] **Step 3: Implement the non-dark-pattern banner and settings dialog**

Both primary choices use the same size and prominence. Necessary only must not be hidden in a secondary dialog. The Marketing explanation states that Meta may use cookies and generic page visits for advertising measurement, that medical/detail/appointment activity is excluded, and that withdrawal affects future collection only.

- [ ] **Step 4: Add CMS-backed BM/English Privacy and Terms routes**

Define `DEFAULT_PRIVACY_CONTENT` and `DEFAULT_TERMS_CONTENT` using the Plan 2 general-page schema. `Privacy.tsx` and `Terms.tsx` call `usePublishedPage` with those bundled fallbacks and render through `GeneralPageRenderer`, so both pages stay available when CMS data is missing. Website Editors can edit the existing `system_content` rows through `/editor/pages`, but cannot change their reserved slugs.

Privacy must name Meta, list the seven generic route paths, state PageView-only/no parameters, explain local consent storage and withdrawal, and link to Meta's privacy/choice information. It must not claim legal compliance or claim previously sent events can be deleted locally.

Run `npx supabase migration new seed_privacy_terms_content`. The migration inserts two `website_pages` rows only when absent: `kind='system_content'`, reserved slugs `privacy` and `terms`, exact validated fallback payloads, `status='published'`, revision `1`. If either row exists with a different payload, raise rather than overwrite. `legal-content-seed.test.ts` must parse SQL JSON and prove exact equality with the TypeScript defaults. The migration creates no draft because it must not fabricate an auth user; an authenticated editor creates the private draft on first edit.

- [ ] **Step 5: Run accessibility, UI, and route tests**

Run:

```powershell
npx vitest run src/test/consent-ui.test.tsx src/test/analytics-controller.test.tsx src/test/legal-content-seed.test.ts
npx tsc --noEmit
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit consent UI**

```powershell
git add src/components/consent src/features/consent/legalDefaults.ts src/pages/Privacy.tsx src/pages/Terms.tsx src/components/layout/Footer.tsx src/App.tsx src/test/consent-ui.test.tsx src/test/legal-content-seed.test.ts supabase/migrations
git commit -m "Add bilingual marketing consent controls"
```

---

### Task 7: Document CSP hosting limits and validate the exact Meta origins

**Files:**
- Modify: `public/_headers`
- Create: `src/test/meta-csp-contract.test.ts`
- Create: `docs/security/meta-pixel-csp.md`

**Interfaces:**
- Meta origin contract: script `https://connect.facebook.net`; collection image/connect `https://www.facebook.com`.

- [ ] **Step 1: Write a failing source/origin contract test**

Assert the loader contains only the exact script URL, no wildcard Meta hostname, and `_headers` documents only the two Meta origins. Assert `index.html` contains no static Meta script or tracking image.

- [ ] **Step 2: Update `_headers` as documentation without claiming GitHub Pages enforcement**

Keep the file comment-only. Add exact Meta origins to the documented `script-src`, `connect-src`, and `img-src`. Do not add blanket sources beyond those already documented. In `docs/security/meta-pixel-csp.md`, state that GitHub Pages does not consume `_headers`; effective response-header CSP requires a supported reverse proxy such as Cloudflare and is a separate deployment decision.

Do not add an enforcing meta CSP in this task because the existing clinic app uses Supabase, Google Maps, Google Fonts, Google Storage, jsDelivr face models, ElevenLabs, YouTube, and user-managed media. A complete origin inventory and browser regression must precede global enforcement.

- [ ] **Step 3: Run contract tests**

Run: `npx vitest run src/test/meta-csp-contract.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit CSP documentation**

```powershell
git add public/_headers src/test/meta-csp-contract.test.ts docs/security/meta-pixel-csp.md
git commit -m "Document Meta Pixel CSP boundary"
```

---

### Task 8: Complete disabled-state and consented browser-network verification

**Files:**
- Create: `docs/security/meta-pixel-validation.md`
- Modify: `.github/workflows/security-gate.yml`

**Interfaces:**
- Produces evidence without Pixel ID values, cookies, identifiers, or request payload dumps.

- [ ] **Step 1: Add focused tests to the Security Gate**

Keep existing steps unchanged and ensure `npm test` covers consent/analytics tests. Add a source scan that fails if `fbq(` appears outside `src/features/analytics/metaPixel.ts` or if `connect.facebook.net` appears in `index.html`.

- [ ] **Step 2: Verify production-disabled state**

With `enabled=false`, inspect `/`, all seven generic routes, service/article detail, appointment, auth, editor, staff, and clinic paths. Expected: zero request to `facebook.com` or `connect.facebook.net`, regardless of locally stored acceptance.

Before staging enablement, re-read the current Meta Business Tools Terms and Pixel setup guidance. Stop and keep the feature disabled if the current terms prohibit the proposed parameter-free generic PageView use or require controls not present in this plan. Visitor consent never authorizes sharing health or other sensitive information.

- [ ] **Step 3: Verify consent choices in sanitized staging**

With a test Pixel ID configured only in sanitized staging:

- unknown consent: zero Meta request;
- Necessary only: zero Meta request after reload/navigation;
- Accept marketing on `/`: one script load and one parameter-free PageView;
- allowed SPA navigation: one PageView per distinct generic path;
- service/article detail, appointment, editor, auth, protected, unknown, and query-string routes: zero new event;
- withdrawal: no new Meta request after tracking-disabled reload and best-effort deletion of Klinik-domain `_fbp`/`_fbc`.

- [ ] **Step 4: Run the full release gate**

Run:

```powershell
npm run lint:changed
npx tsc --noEmit
npm test
npm run build
npm run build:dev
npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org/
```

Expected: PASS; audit high and critical counts are zero.

- [ ] **Step 5: Commit validation evidence and stop**

```powershell
git add .github/workflows/security-gate.yml docs/security/meta-pixel-validation.md
git commit -m "Validate consent gated Meta Pixel"
```

Do not enter a production Pixel ID, enable production analytics, apply the production migration, or deploy until the corresponding approvals are recorded. Even after code deployment, keep production `enabled=false` until the final privacy notice and Meta account configuration have been reviewed.
