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

// Generate dynamic grid positions based on image count
function generateGridPositions(imageCount: number) {
  // Base positions for common layouts
  const basePositions = [
    { col: '1 / 5', row: '1 / 4', rotate: -2 },
    { col: '5 / 9', row: '1 / 3', rotate: 1 },
    { col: '9 / 13', row: '1 / 4', rotate: 3 },
    { col: '2 / 5', row: '4 / 6', rotate: -1 },
    { col: '5 / 9', row: '3 / 6', rotate: 0 },
    { col: '9 / 12', row: '4 / 6', rotate: 2 },
    { col: '1 / 4', row: '6 / 9', rotate: -3 },
    { col: '4 / 7', row: '6 / 8', rotate: 1 },
    { col: '7 / 10', row: '6 / 8', rotate: -2 },
    { col: '10 / 13', row: '6 / 9', rotate: 2 },
    { col: '3 / 6', row: '8 / 10', rotate: -1 },
    { col: '8 / 11', row: '8 / 10', rotate: 3 },
  ];

  // Extended positions for more images
  const extendedPositions = [
    { col: '1 / 3', row: '3 / 5', rotate: -2 },
    { col: '11 / 13', row: '3 / 5', rotate: 2 },
    { col: '2 / 4', row: '5 / 7', rotate: 1 },
    { col: '10 / 12', row: '5 / 7', rotate: -1 },
    { col: '4 / 6', row: '4 / 5', rotate: 0 },
    { col: '8 / 10', row: '4 / 5', rotate: -2 },
    { col: '5 / 7', row: '8 / 10', rotate: 2 },
    { col: '7 / 9', row: '8 / 10', rotate: -1 },
    { col: '1 / 3', row: '7 / 9', rotate: 3 },
    { col: '11 / 13', row: '7 / 9', rotate: -3 },
    { col: '3 / 5', row: '2 / 4', rotate: 1 },
    { col: '9 / 11', row: '2 / 4', rotate: -2 },
  ];

  const allPositions = [...basePositions, ...extendedPositions];
  
  // Return positions for the given image count
  return allPositions.slice(0, Math.min(imageCount, allPositions.length));
}

// Get random rotation for variety
function getRotation(index: number): number {
  const rotations = [-3, -2, -1, 0, 1, 2, 3];
  return rotations[index % rotations.length];
}

export function CircularGalleryGrid({ images, isLoading, error }: CircularGalleryGridProps) {
  const { language } = useLanguage();
  const isMobile = useIsMobile();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const handleImageClick = (index: number) => {
    setCurrentImageIndex(index);
    setLightboxOpen(true);
  };

  // Generate positions based on actual image count
  const gridPositions = generateGridPositions(images.length);

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

  // On mobile, use simple grid layout with hover effects
  if (isMobile) {
    return (
      <>
        <div className="grid grid-cols-2 gap-2">
          {images.map((image, index) => (
            <button
              key={image.id}
              onClick={() => handleImageClick(index)}
              className="group relative aspect-square overflow-hidden rounded-xl bg-muted transition-all duration-300 hover:scale-105 hover:rotate-1 hover:shadow-lg hover:z-10 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
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

  // Limit images to fit in circle (max 24)
  const maxImages = Math.min(images.length, 24);
  const displayImages = images.slice(0, maxImages);

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
            {displayImages.map((image, index) => {
              const position = gridPositions[index] || gridPositions[index % gridPositions.length];
              const baseRotation = position?.rotate ?? getRotation(index);
              
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
                    gridColumn: position?.col || '1 / 4',
                    gridRow: position?.row || '1 / 3',
                    transform: `rotate(${baseRotation}deg)`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = `rotate(0deg) scale(1.15)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = `rotate(${baseRotation}deg)`;
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

      {/* Show remaining images below if more than 24 */}
      {images.length > 24 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {images.slice(24).map((image, index) => {
            const rotation = getRotation(index);
            return (
              <button
                key={image.id}
                onClick={() => handleImageClick(index + 24)}
                className={cn(
                  "group relative aspect-square overflow-hidden rounded-xl bg-muted",
                  "transition-all duration-300 ease-out",
                  "hover:scale-[1.15] hover:rotate-0 hover:z-10 hover:shadow-xl",
                  "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                )}
                style={{ transform: `rotate(${rotation}deg)` }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = `rotate(0deg) scale(1.15)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = `rotate(${rotation}deg)`;
                }}
              >
                <img
                  src={image.url}
                  alt={image.alt_text || ''}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </button>
            );
          })}
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
