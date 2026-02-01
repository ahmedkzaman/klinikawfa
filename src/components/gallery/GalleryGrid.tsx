import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  useGalleryImages, 
  GALLERY_CATEGORIES, 
  type GalleryCategoryId 
} from '@/hooks/useGalleryImages';
import { CircularGalleryGrid } from './CircularGalleryGrid';

export function GalleryGrid() {
  const { language } = useLanguage();
  const [activeCategory, setActiveCategory] = useState<GalleryCategoryId>('all');

  const { images, isLoading, error } = useGalleryImages(activeCategory);

  return (
    <>
      {/* Filter Buttons */}
      <div className="border-b border-border py-4">
        <div className="container">
          <div className="flex flex-wrap gap-2">
            {GALLERY_CATEGORIES.map((cat) => (
              <Button
                key={cat.id}
                variant={activeCategory === cat.id ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setActiveCategory(cat.id as GalleryCategoryId)}
                className={cn(
                  activeCategory === cat.id && 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                {language === 'ms' ? cat.labelMs : cat.labelEn}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Circular Gallery */}
      <section className="py-16 md:py-24">
        <div className="container">
          <CircularGalleryGrid 
            images={images} 
            isLoading={isLoading} 
            error={error} 
          />
        </div>
      </section>
    </>
  );
}
