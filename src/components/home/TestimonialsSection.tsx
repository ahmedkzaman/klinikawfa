import { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Autoplay from 'embla-carousel-autoplay';
import { useLanguage } from '@/contexts/LanguageContext';
import { useReviews } from '@/hooks/useReviews';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from '@/components/ui/carousel';
import { Quote, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PublicSectionHeader } from '@/components/public';
import type { HomeContent } from '@/features/website-cms/schemas/home';

interface TestimonialsSectionProps {
  content: HomeContent['testimonials'];
  preview?: boolean;
}

export function TestimonialsSection({ content, preview = false }: TestimonialsSectionProps) {
  const { language } = useLanguage();
  const { data: reviews, isLoading } = useReviews(true);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  const autoplayPlugin = useRef(
    Autoplay({ delay: 5000, stopOnInteraction: true })
  );

  useEffect(() => {
    if (!api) return;

    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap());

    api.on('select', () => {
      setCurrent(api.selectedScrollSnap());
    });
  }, [api]);

  const scrollTo = useCallback(
    (index: number) => {
      api?.scrollTo(index);
    },
    [api]
  );
  const localized = (copy: { ms: string; en: string }) =>
    language === 'ms' ? copy.ms : copy.en || copy.ms;

  if (!isLoading && (!reviews || reviews.length === 0)) {
    return null;
  }

  return (
    <section className="public-section bg-muted/45">
      <div className="container relative z-10">
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <PublicSectionHeader
            align="center"
            eyebrow={localized(content.eyebrow)}
            title={localized(content.title)}
            description={localized(content.description)}
          />
        </motion.div>

        {isLoading ? (
          <div className="flex gap-6 justify-center">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-56 w-full max-w-sm rounded-none" />
            ))}
          </div>
        ) : (
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto max-w-6xl px-10"
          >
            <Carousel
              aria-roledescription={localized(content.carouselRoleDescription)}
              setApi={setApi}
              plugins={[autoplayPlugin.current]}
              opts={{
                loop: true,
                align: 'start',
              }}
              className="w-full"
              onMouseEnter={() => autoplayPlugin.current.stop()}
              onMouseLeave={() => autoplayPlugin.current.play()}
            >
              <CarouselContent className="-ml-6">
                {reviews?.map((review, index) => (
                  <CarouselItem
                    key={review.id}
                    aria-roledescription={localized(content.slideRoleDescription)}
                    className="pl-6 basis-full md:basis-1/2 lg:basis-1/3"
                  >
                    <Card className="h-full rounded-none border-border bg-card shadow-soft transition-transform hover:-translate-y-0.5 hover:border-primary/35">
                      <CardContent className="relative p-7">
                        <Quote className="mb-6 h-9 w-9 text-primary" aria-hidden="true" />

                        {/* Rating */}
                        <div className="mb-4 flex gap-1">
                          {Array.from({ length: review.rating }).map((_, i) => (
                            <Star
                              key={i}
                              className="h-4 w-4 fill-accent text-accent"
                            />
                          ))}
                        </div>

                        {/* Text */}
                        <p className="mb-6 font-display text-lg leading-8 text-foreground line-clamp-4">
                          "
                          {language === 'ms'
                            ? review.text_ms
                            : review.text_en || review.text_ms}
                          "
                        </p>

                        {/* Name */}
                        <div className="border-t border-border pt-4">
                          <p className="font-bold text-foreground">
                            {language === 'ms'
                              ? review.name_ms
                              : review.name_en || review.name_ms}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {localized(content.patientLabel)}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious
                ariaLabel={localized(content.previousSlideLabel)}
                className="hidden h-12 w-12 rounded-none border-border bg-background hover:border-primary hover:bg-primary hover:text-primary-foreground md:flex"
              />
              <CarouselNext
                ariaLabel={localized(content.nextSlideLabel)}
                className="hidden h-12 w-12 rounded-none border-border bg-background hover:border-primary hover:bg-primary hover:text-primary-foreground md:flex"
              />
            </Carousel>

            {/* Dot indicators */}
            {count > 1 && (
              <div className="flex justify-center gap-2 mt-8">
                {Array.from({ length: count }).map((_, index) => (
                  <motion.button
                    key={index}
                    onClick={() => scrollTo(index)}
                    className={cn(
                      'h-11 w-11 rounded-full transition-colors',
                      current === index
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-primary hover:bg-primary/10'
                    )}
                    aria-label={`${localized(content.goToSlideLabel)} ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </section>
  );
}
