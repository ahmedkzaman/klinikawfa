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

// Component for a single wheel with 9 images (8 around + 1 center)
function GalleryWheel({ 
  images, 
  startIndex,
  onImageClick 
}: { 
  images: GalleryImage[]; 
  startIndex: number;
  onImageClick: (index: number) => void;
}) {
  // Take up to 9 images for this wheel
  const wheelImages = images.slice(0, 9);
  const centerImage = wheelImages[0];
  const surroundingImages = wheelImages.slice(1, 9);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-lg">
      {/* Outer ring with 8 segments */}
      <div className="absolute inset-0">
        {surroundingImages.map((image, index) => {
          const angle = (index * 45) - 90; // 45 degrees apart, starting from top
          const rotation = angle + 22.5; // Center each segment
          
          return (
            <button
              key={image.id}
              onClick={() => onImageClick(startIndex + index + 1)}
              className={cn(
                "absolute left-1/2 top-1/2 origin-bottom overflow-hidden",
                "transition-all duration-300 ease-out",
                "hover:z-20 hover:scale-105 hover:brightness-110",
                "focus:outline-none focus:ring-2 focus:ring-primary"
              )}
              style={{
                width: '45%',
                height: '45%',
                transform: `translate(-50%, -100%) rotate(${rotation}deg)`,
                clipPath: 'polygon(50% 100%, 0% 0%, 100% 0%)',
              }}
            >
              <img
                src={image.url}
                alt={image.alt_text || ''}
                className="h-full w-full object-cover"
                style={{
                  transform: `rotate(${-rotation}deg) scale(1.5)`,
                }}
                loading="lazy"
              />
            </button>
          );
        })}
      </div>

      {/* Center circle */}
      {centerImage && (
        <button
          onClick={() => onImageClick(startIndex)}
          className={cn(
            "absolute left-1/2 top-1/2 z-10 overflow-hidden rounded-full",
            "border-4 border-background shadow-lg",
            "transition-all duration-300 ease-out",
            "hover:scale-110 hover:shadow-xl",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          )}
          style={{
            width: '30%',
            height: '30%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <img
            src={centerImage.url}
            alt={centerImage.alt_text || ''}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </button>
      )}

      {/* Decorative ring border */}
      <div 
        className="pointer-events-none absolute inset-[10%] rounded-full border-4 border-muted/50"
      />
    </div>
  );
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

  // Split images into groups of 9 for multiple wheels
  const wheels: GalleryImage[][] = [];
  for (let i = 0; i < images.length; i += 9) {
    wheels.push(images.slice(i, i + 9));
  }

  return (
    <>
      <div className="grid gap-12 md:grid-cols-1 lg:grid-cols-2">
        {wheels.map((wheelImages, wheelIndex) => (
          <GalleryWheel
            key={wheelIndex}
            images={wheelImages}
            startIndex={wheelIndex * 9}
            onImageClick={handleImageClick}
          />
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
