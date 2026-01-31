import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { CLINIC_INFO } from '@/lib/constants';
import { ArrowRight, MapPin, Clock, Phone } from 'lucide-react';

export function MapSection() {
  const { language, t } = useLanguage();

  return (
    <section className="py-16 md:py-24">
      <div className="container">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="flex flex-col justify-center">
            <h2 className="mb-4">
              {language === 'ms' ? 'Lokasi Kami' : 'Our Location'}
            </h2>
            <p className="mb-8 text-muted-foreground">
              {language === 'ms'
                ? 'Mudah diakses di KotaSAS Avenue, Kuantan. Kami sedia menerima kunjungan anda.'
                : 'Easily accessible at KotaSAS Avenue, Kuantan. We are ready to welcome your visit.'}
            </p>
            
            <div className="space-y-6">
              {/* Address */}
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold">{CLINIC_INFO.name}</h4>
                  <address className="not-italic text-muted-foreground">
                    {CLINIC_INFO.address.line1}
                    <br />
                    {CLINIC_INFO.address.line2}
                    <br />
                    {CLINIC_INFO.address.city}, {CLINIC_INFO.address.state}
                  </address>
                </div>
              </div>

              {/* Operating Hours */}
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold">{t('footer.hours')}</h4>
                  <p className="text-muted-foreground">
                    {t('footer.everyday')}
                    <br />
                    {language === 'ms' ? CLINIC_INFO.hours.timeMalay : CLINIC_INFO.hours.time}
                  </p>
                </div>
              </div>

              {/* Phone */}
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold">{t('cta.call')}</h4>
                  <a 
                    href={CLINIC_INFO.phoneLink} 
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    {CLINIC_INFO.phone}
                  </a>
                </div>
              </div>
            </div>

            <Button className="mt-8 w-fit" asChild>
              <a href={CLINIC_INFO.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                {t('cta.getDirections')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>

          {/* Map */}
          <div className="aspect-square overflow-hidden rounded-2xl bg-muted shadow-card lg:aspect-auto lg:min-h-[400px]">
            <iframe
              src={CLINIC_INFO.googleMapsEmbed}
              width="100%"
              height="100%"
              style={{ border: 0, minHeight: '100%' }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Klinik Awfa Location"
              className="h-full w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
