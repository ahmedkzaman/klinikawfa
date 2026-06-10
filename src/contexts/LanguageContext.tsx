import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type Language = 'ms' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Translation dictionary
const translations: Record<Language, Record<string, string>> = {
  ms: {
    // Navigation
    'nav.home': 'Utama',
    'nav.services': 'Perkhidmatan',
    'nav.doctors': 'Doktor',
    'nav.onDuty': 'Doktor Bertugas',
    'nav.appointment': 'Temujanji',
    'nav.gallery': 'Galeri',
    'nav.healthTips': 'Tips Kesihatan',
    
    // CTAs
    'cta.bookAppointment': 'Buat Temujanji',
    'cta.whatsapp': 'WhatsApp',
    'cta.call': 'Hubungi',
    'cta.learnMore': 'Ketahui Lebih',
    'cta.viewAll': 'Lihat Semua',
    'cta.getDirections': 'Dapatkan Arah',
    
    // Hero
    'hero.title': 'Klinik Keluarga Anda',
    'hero.subtitle': 'Rawatan berkualiti untuk seluruh keluarga di KotaSAS',
    
    // Why Klinik Awfa
    'why.title': 'Mengapa Klinik Awfa?',
    'why.openDaily': 'Buka Setiap Hari',
    'why.openDailyDesc': '8.00 pagi – 12.00 tengah malam',
    'why.comfortable': 'Ruang Menunggu Selesa',
    'why.comfortableDesc': 'Termasuk zon permainan kanak-kanak',
    'why.familyClinic': 'Klinik Keluarga',
    'why.familyClinicDesc': 'Melayani seluruh keluarga di KotaSAS',
    'why.experienced': 'Doktor Berpengalaman',
    'why.experiencedDesc': 'Bertahun-tahun pengalaman dalam perubatan keluarga',
    'why.minorSurgery': 'Pengkhususan Minor Surgery',
    'why.minorSurgeryDesc': 'Kepakaran dalam rawatan ketumbuhan, ketuat & khatan',
    'why.ent': 'Perkhidmatan ENT',
    'why.entDesc': 'Termasuk microsuction untuk penjagaan telinga profesional',
    
    // Services
    'services.title': 'Perkhidmatan Kami',
    'services.generalTreatment': 'Rawatan Umum',
    'services.coldFlu': 'Sakit Tekak / Selsema / Demam',
    'services.rapidTests': 'Ujian Pantas: Influenza / COVID / RSV',
    'services.nebulizer': 'Terapi Nebulizer',
    'services.sputumSuction': 'Sedutan Kahak',
    'services.nasalIrrigation': 'Pencucian Hidung',
    'services.earCare': 'Penjagaan Telinga (Microsuction)',
    'services.circumcision': 'Khatan: Kanak-kanak & Dewasa',
    'services.lumpWart': 'Rawatan Ketumbuhan & Ketuat',
    
    // Doctors
    'doctors.title': 'Pasukan Perubatan Kami',
    'doctors.subtitle': 'Doktor berpengalaman yang mengutamakan kesihatan anda',
    
    // Footer
    'footer.appointment': 'Nak buat temujanji dengan kami?',
    'footer.contact': 'Boleh hubungi kami untuk maklumat lanjut',
    'footer.hours': 'Waktu Operasi',
    'footer.everyday': 'Setiap Hari',
    'footer.time': '8.00 pagi - 12.00 tengah malam',
    'footer.tagline': 'Klinik Keluarga Anda',
    
    // Common
    'common.address': 'B2 & B4, Jalan KS 1/12, KotaSAS Avenue, 25200 Kuantan, Pahang',
    'common.phone': '+60 18-252 3531',
  },
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.services': 'Services',
    'nav.doctors': 'Doctors',
    'nav.appointment': 'Appointment',
    'nav.gallery': 'Gallery',
    'nav.healthTips': 'Health Tips',
    
    // CTAs
    'cta.bookAppointment': 'Book Appointment',
    'cta.whatsapp': 'WhatsApp',
    'cta.call': 'Call',
    'cta.learnMore': 'Learn More',
    'cta.viewAll': 'View All',
    'cta.getDirections': 'Get Directions',
    
    // Hero
    'hero.title': 'Your Family Clinic',
    'hero.subtitle': 'Quality healthcare for the whole family at KotaSAS',
    
    // Why Klinik Awfa
    'why.title': 'Why Klinik Awfa?',
    'why.openDaily': 'Open Daily',
    'why.openDailyDesc': '8:00 AM – 12:00 Midnight',
    'why.comfortable': 'Comfortable Waiting Area',
    'why.comfortableDesc': 'Including kids play zone',
    'why.familyClinic': 'Family Clinic',
    'why.familyClinicDesc': 'Serving all families at KotaSAS',
    'why.experienced': 'Experienced Doctors',
    'why.experiencedDesc': 'Years of experience in family medicine',
    'why.minorSurgery': 'Special Interest in Minor Surgery',
    'why.minorSurgeryDesc': 'Expertise in lumps, warts & circumcision treatment',
    'why.ent': 'ENT Services',
    'why.entDesc': 'Including microsuction for professional ear care',
    
    // Services
    'services.title': 'Our Services',
    'services.generalTreatment': 'General Treatment',
    'services.coldFlu': 'Sore Throat / Cold / Fever',
    'services.rapidTests': 'Rapid Tests: Influenza / COVID / RSV',
    'services.nebulizer': 'Nebulizer Therapy',
    'services.sputumSuction': 'Sputum Suction',
    'services.nasalIrrigation': 'Nasal Irrigation',
    'services.earCare': 'Ear Care (Microsuction)',
    'services.circumcision': 'Circumcision: Children & Adults',
    'services.lumpWart': 'Lump & Wart Treatment',
    
    // Doctors
    'doctors.title': 'Our Medical Team',
    'doctors.subtitle': 'Experienced doctors who prioritize your health',
    
    // Footer
    'footer.appointment': 'Want to book an appointment?',
    'footer.contact': 'Contact us for more information',
    'footer.hours': 'Operating Hours',
    'footer.everyday': 'Every Day',
    'footer.time': '8:00 AM - 12:00 Midnight',
    'footer.tagline': 'Your Family Clinic',
    
    // Common
    'common.address': 'B2 & B4, Jalan KS 1/12, KotaSAS Avenue, 25200 Kuantan, Pahang',
    'common.phone': '+60 18-252 3531',
  },
};

const STORAGE_KEY = 'klinik-awfa-language';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ms');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored && (stored === 'ms' || stored === 'en')) {
      setLanguageState(stored);
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  }, []);

  const t = useCallback((key: string): string => {
    return translations[language][key] || key;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
