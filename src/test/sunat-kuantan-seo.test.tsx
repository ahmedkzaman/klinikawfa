import { describe, expect, it } from 'vitest';
import { LOCAL_SERVICE_PAGES } from '@/content/localServicePages';
import { PUBLIC_SEO_ROUTES } from '@/content/publicSeoRoutes';

describe('Sunat Kuantan SEO contract', () => {
  it('uses one canonical hub for all three patient intents', () => {
    const page = LOCAL_SERVICE_PAGES['sunat-kuantan'];
    expect(page.heading).toMatch(/Sunat.*Kuantan/i);
    expect(page.sections.map((section) => section.heading)).toEqual(
      expect.arrayContaining(['Sunat bayi', 'Sunat kanak-kanak', 'Sunat dewasa']),
    );
    expect(PUBLIC_SEO_ROUTES.filter((route) => route.path.includes('sunat'))).toEqual([
      expect.objectContaining({
        path: '/services/sunat-kuantan/',
        title: expect.stringMatching(/Sunat.*Kuantan.*Klinik Awfa/i),
      }),
    ]);
  });
});
