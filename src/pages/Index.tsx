import { MainLayout } from '@/components/layout';
import { SEOHead } from '@/components/seo';
import { HomeRenderer } from '@/components/home';
import { DEFAULT_HOME_CONTENT } from '@/features/website-cms/home/homeDefaults';
import { usePublishedPage } from '@/features/website-cms/hooks/useWebsitePage';

export default function Index() {
  const content = usePublishedPage('home', DEFAULT_HOME_CONTENT);

  return (
    <MainLayout>
      <SEOHead
        title={content.seo.title.ms}
        description={content.seo.description.ms}
        url="/"
      />

      <HomeRenderer content={content} />
    </MainLayout>
  );
}
