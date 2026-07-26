import { describe, expect, it } from 'vitest';
import {
  buildBreadcrumbSchema,
  buildClinicSchema,
  buildServiceSchema,
  buildWebPageSchema,
  CLINIC_ENTITY_ID,
} from '@/lib/website/clinicSchema';

describe('Klinik Awfa structured data', () => {
  it('identifies one stable medical clinic entity in KotaSAS, Kuantan', () => {
    const schema = buildClinicSchema({
      telephone: '09-5751312',
      streetAddress: 'Ground Floor B2 & B4, Jalan Pahang KS 1/12, KotaSAS',
      postalCode: '25200',
      latitude: 3.8077,
      longitude: 103.326,
      openingHours: ['Mo-Su 08:00-24:00'],
    });

    expect(schema).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'MedicalClinic',
      '@id': CLINIC_ENTITY_ID,
      name: 'Klinik Awfa',
      url: 'https://klinikawfa.com/',
      address: { addressLocality: 'Kuantan', addressRegion: 'Pahang', addressCountry: 'MY' },
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
      '@id': 'https://klinikawfa.com/services',
      url: 'https://klinikawfa.com/services',
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
      '@id': 'https://klinikawfa.com/services/rawatan-telinga#service',
      url: 'https://klinikawfa.com/services/rawatan-telinga',
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
        { '@type': 'ListItem', position: 2, name: 'Perkhidmatan', item: 'https://klinikawfa.com/services' },
      ],
    });
  });
});
