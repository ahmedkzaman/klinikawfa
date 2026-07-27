import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const siteOrigin = "https://klinikawfa.com";

const pages = {
  "services": {
    title: "Perkhidmatan Klinik Awfa | Klinik Keluarga di Kuantan",
    description: "Pelbagai perkhidmatan kesihatan untuk seluruh keluarga anda di Klinik Awfa Kuantan.",
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

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const replaceTag = (html, pattern, replacement) =>
  pattern.test(html) ? html.replace(pattern, replacement) : html.replace("</head>", `${replacement}\n</head>`);

const distDir = process.argv[2] || "dist";
const defaultImage = `${siteOrigin}/klinik-awfa-exterior.webp`;

for (const [route, metadata] of Object.entries(pages)) {
  const htmlPath = join(distDir, route, "index.html");
  let html = readFileSync(htmlPath, "utf8");
  const canonical = `${siteOrigin}/${route}/`;
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);

  html = replaceTag(html, /<title[^>]*>.*?<\/title>/i, `<title data-rh="true">${title}</title>`);
  html = replaceTag(html, /<meta[^>]+name=["']description["'][^>]*>/i, `<meta data-rh="true" name="description" content="${description}" />`);
  html = replaceTag(html, /<meta[^>]+name=["']robots["'][^>]*>/i, `<meta data-rh="true" name="robots" content="index, follow" />`);
  html = replaceTag(html, /<link[^>]+rel=["']canonical["'][^>]*>/i, `<link data-rh="true" rel="canonical" href="${canonical}" />`);
  html = replaceTag(html, /<meta[^>]+property=["']og:title["'][^>]*>/i, `<meta data-rh="true" property="og:title" content="${title}" />`);
  html = replaceTag(html, /<meta[^>]+property=["']og:description["'][^>]*>/i, `<meta data-rh="true" property="og:description" content="${description}" />`);
  html = replaceTag(html, /<meta[^>]+property=["']og:url["'][^>]*>/i, `<meta data-rh="true" property="og:url" content="${canonical}" />`);
  html = replaceTag(html, /<meta[^>]+property=["']og:image["'][^>]*>/i, `<meta data-rh="true" property="og:image" content="${defaultImage}" />`);
  html = replaceTag(html, /<meta[^>]+name=["']twitter:title["'][^>]*>/i, `<meta data-rh="true" name="twitter:title" content="${title}" />`);
  html = replaceTag(html, /<meta[^>]+name=["']twitter:description["'][^>]*>/i, `<meta data-rh="true" name="twitter:description" content="${description}" />`);

  writeFileSync(htmlPath, html);
}
