const fallbacks = {
  'services/sunat-kuantan': {
    heading: 'Sunat di Kuantan untuk bayi, kanak-kanak dan dewasa',
    introduction:
      'Keperluan persediaan, kaedah dan penjagaan selepas sunat berbeza mengikut umur serta keadaan kesihatan. Penilaian doktor diperlukan untuk memastikan prosedur boleh dirancang dengan teliti dan pesakit atau penjaga memahami pilihan, risiko serta tanda yang perlu dipantau.',
    sections: [
      {
        heading: 'Sunat bayi',
        summary:
          'Bagi bayi, doktor akan menilai umur, berat, penyusuan, sejarah kelahiran, masalah pendarahan dalam keluarga dan keadaan kemaluan. Bayi yang tidak sihat, demam, kuning yang masih memerlukan penilaian atau mempunyai bentuk anatomi tertentu mungkin perlu menangguhkan prosedur atau dirujuk.',
      },
      {
        heading: 'Sunat kanak-kanak',
        summary:
          'Persediaan kanak-kanak merangkumi penerangan yang sesuai dengan umur, semakan kesihatan dan perancangan sokongan penjaga. Maklumkan kepada doktor jika anak sangat cemas, mempunyai alahan, mengambil ubat atau pernah mengalami pendarahan yang sukar berhenti.',
      },
      {
        heading: 'Sunat dewasa',
        summary:
          'Bagi orang dewasa, konsultasi memberi ruang untuk membincangkan sebab prosedur, sejarah kesihatan, ubat, pekerjaan dan tempoh pemulihan yang perlu dirancang. Diabetes, ubat pencair darah, jangkitan aktif atau masalah kulit perlu dimaklumkan kepada doktor.',
      },
      {
        heading: 'Persediaan sebelum sunat',
        summary:
          'Ikuti arahan klinik tentang makan, minum, kebersihan dan ubat. Jangan menghentikan ubat preskripsi tanpa arahan doktor. Bawa maklumat alahan dan senarai ubat; bagi kanak-kanak, penjaga yang sah perlu hadir untuk perbincangan serta persetujuan.',
      },
      {
        heading: 'Penjagaan selepas sunat',
        summary:
          'Pesakit atau penjaga akan menerima arahan tentang kebersihan, balutan jika digunakan, ubat dan aktiviti. Sedikit ketidakselesaan atau bengkak boleh berlaku, tetapi tahap yang dijangka dan tempoh pemantauan akan diterangkan oleh doktor mengikut kaedah serta keadaan pesakit.',
      },
      {
        heading: 'Tanda amaran selepas prosedur',
        summary:
          'Dapatkan rawatan segera jika pendarahan tidak berhenti dengan langkah yang diarahkan, pesakit sukar kencing, menjadi sangat lemah, demam, sakit semakin kuat atau luka menunjukkan kemerahan yang merebak dan lelehan bernanah. Untuk bayi, kurang menyusu atau lampin yang kekal kering juga memerlukan perhatian.',
      },
    ],
  },
};

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

export function buildPublicSeoFallback(route) {
  const page = fallbacks[route];
  if (!page) return undefined;

  return `<main data-public-seo-fallback="${escapeHtml(route)}">
    <h1>${escapeHtml(page.heading)}</h1>
    <p>${escapeHtml(page.introduction)}</p>
    ${page.sections.map((section) => `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.summary)}</p></section>`).join('')}
    <p><a href="/appointment">Buat temujanji</a> · <a href="/services/">Lihat perkhidmatan Klinik Awfa</a></p>
  </main>`;
}
