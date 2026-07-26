import { useLocation } from 'react-router-dom';

import { getSeoRoute } from '@/lib/website/seoRoutes';

import { SEOHead } from './SEOHead';

export function RouteSeoGuard() {
  const location = useLocation();
  const route = getSeoRoute(location.pathname);

  if (route.index && route.follow) return null;

  return <SEOHead title={route.title} description={route.description} noIndex noFollow />;
}
