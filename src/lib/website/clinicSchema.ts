import { canonicalUrl, SITE_ORIGIN } from './seoRoutes';

export const CLINIC_ENTITY_ID = `${SITE_ORIGIN}/#clinic`;

export interface ClinicPublicFacts {
  telephone?: string;
  streetAddress?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  openingHours?: string[];
}

export interface PageSchemaInput {
  path: string;
  name: string;
  description?: string;
}

export interface ServiceSchemaInput {
  path: string;
  name: string;
  description?: string;
}

export interface BreadcrumbItem {
  path: string;
  name: string;
}

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function buildClinicSchema(input: ClinicPublicFacts): Record<string, unknown> {
  const streetAddress = nonBlank(input.streetAddress);
  const postalCode = nonBlank(input.postalCode);
  const telephone = nonBlank(input.telephone);
  const openingHours = input.openingHours?.map((hours) => hours.trim()).filter(Boolean);
  const hasCoordinates = Number.isFinite(input.latitude) && Number.isFinite(input.longitude);

  return {
    '@context': 'https://schema.org',
    '@type': 'MedicalClinic',
    '@id': CLINIC_ENTITY_ID,
    name: 'Klinik Awfa',
    url: canonicalUrl('/'),
    ...(telephone ? { telephone } : {}),
    address: {
      '@type': 'PostalAddress',
      ...(streetAddress ? { streetAddress } : {}),
      addressLocality: 'Kuantan',
      addressRegion: 'Pahang',
      ...(postalCode ? { postalCode } : {}),
      addressCountry: 'MY',
    },
    ...(hasCoordinates
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: input.latitude,
            longitude: input.longitude,
          },
        }
      : {}),
    ...(openingHours?.length ? { openingHours } : {}),
  };
}

export function buildWebPageSchema(input: PageSchemaInput): Record<string, unknown> {
  const url = canonicalUrl(input.path);
  const description = nonBlank(input.description);

  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': url,
    url,
    name: input.name,
    ...(description ? { description } : {}),
    isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
    about: { '@id': CLINIC_ENTITY_ID },
  };
}

export function buildServiceSchema(input: ServiceSchemaInput): Record<string, unknown> {
  const url = canonicalUrl(input.path);
  const description = nonBlank(input.description);

  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${url}#service`,
    name: input.name,
    ...(description ? { description } : {}),
    url,
    provider: { '@id': CLINIC_ENTITY_ID },
  };
}

export function buildBreadcrumbSchema(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  };
}
