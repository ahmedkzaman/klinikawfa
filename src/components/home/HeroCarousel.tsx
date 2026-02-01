import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { CLINIC_INFO } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar, MessageCircle, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeroSlide {
  id: number;
  titleMs: string;
  titleEn: string;
  subtitleMs: string;
  subtitleEn: string;
  gradient: string;
}

const slides: HeroSlide[] = [
  {
    id: 1,
    titleMs: 'Klinik Keluarga Anda',
    titleEn: 'Your Family Clinic',
    subtitleMs: 'Rawatan berkualiti untuk seluruh keluarga di KotaSAS',
    subtitleEn: 'Quality healthcare for the whole family at KotaSAS',
    gradient: 'from-primary/20 via-background to-background',
  },
  {
    id: 2,
    titleMs: 'Buka Setiap Hari',
    titleEn: 'Open Every Day',
    subtitleMs: '8.00 pagi hingga 12.00 tengah malam untuk keselesaan anda',
    subtitleEn: '8:00 AM to 12:00 Midnight for your convenience',
    gradient: 'from-accent/10 via-background to-background',
  },
  {
    id: 3,
    titleMs: 'Pengkhususan Minor Surgery',
    titleEn: 'Special Interest in Minor Surgery',
    subtitleMs: 'Kepakaran dalam rawatan ketumbuhan, ketuat & khatan',
    subtitleEn: 'Expertise in lumps, warts & circumcision treatment',
    gradient: 'from-success/10 via-background to-background',
  },
];

interface HeroCarouselProps {
  autoPlayInterval?: number;
}

export function HeroCarousel({ autoPlayInterval = 5000 }: HeroCarouselProps) {
  const { language, t } = useLanguage();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  }, []);

  const goToSlide = useCallback((index: number) => {
    setCurrentSlide(index);
  }, []);

  // Auto-rotate
  useEffect(() => {
    if (isPaused) return;
    
    const interval = setInterval(nextSlide, autoPlayInterval);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide, autoPlayInterval]);

  const slide = slides[currentSlide];

  return (
    <section
      className={cn(
        'relative overflow-hidden bg-gradient-to-b py-20 md:py-28 lg:py-36 transition-colors duration-700',
        slide.gradient
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="container relative z-10">
        <div className="mx-auto max-w-4xl text-center">
          {/* Clinic name */}
          <p className="mb-4 text-lg font-semibold text-primary animate-fade-in">
            {CLINIC_INFO.name}
          </p>

          {/* Main title */}
          <h1 
            key={`title-${currentSlide}`}
            className="mb-6 text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl animate-fade-in"
          >
            {language === 'ms' ? slide.titleMs : slide.titleEn}
          </h1>

          {/* Subtitle */}
          <p 
            key={`subtitle-${currentSlide}`}
            className="mb-10 text-lg text-muted-foreground md:text-xl animate-fade-in"
            style={{ animationDelay: '0.1s' }}
          >
            {language === 'ms' ? slide.subtitleMs : slide.subtitleEn}
          </p>

          {/* CTAs */}
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <Button size="lg" className="min-w-[180px]" asChild>
              <Link to="/appointment">
                <Calendar className="mr-2 h-5 w-5" />
                {t('cta.bookAppointment')}
              </Link>
            </Button>
            <Button 
              size="lg" 
              className="min-w-[180px] bg-[hsl(142,70%,45%)] text-white hover:bg-[hsl(142,70%,40%)]" 
              asChild
            >
              <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-5 w-5" />
                WhatsApp
              </a>
            </Button>
            <Button size="lg" variant="outline" className="min-w-[180px]" asChild>
              <a href={CLINIC_INFO.phoneLink}>
                <Phone className="mr-2 h-5 w-5" />
                {t('cta.call')}
              </a>
            </Button>
          </div>
        </div>

        {/* Navigation arrows */}
        <button
          onClick={prevSlide}
          className="absolute left-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-background/80 text-foreground shadow-soft backdrop-blur transition-all hover:bg-background hover:shadow-card md:left-8 md:h-12 md:w-12"
          aria-label="Previous slide"
        >
          <ChevronLeft className="h-5 w-5 md:h-6 md:w-6" />
        </button>
        <button
          onClick={nextSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-background/80 text-foreground shadow-soft backdrop-blur transition-all hover:bg-background hover:shadow-card md:right-8 md:h-12 md:w-12"
          aria-label="Next slide"
        >
          <ChevronRight className="h-5 w-5 md:h-6 md:w-6" />
        </button>

        {/* Dots indicator */}
        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                currentSlide === index
                  ? 'w-8 bg-primary'
                  : 'w-2 bg-primary/30 hover:bg-primary/50'
              )}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Decorative elements */}
      <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
    </section>
  );
}
