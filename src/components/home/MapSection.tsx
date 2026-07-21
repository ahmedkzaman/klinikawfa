import { motion } from 'framer-motion';
import type { MouseEvent } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { CLINIC_INFO } from '@/lib/constants';
import { ArrowRight, MapPin, Clock, Phone, Navigation } from 'lucide-react';
import type { HomeContent } from '@/features/website-cms/schemas/home';

interface MapSectionProps {
  content: HomeContent['map'];
  preview?: boolean;
}

export function MapSection({ content, preview = false }: MapSectionProps) {
  const { language } = useLanguage();
  const localized = (copy: { ms: string; en: string }) =>
    language === 'ms' ? copy.ms : copy.en || copy.ms;
  const preventPreviewNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
  };

  return (
    <section className="relative py-20 md:py-28 overflow-hidden gradient-section">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="container relative z-10">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 items-center">
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="flex flex-col"
          >
            <motion.span
              initial={false}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 mb-4 w-fit px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20"
            >
              <Navigation className="h-4 w-4" />
              {localized(content.eyebrow)}
            </motion.span>
            
            <h2 className="mb-4">
              {localized(content.title)}
            </h2>
            <p className="mb-10 text-muted-foreground text-lg">
              {localized(content.description)}
            </p>
            
            <div className="space-y-6">
              {/* Address */}
              <motion.div
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="flex items-start gap-4 p-4 rounded-2xl bg-card/50 border border-border/50 shadow-soft"
              >
                <div className="icon-gradient h-12 w-12 shrink-0 text-primary">
                  <MapPin className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold text-lg mb-1">{CLINIC_INFO.name}</h4>
                  <address className="not-italic text-muted-foreground">
                    {CLINIC_INFO.address.line1}
                    <br />
                    {CLINIC_INFO.address.line2}
                    <br />
                    {CLINIC_INFO.address.city}, {CLINIC_INFO.address.state}
                  </address>
                </div>
              </motion.div>

              {/* Operating Hours */}
              <motion.div
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="flex items-start gap-4 p-4 rounded-2xl bg-card/50 border border-border/50 shadow-soft"
              >
                <div className="icon-gradient h-12 w-12 shrink-0 text-primary">
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold text-lg mb-1">{localized(content.hoursLabel)}</h4>
                  <p className="text-muted-foreground">
                    {localized(content.everydayLabel)}
                    <br />
                    {language === 'ms' ? CLINIC_INFO.hours.timeMalay : CLINIC_INFO.hours.time}
                  </p>
                </div>
              </motion.div>

              {/* Phone */}
              <motion.div
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="flex items-start gap-4 p-4 rounded-2xl bg-card/50 border border-border/50 shadow-soft"
              >
                <div className="icon-gradient h-12 w-12 shrink-0 text-primary">
                  <Phone className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold text-lg mb-1">{localized(content.callLabel)}</h4>
                  <a 
                    href={CLINIC_INFO.phoneLink} 
                    className="text-muted-foreground hover:text-primary transition-colors font-medium"
                    onClick={preview ? preventPreviewNavigation : undefined}
                  >
                    {CLINIC_INFO.phone}
                  </a>
                </div>
              </motion.div>
            </div>

            <motion.div
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
            >
              <Button 
                className="mt-8 btn-primary-glow bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary group" 
                size="lg"
                asChild
              >
                <a
                  href={content.directionsCta.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={preview ? preventPreviewNavigation : undefined}
                >
                  {localized(content.directionsCta.label)}
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </a>
              </Button>
            </motion.div>
          </motion.div>

          {/* Map */}
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative overflow-hidden rounded-3xl bg-muted shadow-elevated border border-border/50 group"
          >
            {/* Decorative border gradient */}
            <div className="absolute inset-0 rounded-3xl border-gradient pointer-events-none z-10" />
            {preview ? (
              <div
                aria-label={`${localized(content.embedTitle)} preview`}
                className="flex min-h-[400px] w-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary/10 to-accent/10 px-6 text-center lg:min-h-[500px]"
                role="img"
              >
                <MapPin aria-hidden="true" className="h-14 w-14 text-primary" />
                <p className="text-lg font-semibold text-foreground">
                  {localized(content.embedTitle)}
                </p>
              </div>
            ) : (
              <iframe
                src={content.embedUrl}
                width="100%"
                height="450"
                style={{ border: 0, display: 'block' }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title={localized(content.embedTitle)}
                className="w-full min-h-[400px] lg:min-h-[500px]"
              />
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
