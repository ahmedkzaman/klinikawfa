import { MainLayout } from '@/components/layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { CLINIC_INFO } from '@/lib/constants';
import { Image, Phone, MessageCircle } from 'lucide-react';

// Placeholder gallery categories
const categories = [
  { id: 'waiting', labelMs: 'Ruang Menunggu & Zon Kanak-kanak', labelEn: 'Waiting Area & Kids Zone' },
  { id: 'treatment', labelMs: 'Bilik Rawatan', labelEn: 'Treatment Rooms' },
  { id: 'exterior', labelMs: 'Luaran Klinik', labelEn: 'Clinic Exterior' },
  { id: 'staff', labelMs: 'Kakitangan', labelEn: 'Staff' },
];

// Placeholder images
const placeholderImages = [
  { id: 1, category: 'waiting', alt: 'Waiting area' },
  { id: 2, category: 'waiting', alt: 'Kids play zone' },
  { id: 3, category: 'treatment', alt: 'Treatment room 1' },
  { id: 4, category: 'treatment', alt: 'Treatment room 2' },
  { id: 5, category: 'exterior', alt: 'Clinic entrance' },
  { id: 6, category: 'exterior', alt: 'Clinic signage' },
  { id: 7, category: 'staff', alt: 'Friendly staff' },
  { id: 8, category: 'staff', alt: 'Team photo' },
];

export default function Gallery() {
  const { language } = useLanguage();

  return (
    <MainLayout>
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

      {/* Filter Buttons */}
      <section className="border-b border-border py-4">
        <div className="container">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" className="bg-primary text-primary-foreground">
              {language === 'ms' ? 'Semua' : 'All'}
            </Button>
            {categories.map((cat) => (
              <Button key={cat.id} variant="outline" size="sm">
                {language === 'ms' ? cat.labelMs : cat.labelEn}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery Grid */}
      <section className="py-16 md:py-24">
        <div className="container">
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {placeholderImages.map((img) => (
              <div
                key={img.id}
                className="group aspect-square cursor-pointer overflow-hidden rounded-xl bg-muted transition-all hover:shadow-card"
              >
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                  <div className="text-center text-muted-foreground">
                    <Image className="mx-auto mb-2 h-12 w-12 opacity-50" />
                    <p className="text-sm">{img.alt}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* TODO Notice */}
          <div className="mt-8 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/50 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {language === 'ms'
                ? '📸 Gambar sebenar klinik akan dikemaskini. Lightbox akan diaktifkan kemudian.'
                : '📸 Actual clinic photos will be updated. Lightbox will be enabled later.'}
            </p>
          </div>
        </div>
      </section>

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
