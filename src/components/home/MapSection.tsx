import { motion } from 'framer-motion';
import type { MouseEvent } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { CLINIC_INFO } from '@/lib/constants';
import { PublicSectionHeader } from '@/components/public';
import { ArrowRight, MapPin, Clock, Phone } from 'lucide-react';
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
    <section className="public-section bg-muted/45">
      <div className="container relative z-10">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 items-center">
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="flex flex-col"
          >
            <PublicSectionHeader
              eyebrow={localized(content.eyebrow)}
              title={localized(content.title)}
              description={localized(content.description)}
            />
            
            <div className="space-y-6">
              {/* Address */}
              <motion.div
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
              className="flex items-start gap-4 border border-border bg-card p-4 shadow-soft"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-primary/20 bg-muted text-primary">
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
              className="flex items-start gap-4 border border-border bg-card p-4 shadow-soft"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-primary/20 bg-muted text-primary">
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
              className="flex items-start gap-4 border border-border bg-card p-4 shadow-soft"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-primary/20 bg-muted text-primary">
                  <Phone className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold text-lg mb-1">{localized(content.callLabel)}</h4>
                  <a 
                    href={CLINIC_INFO.phoneLink} 
                    className="inline-flex min-h-11 items-center py-2 text-muted-foreground font-medium transition-colors hover:text-primary"
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
                className="group mt-8 min-h-11 bg-primary shadow-soft hover:bg-primary/90"
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
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
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
            className="relative overflow-hidden border border-border bg-muted shadow-card"
          >
            {preview ? (
              <div
                aria-label={`${localized(content.embedTitle)} preview`}
                className="flex min-h-[400px] w-full flex-col items-center justify-center gap-4 bg-muted px-6 text-center lg:min-h-[500px]"
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
