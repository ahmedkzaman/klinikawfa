import { useState, useEffect, useCallback, type MouseEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { PublicSectionHeader } from '@/components/public';
import { ArrowRight, ImageIcon, Expand, ChevronLeft, ChevronRight } from 'lucide-react';
import { useGalleryImages } from '@/hooks/useGalleryImages';
import { GalleryLightbox } from '@/components/gallery';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { cn } from '@/lib/utils';
import type { HomeContent } from '@/features/website-cms/schemas/home';

interface PreviewLinkProps {
  href: string;
  preview: boolean;
  className?: string;
  children: ReactNode;
}

function PreviewLink({ href, preview, className, children }: PreviewLinkProps) {
  const preventPreviewNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
  };
  const onClick = preview ? preventPreviewNavigation : undefined;

  return href.startsWith('/') ? (
    <Link to={href} className={className} onClick={onClick}>
      {children}
    </Link>
  ) : (
    <a
      href={href}
      className={className}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
      onClick={onClick}
    >
      {children}
    </a>
  );
}

interface GalleryStripProps {
  content: HomeContent['gallery'];
  preview?: boolean;
}

export function GalleryStrip({ content, preview = false }: GalleryStripProps) {
  const { language } = useLanguage();
  const { allImages, isLoading } = useGalleryImages();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const displayImages = allImages.slice(0, content.itemLimit);
  const localized = (copy: { ms: string; en: string }) =>
    language === 'ms' ? copy.ms : copy.en || copy.ms;

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { 
      loop: true, 
      align: 'start',
      skipSnaps: false,
      dragFree: false,
    },
    [Autoplay({ delay: 4000, stopOnInteraction: false, stopOnMouseEnter: true })]
  );

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi, onSelect]);

  const handleImageClick = (index: number) => {
    setCurrentImageIndex(index);
    setLightboxOpen(true);
  };

  return (
    <section className="public-section overflow-hidden bg-background">
      <div className="container relative z-10">
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <PublicSectionHeader
              eyebrow={localized(content.eyebrow)}
              title={localized(content.title)}
              description={localized(content.description)}
            />
          </div>
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <Button 
              variant="outline" 
              className="hidden min-h-11 sm:flex group border-border bg-background hover:border-primary/50 hover:bg-muted"
              asChild
            >
              <PreviewLink href={content.cta.href} preview={preview}>
                {localized(content.cta.label)}
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </PreviewLink>
            </Button>
          </motion.div>
        </motion.div>
      </div>

      {/* Carousel Gallery */}
      <motion.div
        initial={false}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="relative"
      >
        {isLoading ? (
          <div className="flex gap-5 overflow-hidden pb-4 pl-4 md:pl-[max(1rem,calc((100vw-1280px)/2+1rem))]">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton 
                key={i} 
                className="aspect-[4/3] w-80 flex-shrink-0 rounded-none md:w-96"
              />
            ))}
          </div>
        ) : displayImages.length === 0 ? (
          <div className="container">
            <div className="flex aspect-[4/3] w-full max-w-md items-center justify-center border border-border bg-card">
              <div className="text-center text-muted-foreground">
                <ImageIcon className="mx-auto mb-3 h-12 w-12 opacity-40" />
                <p className="text-sm font-medium">
                  {localized(content.emptyMessage)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Embla Carousel */}
            <div className="overflow-hidden" ref={emblaRef}>
              <div className="flex gap-5 pl-4 md:pl-[max(1rem,calc((100vw-1280px)/2+1rem))]">
                {displayImages.map((image, index) => (
                  <motion.button
                    key={image.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleImageClick(index)}
                    className="group relative aspect-[4/3] w-80 flex-shrink-0 cursor-pointer overflow-hidden border border-border bg-muted shadow-soft transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-card focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 md:w-96"
                  >
                    <img
                      src={image.url}
                      alt={image.alt_text || ''}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      loading="lazy"
                    />

                    <div className="absolute inset-0 flex items-center justify-center bg-foreground/25 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      <div className="flex h-12 w-12 items-center justify-center bg-background text-primary shadow-card">
                        <Expand className="h-6 w-6" />
                      </div>
                    </div>
                  </motion.button>
                ))}

                {/* View all card */}
                <PreviewLink
                  href={content.cta.href}
                  preview={preview}
                  className="group mr-4 flex aspect-[4/3] w-80 flex-shrink-0 items-center justify-center border border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary hover:bg-muted md:w-96"
                >
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center border border-primary/20 bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <ArrowRight className="h-6 w-6 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="font-bold text-lg">{localized(content.cta.label)}</p>
                    {allImages.length > content.itemLimit && (
                      <p className="mt-1 text-sm opacity-70">
                        +{allImages.length - content.itemLimit} {localized(content.moreLabel)}
                      </p>
                    )}
                  </div>
                </PreviewLink>
              </div>
            </div>

            {/* Navigation arrows */}
            <div className="container mt-6 flex items-center justify-center gap-4">
              <motion.button
                onClick={scrollPrev}
                className="flex h-12 w-12 items-center justify-center border border-border bg-background text-foreground transition-colors hover:border-primary hover:text-primary hover:bg-muted"
                aria-label={localized(content.carouselLabels.previous)}
              >
                <ChevronLeft className="h-5 w-5" />
              </motion.button>

              {/* Dots indicator */}
              <div className="flex gap-2">
                {displayImages.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => emblaApi?.scrollTo(index)}
                    className={cn(
                      'h-11 w-11 rounded-full transition-colors',
                      selectedIndex === index
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-primary hover:bg-primary/10'
                    )}
                    aria-label={`${localized(content.carouselLabels.goTo)} ${index + 1}`}
                  />
                ))}
              </div>

              <motion.button
                onClick={scrollNext}
                className="flex h-12 w-12 items-center justify-center border border-border bg-background text-foreground transition-colors hover:border-primary hover:text-primary hover:bg-muted"
                aria-label={localized(content.carouselLabels.next)}
              >
                <ChevronRight className="h-5 w-5" />
              </motion.button>
            </div>
          </>
        )}

        {/* Gradient fade on right */}
        <div className="pointer-events-none absolute right-0 top-0 h-[calc(100%-4rem)] w-32 bg-gradient-to-l from-background to-transparent" />
      </motion.div>

      <div className="container relative z-10 mt-8 text-center sm:hidden">
        <Button variant="outline" className="min-h-11 border-border bg-background" asChild>
          <PreviewLink href={content.cta.href} preview={preview}>
            {localized(content.cta.label)}
            <ArrowRight className="ml-2 h-4 w-4" />
          </PreviewLink>
        </Button>
      </div>

      {/* Lightbox */}
      <GalleryLightbox
        images={displayImages}
        currentIndex={currentImageIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setCurrentImageIndex}
        labels={{
          close: localized(content.closeLabel),
          previous: localized(content.previousLabel),
          next: localized(content.nextLabel),
          swipeHint: localized(content.swipeHint),
        }}
      />
    </section>
  );
}
