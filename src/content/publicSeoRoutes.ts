import routeData from './publicSeoRoutes.json';

export interface PublicSeoRoute {
  path: string;
  title: string;
  description: string;
  lastModified: string;
  changeFrequency: 'daily' | 'weekly' | 'monthly';
  priority: number;
}

const CHANGE_FREQUENCIES = new Set<PublicSeoRoute['changeFrequency']>([
  'daily',
  'weekly',
  'monthly',
]);

function isPublicSeoRoute(value: unknown): value is PublicSeoRoute {
  if (typeof value !== 'object' || value === null) return false;

  const route = value as Record<string, unknown>;
  return (
    typeof route.path === 'string' &&
    typeof route.title === 'string' &&
    typeof route.description === 'string' &&
    typeof route.lastModified === 'string' &&
    typeof route.changeFrequency === 'string' &&
    CHANGE_FREQUENCIES.has(route.changeFrequency as PublicSeoRoute['changeFrequency']) &&
    typeof route.priority === 'number'
  );
}

function validatePublicSeoRoutes(value: unknown): readonly PublicSeoRoute[] {
  if (!Array.isArray(value) || !value.every(isPublicSeoRoute)) {
    throw new Error('publicSeoRoutes.json must contain valid public SEO routes');
  }

  return value;
}

export const PUBLIC_SEO_ROUTES = validatePublicSeoRoutes(routeData);
