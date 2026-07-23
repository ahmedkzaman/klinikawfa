import { useState, useEffect, useCallback, type MouseEvent } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { CLINIC_INFO } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar, MessageCircle, Pause, Phone, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HomeContent } from '@/features/website-cms/schemas/home';

interface HeroCarouselProps {
  content: HomeContent['hero'];
  preview?: boolean;
}

export function HeroCarousel({ content, preview = false }: HeroCarouselProps) {
  const { language } = useLanguage();
  const slides = content.slides;
  const backgroundOpacity = Number.isFinite(content.backgroundOpacity)
    ? Math.min(25, Math.max(5, content.backgroundOpacity))
    : 13;
  const autoplayMs = Number.isFinite(content.autoplayMs)
    ? Math.min(15000, Math.max(3000, Math.round(content.autoplayMs)))
    : 5000;
  const [currentSlide, setCurrentSlide] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const [isManuallyPaused, setIsManuallyPaused] = useState(false);
  const [isPointerPaused, setIsPointerPaused] = useState(false);
  const [isFocusPaused, setIsFocusPaused] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) =>
      slides.length > 0 ? (prev + 1) % slides.length : 0,
    );
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) =>
      slides.length > 0 ? (prev - 1 + slides.length) % slides.length : 0,
    );
  }, [slides.length]);

  const goToSlide = useCallback(
    (index: number) => {
      setCurrentSlide(
        slides.length > 0 ? Math.min(slides.length - 1, Math.max(0, index)) : 0,
      );
    },
    [slides.length],
  );

  useEffect(() => {
    setCurrentSlide((previous) =>
      slides.length > 0 ? Math.min(previous, slides.length - 1) : 0,
    );
  }, [slides.length]);

  useEffect(() => {
    if (
      shouldReduceMotion ||
      isManuallyPaused ||
      isPointerPaused ||
      isFocusPaused ||
      slides.length <= 1
    ) return;
    const interval = setInterval(nextSlide, autoplayMs);
    return () => clearInterval(interval);
  }, [
    autoplayMs,
    isFocusPaused,
    isManuallyPaused,
    isPointerPaused,
    nextSlide,
    shouldReduceMotion,
    slides.length,
  ]);

  const safeCurrentSlide =
    slides.length > 0 ? Math.min(currentSlide, slides.length - 1) : 0;
  const slide = slides[safeCurrentSlide];
  const localized = (copy: { ms: string; en: string }) =>
    language === 'ms' ? copy.ms : copy.en || copy.ms;
  const preventPreviewNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
  };

  if (!slide) return null;

  return (
    <section
      className="relative overflow-hidden bg-background py-16 md:py-20 lg:py-24"
      onMouseEnter={() => setIsPointerPaused(true)}
      onMouseLeave={() => setIsPointerPaused(false)}
      onFocusCapture={() => setIsFocusPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsFocusPaused(false);
        }
      }}
    >
      <div className="absolute inset-0">
        <img
          src={content.backgroundImage}
          alt={localized(content.backgroundAlt)}
          aria-hidden={localized(content.backgroundAlt) ? undefined : 'true'}
          decoding="async"
          loading="eager"
          draggable={false}
          style={backgroundOpacity === 13 ? undefined : { opacity: backgroundOpacity / 100 }}
          className={cn(
            'pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-[68%_center] opacity-[0.13] md:object-center dark:opacity-[0.08]',
            backgroundOpacity !== 13 && 'dark:!opacity-[0.08]',
          )}
        />
      </div>

      <div className="container relative z-10">
        <div className="mx-auto max-w-4xl border border-primary/15 bg-background/90 px-6 py-10 text-center shadow-card backdrop-blur-sm sm:px-10 md:py-12">
          {/* Clinic badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-5 inline-flex items-center border-l-2 border-primary pl-3 text-sm font-semibold uppercase tracking-[0.16em] text-primary"
          >
            {CLINIC_INFO.name}
          </motion.div>

          {/* Main title */}
          <AnimatePresence mode="wait">
            <motion.h1
              key={`title-${safeCurrentSlide}`}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
              className="mb-5 font-display text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl"
            >
              <span className="text-foreground">
                {localized(slide.title)}
              </span>
            </motion.h1>
          </AnimatePresence>

          {/* Subtitle */}
          <AnimatePresence mode="wait">
            <motion.p
              key={`subtitle-${safeCurrentSlide}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
              className="mx-auto mb-8 max-w-2xl text-lg leading-8 text-muted-foreground md:text-xl"
            >
              {localized(slide.subtitle)}
            </motion.p>
          </AnimatePresence>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center"
          >
            {content.ctas.map((cta, index) => {
              const Icon = index === 0 ? Calendar : index === 1 ? MessageCircle : Phone;
              const linkContent = (
                <>
                  <Icon className="mr-2 h-5 w-5" />
                  {localized(cta.label)}
                </>
              );
              const child = cta.href.startsWith('/') ? (
                <Link
                  to={cta.href}
                  onClick={preview ? preventPreviewNavigation : undefined}
                >
                  {linkContent}
                </Link>
              ) : (
                <a
                  href={cta.href}
                  target={cta.href.startsWith('http') ? '_blank' : undefined}
                  rel={cta.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  onClick={preview ? preventPreviewNavigation : undefined}
                >
                  {linkContent}
                </a>
              );

              return (
                <Button
                  key={`${cta.href}-${index}`}
                  size="lg"
                  variant={index >= 2 ? 'outline' : undefined}
                  className={cn(
                    'min-h-11 min-w-[180px]',
                    index === 0 && 'bg-primary shadow-soft hover:bg-primary/90',
                    index === 1 &&
                      'bg-whatsapp text-whatsapp-foreground shadow-soft hover:bg-whatsapp/90',
                    index >= 2 &&
                      'border-border bg-background text-foreground hover:bg-muted',
                  )}
                  asChild
                >
                  {child}
                </Button>
              );
            })}
          </motion.div>

          {/* Dots indicator - positioned below CTAs */}
          <div className="mt-8 flex justify-center gap-1">
            {slides.map((_, index) => (
              <motion.button
                key={index}
                onClick={() => goToSlide(index)}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
                  safeCurrentSlide === index
                    ? 'w-10 min-w-11 text-primary'
                    : 'text-primary/35 hover:text-primary/70'
                )}
                aria-label={`${localized(content.carouselLabels.goTo)} ${index + 1}`}
              ><span className={cn('block h-2 rounded-full', safeCurrentSlide === index ? 'w-7 bg-current' : 'w-2 bg-current')} /></motion.button>
            ))}
            {slides.length > 1 && (
              <button
                type="button"
                onClick={() => setIsManuallyPaused((paused) => !paused)}
                className="ml-2 flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-background px-3 text-primary transition-colors hover:bg-muted"
                aria-label={
                  isManuallyPaused
                    ? language === 'ms'
                      ? 'Sambung karusel'
                      : 'Resume carousel'
                    : language === 'ms'
                      ? 'Jeda karusel'
                      : 'Pause carousel'
                }
                aria-pressed={isManuallyPaused}
              >
                {isManuallyPaused ? (
                  <Play className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Pause className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Navigation arrows */}
        <motion.button
          onClick={prevSlide}
          className="absolute left-3 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center border border-border bg-background/95 text-foreground shadow-soft transition-colors hover:bg-muted md:left-6"
          aria-label={localized(content.carouselLabels.previous)}
        >
          <ChevronLeft className="h-5 w-5 md:h-6 md:w-6" />
        </motion.button>
        <motion.button
          onClick={nextSlide}
          className="absolute right-3 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center border border-border bg-background/95 text-foreground shadow-soft transition-colors hover:bg-muted md:right-6"
          aria-label={localized(content.carouselLabels.next)}
        >
          <ChevronRight className="h-5 w-5 md:h-6 md:w-6" />
        </motion.button>
      </div>
    </section>
  );
}
