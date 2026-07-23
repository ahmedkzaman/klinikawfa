import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  useGalleryImages, 
  GALLERY_CATEGORIES, 
  type GalleryCategoryId 
} from '@/hooks/useGalleryImages';
import { GalleryLightbox } from './GalleryLightbox';

export function GalleryGrid() {
  const { language } = useLanguage();
  const [activeCategory, setActiveCategory] = useState<GalleryCategoryId>('all');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const { images, isLoading, error } = useGalleryImages(activeCategory);

  const handleImageClick = (index: number) => {
    setCurrentImageIndex(index);
    setLightboxOpen(true);
  };

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6 text-center">
        <p className="text-sm text-destructive">
          {language === 'ms'
          ? 'Ralat memuatkan galeri. Sila cuba lagi.'
          : 'Error loading gallery. Please try again.'}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Filter Buttons */}
      <div className="border-b border-border bg-card py-4">
        <div className="container">
          <div className="flex flex-wrap gap-2">
            {GALLERY_CATEGORIES.map((cat) => (
              <Button
                key={cat.id}
                variant={activeCategory === cat.id ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setActiveCategory(cat.id as GalleryCategoryId)}
                className={cn(
                  'min-h-11 px-4',
                  activeCategory === cat.id && 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                {language === 'ms' ? cat.labelMs : cat.labelEn}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Gallery Grid */}
      <section className="py-16 md:py-24">
        <div className="container">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-xl" />
              ))}
            </div>
          ) : images.length === 0 ? (
            <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/50 p-12 text-center">
              <ImageIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                {activeCategory === 'all'
                  ? (language === 'ms' 
                      ? 'Tiada gambar dalam galeri.' 
                      : 'No images in the gallery.')
                  : (language === 'ms'
                      ? 'Tiada gambar dalam kategori ini.'
                      : 'No images in this category.')}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {images.map((image, index) => (
                <button
                  key={image.id}
                  onClick={() => handleImageClick(index)}
                  className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-muted shadow-soft transition-shadow hover:shadow-card focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  <img
                    src={image.url}
                    alt={image.alt_text || ''}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-foreground/0 transition-colors group-hover:bg-foreground/20" />
                  
                  {/* Caption on hover */}
                  {image.alt_text && (
                    <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/80 to-transparent p-4 transition-transform duration-300 group-hover:translate-y-0">
                      <p className="text-sm text-white">{image.alt_text}</p>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Lightbox */}
      <GalleryLightbox
        images={images}
        currentIndex={currentImageIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setCurrentImageIndex}
      />
    </>
  );
}
