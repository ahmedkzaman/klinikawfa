import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('generated public sitemap', () => {
  it('publishes the one canonical Sunat route with its truthful update date', () => {
    const sitemap = readFileSync('public/sitemap.xml', 'utf8');

    expect(sitemap).toContain('<loc>https://klinikawfa.com/services/sunat-kuantan/</loc>');
    expect(sitemap).toContain('<lastmod>2026-08-12</lastmod>');
    expect((sitemap.match(/services\/sunat-kuantan\//g) ?? [])).toHaveLength(1);
    expect(sitemap).not.toMatch(/\/(?:clinic|staff|editor|admin)(?:\/|<)/);
  });
});
