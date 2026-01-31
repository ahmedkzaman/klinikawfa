import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { CLINIC_INFO } from '@/lib/constants';
import { Phone, MessageCircle } from 'lucide-react';

export function Footer() {
  const { language, t } = useLanguage();

  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container py-12 md:py-16">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {/* Appointment CTA */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">{t('footer.appointment')}</h3>
            <p className="text-primary-foreground/80">{t('footer.contact')}</p>
            
            <div className="flex flex-col gap-3">
              <a
                href={CLINIC_INFO.phoneLink}
                className="inline-flex items-center gap-2 text-lg font-medium hover:underline"
              >
                <Phone className="h-5 w-5" />
                {CLINIC_INFO.phone}
              </a>
              <a
                href={CLINIC_INFO.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-lg font-medium hover:underline"
              >
                <MessageCircle className="h-5 w-5" />
                WhatsApp
              </a>
            </div>
          </div>

          {/* Address */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">{CLINIC_INFO.name}</h3>
            <address className="not-italic text-primary-foreground/80 leading-relaxed">
              {CLINIC_INFO.address.line1}
              <br />
              {CLINIC_INFO.address.line2}
              <br />
              {CLINIC_INFO.address.city}, {CLINIC_INFO.address.state}
            </address>
            <a
              href={CLINIC_INFO.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-medium underline underline-offset-4 hover:no-underline"
            >
              {t('cta.getDirections')} →
            </a>
          </div>

          {/* Operating Hours */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">{t('footer.hours')}</h3>
            <div className="text-primary-foreground/80">
              <p className="font-medium">{t('footer.everyday')}</p>
              <p>{language === 'ms' ? CLINIC_INFO.hours.timeMalay : CLINIC_INFO.hours.time}</p>
            </div>
            <p className="text-lg font-semibold italic">
              "{CLINIC_INFO.tagline[language]}"
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 border-t border-primary-foreground/20 pt-6">
          <div className="flex flex-col items-center justify-between gap-4 text-sm text-primary-foreground/60 md:flex-row">
            <p>© {new Date().getFullYear()} {CLINIC_INFO.name}. All rights reserved.</p>
            <div className="flex gap-6">
              <Link to="/privacy" className="hover:text-primary-foreground hover:underline">
                Privacy Policy
              </Link>
              <Link to="/terms" className="hover:text-primary-foreground hover:underline">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
