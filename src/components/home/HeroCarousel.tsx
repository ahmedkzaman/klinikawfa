import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { CLINIC_INFO } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar, MessageCircle, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import clinicExterior from '@/assets/klinik-awfa-exterior.webp';

interface HeroSlide {
  id: number;
  titleMs: string;
  titleEn: string;
  subtitleMs: string;
  subtitleEn: string;
}

const slides: HeroSlide[] = [
  {
    id: 1,
    titleMs: 'Klinik Keluarga Anda',
    titleEn: 'Your Family Clinic',
    subtitleMs: 'Rawatan berkualiti untuk seluruh keluarga di KotaSAS',
    subtitleEn: 'Quality healthcare for the whole family at KotaSAS',
  },
  {
    id: 2,
    titleMs: 'Buka Setiap Hari',
    titleEn: 'Open Every Day',
    subtitleMs: '8.00 pagi hingga 12.00 tengah malam untuk keselesaan anda',
    subtitleEn: '8:00 AM to 12:00 Midnight for your convenience',
  },
  {
    id: 3,
    titleMs: 'Pengkhususan Minor Surgery',
    titleEn: 'Special Interest in Minor Surgery',
    subtitleMs: 'Kepakaran dalam rawatan ketumbuhan, ketuat & khatan',
    subtitleEn: 'Expertise in lumps, warts & circumcision treatment',
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

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(nextSlide, autoPlayInterval);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide, autoPlayInterval]);

  const slide = slides[currentSlide];

  return (
    <section
      className="relative overflow-hidden py-24 md:py-32 lg:py-40"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Animated background */}
      <div className="absolute inset-0 gradient-section">
        <img
          src={clinicExterior}
          alt=""
          aria-hidden="true"
          decoding="async"
          loading="eager"
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-[68%_center] opacity-[0.13] md:object-center dark:opacity-[0.08]"
        />
        <motion.div 
          className="floating-orb floating-orb-primary w-[600px] h-[600px] -top-40 -right-40"
          animate={{ 
            x: [0, 30, -20, 0],
            y: [0, -20, 30, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="floating-orb floating-orb-accent w-[500px] h-[500px] -bottom-40 -left-40"
          animate={{ 
            x: [0, -30, 20, 0],
            y: [0, 20, -30, 0],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="floating-orb floating-orb-primary w-[300px] h-[300px] top-1/2 left-1/4"
          animate={{ 
            x: [0, 50, -30, 0],
            y: [0, -40, 20, 0],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="container relative z-10">
        <div className="mx-auto max-w-4xl text-center">
          {/* Clinic badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 inline-flex items-center border-l-2 border-primary pl-3 text-sm font-semibold uppercase tracking-[0.16em] text-primary"
          >
            {CLINIC_INFO.name}
          </motion.div>

          {/* Main title */}
          <AnimatePresence mode="wait">
            <motion.h1
              key={`title-${currentSlide}`}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
              className="mb-6 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl xl:text-7xl"
            >
              <span className="gradient-text">
                {language === 'ms' ? slide.titleMs : slide.titleEn}
              </span>
            </motion.h1>
          </AnimatePresence>

          {/* Subtitle */}
          <AnimatePresence mode="wait">
            <motion.p
              key={`subtitle-${currentSlide}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
              className="mb-10 text-lg text-muted-foreground md:text-xl lg:text-2xl max-w-2xl mx-auto"
            >
              {language === 'ms' ? slide.subtitleMs : slide.subtitleEn}
            </motion.p>
          </AnimatePresence>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button 
              size="lg" 
              className="min-w-[180px] bg-primary hover:bg-primary/90" 
              asChild
            >
              <Link to="/appointment">
                <Calendar className="mr-2 h-5 w-5" />
                {t('cta.bookAppointment')}
              </Link>
            </Button>
            <Button 
              size="lg" 
              className="min-w-[180px] bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90 btn-primary-glow" 
              asChild
            >
              <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-5 w-5" />
                WhatsApp
              </a>
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="min-w-[180px] border-2 hover:bg-primary/5 transition-all duration-300" 
              asChild
            >
              <a href={CLINIC_INFO.phoneLink}>
                <Phone className="mr-2 h-5 w-5" />
                {t('cta.call')}
              </a>
            </Button>
          </motion.div>

          {/* Dots indicator - positioned below CTAs */}
          <div className="mt-10 flex justify-center gap-3">
            {slides.map((_, index) => (
              <motion.button
                key={index}
                onClick={() => goToSlide(index)}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                className={cn(
                  'h-3 rounded-full transition-all duration-500',
                  currentSlide === index
                    ? 'w-10 bg-primary'
                    : 'w-3 bg-primary/30 hover:bg-primary/50'
                )}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Navigation arrows */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={prevSlide}
          className="absolute left-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full glass border border-border/50 text-foreground shadow-card transition-all hover:shadow-elevated md:left-8 md:h-14 md:w-14"
          aria-label="Previous slide"
        >
          <ChevronLeft className="h-5 w-5 md:h-6 md:w-6" />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={nextSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full glass border border-border/50 text-foreground shadow-card transition-all hover:shadow-elevated md:right-8 md:h-14 md:w-14"
          aria-label="Next slide"
        >
          <ChevronRight className="h-5 w-5 md:h-6 md:w-6" />
        </motion.button>
      </div>
    </section>
  );
}
