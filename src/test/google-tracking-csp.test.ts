import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const headers = readFileSync(resolve(repoRoot, "public/_headers"), "utf8");
const indexHtml = readFileSync(resolve(repoRoot, "index.html"), "utf8");
const consent = readFileSync(
  resolve(repoRoot, "src/components/consent/ConsentBanner.tsx"),
  "utf8",
);

describe("Google tracking consent boundary", () => {
  it("documents only explicit Google collection origins", () => {
    const googleOrigins = [
      "https://www.googletagmanager.com",
      "https://www.google-analytics.com",
      "https://analytics.google.com",
      "https://googleads.g.doubleclick.net",
    ];

    for (const origin of googleOrigins) expect(headers).toContain(origin);
    expect(headers).not.toMatch(/https:\s*(?:;|$)/i);
    expect(headers).not.toMatch(/(?:script-src|connect-src)[^\n]*\*/i);
    expect(headers).not.toMatch(/facebook\.com|connect\.facebook\.net|fbq/i);
    expect(headers).not.toMatch(/\bmeta\s+(?:pixel|tracking)/i);
  });

  it("keeps identifiers unset in the host documents", () => {
    expect(`${headers}\n${indexHtml}`).not.toMatch(/\b(?:G|AW)-[A-Z0-9]{6,}\b/);
  });

  it("discloses Google measurement and consent in BM and English", () => {
    expect(consent).toMatch(/Google Analytics dan Google Ads/i);
    expect(consent).toMatch(/Google Analytics and Google Ads/i);
    expect(consent).toMatch(/Terima pemasaran.*Accept marketing/i);
    expect(consent).toMatch(/Tolak pemasaran.*Reject marketing/i);
    expect(consent).toMatch(/does not erase data already\s+sent to Google/i);
    expect(consent).not.toMatch(/(?:withdraw|consent)[^.!?]{0,80}(?:erase|delete)[^.!?]{0,80}(?:already sent|transmitted)/i);
  });
});
