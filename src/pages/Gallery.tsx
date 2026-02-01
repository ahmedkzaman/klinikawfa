import { MainLayout } from '@/components/layout';
import { SEOHead } from '@/components/seo';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { CLINIC_INFO } from '@/lib/constants';
import { Phone, MessageCircle } from 'lucide-react';
import { GalleryGrid } from '@/components/gallery';

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

      {/* Hero */}
      {/* Hero */}
      <section className="bg-gradient-to-b from-background to-primary/5 py-16 md:py-24">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-4">
              {language === 'ms' ? 'Galeri' : 'Gallery'}
            </h1>
            <p className="text-lg text-muted-foreground">
              {language === 'ms'
                ? 'Lihat suasana di Klinik Awfa.'
                : 'See the atmosphere at Klinik Awfa.'}
            </p>
          </div>
        </div>
      </section>

      {/* Gallery Grid with Filters */}
      <GalleryGrid />

      {/* CTA Section */}
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-4 text-primary-foreground">
              {language === 'ms' ? 'Ingin Melawat?' : 'Want to Visit?'}
            </h2>
            <p className="mb-8 text-primary-foreground/80">
              {language === 'ms'
                ? 'Hubungi kami untuk membuat temujanji.'
                : 'Contact us to make an appointment.'}
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" variant="secondary" asChild>
                <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  WhatsApp
                </a>
              </Button>
              <Button size="lg" variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" asChild>
                <a href={CLINIC_INFO.phoneLink}>
                  <Phone className="mr-2 h-5 w-5" />
                  {CLINIC_INFO.phone}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
