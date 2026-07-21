import { Fragment, type ReactNode } from "react";

import { GalleryStrip } from "@/components/home/GalleryStrip";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { MapSection } from "@/components/home/MapSection";
import { ServicesPreview } from "@/components/home/ServicesPreview";
import { TestimonialsSection } from "@/components/home/TestimonialsSection";
import { VideoSection } from "@/components/home/VideoSection";
import { WhySection } from "@/components/home/WhySection";
import type {
  HomeContent,
  HomeSectionId,
} from "@/features/website-cms/schemas/home";

interface HomeRendererProps {
  content: HomeContent;
  preview?: boolean;
}

export function HomeRenderer({ content, preview = false }: HomeRendererProps) {
  const sectionRenderers: Record<HomeSectionId, () => ReactNode> = {
    hero: () => <HeroCarousel content={content.hero} preview={preview} />,
    why: () => <WhySection content={content.why} preview={preview} />,
    video: () => <VideoSection content={content.video} preview={preview} />,
    services: () => <ServicesPreview content={content.services} preview={preview} />,
    gallery: () => <GalleryStrip content={content.gallery} preview={preview} />,
    testimonials: () => (
      <TestimonialsSection content={content.testimonials} preview={preview} />
    ),
    map: () => <MapSection content={content.map} preview={preview} />,
  };

  return content.sectionOrder.map((section) => (
    <Fragment key={section}>{sectionRenderers[section]()}</Fragment>
  ));
}
