import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
  title: string;
  description: string;
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
const SITE_URL = 'https://klinikawfa.com';

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
  const fullTitle = `${title} | ${SITE_NAME}`;
  const fullUrl = canonicalUrl || (url ? `${SITE_URL}${url}` : SITE_URL);
  const blockFollowing = noFollow ?? noIndex;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {(noIndex || blockFollowing) && <meta name="robots" content={`${noIndex ? 'noindex' : 'index'}, ${blockFollowing ? 'nofollow' : 'follow'}`} />}

      {/* Open Graph */}
      <meta property="og:title" content={socialTitle || fullTitle} />
      <meta property="og:description" content={socialDescription || description} />
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
      <meta name="twitter:description" content={socialDescription || description} />
      <meta name="twitter:image" content={image} />

      {/* Canonical URL */}
      <link rel="canonical" href={fullUrl} />
    </Helmet>
  );
}
