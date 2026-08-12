import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifestPath = resolve('src/content/publicSeoRoutes.json');
const sitemapPath = resolve('public/sitemap.xml');

function runGeneratorWithManifest(mutator: (routes: Array<Record<string, unknown>>) => void) {
  const originalManifest = readFileSync(manifestPath, 'utf8');
  const originalSitemap = readFileSync(sitemapPath, 'utf8');
  const routes = JSON.parse(originalManifest) as Array<Record<string, unknown>>;

  mutator(routes);
  writeFileSync(manifestPath, `${JSON.stringify(routes, null, 2)}\n`, 'utf8');

  try {
    execFileSync(process.execPath, ['scripts/generate-sitemap.mjs'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } finally {
    writeFileSync(manifestPath, originalManifest, 'utf8');
    writeFileSync(sitemapPath, originalSitemap, 'utf8');
  }
}

describe('generated public sitemap', () => {
  it('publishes the one canonical Sunat route with its truthful update date', () => {
    const sitemap = readFileSync('public/sitemap.xml', 'utf8');

    expect(sitemap).toContain('<loc>https://klinikawfa.com/services/sunat-kuantan/</loc>');
    expect(sitemap).toContain('<lastmod>2026-08-12</lastmod>');
    expect((sitemap.match(/services\/sunat-kuantan\//g) ?? [])).toHaveLength(1);
    expect(sitemap).not.toMatch(/\/(?:clinic|staff|editor|admin)(?:\/|<)/);
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

  it('rejects a Sunat lastmod that is not bound to its canonical URL', () => {
    expect(() =>
      runGeneratorWithManifest((routes) => {
        const sunatRoute = routes.find((route) => route.path === '/services/sunat-kuantan/');
        if (!sunatRoute) throw new Error('Sunat route fixture missing');
        sunatRoute.lastModified = '2026-08-11';
      }),
    ).toThrow('The sitemap must contain one /services/sunat-kuantan/ entry dated 2026-08-12.');
  });
});
