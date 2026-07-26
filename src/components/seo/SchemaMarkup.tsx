import { Helmet } from 'react-helmet-async';
import { canonicalUrl, SITE_ORIGIN } from '@/lib/website/seoRoutes';

interface ArticleSchemaProps {
  title: string;
  description: string;
  image?: string;
  url: string;
  publishedTime?: string;
  author?: string;
}

interface SchemaMarkupProps {
  schemas?: Record<string, unknown>[];
}

export function SchemaMarkup({ schemas = [] }: SchemaMarkupProps) {
  return (
    <Helmet>
      {schemas.map((schema, index) => (
        <script key={index} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}

export function ArticleSchema({
  title,
  description,
  image,
  url,
  publishedTime,
  author = 'Klinik Awfa',
}: ArticleSchemaProps) {
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: description,
    ...(image ? { image } : {}),
    url: canonicalUrl(url),
    datePublished: publishedTime,
    author: {
      '@type': 'Organization',
      name: author,
      url: canonicalUrl('/'),
    },
    publisher: {
      '@type': 'Organization',
      name: 'Klinik Awfa',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl(url),
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(articleSchema)}
      </script>
    </Helmet>
  );
}
