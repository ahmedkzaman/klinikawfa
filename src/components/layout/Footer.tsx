import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { CLINIC_INFO } from '@/lib/constants';
import { Phone, MessageCircle, Heart } from 'lucide-react';
import logoKlinikAwfa from '@/assets/logo-klinik-awfa.png';

export function Footer() {
  const { language } = useLanguage();
  const { user, isStaffOrAdmin, isGuest } = useAuth();
  return (
    <footer className="relative bg-gradient-to-br from-primary via-primary to-primary-glow text-primary-foreground overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
      </div>

      <div className="container relative z-10 py-14 md:py-20">
        <div className="mb-10">
          <img src={logoKlinikAwfa} alt="Klinik Awfa Logo" className="h-14 w-auto brightness-0 invert opacity-90" />
        </div>
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
          {/* Appointment CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="space-y-5"
          >
            <h3 className="text-2xl font-bold">
              Nak buat temujanji dengan kami?
            </h3>
            <p className="text-primary-foreground/80 text-lg">
              Boleh hubungi kami untuk maklumat lanjut
            </p>
            
            <div className="flex flex-col gap-4">
              <motion.a
                whileHover={{ x: 4 }}
                href={CLINIC_INFO.phoneLink}
                className="inline-flex items-center gap-3 text-lg font-medium group"
                aria-label="Hubungi kami melalui telefon"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm group-hover:bg-white/25 transition-colors">
                  <Phone className="h-5 w-5" aria-hidden="true" />
                </div>
                ☎️ +60 18-252 3531
              </motion.a>
              <motion.a
                whileHover={{ x: 4 }}
                href={CLINIC_INFO.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 text-lg font-medium group"
                aria-label="Hubungi kami melalui WhatsApp"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm group-hover:bg-white/25 transition-colors">
                  <MessageCircle className="h-5 w-5" aria-hidden="true" />
                </div>
                📱 www.wasap.my/60182523531
              </motion.a>
            </div>
          </motion.div>

          {/* Address */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="space-y-5"
          >
            <h3 className="text-2xl font-bold">Klinik Awfa, KotaSAS,</h3>
            <address className="not-italic text-primary-foreground/80 leading-relaxed text-lg">
              B2 & B4, Jalan KS 1/12,
              <br />
              KotaSAS Avenue,
              <br />
              25200 Kuantan, Pahang
            </address>
            <motion.a
              whileHover={{ x: 4 }}
              href={CLINIC_INFO.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold bg-white/15 backdrop-blur-sm px-4 py-2 rounded-xl hover:bg-white/25 transition-colors"
              aria-label="Dapatkan arah ke Klinik Awfa menggunakan Google Maps"
            >
              {language === 'ms' ? 'Dapatkan Arah' : 'Get Directions'} →
            </motion.a>
          </motion.div>

          {/* Operating Hours */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="space-y-5"
          >
            <h3 className="text-2xl font-bold">Waktu Operasi:</h3>
            <div className="text-primary-foreground/80 text-lg">
              <p className="font-semibold text-primary-foreground">Setiap Hari</p>
              <p>8.00 pagi - 12.00 tengah malam</p>
            </div>
            <p className="text-xl font-bold italic flex items-center gap-2">
              <Heart className="h-5 w-5 fill-current" />
              "Klinik Keluarga Anda"
            </p>
          </motion.div>
        </div>

        {/* Bottom bar */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-14 border-t border-primary-foreground/20 pt-8"
        >
          <div className="flex flex-col items-center justify-between gap-4 text-sm text-primary-foreground/70 md:flex-row">
            <div className="flex items-center gap-4">
              {user && isStaffOrAdmin && (
                <Link to="/staff/dashboard" className="hover:text-primary-foreground transition-colors">
                  Staff Portal
                </Link>
              )}
              {user && isGuest && (
                <span className="text-primary-foreground/40 cursor-not-allowed select-none">
                  Staff Portal
                </span>
              )}
              <p>© {new Date().getFullYear()} {CLINIC_INFO.name}. All rights reserved.</p>
            </div>
            <div className="flex gap-6">
              <Link to="/privacy" className="hover:text-primary-foreground transition-colors">
                Privacy Policy
              </Link>
              <Link to="/terms" className="hover:text-primary-foreground transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </footer>
  );
}
