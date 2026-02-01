import { useLanguage } from '@/contexts/LanguageContext';
import { useReviews } from '@/hooks/useReviews';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Quote, Star } from 'lucide-react';

export function TestimonialsSection() {
  const { language } = useLanguage();
  const { data: reviews, isLoading } = useReviews(true);

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
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {reviews?.map((review, index) => (
              <Card 
                key={review.id} 
                className="group border-border/50 bg-card shadow-soft transition-all hover:shadow-card hover:-translate-y-1"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <CardContent className="p-6">
                  <Quote className="mb-4 h-8 w-8 text-primary/30" />
                  
                  {/* Rating */}
                  <div className="mb-3 flex gap-0.5">
                    {Array.from({ length: review.rating }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-accent text-accent" />
                    ))}
                  </div>

                  {/* Text */}
                  <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
                    "{language === 'ms' ? review.text_ms : (review.text_en || review.text_ms)}"
                  </p>

                  {/* Name */}
                  <p className="font-semibold text-foreground">
                    {language === 'ms' ? review.name_ms : (review.name_en || review.name_ms)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
