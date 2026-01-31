// Clinic contact information
export const CLINIC_INFO = {
  name: 'Klinik Awfa',
  phone: '+60 18-252 3531',
  phoneLink: 'tel:+60182523531',
  whatsapp: 'http://www.wasap.my/60182523531',
  address: {
    line1: 'B2 & B4, Jalan KS 1/12',
    line2: 'KotaSAS Avenue',
    city: '25200 Kuantan',
    state: 'Pahang',
    country: 'Malaysia',
    full: 'B2 & B4, Jalan KS 1/12, KotaSAS Avenue, 25200 Kuantan, Pahang',
  },
  hours: {
    days: 'Setiap Hari / Every Day',
    time: '8:00 AM - 12:00 Midnight',
    timeMalay: '8.00 pagi - 12.00 tengah malam',
  },
  tagline: {
    ms: 'Klinik Keluarga Anda',
    en: 'Your Family Clinic',
  },
  googleMapsUrl: 'https://maps.google.com/?q=Klinik+Awfa+KotaSAS+Kuantan',
  googleMapsEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3975.5!2d103.4!3d3.8!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zM8KwNDgnMDAuMCJOIDEwM8KwMjQnMDAuMCJF!5e0!3m2!1sen!2smy!4v1234567890',
} as const;

// Service categories
export const SERVICES = [
  {
    id: 'general-treatment',
    slug: 'rawatan-umum',
    icon: 'Stethoscope',
    titleMs: 'Rawatan Umum',
    titleEn: 'General Treatment',
  },
  {
    id: 'cold-flu',
    slug: 'sakit-tekak-selsema-demam',
    icon: 'Thermometer',
    titleMs: 'Sakit Tekak / Selsema / Demam',
    titleEn: 'Sore Throat / Cold / Fever',
  },
  {
    id: 'rapid-tests',
    slug: 'ujian-pantas',
    icon: 'TestTube',
    titleMs: 'Ujian Pantas: Influenza / COVID / RSV',
    titleEn: 'Rapid Tests: Influenza / COVID / RSV',
  },
  {
    id: 'nebulizer',
    slug: 'nebulizer',
    icon: 'Wind',
    titleMs: 'Terapi Nebulizer',
    titleEn: 'Nebulizer Therapy',
  },
  {
    id: 'sputum-suction',
    slug: 'sedutan-kahak',
    icon: 'Activity',
    titleMs: 'Sedutan Kahak',
    titleEn: 'Sputum Suction',
  },
  {
    id: 'nasal-irrigation',
    slug: 'pencucian-hidung',
    icon: 'Droplets',
    titleMs: 'Pencucian Hidung',
    titleEn: 'Nasal Irrigation',
  },
  {
    id: 'ear-care',
    slug: 'penjagaan-telinga',
    icon: 'Ear',
    titleMs: 'Penjagaan Telinga (Microsuction)',
    titleEn: 'Ear Care (Microsuction)',
  },
  {
    id: 'circumcision',
    slug: 'khatan',
    icon: 'Scissors',
    titleMs: 'Khatan: Kanak-kanak & Dewasa',
    titleEn: 'Circumcision: Children & Adults',
  },
  {
    id: 'lump-wart',
    slug: 'ketumbuhan-ketuat',
    icon: 'Circle',
    titleMs: 'Rawatan Ketumbuhan & Ketuat',
    titleEn: 'Lump & Wart Treatment',
  },
  {
    id: 'full-blood-count',
    slug: 'ujian-darah-penuh',
    icon: 'Droplet',
    titleMs: 'Ujian Darah Penuh (FBC)',
    titleEn: 'Full Blood Count (FBC)',
  },
  {
    id: 'dengue-test',
    slug: 'ujian-denggi',
    icon: 'Bug',
    titleMs: 'Ujian Denggi',
    titleEn: 'Dengue Test',
  },
  {
    id: 'blood-investigation',
    slug: 'pemeriksaan-darah',
    icon: 'FlaskConical',
    titleMs: 'Pemeriksaan Darah Menyeluruh',
    titleEn: 'Thorough Blood Investigation',
  },
  {
    id: 'student-checkup',
    slug: 'pemeriksaan-pelajar',
    icon: 'GraduationCap',
    titleMs: 'Pemeriksaan Kesihatan Pelajar',
    titleEn: 'Student Medical Checkup',
  },
  {
    id: 'pre-employment-checkup',
    slug: 'pemeriksaan-pra-pekerjaan',
    icon: 'Briefcase',
    titleMs: 'Pemeriksaan Kesihatan Pra-Pekerjaan',
    titleEn: 'Pre-Employment Medical Checkup',
  },
  {
    id: 'return-to-work',
    slug: 'pemeriksaan-kembali-bekerja',
    icon: 'ClipboardCheck',
    titleMs: 'Penilaian Kembali Bekerja',
    titleEn: 'Return to Work Assessment',
  },
  {
    id: 'haj-checkup',
    slug: 'pemeriksaan-haji-2026',
    icon: 'Star',
    titleMs: 'Pemeriksaan Kesihatan Haji 2026',
    titleEn: 'Haj 2026 Medical Checkup',
  },
] as const;

// Navigation items
export const NAV_ITEMS = [
  { href: '/', labelKey: 'nav.home' },
  { href: '/services', labelKey: 'nav.services' },
  { href: '/doctors', labelKey: 'nav.doctors' },
  { href: '/appointment', labelKey: 'nav.appointment' },
  { href: '/gallery', labelKey: 'nav.gallery' },
  { href: '/health-tips', labelKey: 'nav.healthTips' },
] as const;
