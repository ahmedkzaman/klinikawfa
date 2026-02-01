import { useState } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { ArrowRight, ImageIcon, Camera, Expand } from 'lucide-react';
import { useGalleryImages } from '@/hooks/useGalleryImages';
import { GalleryLightbox } from '@/components/gallery';

export function GalleryStrip() {
  const { language, t } = useLanguage();
  const { allImages, isLoading } = useGalleryImages();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const displayImages = allImages.slice(0, 6);

  const handleImageClick = (index: number) => {
    setCurrentImageIndex(index);
    setLightboxOpen(true);
  };

  return (
    <section className="relative py-20 md:py-28 overflow-hidden gradient-section-alt">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 left-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="container relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mb-10 flex flex-col items-center text-center sm:flex-row sm:items-end sm:justify-between sm:text-left"
        >
          <div>
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20"
            >
              <Camera className="h-4 w-4" />
              {language === 'ms' ? 'Galeri Foto' : 'Photo Gallery'}
            </motion.span>
            <h2 className="mb-2">
              {language === 'ms' ? 'Galeri Klinik' : 'Clinic Gallery'}
            </h2>
            <p className="text-muted-foreground text-lg">
              {language === 'ms'
                ? 'Lihat suasana di Klinik Awfa.'
                : 'See the atmosphere at Klinik Awfa.'}
            </p>
          </div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <Button 
              variant="outline" 
              className="hidden sm:flex group border-2 hover:border-primary/50 hover:bg-primary/5 transition-all duration-300" 
              asChild
            >
              <Link to="/gallery">
                {t('cta.viewAll')}
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </motion.div>
        </motion.div>
      </div>

      {/* Horizontal scrollable gallery */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="relative"
      >
        <div className="flex gap-5 overflow-x-auto pb-4 pl-4 scrollbar-hide md:pl-[max(1rem,calc((100vw-1280px)/2+1rem))]">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton 
                key={i} 
                className="aspect-[4/3] w-80 flex-shrink-0 rounded-2xl md:w-96" 
              />
            ))
          ) : displayImages.length === 0 ? (
            <div className="flex aspect-[4/3] w-80 flex-shrink-0 items-center justify-center rounded-2xl bg-card border border-border/50 md:w-96">
              <div className="text-center text-muted-foreground">
                <ImageIcon className="mx-auto mb-3 h-12 w-12 opacity-40" />
                <p className="text-sm font-medium">
                  {language === 'ms' ? 'Tiada gambar' : 'No images'}
                </p>
              </div>
            </div>
          ) : (
            displayImages.map((image, index) => (
              <motion.button
                key={image.id}
                whileHover={{ y: -8 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleImageClick(index)}
                className="group relative aspect-[4/3] w-80 flex-shrink-0 cursor-pointer overflow-hidden rounded-2xl bg-muted shadow-card transition-all duration-500 hover:shadow-elevated focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 md:w-96"
              >
                <img
                  src={image.url}
                  alt={image.alt_text || ''}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  loading="lazy"
                />

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                {/* Hover icon */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-md text-white shadow-lg">
                    <Expand className="h-6 w-6" />
                  </div>
                </div>
              </motion.button>
            ))
          )}

          {/* View all card */}
          {!isLoading && displayImages.length > 0 && (
            <Link
              to="/gallery"
              className="group flex aspect-[4/3] w-80 flex-shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card/50 text-muted-foreground transition-all duration-300 hover:border-primary hover:text-primary hover:bg-primary/5 md:w-96"
            >
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <ArrowRight className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
                </div>
                <p className="font-bold text-lg">{t('cta.viewAll')}</p>
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
        <div className="pointer-events-none absolute right-0 top-0 h-full w-32 bg-gradient-to-l from-background to-transparent" />
      </motion.div>

      <div className="container relative z-10 mt-8 text-center sm:hidden">
        <Button variant="outline" className="border-2" asChild>
          <Link to="/gallery">
            {t('cta.viewAll')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Lightbox */}
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
