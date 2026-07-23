import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { CLINIC_INFO } from '@/lib/constants';
import { Phone, MessageCircle, Heart } from 'lucide-react';
import logoKlinikAwfa from '@/assets/logo-klinik-awfa.png';
import { usePublishedNavigation } from '@/hooks/usePublishedNavigation';

export function Footer() {
  const { language } = useLanguage();
  const { user, isStaffOrAdmin } = useAuth();
  const managedNavigation = usePublishedNavigation();
  const navigationItems = managedNavigation?.filter((item) => !item.parentId).slice(0, 6) ?? [];

  return (
    <footer className="bg-primary pb-20 text-primary-foreground lg:pb-0">
      <div className="container py-12 md:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
          <section className="space-y-5" aria-label={CLINIC_INFO.name}>
            <img src={logoKlinikAwfa} alt="Klinik Awfa Logo" className="h-14 w-auto brightness-0 invert" />
            <h3 className="font-display text-2xl font-bold">Nak buat temujanji dengan kami?</h3>
            <p className="text-primary-foreground/80">Boleh hubungi kami untuk maklumat lanjut</p>
            <p className="flex items-center gap-2 font-semibold">
              <Heart className="h-5 w-5 fill-current" aria-hidden="true" />
              "Klinik Keluarga Anda"
            </p>
          </section>

          <section className="space-y-5" aria-label={language === 'ms' ? 'Hubungi dan waktu operasi' : 'Contact and opening hours'}>
            <div className="space-y-3">
              <h3 className="font-display text-xl font-bold">Klinik Awfa, KotaSAS,</h3>
              <address className="not-italic leading-relaxed text-primary-foreground/80">
                B2 & B4, Jalan KS 1/12,<br />
                KotaSAS Avenue,<br />
                25200 Kuantan, Pahang
              </address>
              <a href={CLINIC_INFO.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 hover:text-primary-foreground/80">
                {language === 'ms' ? 'Dapatkan Arah' : 'Get Directions'} →
              </a>
            </div>
            <div className="space-y-2">
              <a href={CLINIC_INFO.phoneLink} className="flex min-h-11 items-center gap-3 font-medium" aria-label="Hubungi kami melalui telefon">
                <Phone className="h-5 w-5" aria-hidden="true" />
                ☎️ +60 18-252 3531
              </a>
              <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-3 font-medium" aria-label="Hubungi kami melalui WhatsApp">
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
                📱 www.wasap.my/60182523531
              </a>
            </div>
            <div>
              <h3 className="font-display text-xl font-bold">Waktu Operasi:</h3>
              <p className="mt-2 font-semibold">Setiap Hari</p>
              <p className="text-primary-foreground/80">8.00 pagi - 12.00 tengah malam</p>
            </div>
          </section>

          <section className="space-y-5" aria-label={language === 'ms' ? 'Navigasi' : 'Navigation'}>
            <nav aria-label={language === 'ms' ? 'Navigasi footer' : 'Footer navigation'} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {navigationItems.map((item) => (
                <Link key={item.id} to={item.href} className="flex min-h-11 items-center hover:text-primary-foreground/80">
                  {language === 'en' ? item.labelEn || item.labelMs : item.labelMs}
                </Link>
              ))}
              <Link to="/privacy" className="flex min-h-11 items-center hover:text-primary-foreground/80">Privacy Policy</Link>
              <Link to="/terms" className="flex min-h-11 items-center hover:text-primary-foreground/80">Terms of Service</Link>
              {user && isStaffOrAdmin && (
                <Link to="/staff/dashboard" className="flex min-h-11 items-center hover:text-primary-foreground/80">Staff Portal</Link>
              )}
            </nav>
          </section>
        </div>

        <div className="mt-10 border-t border-primary-foreground/20 pt-6 text-sm text-primary-foreground/70">
          <p>© {new Date().getFullYear()} {CLINIC_INFO.name}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
