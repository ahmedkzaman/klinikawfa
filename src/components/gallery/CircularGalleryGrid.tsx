import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import type { GalleryImage } from '@/hooks/useGalleryImages';
import { GalleryLightbox } from './GalleryLightbox';

interface CircularGalleryGridProps {
  images: GalleryImage[];
  isLoading: boolean;
  error: Error | null;
}

// Define grid positions for images in the circular layout
// Each position has column span, row span, and placement
const gridPositions = [
  { col: '1 / 5', row: '1 / 4' },      // Top-left large
  { col: '5 / 9', row: '1 / 3' },      // Top-center
  { col: '9 / 13', row: '1 / 4' },     // Top-right large
  { col: '2 / 5', row: '4 / 6' },      // Middle-left
  { col: '5 / 9', row: '3 / 6' },      // Center (large, focal)
  { col: '9 / 12', row: '4 / 6' },     // Middle-right
  { col: '1 / 4', row: '6 / 9' },      // Bottom-left large
  { col: '4 / 7', row: '6 / 8' },      // Bottom-center-left
  { col: '7 / 10', row: '6 / 8' },     // Bottom-center-right
  { col: '10 / 13', row: '6 / 9' },    // Bottom-right large
  { col: '3 / 6', row: '8 / 10' },     // Extra bottom-left
  { col: '8 / 11', row: '8 / 10' },    // Extra bottom-right
];

export function CircularGalleryGrid({ images, isLoading, error }: CircularGalleryGridProps) {
  const { language } = useLanguage();
  const isMobile = useIsMobile();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

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

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/50 p-12 text-center">
        <ImageIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
        <p className="text-muted-foreground">
          {language === 'ms' 
            ? 'Tiada gambar dalam galeri.' 
            : 'No images in the gallery.'}
        </p>
      </div>
    );
  }

  // On mobile, use simple grid layout
  if (isMobile) {
    return (
      <>
        <div className="grid grid-cols-2 gap-2">
          {images.map((image, index) => (
            <button
              key={image.id}
              onClick={() => handleImageClick(index)}
              className="group relative aspect-square overflow-hidden rounded-xl bg-muted transition-all duration-300 hover:scale-105 hover:shadow-lg hover:z-10 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <img
                src={image.url}
                alt={image.alt_text || ''}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
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

  return (
    <>
      {/* Circular Gallery Container */}
      <div className="relative mx-auto w-full max-w-4xl aspect-square">
        {/* Circular mask container */}
        <div 
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: 'circle(50% at 50% 50%)' }}
        >
          {/* Grid layout inside the circle */}
          <div 
            className="grid h-full w-full gap-1 bg-muted/30 p-1"
            style={{ 
              gridTemplateColumns: 'repeat(12, 1fr)',
              gridTemplateRows: 'repeat(10, 1fr)',
            }}
          >
            {images.slice(0, 12).map((image, index) => {
              const position = gridPositions[index] || gridPositions[index % gridPositions.length];
              
              return (
                <button
                  key={image.id}
                  onClick={() => handleImageClick(index)}
                  className={cn(
                    "group relative overflow-hidden rounded-lg bg-muted",
                    "transition-all duration-300 ease-out",
                    "hover:scale-[1.15] hover:z-20 hover:shadow-2xl",
                    "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  )}
                  style={{
                    gridColumn: position.col,
                    gridRow: position.row,
                  }}
                >
                  <img
                    src={image.url}
                    alt={image.alt_text || ''}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                    loading="lazy"
                  />
                  {/* Hover overlay with subtle gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Decorative shadow behind the circle */}
        <div 
          className="absolute inset-0 -z-10 blur-3xl opacity-20 bg-primary"
          style={{ clipPath: 'circle(48% at 50% 50%)' }}
        />
      </div>

      {/* Show remaining images in a smaller grid below if more than 12 */}
      {images.length > 12 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {images.slice(12).map((image, index) => (
            <button
              key={image.id}
              onClick={() => handleImageClick(index + 12)}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-xl bg-muted",
                "transition-all duration-300 ease-out",
                "hover:scale-[1.15] hover:z-10 hover:shadow-xl",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              )}
            >
              <img
                src={image.url}
                alt={image.alt_text || ''}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

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
