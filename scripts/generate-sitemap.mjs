import { readFileSync, writeFileSync } from 'node:fs';

const SITE_ORIGIN = 'https://klinikawfa.com';
const manifestPath = new URL('../src/content/publicSeoRoutes.json', import.meta.url);
const sitemapPath = new URL('../public/sitemap.xml', import.meta.url);
const privatePrefixes = [
  '/clinic',
  '/staff',
  '/editor',
  '/admin',
  '/auth',
  '/locum-register',
  '/reset-password',
  '/video-call',
  '/tv',
];
const changeFrequencies = new Set(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']);
const sunatPath = '/services/sunat-kuantan/';
const sunatLastModified = '2026-08-12';

const routes = JSON.parse(readFileSync(manifestPath, 'utf8'));

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isPrivatePath(path) {
  return privatePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function validateRoute(route, index) {
  if (!route || typeof route !== 'object') {
    throw new Error(`Route ${index} must be an object.`);
  }

  if (typeof route.path !== 'string' || !/^\/[A-Za-z0-9._~!$'()*+,;=:@%/-]*$/.test(route.path)) {
    throw new Error(`Route ${index} has an invalid public path.`);
  }

  if (isPrivatePath(route.path)) {
    throw new Error(`Route ${route.path} is private and cannot be included in the sitemap.`);
  }

  if (route.path.startsWith('/services/') && !route.path.endsWith('/')) {
    throw new Error(`Service route ${route.path} must use a trailing slash.`);
  }

  if (typeof route.lastModified !== 'string' || !isValidIsoDate(route.lastModified)) {
    throw new Error(`Route ${route.path} has an invalid lastModified date.`);
  }

  if (!changeFrequencies.has(route.changeFrequency)) {
    throw new Error(`Route ${route.path} has an invalid changeFrequency.`);
  }

  if (typeof route.priority !== 'number' || !Number.isFinite(route.priority) || route.priority < 0 || route.priority > 1) {
    throw new Error(`Route ${route.path} has an invalid priority.`);
  }
}

if (!Array.isArray(routes)) {
  throw new Error('The public sitemap manifest must be an array.');
}

const paths = new Set();
routes.forEach((route, index) => {
  validateRoute(route, index);

  if (paths.has(route.path)) {
    throw new Error(`Duplicate sitemap route: ${route.path}`);
  }

  paths.add(route.path);
});

const sunatRoutes = routes.filter((route) => route.path === sunatPath);
if (sunatRoutes.length !== 1 || sunatRoutes[0].lastModified !== sunatLastModified) {
  throw new Error(`The sitemap must contain one ${sunatPath} entry dated ${sunatLastModified}.`);
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes
  .map(
    (route) => `  <url>\n    <loc>${SITE_ORIGIN}${route.path}</loc>\n    <lastmod>${route.lastModified}</lastmod>\n    <changefreq>${route.changeFrequency}</changefreq>\n    <priority>${route.priority.toFixed(1)}</priority>\n  </url>`,
  )
  .join('\n')}\n</urlset>\n`;

writeFileSync(sitemapPath, xml, 'utf8');
