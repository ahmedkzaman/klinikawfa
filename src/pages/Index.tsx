import { Fragment, type ReactNode } from 'react';
import { MainLayout } from '@/components/layout';
import { SEOHead } from '@/components/seo';
import {
  HeroCarousel,
  WhySection,
  VideoSection,
  ServicesPreview,
  GalleryStrip,
  TestimonialsSection,
  MapSection,
} from '@/components/home';
import { DEFAULT_HOME_CONTENT } from '@/features/website-cms/home/homeDefaults';
import { usePublishedPage } from '@/features/website-cms/hooks/useWebsitePage';
import type { HomeSectionId } from '@/features/website-cms/schemas/home';

export default function Index() {
  const content = usePublishedPage('home', DEFAULT_HOME_CONTENT);
  const HOME_SECTION_RENDERERS: Record<HomeSectionId, () => ReactNode> = {
    hero: () => <HeroCarousel content={content.hero} />,
    why: () => <WhySection content={content.why} />,
    video: () => <VideoSection content={content.video} />,
    services: () => <ServicesPreview content={content.services} />,
    gallery: () => <GalleryStrip content={content.gallery} />,
    testimonials: () => <TestimonialsSection content={content.testimonials} />,
    map: () => <MapSection content={content.map} />,
  };

  return (
    <MainLayout>
      <SEOHead
        title={content.seo.title.ms}
        description={content.seo.description.ms}
        url="/"
      />

      {content.sectionOrder.map((section) => (
        <Fragment key={section}>{HOME_SECTION_RENDERERS[section]()}</Fragment>
      ))}
    </MainLayout>
  );
}
