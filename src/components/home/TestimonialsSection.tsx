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
import { Quote, Star, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
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
    <section className="relative py-20 md:py-28 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="container relative z-10">
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mb-14 text-center"
        >
          <motion.span
            initial={false}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-success/10 text-success text-sm font-medium border border-success/20"
          >
            <Sparkles className="h-4 w-4" />
            {localized(content.eyebrow)}
          </motion.span>
          <h2 className="mb-4">
            {localized(content.title)}
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground text-lg">
            {localized(content.description)}
          </p>
        </motion.div>

        {isLoading ? (
          <div className="flex gap-6 justify-center">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-56 w-full max-w-sm rounded-2xl" />
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
                    className="pl-6 basis-full md:basis-1/2 lg:basis-1/3"
                  >
                    <Card className="group h-full glass-card border-border/30 rounded-2xl overflow-hidden transition-all duration-500 hover:shadow-elevated hover:-translate-y-2">
                      <CardContent className="p-6 relative">
                        {/* Decorative quote */}
                        <div className="absolute -top-2 -left-2 w-16 h-16 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full blur-xl" />
                        <Quote className="relative mb-4 h-10 w-10 text-primary/40" />

                        {/* Rating */}
                        <div className="mb-4 flex gap-1">
                          {Array.from({ length: review.rating }).map((_, i) => (
                            <Star
                              key={i}
                              className="h-5 w-5 fill-accent text-accent drop-shadow-sm"
                            />
                          ))}
                        </div>

                        {/* Text */}
                        <p className="mb-5 text-muted-foreground leading-relaxed line-clamp-4">
                          "
                          {language === 'ms'
                            ? review.text_ms
                            : review.text_en || review.text_ms}
                          "
                        </p>

                        {/* Name */}
                        <div className="pt-4 border-t border-border/50">
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
              <CarouselPrevious className="hidden md:flex -left-4 h-12 w-12 border-2 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all" />
              <CarouselNext className="hidden md:flex -right-4 h-12 w-12 border-2 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all" />
            </Carousel>

            {/* Dot indicators */}
            {count > 1 && (
              <div className="flex justify-center gap-2 mt-8">
                {Array.from({ length: count }).map((_, index) => (
                  <motion.button
                    key={index}
                    onClick={() => scrollTo(index)}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    className={cn(
                      'h-2.5 rounded-full transition-all duration-400',
                      current === index
                        ? 'bg-gradient-to-r from-primary to-primary-glow w-8 shadow-glow-primary'
                        : 'bg-primary/30 w-2.5 hover:bg-primary/50'
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
