export const SITE_ORIGIN = 'https://klinikawfa.com';

export type SeoRouteDefinition = {
  path: string;
  title: string;
  description: string;
  index: boolean;
  follow: boolean;
};

const NOINDEX_PREFIXES = [
  '/clinic',
  '/staff',
  '/editor',
  '/auth',
  '/locum-register',
  '/reset-password',
  '/video-call',
  '/tv',
] as const;

const ROUTES: Record<string, SeoRouteDefinition> = {
  '/': {
    path: '/',
    title: 'Klinik Awfa KotaSAS | Klinik Keluarga di Kuantan',
    description: 'Klinik keluarga di KotaSAS, Kuantan untuk rawatan kesihatan berkualiti bagi seluruh keluarga.',
    index: true,
    follow: true,
  },
  '/services': {
    path: '/services',
    title: 'Perkhidmatan Klinik Awfa | Klinik Keluarga di Kuantan',
    description: 'Pelbagai perkhidmatan kesihatan untuk seluruh keluarga anda di Klinik Awfa Kuantan.',
    index: true,
    follow: true,
  },
};

const STATIC_PUBLIC_ROUTES = new Set([
  '/',
  '/services',
  '/doctors',
  '/doctor-on-duty',
  '/appointment',
  '/gallery',
  '/health-tips',
]);

const PUBLIC_CONTENT_ROUTE_PATTERNS = [
  /^\/services\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
  /^\/health-tips\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
  /^\/pages\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
] as const;

const PUBLIC_FALLBACK: SeoRouteDefinition = {
  path: '/',
  title: 'Klinik Awfa | Klinik Keluarga di Kuantan',
  description: 'Klinik keluarga di KotaSAS, Kuantan untuk rawatan kesihatan berkualiti bagi seluruh keluarga.',
  index: true,
  follow: true,
};

const PRIVATE_FALLBACK: SeoRouteDefinition = {
  ...PUBLIC_FALLBACK,
  index: false,
  follow: false,
};

function normalizedPath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\\/g, '/').replace(/\/+/g, '/');
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/$/, '') : '/';
}

export function isProtectedFromIndex(pathname: string): boolean {
  const path = normalizedPath(pathname);
  return NOINDEX_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function isPublicRoute(path: string): boolean {
  return (
    STATIC_PUBLIC_ROUTES.has(path) ||
    PUBLIC_CONTENT_ROUTE_PATTERNS.some((pattern) => pattern.test(path))
  );
}

export function getSeoRoute(pathname: string): SeoRouteDefinition {
  const path = normalizedPath(pathname);
  const definition = ROUTES[path];
  if (definition) return definition;
  if (isProtectedFromIndex(path) || !isPublicRoute(path)) {
    return { ...PRIVATE_FALLBACK, path };
  }
  return { ...PUBLIC_FALLBACK, path };
}

export function canonicalUrl(pathname: string): string {
  return `${SITE_ORIGIN}${normalizedPath(pathname)}`;
}

export function normalizeCanonicalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.origin === SITE_ORIGIN ? canonicalUrl(url.pathname) : null;
  } catch {
    return null;
  }
}
