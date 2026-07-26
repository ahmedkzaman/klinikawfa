import { describe, expect, it } from 'vitest';
import { canonicalUrl, getSeoRoute, isProtectedFromIndex } from '@/lib/website/seoRoutes';

describe('SEO route policy', () => {
  it('makes the homepage authoritative for Klinik Awfa KotaSAS', () => {
    expect(getSeoRoute('/')).toMatchObject({
      title: 'Klinik Awfa KotaSAS | Klinik Keluarga di Kuantan',
      index: true,
      follow: true,
    });
    expect(canonicalUrl('/')).toBe('https://klinikawfa.com/');
  });

  it.each(['/clinic/queue', '/staff/dashboard', '/editor/home', '/auth', '/tv'])(
    'keeps operational route %s out of search',
    (path) => {
      expect(isProtectedFromIndex(path)).toBe(true);
      expect(getSeoRoute(path)).toMatchObject({ index: false, follow: false });
    },
  );

  it('normalizes query strings and trailing slashes in canonicals', () => {
    expect(canonicalUrl('/services/telinga-kuantan/?from=home')).toBe(
      'https://klinikawfa.com/services/telinga-kuantan',
    );
  });
});
