import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GalleryImage } from '@/hooks/useGalleryImages';

export interface GalleryLightboxLabels {
  close: string;
  previous: string;
  next: string;
  swipeHint: string;
}

const DEFAULT_GALLERY_LIGHTBOX_LABELS: GalleryLightboxLabels = {
  close: 'Close',
  previous: 'Previous',
  next: 'Next',
  swipeHint: 'Swipe to navigate',
};

interface GalleryLightboxProps {
  images: GalleryImage[];
  currentIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
  labels?: GalleryLightboxLabels;
}

export function GalleryLightbox({
  images,
  currentIndex,
  open,
  onOpenChange,
  onIndexChange,
  labels = DEFAULT_GALLERY_LIGHTBOX_LABELS,
}: GalleryLightboxProps) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  const currentImage = images[currentIndex];
  const hasNext = currentIndex < images.length - 1;
  const hasPrev = currentIndex > 0;

  const goNext = useCallback(() => {
    if (hasNext) {
      setIsImageLoaded(false);
      onIndexChange(currentIndex + 1);
    }
  }, [currentIndex, hasNext, onIndexChange]);

  const goPrev = useCallback(() => {
    if (hasPrev) {
      setIsImageLoaded(false);
      onIndexChange(currentIndex - 1);
    }
  }, [currentIndex, hasPrev, onIndexChange]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goPrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goNext();
          break;
        case 'Escape':
          e.preventDefault();
          handleClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, goNext, goPrev, handleClose]);

  // Touch swipe handling
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      goNext();
    } else if (isRightSwipe) {
      goPrev();
    }
  };

  // Preload adjacent images
  useEffect(() => {
    if (!open || images.length === 0) return;

    const preloadImages: string[] = [];
    if (hasNext) preloadImages.push(images[currentIndex + 1].url);
    if (hasPrev) preloadImages.push(images[currentIndex - 1].url);

    preloadImages.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [open, currentIndex, images, hasNext, hasPrev]);

  if (!currentImage) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/95 backdrop-blur-sm" />
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            aria-label={labels.close}
            className="absolute right-4 top-4 z-50 h-11 w-11 rounded-full bg-background/20 text-white backdrop-blur-sm hover:bg-background/40"
            onClick={handleClose}
          >
            <X className="h-5 w-5" />
            <span className="sr-only">{labels.close}</span>
          </Button>

          {/* Counter badge */}
          <div aria-live="polite" className="absolute left-4 top-4 z-50 rounded-full bg-background/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
            {currentIndex + 1} / {images.length}
          </div>

          {/* Previous button */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "absolute left-4 top-1/2 z-50 h-12 w-12 -translate-y-1/2 rounded-full bg-background/20 text-white backdrop-blur-sm hover:bg-background/40",
              "hidden sm:flex",
              !hasPrev && "pointer-events-none opacity-30"
            )}
            onClick={goPrev}
            disabled={!hasPrev}
          >
            <ChevronLeft className="h-6 w-6" />
            <span className="sr-only">{labels.previous}</span>
          </Button>

          {/* Image container */}
          <div className="flex h-full w-full items-center justify-center px-4 py-16 sm:px-20">
            <div className="relative max-h-full max-w-full">
              {!isImageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
                </div>
              )}
              <img
                ref={imageRef}
                src={currentImage.url}
                alt={currentImage.alt_text || ''}
                className={cn(
                  "max-h-[80vh] max-w-full rounded-lg object-contain transition-opacity duration-300",
                  isImageLoaded ? "opacity-100" : "opacity-0"
                )}
                onLoad={() => setIsImageLoaded(true)}
                draggable={false}
              />
            </div>
          </div>

          {/* Next button */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "absolute right-4 top-1/2 z-50 h-12 w-12 -translate-y-1/2 rounded-full bg-background/20 text-white backdrop-blur-sm hover:bg-background/40",
              "hidden sm:flex",
              !hasNext && "pointer-events-none opacity-30"
            )}
            onClick={goNext}
            disabled={!hasNext}
          >
            <ChevronRight className="h-6 w-6" />
            <span className="sr-only">{labels.next}</span>
          </Button>

          {/* Caption */}
          {currentImage.alt_text && (
            <div className="absolute bottom-4 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-lg bg-background/20 px-4 py-2 text-center text-sm text-white backdrop-blur-sm">
              {currentImage.alt_text}
            </div>
          )}

          {/* Mobile navigation hint */}
          <div className="absolute bottom-16 left-1/2 z-50 -translate-x-1/2 text-xs text-white/50 sm:hidden">
            {labels.swipeHint}
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
