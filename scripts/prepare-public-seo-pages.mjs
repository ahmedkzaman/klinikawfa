import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const siteOrigin = "https://klinikawfa.com";
const defaultImage = `${siteOrigin}/klinik-awfa-exterior.webp`;

const pages = {
  services: {
    title: "Perkhidmatan Klinik Awfa | Klinik Keluarga di Kuantan",
    description: "Pelbagai perkhidmatan kesihatan untuk seluruh keluarga anda di Klinik Awfa Kuantan.",
  },
  "services/rawatan-umum": {
    title: "Rawatan Umum & Penyakit Akut | Klinik Awfa Kuantan",
    description: "Rawatan umum dan penilaian penyakit akut untuk seisi keluarga di Klinik Awfa, KotaSAS, Kuantan.",
  },
  "services/prosedur-kecil": {
    title: "Prosedur Minor & Pembedahan | Klinik Awfa Kuantan",
    description: "Penilaian doktor dan prosedur minor yang sesuai di Klinik Awfa, KotaSAS, Kuantan.",
  },
  "services/pemeriksaan-kesihatan": {
    title: "Pemeriksaan Kesihatan & Pekerjaan | Klinik Awfa",
    description: "Pemeriksaan kesihatan untuk pekerjaan, pra-pekerjaan, pengajian dan keperluan majikan di KotaSAS, Kuantan.",
  },
  "services/rawatan-telinga-kuantan": {
    title: "Rawatan Telinga Kuantan | Klinik Awfa KotaSAS",
    description: "Rawatan telinga di Kuantan untuk sakit telinga, telinga tersumbat, tahi telinga dan pemeriksaan awal di Klinik Awfa KotaSAS.",
  },
  "services/minor-surgery-kutil-kuantan": {
    title: "Minor Surgery & Rawatan Kutil Kuantan | Klinik Awfa",
    description: "Minor surgery di Kuantan untuk kutil, ketumbuhan kecil, luka dan prosedur kecil yang sesuai dinilai doktor Klinik Awfa.",
  },
  "services/swab-test-demam-kuantan": {
    title: "Swab Test & Rawatan Demam Kuantan | Klinik Awfa",
    description: "Swab test dan rawatan demam di Kuantan untuk selsema, sakit tekak, batuk dan gejala jangkitan harian di Klinik Awfa.",
  },
  "services/pengurusan-berat-badan-kuantan": {
    title: "Program Kurus & Pengurusan Berat Badan Kuantan | Klinik Awfa",
    description: "Pengurusan berat badan dan program kurus di Kuantan dengan penilaian doktor, sasaran realistik dan pemantauan di Klinik Awfa.",
  },
  "services/sunat-kuantan": {
    title: "Sunat Bayi, Kanak-kanak & Dewasa Kuantan | Klinik Awfa",
    description: "Khidmat sunat bayi, kanak-kanak dan dewasa di Kuantan dengan penilaian doktor dan penjagaan selepas prosedur di Klinik Awfa.",
  },
};

const canonicalServiceRoutes = new Set(Object.keys(pages).filter((route) => route !== "services"));

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const replaceTag = (html, pattern, replacement) =>
  pattern.test(html) ? html.replace(pattern, replacement) : html.replace("</head>", `${replacement}\n</head>`);

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const validText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;

