import { MainLayout } from '@/components/layout';
import { SchemaMarkup, SEOHead } from '@/components/seo';
import { HomeRenderer } from '@/components/home';
import { DEFAULT_HOME_CONTENT } from '@/features/website-cms/home/homeDefaults';
import { usePublishedPage } from '@/features/website-cms/hooks/useWebsitePage';
import { buildClinicSchema, buildWebPageSchema } from '@/lib/website/clinicSchema';
import { SITE_ORIGIN } from '@/lib/website/seoRoutes';

export default function Index() {
  const content = usePublishedPage('home', DEFAULT_HOME_CONTENT);
  const schemas = [
    buildClinicSchema({
      telephone: '09-5751312',
      streetAddress: 'Ground Floor B2 & B4, Jalan Pahang KS 1/12, KotaSAS',
      postalCode: '25200',
      latitude: 3.8077,
      longitude: 103.326,
      openingHours: ['Mo-Su 08:00-24:00'],
    }),
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE_ORIGIN}/#website`,
      name: 'Klinik Awfa',
      url: `${SITE_ORIGIN}/`,
    },
    buildWebPageSchema({
      path: '/',
      name: content.seo.title.ms,
      description: content.seo.description.ms,
    }),
  ];

  return (
    <MainLayout>
      <SEOHead
        title={content.seo.title.ms}
        description={content.seo.description.ms}
        url="/"
      />
      <SchemaMarkup schemas={schemas} />

      <HomeRenderer content={content} />
    </MainLayout>
  );
}
