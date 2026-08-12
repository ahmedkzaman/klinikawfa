import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifestPath = resolve('src/content/publicSeoRoutes.json');
const sitemapPath = resolve('public/sitemap.xml');

function runGeneratorWithManifest(
  mutator: (routes: Array<Record<string, unknown>>) => void,
  registry?: Array<Record<string, unknown>>,
) {
  const originalManifest = readFileSync(manifestPath, 'utf8');
  const originalSitemap = readFileSync(sitemapPath, 'utf8');
  const routes = JSON.parse(originalManifest) as Array<Record<string, unknown>>;

  mutator(routes);
  writeFileSync(manifestPath, `${JSON.stringify(routes, null, 2)}\n`, 'utf8');

  try {
    execFileSync(process.execPath, ['scripts/generate-sitemap.mjs'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_PUBLISHABLE_KEY: '',
        SERVICE_SEO_REGISTRY_JSON: registry ? JSON.stringify(registry) : '',
      },
      stdio: 'pipe',
    });
    return readFileSync(sitemapPath, 'utf8');
  } finally {
    writeFileSync(manifestPath, originalManifest, 'utf8');
    writeFileSync(sitemapPath, originalSitemap, 'utf8');
  }
}

describe('generated public sitemap', () => {
  it('publishes the one canonical Sunat route with its truthful update date', () => {
    const sitemap = runGeneratorWithManifest(() => undefined);

    expect(sitemap).toContain('<loc>https://klinikawfa.com/services/sunat-kuantan/</loc>');
    expect(sitemap).toContain('<lastmod>2026-08-12</lastmod>');
    expect((sitemap.match(/services\/sunat-kuantan\//g) ?? [])).toHaveLength(1);
    expect(sitemap).not.toMatch(/\/(?:clinic|staff|editor|admin)(?:\/|<)/);
  });

  it('uses the latest published service timestamp as a deterministic build-time lastmod overlay', () => {
    const sitemap = runGeneratorWithManifest(
      () => undefined,
      [{
        path: '/services/sunat-kuantan/',
        published_at: '2026-08-13T03:04:05.000Z',
        updated_at: '2026-08-15T10:11:12.000Z',
      }],
    );

    expect(sitemap).toMatch(
      /<loc>https:\/\/klinikawfa\.com\/services\/sunat-kuantan\/<\/loc>\s*<lastmod>2026-08-15<\/lastmod>/,
    );
    expect(sitemap).not.toMatch(
      /<loc>https:\/\/klinikawfa\.com\/services\/sunat-kuantan\/<\/loc>\s*<lastmod>2026-08-12<\/lastmod>/,
    );
  });

  it('emits canonical trailing slashes for every public location', () => {
    const sitemap = readFileSync('public/sitemap.xml', 'utf8');
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, location]) => location);

    expect(locations.every((location) => location.endsWith('/'))).toBe(true);
  });

  it('rejects a non-root public route without its canonical trailing slash', () => {
    expect(() =>
      runGeneratorWithManifest((routes) => {
        const doctorsRoute = routes.find((route) => route.path === '/doctors/');
        if (!doctorsRoute) throw new Error('Doctors route fixture missing');
        doctorsRoute.path = '/doctors-without-slash';
      }),
    ).toThrow('must use a trailing slash');
  });

  it.each(['/services/%/', '/services/%2/', '/services/%GG/'])(
    'rejects malformed percent encoding in a manifest route path: %s',
    (path) => {
      expect(() =>
        runGeneratorWithManifest((routes) => {
          routes[0].path = path;
        }),
      ).toThrow('invalid public path');
    },
  );

  it.each(['/services/%2e/', '/services/%2e%2e/'])('rejects decoded dot segments: %s', (path) => {
    expect(() =>
      runGeneratorWithManifest((routes) => {
        routes[0].path = path;
      }),
    ).toThrow('invalid public path');
  });

  it.each(['/%63linic/', '/%61dmin/'])('rejects a private route hidden by percent encoding: %s', (path) => {
    expect(() =>
      runGeneratorWithManifest((routes) => {
        routes[0].path = path;
      }),
    ).toThrow('private and cannot be included in the sitemap');
  });

});
