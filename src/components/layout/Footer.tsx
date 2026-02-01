import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { CLINIC_INFO } from '@/lib/constants';
import { Phone, MessageCircle } from 'lucide-react';

export function Footer() {
  const { language } = useLanguage();

  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container py-12 md:py-16">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {/* Appointment CTA - Required verbatim copy */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">
              Nak buat temujanji dengan kami?
            </h3>
            <p className="text-primary-foreground/80">
              Boleh hubungi kami untuk maklumat lanjut
            </p>
            
            <div className="flex flex-col gap-3">
              <a
                href={CLINIC_INFO.phoneLink}
                className="inline-flex items-center gap-2 text-lg font-medium hover:underline"
                aria-label="Hubungi kami melalui telefon"
              >
                <Phone className="h-5 w-5" aria-hidden="true" />
                ☎️ +60 18-252 3531
              </a>
              <a
                href={CLINIC_INFO.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-lg font-medium hover:underline"
                aria-label="Hubungi kami melalui WhatsApp"
              >
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
                📱 www.wasap.my/60182523531
              </a>
            </div>
          </div>

          {/* Address - Required verbatim copy */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Klinik Awfa, KotaSAS,</h3>
            <address className="not-italic text-primary-foreground/80 leading-relaxed">
              B2 & B4, Jalan KS 1/12,
              <br />
              KotaSAS Avenue,
              <br />
              25200 Kuantan, Pahang
            </address>
            <a
              href={CLINIC_INFO.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-medium underline underline-offset-4 hover:no-underline"
              aria-label="Dapatkan arah ke Klinik Awfa menggunakan Google Maps"
            >
              {language === 'ms' ? 'Dapatkan Arah' : 'Get Directions'} →
            </a>
          </div>

          {/* Operating Hours - Required verbatim copy */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Waktu Operasi:</h3>
            <div className="text-primary-foreground/80">
              <p className="font-medium">Setiap Hari</p>
              <p>8.00 pagi - 12.00 tengah malam</p>
            </div>
            <p className="text-lg font-semibold italic">
              "Klinik Keluarga Anda"
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
