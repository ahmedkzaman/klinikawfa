import type { HomeContent } from "@/features/website-cms/schemas/home";

const clinicExterior = "/klinik-awfa-exterior.webp";

export const DEFAULT_HOME_CONTENT: HomeContent = {
  hero: {
    backgroundImage: clinicExterior,
    backgroundAlt: { ms: "", en: "" },
    backgroundOpacity: 13,
    autoplayMs: 5000,
    slides: [
      {
        title: { ms: "Klinik Keluarga Anda", en: "Your Family Clinic" },
        subtitle: {
          ms: "Rawatan berkualiti untuk seluruh keluarga di KotaSAS",
          en: "Quality healthcare for the whole family at KotaSAS",
        },
      },
      {
        title: { ms: "Buka Setiap Hari", en: "Open Every Day" },
        subtitle: {
          ms: "8.00 pagi hingga 12.00 tengah malam untuk keselesaan anda",
          en: "8:00 AM to 12:00 Midnight for your convenience",
        },
      },
      {
        title: {
          ms: "Pengkhususan Minor Surgery",
          en: "Special Interest in Minor Surgery",
        },
        subtitle: {
          ms: "Kepakaran dalam rawatan ketumbuhan, ketuat & khatan",
          en: "Expertise in lumps, warts & circumcision treatment",
        },
      },
    ],
    ctas: [
      {
        label: { ms: "Buat Temujanji", en: "Book Appointment" },
        href: "/appointment",
      },
      {
        label: { ms: "WhatsApp", en: "WhatsApp" },
        href: "https://wa.me/60182523531",
      },
      {
        label: { ms: "Hubungi", en: "Call" },
        href: "tel:+60182523531",
      },
    ],
    carouselLabels: {
      previous: { ms: "Previous slide", en: "Previous slide" },
      next: { ms: "Next slide", en: "Next slide" },
      goTo: { ms: "Go to slide", en: "Go to slide" },
    },
  },
  why: {
    eyebrow: { ms: "Mengapa Pilih Kami", en: "Why Choose Us" },
    title: { ms: "Mengapa Klinik Awfa?", en: "Why Klinik Awfa?" },
    description: {
      ms: "Kami komited untuk menyediakan perkhidmatan kesihatan yang terbaik untuk anda dan keluarga.",
      en: "We are committed to providing the best healthcare services for you and your family.",
    },
    items: [
      {
        icon: "clock",
        title: { ms: "Buka Setiap Hari", en: "Open Daily" },
        description: {
          ms: "8.00 pagi – 12.00 tengah malam",
          en: "8:00 AM – 12:00 Midnight",
        },
      },
      {
        icon: "sofa",
        title: {
          ms: "Ruang Menunggu Selesa",
          en: "Comfortable Waiting Area",
        },
        description: {
          ms: "Termasuk zon permainan kanak-kanak",
          en: "Including kids play zone",
        },
      },
      {
        icon: "users",
        title: { ms: "Klinik Keluarga", en: "Family Clinic" },
        description: {
          ms: "Melayani seluruh keluarga di KotaSAS",
          en: "Serving all families at KotaSAS",
        },
      },
      {
        icon: "user-check",
        title: {
          ms: "Doktor Berpengalaman",
          en: "Experienced Doctors",
        },
        description: {
          ms: "Bertahun-tahun pengalaman dalam perubatan keluarga",
          en: "Years of experience in family medicine",
        },
      },
      {
        icon: "scissors",
        title: {
          ms: "Pengkhususan Minor Surgery",
          en: "Special Interest in Minor Surgery",
        },
        description: {
          ms: "Kepakaran dalam rawatan ketumbuhan, ketuat & khatan",
          en: "Expertise in lumps, warts & circumcision treatment",
        },
      },
      {
        icon: "ear",
        title: { ms: "Perkhidmatan ENT", en: "ENT Services" },
        description: {
          ms: "Termasuk microsuction untuk penjagaan telinga profesional",
          en: "Including microsuction for professional ear care",
        },
      },
    ],
  },
  video: {
    eyebrow: { ms: "Video Klinik", en: "Clinic Video" },
    title: { ms: "Lawat Klinik Kami", en: "Visit Our Clinic" },
    description: {
      ms: "Lihat suasana mesra dan selesa di Klinik Awfa.",
      en: "See the friendly and comfortable atmosphere at Klinik Awfa.",
    },
    placeholder: {
      ms: "📹 Video klinik akan ditambah di sini",
      en: "📹 Clinic video will be added here",
    },
    unsupportedMessage: {
      ms: "Your browser does not support the video tag.",
      en: "Your browser does not support the video tag.",
    },
    videoUrlSettingKey: "homepage_video_url",
    posterSettingKey: "homepage_video_poster",
  },
  services: {
    eyebrow: { ms: "Perkhidmatan Kami", en: "Our Services" },
    title: { ms: "Perkhidmatan Kami", en: "Our Services" },
    description: {
      ms: "Pelbagai perkhidmatan kesihatan untuk memenuhi keperluan anda.",
      en: "A wide range of health services to meet your needs.",
    },
    cta: {
      label: { ms: "Lihat Semua", en: "View All" },
      href: "/services",
    },
    learnMoreLabel: { ms: "Ketahui Lebih", en: "Learn More" },
    itemLimit: 6,
  },
  gallery: {
    eyebrow: { ms: "Galeri Foto", en: "Photo Gallery" },
    title: { ms: "Galeri Klinik", en: "Clinic Gallery" },
    description: {
      ms: "Lihat suasana di Klinik Awfa.",
      en: "See the atmosphere at Klinik Awfa.",
    },
    cta: {
      label: { ms: "Lihat Semua", en: "View All" },
      href: "/gallery",
    },
    emptyMessage: { ms: "Tiada gambar", en: "No images" },
    moreLabel: { ms: "lagi", en: "more" },
    carouselLabels: {
      previous: { ms: "Previous slide", en: "Previous slide" },
      next: { ms: "Next slide", en: "Next slide" },
      goTo: { ms: "Go to slide", en: "Go to slide" },
    },
    closeLabel: { ms: "Close", en: "Close" },
    previousLabel: { ms: "Previous", en: "Previous" },
    nextLabel: { ms: "Next", en: "Next" },
    swipeHint: { ms: "Swipe to navigate", en: "Swipe to navigate" },
    itemLimit: 8,
  },
  testimonials: {
    eyebrow: { ms: "Testimoni", en: "Testimonials" },
    title: {
      ms: "Apa Kata Pesakit Kami",
      en: "What Our Patients Say",
    },
    description: {
      ms: "Kepuasan pesakit adalah keutamaan kami.",
      en: "Patient satisfaction is our priority.",
    },
    patientLabel: {
      ms: "Pesakit Klinik Awfa",
      en: "Klinik Awfa Patient",
    },
    goToSlideLabel: { ms: "Go to slide", en: "Go to slide" },
    previousSlideLabel: { ms: "Previous slide", en: "Previous slide" },
    nextSlideLabel: { ms: "Next slide", en: "Next slide" },
    carouselRoleDescription: { ms: "carousel", en: "carousel" },
    slideRoleDescription: { ms: "slide", en: "slide" },
  },
  map: {
    eyebrow: { ms: "Cari Kami", en: "Find Us" },
    title: { ms: "Lokasi Kami", en: "Our Location" },
    description: {
      ms: "Mudah diakses di KotaSAS Avenue, Kuantan. Kami sedia menerima kunjungan anda.",
      en: "Easily accessible at KotaSAS Avenue, Kuantan. We are ready to welcome your visit.",
    },
    hoursLabel: { ms: "Waktu Operasi", en: "Operating Hours" },
    everydayLabel: { ms: "Setiap Hari", en: "Every Day" },
    callLabel: { ms: "Hubungi", en: "Call" },
    directionsCta: {
      label: { ms: "Dapatkan Arah", en: "Get Directions" },
      href: "https://maps.google.com/?q=3.871944656053272,103.27734116870465",
    },
    embedUrl:
      "https://maps.google.com/maps?q=3.871944656053272,103.27734116870465&t=&z=17&ie=UTF8&iwloc=&output=embed",
    embedTitle: {
      ms: "Klinik Awfa Location",
      en: "Klinik Awfa Location",
    },
  },
  seo: {
    title: { ms: "Klinik Keluarga Anda", en: "" },
    description: {
      ms: "Klinik Awfa menawarkan rawatan kesihatan berkualiti untuk keluarga anda di KotaSAS, Kuantan. Buka setiap hari 8 pagi - 12 tengah malam.",
      en: "",
    },
  },
  sectionOrder: [
    "hero",
    "why",
    "video",
    "services",
    "gallery",
    "testimonials",
    "map",
  ],
};
