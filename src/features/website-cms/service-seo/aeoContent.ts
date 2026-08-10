export type BilingualText = { ms: string; en: string };

export type ServiceAeoContent = {
  intro: BilingualText;
  suitableFor: BilingualText;
  whatToExpect: BilingualText;
  preparation?: BilingualText;
  safetyNote?: BilingualText;
  bookingCta: BilingualText;
  faqs: Array<{ question: BilingualText; answer: BilingualText }>;
};

const COMMON_SAFETY: BilingualText = {
  ms: 'Maklumat ini adalah panduan umum. Diagnosis, rawatan dan kesesuaian prosedur memerlukan penilaian doktor.',
  en: 'This is general information. Diagnosis, treatment, and procedure suitability require a doctor’s assessment.',
};

export function buildLocalServiceAeo(content: {
  title: string;
  introduction: string;
  faqs: Array<{ question: string; answer: string }>;
}): ServiceAeoContent {
  return {
    intro: {
      ms: content.introduction,
      en: `Klinik Awfa provides assessment for ${content.title.toLowerCase()} in KotaSAS, Kuantan. The doctor will review your symptoms and health history before discussing suitable next steps.`,
    },
    suitableFor: {
      ms: `Perkhidmatan ini boleh dipertimbangkan oleh pesakit yang mempunyai simptom atau keperluan berkaitan ${content.title.toLowerCase()}, tertakluk pada penilaian doktor.`,
      en: `This service may be suitable for patients with symptoms or needs related to ${content.title.toLowerCase()}, subject to clinical assessment.`,
    },
    whatToExpect: {
      ms: 'Lawatan biasanya bermula dengan pendaftaran, sejarah ringkas, pemeriksaan dan perbincangan pilihan rawatan. Ujian atau prosedur hanya dilakukan apabila sesuai.',
      en: 'A visit usually starts with registration, a brief history, examination, and discussion of treatment options. Tests or procedures are performed only when appropriate.',
    },
    preparation: {
      ms: 'Bawa senarai ubat, alahan dan maklumat kesihatan yang berkaitan. Hubungi klinik lebih awal jika anda ingin bertanya tentang temujanji atau persediaan khusus.',
      en: 'Bring your medication list, allergies, and relevant health information. Contact the clinic ahead of time if you need appointment or preparation details.',
    },
    safetyNote: COMMON_SAFETY,
    bookingCta: { ms: 'Buat temujanji', en: 'Book an appointment' },
    faqs: content.faqs.map((faq) => ({
      question: { ms: faq.question, en: `What should I know about ${content.title.toLowerCase()}?` },
      answer: { ms: faq.answer, en: 'The doctor will assess your symptoms and explain the appropriate options, preparation, and follow-up for your individual situation.' },
    })),
  };
}

export function buildCategoryServiceAeo(input: {
  titleMs: string;
  titleEn: string;
  descriptionMs: string;
  descriptionEn: string;
}): ServiceAeoContent {
  const faq = {
    question: { ms: `Apakah yang termasuk dalam ${input.titleMs}?`, en: `What is included in ${input.titleEn}?` },
    answer: { ms: 'Skop perkhidmatan bergantung pada simptom dan penilaian doktor. Hubungi klinik untuk maklumat semasa.', en: 'The scope depends on your symptoms and the doctor’s assessment. Contact the clinic for current details.' },
  };
  return {
    intro: { ms: input.descriptionMs, en: input.descriptionEn || input.descriptionMs },
    suitableFor: { ms: `Penilaian ini sesuai untuk pesakit yang memerlukan ${input.titleMs.toLowerCase()}, tertakluk pada kesesuaian klinikal.`, en: `This assessment is for patients seeking ${input.titleEn.toLowerCase()}, subject to clinical suitability.` },
    whatToExpect: { ms: 'Doktor akan mengambil sejarah, membuat pemeriksaan dan menerangkan pilihan seterusnya. Ujian atau rawatan ditentukan mengikut keadaan anda.', en: 'The doctor will take a history, perform an examination, and explain the next options. Tests or treatment are selected according to your condition.' },
    preparation: { ms: 'Bawa senarai ubat dan maklumat alahan. Tanya klinik jika persediaan khas diperlukan.', en: 'Bring your medication and allergy information. Ask the clinic whether special preparation is needed.' },
    safetyNote: COMMON_SAFETY,
    bookingCta: { ms: 'Buat temujanji', en: 'Book an appointment' },
    faqs: [faq],
  };
}

export function selectBilingual(value: BilingualText, language: 'ms' | 'en'): string {
  return language === 'en' ? value.en || value.ms : value.ms || value.en;
}
