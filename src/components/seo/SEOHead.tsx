import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { canonicalUrl as routeCanonicalUrl, getSeoRoute, isProtectedFromIndex, normalizeCanonicalUrl } from '@/lib/website/seoRoutes';

interface SEOHeadProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  author?: string;
  noIndex?: boolean;
  noFollow?: boolean;
  canonicalUrl?: string;
  socialTitle?: string;
  socialDescription?: string;
}

const SITE_NAME = 'Klinik Awfa';
const DEFAULT_IMAGE = 'https://klinikawfa.com/og-image.png';

export function SEOHead({
  title,
  description,
  image = DEFAULT_IMAGE,
  url,
  type = 'website',
  publishedTime,
  author,
  noIndex = false,
  noFollow,
  canonicalUrl,
  socialTitle,
  socialDescription,
}: SEOHeadProps) {
  const location = useLocation();
  const route = getSeoRoute(location.pathname);
  const protectedRoute = isProtectedFromIndex(location.pathname);
  const pageTitle = title?.trim() || route.title;
  const pageDescription = description?.trim() || route.description;
  const fullTitle = pageTitle.includes(SITE_NAME) ? pageTitle : `${pageTitle} | ${SITE_NAME}`;
  const fullUrl = (canonicalUrl && normalizeCanonicalUrl(canonicalUrl)) || (url ? routeCanonicalUrl(url) : routeCanonicalUrl(location.pathname));
  const shouldNoIndex = protectedRoute || noIndex || !route.index;
  const blockFollowing = protectedRoute || noFollow || shouldNoIndex || !route.follow;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={pageDescription} />
      <meta name="robots" content={`${shouldNoIndex ? 'noindex' : 'index'}, ${blockFollowing ? 'nofollow' : 'follow'}`} />

      {/* Open Graph */}
      <meta property="og:title" content={socialTitle || fullTitle} />
      <meta property="og:description" content={socialDescription || pageDescription} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="ms_MY" />
      <meta property="og:locale:alternate" content="en_MY" />

      {/* Article-specific */}
      {type === 'article' && publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}
      {type === 'article' && author && (
        <meta property="article:author" content={author} />
      )}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={socialTitle || fullTitle} />
      <meta name="twitter:description" content={socialDescription || pageDescription} />
      <meta name="twitter:image" content={image} />

      {/* Canonical URL */}
      <link rel="canonical" href={fullUrl} />
    </Helmet>
  );
}
