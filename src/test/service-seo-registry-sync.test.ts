import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = resolve(repoRoot, "scripts/prepare-public-seo-pages.mjs");
const routes = [
  "services",
  "services/rawatan-umum",
  "services/prosedur-kecil",
  "services/pemeriksaan-kesihatan",
  "services/rawatan-telinga-kuantan",
  "services/minor-surgery-kutil-kuantan",
  "services/swab-test-demam-kuantan",
  "services/pengurusan-berat-badan-kuantan",
  "services/sunat-kuantan",
];

const indexHtml = `<!doctype html><html lang="ms"><head>
<title>Fallback</title><meta name="description" content="Fallback" />
<meta name="robots" content="index, follow" /><link rel="canonical" href="https://klinikawfa.com/" />
<meta property="og:title" content="Fallback" /><meta property="og:description" content="Fallback" />
<meta property="og:url" content="https://klinikawfa.com/" /><meta property="og:image" content="https://klinikawfa.com/klinik-awfa-exterior.webp" />
<meta name="twitter:title" content="Fallback" /><meta name="twitter:description" content="Fallback" />
</head><body></body></html>`;

function createFixture() {
  const dist = mkdtempSync(resolve(tmpdir(), "klinikawfa-seo-registry-"));
  writeFileSync(resolve(dist, "index.html"), indexHtml);
  for (const route of routes) {
    const target = resolve(dist, route);
    mkdirSync(target, { recursive: true });
    cpSync(resolve(dist, "index.html"), resolve(target, "index.html"));
  }
  return dist;
}

describe("service SEO crawler sync", () => {
  it("stamps validated published Malay registry metadata into crawler HTML", () => {
    const dist = createFixture();
    try {
      const registry = [{
        path: "/services/rawatan-umum/",
        seo_ms: {
          title: "Rawatan Umum Custom",
          description: "Penerangan carian rawatan umum yang diterbitkan.",
          canonicalUrl: "",
          socialTitle: "Rawatan Umum di Klinik Awfa",
          socialDescription: "Maklumat rawatan umum di KotaSAS.",
          socialImageMediaId: null,
          index: false,
          follow: false,
        },
        seo_ms_social_image_path: "website-media/services/custom.jpg",
      }];

      execFileSync(process.execPath, [scriptPath, dist], {
        cwd: repoRoot,
        env: {
          ...process.env,
          SERVICE_SEO_REGISTRY_JSON: JSON.stringify(registry),
          VITE_SUPABASE_URL: "https://project.supabase.co",
        },
      });

      const html = readFileSync(resolve(dist, "services/rawatan-umum/index.html"), "utf8");
      expect(html).toContain('<title data-rh="true">Rawatan Umum Custom</title>');
      expect(html).toContain('name="description" content="Penerangan carian rawatan umum yang diterbitkan."');
      expect(html).toContain('name="robots" content="noindex, nofollow"');
      expect(html).toContain('property="og:title" content="Rawatan Umum di Klinik Awfa"');
      expect(html).toContain('property="og:image" content="https://project.supabase.co/storage/v1/object/public/website-media/services/custom.jpg"');
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});
