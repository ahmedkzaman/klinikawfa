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

  it.each([
    '/clinic/queue',
    '/staff/dashboard',
    '/editor/home',
    '/auth',
    '/locum-register',
    '/reset-password',
    '/video-call',
    '/tv',
  ])(
    'keeps operational route %s out of search',
    (path) => {
      expect(isProtectedFromIndex(path)).toBe(true);
      expect(getSeoRoute(path)).toMatchObject({ index: false, follow: false });
    },
  );

  it('normalizes query strings and trailing slashes in canonicals', () => {
    expect(canonicalUrl('/services/telinga-kuantan/?from=home')).toBe(
      'https://klinikawfa.com/services/telinga-kuantan/',
    );
  });

  it.each([
    '/services/rawatan-umum',
    '/health-tips/penjagaan-demam',
    '/pages/tentang-klinik',
  ])('allows a valid one-segment public content route %s', (path) => {
    expect(getSeoRoute(path)).toMatchObject({ index: true, follow: true });
  });

  it.each([
    '/pages',
    '/pages/tentang-klinik/pasukan',
    '/services/rawatan-umum/lebihan',
    '/health-tips/penjagaan-demam/lebihan',
    '/doctors/lebihan',
  ])('keeps malformed or non-page route %s out of search', (path) => {
    expect(getSeoRoute(path)).toMatchObject({ index: false, follow: false });
  });
});
