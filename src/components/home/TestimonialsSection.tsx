import { useRef, useState, useEffect, useCallback } from 'react';
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

export function TestimonialsSection() {
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

  // Don't render section if no reviews
  if (!isLoading && (!reviews || reviews.length === 0)) {
    return null;
  }

  return (
    <section className="bg-muted/30 py-16 md:py-24">
      <div className="container">
        <div className="mb-12 text-center">
          <h2 className="mb-4">
            {language === 'ms' ? 'Apa Kata Pesakit Kami' : 'What Our Patients Say'}
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {language === 'ms'
              ? 'Kepuasan pesakit adalah keutamaan kami.'
              : 'Patient satisfaction is our priority.'}
          </p>
        </div>

        {isLoading ? (
          <div className="flex gap-4 justify-center">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full max-w-sm" />
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-6xl px-10">
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
              <CarouselContent className="-ml-4">
                {reviews?.map((review) => (
                  <CarouselItem
                    key={review.id}
                    className="pl-4 basis-full md:basis-1/2 lg:basis-1/3"
                  >
                    <Card className="h-full border-border/50 bg-card shadow-soft transition-all hover:shadow-card hover:-translate-y-1">
                      <CardContent className="p-6">
                        <Quote className="mb-4 h-8 w-8 text-primary/30" />

                        {/* Rating */}
                        <div className="mb-3 flex gap-0.5">
                          {Array.from({ length: review.rating }).map((_, i) => (
                            <Star
                              key={i}
                              className="h-4 w-4 fill-accent text-accent"
                            />
                          ))}
                        </div>

                        {/* Text */}
                        <p className="mb-4 text-sm text-muted-foreground leading-relaxed line-clamp-4">
                          "
                          {language === 'ms'
                            ? review.text_ms
                            : review.text_en || review.text_ms}
                          "
                        </p>

                        {/* Name */}
                        <p className="font-semibold text-foreground">
                          {language === 'ms'
                            ? review.name_ms
                            : review.name_en || review.name_ms}
                        </p>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="hidden md:flex" />
              <CarouselNext className="hidden md:flex" />
            </Carousel>

            {/* Dot indicators */}
            {count > 1 && (
              <div className="flex justify-center gap-2 mt-6">
                {Array.from({ length: count }).map((_, index) => (
                  <button
                    key={index}
                    onClick={() => scrollTo(index)}
                    className={cn(
                      'h-2 w-2 rounded-full transition-all',
                      current === index
                        ? 'bg-primary w-4'
                        : 'bg-primary/30 hover:bg-primary/50'
                    )}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
