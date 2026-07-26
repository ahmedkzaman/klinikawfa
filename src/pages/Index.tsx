import { MainLayout } from '@/components/layout';
import { SchemaMarkup, SEOHead } from '@/components/seo';
import { HomeRenderer } from '@/components/home';
import { DEFAULT_HOME_CONTENT } from '@/features/website-cms/home/homeDefaults';
import { usePublishedPage } from '@/features/website-cms/hooks/useWebsitePage';
import { buildClinicSchema, buildWebPageSchema, PUBLIC_CLINIC_FACTS } from '@/lib/website/clinicSchema';
import { SITE_ORIGIN } from '@/lib/website/seoRoutes';

export default function Index() {
  const content = usePublishedPage('home', DEFAULT_HOME_CONTENT);
  const schemas = [
    buildClinicSchema(PUBLIC_CLINIC_FACTS),
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