function publicImageUrl(path) {
  const base = process.env.VITE_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base || typeof path !== "string" || !path.startsWith("website-media/") || path.includes("..")) return undefined;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${encodedPath}`;
}

function validateRegistryRow(row) {
  if (!isRecord(row) || typeof row.path !== "string") return null;
  const route = row.path.replace(/^\/+|\/+$/g, "");
  if (!canonicalServiceRoutes.has(route) || !isRecord(row.seo_ms)) return null;
  const seo = row.seo_ms;
  if (!validText(seo.title, 120) || !validText(seo.description, 320)) return null;
  return {
    route,
    metadata: {
      title: seo.title.trim(),
      description: seo.description.trim(),
      socialTitle: validText(seo.socialTitle, 120) ? seo.socialTitle.trim() : seo.title.trim(),
      socialDescription: validText(seo.socialDescription, 320) ? seo.socialDescription.trim() : seo.description.trim(),
      image: publicImageUrl(row.seo_ms_social_image_path) ?? defaultImage,
      index: seo.index !== false,
      follow: seo.follow !== false,
    },
  };
}

async function loadPublishedRegistry() {
  try {
    let rows;
    if (process.env.SERVICE_SEO_REGISTRY_JSON) {
      rows = JSON.parse(process.env.SERVICE_SEO_REGISTRY_JSON);
    } else {
      const base = process.env.VITE_SUPABASE_URL?.replace(/\/+$/, "");
      const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!base || !key) return new Map();
      const response = await fetch(`${base}/rest/v1/website_service_seo?select=path,seo_ms,seo_ms_social_image_path&published_at=not.is.null`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      rows = await response.json();
    }
    if (!Array.isArray(rows)) throw new Error("registry is not an array");
    return new Map(rows.map(validateRegistryRow).filter(Boolean).map(({ route, metadata }) => [route, metadata]));
  } catch (error) {
    console.warn(`[service-seo] using checked-in crawler fallbacks: ${error instanceof Error ? error.message : "registry unavailable"}`);
    return new Map();
  }
}

const distDir = process.argv[2] || "dist";
const registry = await loadPublishedRegistry();

for (const [route, fallback] of Object.entries(pages)) {
  const metadata = registry.get(route) ?? {
    ...fallback,
    socialTitle: fallback.title,
    socialDescription: fallback.description,
    image: defaultImage,
    index: true,
    follow: true,
  };
  const htmlPath = join(distDir, route, "index.html");
  let html = readFileSync(htmlPath, "utf8");
  const canonical = `${siteOrigin}/${route}/`;
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const socialTitle = escapeHtml(metadata.socialTitle);
  const socialDescription = escapeHtml(metadata.socialDescription);
  const image = escapeHtml(metadata.image);
  const robots = `${metadata.index ? "index" : "noindex"}, ${metadata.follow && metadata.index ? "follow" : "nofollow"}`;

  html = replaceTag(html, /<title[^>]*>.*?<\/title>/i, `<title data-rh="true">${title}</title>`);
  html = replaceTag(html, /<meta[^>]+name=["']description["'][^>]*>/i, `<meta data-rh="true" name="description" content="${description}" />`);
  html = replaceTag(html, /<meta[^>]+name=["']robots["'][^>]*>/i, `<meta data-rh="true" name="robots" content="${robots}" />`);
  html = replaceTag(html, /<link[^>]+rel=["']canonical["'][^>]*>/i, `<link data-rh="true" rel="canonical" href="${canonical}" />`);
  html = replaceTag(html, /<meta[^>]+property=["']og:title["'][^>]*>/i, `<meta data-rh="true" property="og:title" content="${socialTitle}" />`);
  html = replaceTag(html, /<meta[^>]+property=["']og:description["'][^>]*>/i, `<meta data-rh="true" property="og:description" content="${socialDescription}" />`);
  html = replaceTag(html, /<meta[^>]+property=["']og:url["'][^>]*>/i, `<meta data-rh="true" property="og:url" content="${canonical}" />`);
  html = replaceTag(html, /<meta[^>]+property=["']og:image["'][^>]*>/i, `<meta data-rh="true" property="og:image" content="${image}" />`);
  html = replaceTag(html, /<meta[^>]+name=["']twitter:title["'][^>]*>/i, `<meta data-rh="true" name="twitter:title" content="${socialTitle}" />`);
  html = replaceTag(html, /<meta[^>]+name=["']twitter:description["'][^>]*>/i, `<meta data-rh="true" name="twitter:description" content="${socialDescription}" />`);
  html = replaceTag(html, /<meta[^>]+name=["']twitter:image["'][^>]*>/i, `<meta data-rh="true" name="twitter:image" content="${image}" />`);

  writeFileSync(htmlPath, html);
}
