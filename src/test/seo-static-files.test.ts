import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const robots = readFileSync('public/robots.txt', 'utf8');
const sitemap = readFileSync('public/sitemap.xml', 'utf8');

const protectedPrefixes = [
  '/clinic',
  '/staff',
  '/editor',
  '/auth',
  '/locum-register',
  '/reset-password',
  '/video-call',
  '/tv',
] as const;

const localServiceHubs = [
  '/services/rawatan-telinga-kuantan',
  '/services/minor-surgery-kutil-kuantan',
  '/services/swab-test-demam-kuantan',
  '/services/pengurusan-berat-badan-kuantan',
  '/services/sunat-kuantan',
] as const;

describe('production SEO static files', () => {
  it('uses only the canonical production host', () => {
    expect(robots).toContain('Sitemap: https://klinikawfa.com/sitemap.xml');
    expect(sitemap).not.toContain('lovable.app');

    const sitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      ([, location]) => location,
    );
    expect(sitemapLocations.length).toBeGreaterThan(0);
    expect(sitemapLocations.every((location) => location.startsWith('https://klinikawfa.com/'))).toBe(
      true,
    );
  });

  it.each(protectedPrefixes)('keeps %s out of crawl targets', (prefix) => {
    expect(robots).toContain(`Disallow: ${prefix}`);
    expect(sitemap).not.toContain(`<loc>https://klinikawfa.com${prefix}`);
  });

  it.each(localServiceHubs)('submits %s in the sitemap', (path) => {
    expect(sitemap).toContain(`<loc>https://klinikawfa.com${path}</loc>`);
  });
});
