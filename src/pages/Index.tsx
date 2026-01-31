import { MainLayout } from '@/components/layout';
import {
  HeroCarousel,
  WhySection,
  VideoSection,
  ServicesPreview,
  GalleryStrip,
  TestimonialsSection,
  MapSection,
} from '@/components/home';

export default function Index() {
  return (
    <MainLayout>
      {/* Hero Carousel with auto-rotation */}
      <HeroCarousel autoPlayInterval={5000} />

      {/* Why Klinik Awfa - 6 key highlights */}
      <WhySection />

      {/* Autoplay Video Section */}
      <VideoSection />

      {/* Services Preview Grid */}
      <ServicesPreview />

      {/* Photo Gallery Strip - horizontal scroll */}
      <GalleryStrip />

      {/* Patient Testimonials */}
      <TestimonialsSection />

      {/* Map & Location */}
      <MapSection />
    </MainLayout>
  );
}
