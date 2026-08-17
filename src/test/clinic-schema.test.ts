import { cleanup, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, describe, expect, it } from 'vitest';
import { ArticleSchema } from '@/components/seo/SchemaMarkup';
import { CLINIC_INFO } from '@/lib/constants';
import {
  buildBreadcrumbSchema,
  buildClinicSchema,
  buildServiceSchema,
  buildWebPageSchema,
  CLINIC_ENTITY_ID,
  PUBLIC_CLINIC_FACTS,
} from '@/lib/website/clinicSchema';

afterEach(() => cleanup());

describe('Klinik Awfa structured data', () => {
  it('keeps the registered company name and number available for public pages', () => {
    expect(CLINIC_INFO.legalName).toBe('KUMPULAN IKRAM HEALTH TERENGGANU SDN. BHD.');
    expect(CLINIC_INFO.registrationNo).toBe('(1335162-W)');
  });

  it('identifies one stable medical clinic entity in KotaSAS, Kuantan', () => {
    const schema = buildClinicSchema(PUBLIC_CLINIC_FACTS);

    expect(schema).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'MedicalClinic',
      '@id': CLINIC_ENTITY_ID,
      name: 'Klinik Awfa',
      url: 'https://klinikawfa.com/',
      address: { addressLocality: 'Kuantan', addressRegion: 'Pahang', addressCountry: 'MY' },
    });
    expect(schema).toMatchObject({
      telephone: CLINIC_INFO.phone,
      address: {
        streetAddress: 'B2 & B4, Jalan KS 1/12, KotaSAS Avenue',
        postalCode: '25200',
      },
      geo: { latitude: 3.871944656053272, longitude: 103.27734116870465 },
    });
  });

  it('omits blank optional clinic facts', () => {
    const schema = buildClinicSchema({
      telephone: '',
      streetAddress: '',
      postalCode: '',
      latitude: undefined,
      longitude: undefined,
      openingHours: [],
    });

    expect(schema).not.toHaveProperty('telephone');
    expect(schema).not.toHaveProperty('geo');
    expect(schema).not.toHaveProperty('openingHours');
    expect(schema.address).not.toHaveProperty('streetAddress');
    expect(schema.address).not.toHaveProperty('postalCode');
  });

  it('links a canonical web page to the stable clinic entity', () => {
    expect(buildWebPageSchema({ path: '/services', name: 'Perkhidmatan Klinik Awfa' })).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': 'https://klinikawfa.com/services/',
      url: 'https://klinikawfa.com/services/',
      name: 'Perkhidmatan Klinik Awfa',
      about: { '@id': CLINIC_ENTITY_ID },
    });
  });

  it('links services to the stable clinic provider and omits blank descriptions', () => {
    const schema = buildServiceSchema({
      name: 'Rawatan Telinga',
      path: '/services/rawatan-telinga',
      description: 'Pemeriksaan dan rawatan telinga.',
    });
    const withoutDescription = buildServiceSchema({
      name: 'Rawatan Telinga',
      path: '/services/rawatan-telinga',
      description: ' ',
    });

    expect(schema).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Service',
      '@id': 'https://klinikawfa.com/services/rawatan-telinga/#service',
      url: 'https://klinikawfa.com/services/rawatan-telinga/',
      provider: { '@id': CLINIC_ENTITY_ID },
    });
    expect(withoutDescription).not.toHaveProperty('description');
  });

  it('builds ordered breadcrumbs with canonical item URLs', () => {
    expect(buildBreadcrumbSchema([
      { name: 'Utama', path: '/' },
      { name: 'Perkhidmatan', path: '/services' },
    ])).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Utama', item: 'https://klinikawfa.com/' },
        { '@type': 'ListItem', position: 2, name: 'Perkhidmatan', item: 'https://klinikawfa.com/services/' },
      ],
    });
  });

  it('omits article image and logo markup when no public asset is available', async () => {
    render(
      createElement(
        HelmetProvider,
        null,
        createElement(ArticleSchema, {
          title: 'Artikel',
          description: 'Maklumat kesihatan',
          url: '/health-tips/artikel',
        }),
      ),
    );

    await waitFor(() => {
      const script = document.head.querySelector('script[type="application/ld+json"]');
      expect(script).toBeTruthy();
      const schema = JSON.parse(script!.textContent || '{}');
      expect(schema).not.toHaveProperty('image');
      expect(schema.publisher).not.toHaveProperty('logo');
    });
  });
});
