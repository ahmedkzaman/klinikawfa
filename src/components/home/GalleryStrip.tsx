import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { ArrowRight, ImageIcon } from 'lucide-react';
import { useGalleryImages } from '@/hooks/useGalleryImages';
import { GalleryLightbox } from '@/components/gallery';

export function GalleryStrip() {
  const { language, t } = useLanguage();
  const { allImages, isLoading } = useGalleryImages();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Show first 6 images
  const displayImages = allImages.slice(0, 6);

  const handleImageClick = (index: number) => {
    setCurrentImageIndex(index);
    setLightboxOpen(true);
  };

  return (
    <section className="py-16 md:py-24">
      <div className="container">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="mb-2">
              {language === 'ms' ? 'Galeri Klinik' : 'Clinic Gallery'}
            </h2>
            <p className="text-muted-foreground">
              {language === 'ms'
                ? 'Lihat suasana di Klinik Awfa.'
                : 'See the atmosphere at Klinik Awfa.'}
            </p>
          </div>
          <Button variant="outline" className="hidden sm:flex" asChild>
            <Link to="/gallery">
              {t('cta.viewAll')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Horizontal scrollable gallery */}
      <div className="relative">
        <div className="flex gap-4 overflow-x-auto pb-4 pl-4 scrollbar-hide md:pl-[max(1rem,calc((100vw-1280px)/2+1rem))]">
          {isLoading ? (
            // Loading skeletons
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton 
                key={i} 
                className="aspect-[4/3] w-72 flex-shrink-0 rounded-xl md:w-80" 
              />
            ))
          ) : displayImages.length === 0 ? (
            // Empty state placeholder
            <div className="flex aspect-[4/3] w-72 flex-shrink-0 items-center justify-center rounded-xl bg-muted md:w-80">
              <div className="text-center text-muted-foreground">
                <ImageIcon className="mx-auto mb-2 h-10 w-10 opacity-50" />
                <p className="text-sm">
                  {language === 'ms' ? 'Tiada gambar' : 'No images'}
                </p>
              </div>
            </div>
          ) : (
            // Real images from database
            displayImages.map((image, index) => (
              <button
                key={image.id}
                onClick={() => handleImageClick(index)}
                className="group relative aspect-[4/3] w-72 flex-shrink-0 cursor-pointer overflow-hidden rounded-xl bg-muted shadow-soft transition-all hover:shadow-card focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 md:w-80"
              >
                <img
                  src={image.url}
                  alt={image.alt_text || ''}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />

                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-foreground/0 opacity-0 transition-all group-hover:bg-foreground/40 group-hover:opacity-100">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background text-foreground">
                    <ArrowRight className="h-5 w-5" />
                  </div>
                </div>
              </button>
            ))
          )}

          {/* View all card - always shown if there are images */}
          {!isLoading && displayImages.length > 0 && (
            <Link
              to="/gallery"
              className="flex aspect-[4/3] w-72 flex-shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/50 text-muted-foreground transition-colors hover:border-primary hover:text-primary md:w-80"
            >
              <div className="text-center">
                <ArrowRight className="mx-auto mb-2 h-8 w-8" />
                <p className="font-medium">{t('cta.viewAll')}</p>
                {allImages.length > 6 && (
                  <p className="mt-1 text-sm opacity-70">
                    +{allImages.length - 6} {language === 'ms' ? 'lagi' : 'more'}
                  </p>
                )}
              </div>
            </Link>
          )}
        </div>

        {/* Gradient fade on right */}
        <div className="pointer-events-none absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-background to-transparent" />
      </div>

      <div className="container mt-6 text-center sm:hidden">
        <Button variant="outline" asChild>
          <Link to="/gallery">
            {t('cta.viewAll')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Lightbox for strip images */}
      <GalleryLightbox
        images={displayImages}
        currentIndex={currentImageIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setCurrentImageIndex}
      />
    </section>
  );
}
