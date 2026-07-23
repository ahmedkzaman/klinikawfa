import { MainLayout } from '@/components/layout';
import { SEOHead } from '@/components/seo';
import { useLanguage } from '@/contexts/LanguageContext';
import { GalleryGrid } from '@/components/gallery';
import { PublicClosingCta, PublicPageHeader } from '@/components/public';

export default function Gallery() {
  const { language } = useLanguage();

  return (
    <MainLayout>
      <SEOHead
        title={language === 'ms' ? 'Galeri' : 'Gallery'}
        description={language === 'ms' 
          ? 'Lihat suasana di Klinik Awfa Kuantan. Galeri foto kemudahan dan perkhidmatan kami.'
          : 'See the atmosphere at Klinik Awfa Kuantan. Photo gallery of our facilities and services.'}
        url="/gallery"
      />

      <PublicPageHeader
        title={language === 'ms' ? 'Galeri' : 'Gallery'}
        description={language === 'ms'
          ? 'Lihat suasana di Klinik Awfa.'
          : 'See the atmosphere at Klinik Awfa.'}
      />

      {/* Gallery Grid with Filters */}
      <GalleryGrid />

      <PublicClosingCta
        title={language === 'ms' ? 'Ingin Melawat?' : 'Want to Visit?'}
        description={language === 'ms'
          ? 'Hubungi kami untuk membuat temujanji.'
          : 'Contact us to make an appointment.'}
        appointmentLabel={language === 'ms' ? 'Buat Temujanji' : 'Book Appointment'}
      />
    </MainLayout>
  );
}
