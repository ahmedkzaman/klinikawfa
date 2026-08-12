export interface LocalServicePageContent {
  slug: string;
  title: string;
  metaDescription: string;
  eyebrow: string;
  heading: string;
  introduction: string;
  sections: Array<{
    id: string;
    heading: string;
    paragraphs: string[];
    bullets?: string[];
  }>;
  faqs: Array<{ question: string; answer: string }>;
  relatedSlugs: string[];
  reviewedByLabel: string;
}

export const LOCAL_SERVICE_REVIEW = {
  organization: 'Klinik Awfa',
  date: '2026-07-27',
} as const;

export const LOCAL_SERVICE_PAGES: Record<string, LocalServicePageContent> = {
  'rawatan-telinga-kuantan': {
    slug: 'rawatan-telinga-kuantan',
    title: 'Rawatan Telinga di Kuantan',
    metaDescription:
      'Penilaian doktor untuk sakit telinga, telinga tersumbat, tahi telinga dan simptom berkaitan di Klinik Awfa, KotaSAS, Kuantan.',
    eyebrow: 'Penjagaan telinga di KotaSAS',
    heading: 'Rawatan telinga di Kuantan',
    introduction:
      'Telinga sakit, rasa tersumbat atau pendengaran yang tiba-tiba kurang jelas boleh mempunyai beberapa punca. Di Klinik Awfa, lawatan bermula dengan penilaian doktor supaya keadaan salur telinga dan gegendang telinga dapat diperiksa sebelum rawatan yang sesuai dibincangkan.',
    sections: [
      {
        id: 'bila-perlu-diperiksa',
        heading: 'Bila telinga perlu diperiksa',
        paragraphs: [
          'Pemeriksaan membantu membezakan tahi telinga yang terkumpul daripada jangkitan, keradangan, kecederaan atau punca lain. Elakkan memasukkan putik kapas, penyepit atau cecair yang tidak disarankan ke dalam telinga kerana tindakan ini boleh menolak tahi telinga lebih dalam atau mencederakan salur telinga.',
        ],
        bullets: [
          'Sakit, gatal atau rasa penuh pada telinga',
          'Pendengaran menjadi kurang jelas atau bunyi berdengung',
          'Cecair, nanah atau darah keluar dari telinga',
          'Telinga tersumbat selepas berenang atau penggunaan alat bantu dengar',
        ],
      },
      {
        id: 'penilaian',
        heading: 'Apa yang dinilai oleh doktor',
        paragraphs: [
          'Doktor akan bertanya tentang tempoh simptom, demam, pendedahan kepada air, penggunaan ubat titis, sejarah pembedahan telinga dan masalah pendengaran. Pemeriksaan telinga dilakukan menggunakan alat yang sesuai untuk melihat salur telinga serta gegendang telinga setakat yang dapat dilihat.',
          'Rawatan bergantung pada penemuan pemeriksaan. Ubat, pemantauan, pembersihan telinga atau rujukan lanjut mungkin dipertimbangkan mengikut keadaan klinikal.',
        ],
      },
      {
        id: 'pembersihan',
        heading: 'Pembersihan tahi telinga dan microsuction',
        paragraphs: [
          'Jika tahi telinga menjadi punca sumbatan, doktor akan menentukan sama ada pembersihan sesuai dilakukan pada lawatan tersebut. Kaedah seperti microsuction hanya dipilih selepas keadaan telinga dinilai; ia tidak sesuai untuk setiap pesakit atau setiap masalah telinga.',
          'Beritahu doktor jika anda pernah mengalami gegendang telinga pecah, mempunyai tiub telinga, menjalani pembedahan telinga, mengambil ubat pencair darah atau mudah berdarah. Maklumat ini membantu doktor merancang pilihan yang lebih selamat.',
        ],
      },
      {
        id: 'tanda-amaran',
        heading: 'Tanda amaran yang memerlukan perhatian segera',
        paragraphs: [
          'Dapatkan rawatan segera jika sakit telinga disertai kelemahan muka, pening yang teruk, kehilangan pendengaran secara mendadak, kecederaan kepala, pendarahan berterusan atau keadaan umum yang semakin merosot. Kanak-kanak kecil yang sangat lesu, kurang minum atau sukar dikejutkan juga perlu dinilai segera.',
        ],
      },
      {
        id: 'sebelum-lawatan',
        heading: 'Sebelum datang ke klinik',
        paragraphs: [
          'Catat bila simptom bermula dan bawa senarai ubat atau ubat titis yang telah digunakan. Jangan cuba mengorek telinga sebelum pemeriksaan. Jika anda mengalami demam atau simptom pernafasan bersama sakit telinga, maklumkan kepada pasukan klinik semasa mendaftar.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Adakah semua telinga tersumbat perlu dicuci?',
        answer:
          'Tidak. Rasa tersumbat boleh berpunca daripada tahi telinga, jangkitan, perubahan tekanan atau masalah lain. Doktor perlu memeriksa telinga terlebih dahulu sebelum menentukan sama ada pembersihan sesuai.',
      },
      {
        question: 'Bolehkah saya menggunakan ubat titis sebelum datang?',
        answer:
          'Sesetengah ubat titis tidak sesuai jika gegendang telinga mungkin berlubang atau jika puncanya belum diketahui. Dapatkan nasihat klinikal dan beritahu doktor tentang apa-apa produk yang telah digunakan.',
      },
      {
        question: 'Adakah microsuction sesuai untuk kanak-kanak?',
        answer:
          'Kesesuaian bergantung pada umur, kerjasama kanak-kanak, keadaan telinga dan penilaian doktor. Doktor akan membincangkan pilihan yang munasabah bersama penjaga.',
      },
      {
        question: 'Perlukah saya membuat temujanji?',
        answer:
          'Temujanji membantu klinik merancang masa penilaian. Hubungi klinik lebih awal jika anda ingin bertanya tentang ketersediaan pemeriksaan atau prosedur pada hari berkenaan.',
      },
    ],
    relatedSlugs: ['swab-test-demam-kuantan', 'minor-surgery-kutil-kuantan'],
    reviewedByLabel:
      'Maklumat kesihatan umum — diagnosis dan kesesuaian rawatan memerlukan penilaian doktor.',
  },
  'minor-surgery-kutil-kuantan': {
    slug: 'minor-surgery-kutil-kuantan',
    title: 'Minor Surgery dan Rawatan Kutil di Kuantan',
    metaDescription:
      'Penilaian doktor untuk kutil, ketumbuhan kulit dan pembedahan kecil atau minor surgery di Klinik Awfa, KotaSAS, Kuantan.',
    eyebrow: 'Pembedahan kecil di KotaSAS',
    heading: 'Minor surgery dan rawatan kutil di Kuantan',
    introduction:
      'Kutil dan ketumbuhan kulit tidak semuanya sama. Sebelum sesuatu pembedahan kecil atau minor surgery dirancang, doktor perlu menilai rupa, lokasi, tempoh perubahan, simptom dan faktor kesihatan pesakit untuk menentukan langkah seterusnya.',
    sections: [
      {
        id: 'masalah-yang-dinilai',
        heading: 'Masalah kulit yang boleh dinilai',
        paragraphs: [
          'Anda boleh mendapatkan pemeriksaan bagi kutil, benjolan kecil, sista atau luka kulit yang mengganggu. Pemeriksaan awal penting kerana sesetengah perubahan kulit memerlukan siasatan, rawatan berlainan atau rujukan kepada perkhidmatan yang lebih khusus.',
        ],
        bullets: [
          'Kutil yang sakit, mudah berdarah atau mengganggu aktiviti',
          'Benjolan yang membesar, meradang atau berulang',
          'Luka kecil yang lambat sembuh',
          'Ketumbuhan kulit yang berubah warna, bentuk atau tekstur',
        ],
      },
      {
        id: 'penilaian-doktor',
        heading: 'Penilaian sebelum minor surgery',
        paragraphs: [
          'Doktor akan meneliti sejarah masalah, ubat semasa, alahan, penyakit kronik dan risiko pendarahan. Beritahu doktor jika anda mengambil ubat pencair darah, mempunyai diabetes, pernah mengalami reaksi terhadap ubat bius setempat atau mempunyai masalah penyembuhan luka.',
          'Kesesuaian prosedur bergantung pada penilaian doktor. Ada keadaan yang boleh dirawat secara konservatif, ada yang sesuai untuk prosedur di klinik, dan ada yang lebih selamat dirujuk untuk pemeriksaan atau rawatan lanjut.',
        ],
      },
      {
        id: 'semasa-prosedur',
        heading: 'Apa yang dijangka semasa pembedahan kecil',
        paragraphs: [
          'Jika prosedur dipersetujui, doktor akan menerangkan tujuan, pilihan rawatan, risiko yang relevan dan penjagaan selepas prosedur sebelum mendapatkan persetujuan. Jenis prosedur dan penggunaan ubat bius setempat bergantung pada keadaan kulit, lokasi serta faktor pesakit.',
          'Prosedur mungkin perlu dijadualkan pada lawatan berasingan supaya persediaan, peralatan dan masa pemantauan yang sesuai dapat disediakan.',
        ],
      },
      {
        id: 'penjagaan-luka',
        heading: 'Penjagaan luka selepas prosedur',
        paragraphs: [
          'Arahan penjagaan luka akan disesuaikan dengan prosedur. Secara umum, pastikan kawasan bersih seperti diarahkan, elakkan mengusik luka dan ambil ubat hanya mengikut nasihat. Datang semula jika doktor menetapkan pemeriksaan luka atau penanggalan jahitan.',
          'Dapatkan pemeriksaan jika sakit semakin kuat, pendarahan tidak berhenti dengan tekanan lembut, kemerahan merebak, luka mengeluarkan nanah atau anda demam selepas prosedur.',
        ],
      },
      {
        id: 'bila-segera',
        heading: 'Bila perubahan kulit perlu dinilai segera',
        paragraphs: [
          'Jangan menangguhkan pemeriksaan bagi ketumbuhan yang cepat membesar, berpigmen tidak sekata, kerap berdarah tanpa sebab jelas atau disertai gejala umum. Penilaian awal tidak semestinya bermakna pembedahan akan dilakukan; tujuannya ialah menentukan laluan pemeriksaan yang sesuai.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Adakah kutil boleh terus dibuang pada lawatan pertama?',
        answer:
          'Tidak semestinya. Doktor perlu mengesahkan ciri masalah kulit, menilai kesesuaian prosedur dan menerangkan pilihan rawatan. Sesetengah prosedur perlu dijadualkan kemudian atau dirujuk.',
      },
      {
        question: 'Adakah semua ketumbuhan kulit ialah kutil?',
        answer:
          'Tidak. Benjolan dan perubahan kulit mempunyai pelbagai punca. Elakkan rawatan sendiri dengan bahan menghakis sebelum diagnosis dinilai, terutama pada muka, kawasan sulit atau kulit yang mudah berdarah.',
      },
      {
        question: 'Perlukah saya berhenti ubat pencair darah?',
        answer:
          'Jangan hentikan ubat preskripsi sendiri. Beritahu doktor nama dan dos ubat supaya risiko serta pelan prosedur boleh dinilai dengan selamat.',
      },
      {
        question: 'Berapa lama luka akan sembuh?',
        answer:
          'Tempoh penyembuhan berbeza mengikut prosedur, lokasi, saiz luka dan keadaan kesihatan. Doktor akan memberikan panduan yang lebih khusus selepas penilaian.',
      },
    ],
    relatedSlugs: ['rawatan-telinga-kuantan', 'sunat-kuantan'],
    reviewedByLabel:
      'Maklumat kesihatan umum — prosedur hanya dipertimbangkan selepas penilaian doktor dan persetujuan pesakit.',
  },
  'swab-test-demam-kuantan': {
    slug: 'swab-test-demam-kuantan',
    title: 'Swab Test dan Pemeriksaan Demam di Kuantan',
    metaDescription:
      'Pemeriksaan demam dan swab test yang dipilih mengikut penilaian doktor, simptom serta tempoh penyakit di Klinik Awfa, KotaSAS, Kuantan.',
    eyebrow: 'Pemeriksaan demam di KotaSAS',
    heading: 'Swab test dan pemeriksaan demam di Kuantan',
    introduction:
      'Demam boleh disebabkan oleh pelbagai jangkitan dan keadaan bukan jangkitan. Swab test mungkin membantu dalam keadaan tertentu, tetapi keputusan ujian perlu ditafsir bersama simptom, tempoh penyakit dan pemeriksaan klinikal.',
    sections: [
      {
        id: 'sebelum-ujian',
        heading: 'Pemeriksaan dahulu, ujian apabila sesuai',
        paragraphs: [
          'Doktor akan bertanya tentang suhu, tempoh demam, batuk, sakit tekak, selesema, sakit badan, muntah, cirit-birit, ruam, pendedahan penyakit dan faktor risiko. Pemeriksaan membantu menentukan sama ada ujian pernafasan, ujian darah, pemantauan atau rujukan lebih sesuai.',
          'Tidak semua pesakit demam memerlukan swab test. Ujian yang dibuat terlalu awal atau di luar tempoh pengesanan yang sesuai boleh memberi keputusan yang tidak mencerminkan keseluruhan keadaan klinikal.',
        ],
      },
      {
        id: 'ujian-yang-dipertimbang',
        heading: 'Jenis swab test yang mungkin dipertimbangkan',
        paragraphs: [
          'Bergantung pada simptom dan penilaian doktor, ujian pantas bagi jangkitan pernafasan seperti influenza atau COVID-19 mungkin dibincangkan. Bagi kanak-kanak atau kumpulan tertentu, ujian lain hanya dipertimbangkan apabila ada petunjuk klinikal.',
          'Ketersediaan kit dan jenis sampel boleh berubah. Pasukan klinik boleh menerangkan pilihan semasa lawatan tanpa menganggap satu ujian sesuai untuk semua punca demam.',
        ],
      },
      {
        id: 'makna-keputusan',
        heading: 'Memahami keputusan ujian',
        paragraphs: [
          'Keputusan positif boleh menyokong diagnosis tertentu, manakala keputusan negatif tidak semestinya menolak jangkitan. Doktor akan menilai keputusan bersama keadaan pesakit dan memberi nasihat tentang rawatan simptom, pemantauan, langkah mengurangkan penularan atau pemeriksaan lanjut.',
          'Jangan berkongsi antibiotik atau mengambil baki ubat lama. Antibiotik tidak merawat virus dan hanya digunakan apabila dinilai sesuai untuk keadaan bakteria.',
        ],
      },
      {
        id: 'penjagaan-rumah',
        heading: 'Penjagaan sementara di rumah',
        paragraphs: [
          'Rehat, minum cecair dengan kerap dan pantau suhu serta perubahan simptom. Gunakan ubat demam mengikut label atau nasihat profesional kesihatan, dengan dos yang sesuai untuk umur dan berat. Pakai pelitup muka jika bergejala pernafasan dan kurangkan kontak rapat dengan individu berisiko tinggi.',
        ],
      },
      {
        id: 'tanda-kecemasan',
        heading: 'Tanda yang memerlukan rawatan segera',
        paragraphs: [
          'Dapatkan rawatan segera jika terdapat sesak nafas, sakit dada, sawan, kekeliruan, leher tegang, ruam yang membimbangkan, kurang kencing, muntah berterusan atau tanda dehidrasi. Bayi kecil dengan demam, pesakit hamil, warga emas dan individu dengan imuniti lemah memerlukan ambang penilaian yang lebih rendah.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Adakah saya mesti membuat swab test apabila demam?',
        answer:
          'Tidak semestinya. Keperluan ujian bergantung pada simptom, tempoh penyakit, pendedahan dan penilaian doktor. Ada punca demam yang memerlukan jenis pemeriksaan lain.',
      },
      {
        question: 'Apakah maksud keputusan swab negatif?',
        answer:
          'Keputusan negatif perlu ditafsir mengikut masa sampel diambil dan keadaan klinikal. Teruskan pemantauan dan dapatkan penilaian semula jika simptom bertambah teruk atau berpanjangan.',
      },
      {
        question: 'Bolehkah kanak-kanak menjalani swab test?',
        answer:
          'Boleh apabila terdapat petunjuk yang sesuai. Doktor akan mempertimbangkan umur, simptom dan manfaat ujian sebelum berbincang dengan penjaga.',
      },
      {
        question: 'Perlukah saya mengasingkan diri sementara menunggu penilaian?',
        answer:
          'Jika mempunyai simptom pernafasan, kurangkan kontak rapat, amalkan kebersihan tangan dan pakai pelitup muka apabila bersama orang lain. Ikuti nasihat kesihatan awam semasa serta arahan doktor berdasarkan diagnosis.',
      },
    ],
    relatedSlugs: ['rawatan-telinga-kuantan', 'pengurusan-berat-badan-kuantan'],
    reviewedByLabel:
      'Maklumat kesihatan umum — pemilihan dan tafsiran ujian bergantung pada penilaian doktor.',
  },
  'pengurusan-berat-badan-kuantan': {
    slug: 'pengurusan-berat-badan-kuantan',
    title: 'Pengurusan Berat Badan di Kuantan',
    metaDescription:
      'Pengurusan berat badan berasaskan penilaian doktor, matlamat realistik dan pemantauan kesihatan di Klinik Awfa, KotaSAS, Kuantan.',
    eyebrow: 'Penjagaan kesihatan berperingkat di KotaSAS',
    heading: 'Pengurusan berat badan di Kuantan',
    introduction:
      'Pengurusan berat badan bukan sekadar mengejar nombor pada penimbang. Pendekatan yang selamat bermula dengan penilaian doktor, pemahaman corak pemakanan dan aktiviti, serta matlamat yang realistik berdasarkan kesihatan dan keperluan individu.',
    sections: [
      {
        id: 'penilaian-awal',
        heading: 'Penilaian awal oleh doktor',
        paragraphs: [
          'Doktor akan berbincang tentang perubahan berat, sejarah perubatan, ubat, tidur, tekanan, pemakanan, aktiviti fizikal dan usaha terdahulu. Ukuran yang relevan serta tekanan darah boleh diperiksa, manakala ujian makmal hanya dipertimbangkan apabila ada petunjuk klinikal.',
          'Perbincangan dibuat tanpa menghukum. Tujuannya ialah mengenal pasti faktor kesihatan yang boleh mempengaruhi berat dan membina pelan yang praktikal untuk rutin harian pesakit.',
        ],
      },
      {
        id: 'pelan-individu',
        heading: 'Pelan yang disesuaikan dengan individu',
        paragraphs: [
          'Pelan mungkin merangkumi perubahan pemakanan secara berperingkat, aktiviti yang sesuai dengan tahap kecergasan, tidur yang lebih teratur dan strategi menangani pencetus makan. Keutamaan diberikan kepada perubahan yang boleh diteruskan, bukan diet ekstrem atau sekatan yang sukar dipertahankan.',
        ],
        bullets: [
          'Matlamat kesihatan dan berat yang dipersetujui bersama',
          'Cadangan pemakanan yang mengambil kira rutin serta budaya makan',
          'Aktiviti fizikal mengikut kemampuan dan keadaan kesihatan',
          'Pelan pemantauan untuk menilai kemajuan dan halangan',
        ],
      },
      {
        id: 'ubat',
        heading: 'Peranan ubat dalam pengurusan berat badan',
        paragraphs: [
          'Ubat bukan pilihan automatik dan tidak menggantikan asas pemakanan, aktiviti serta pemantauan. Jika ubat dipertimbangkan, doktor akan menilai petunjuk, kontraindikasi, ubat lain, kemungkinan kesan sampingan dan keperluan susulan.',
          'Jangan membeli atau menggunakan ubat pelangsing, suntikan atau suplemen tanpa penilaian doktor. Produk yang sesuai untuk seorang individu mungkin tidak selamat untuk orang lain, termasuk ketika hamil, menyusu atau mempunyai penyakit tertentu.',
        ],
      },
      {
        id: 'pemantauan',
        heading: 'Pemantauan dan susulan',
        paragraphs: [
          'Lawatan susulan membolehkan doktor menilai perubahan ukuran, kesejahteraan, tekanan darah, toleransi pelan dan sebarang kesan sampingan. Pelan boleh dilaraskan apabila keadaan, keutamaan atau respons pesakit berubah.',
          'Kemajuan tidak semestinya linear. Tidur, tekanan, penyakit, ubat dan perubahan rutin boleh mempengaruhi berat; maklumat ini dibincangkan untuk menentukan langkah seterusnya.',
        ],
      },
      {
        id: 'bila-perlu-bantuan',
        heading: 'Bila perlu mendapatkan bantuan lebih awal',
        paragraphs: [
          'Dapatkan penilaian jika berat berubah dengan cepat tanpa sebab jelas, disertai berdebar, sesak nafas, bengkak, lemah teruk atau perubahan haid yang ketara. Jika usaha mengawal berat mencetuskan makan tidak terkawal, muntah disengajakan atau tekanan emosi, beritahu doktor supaya sokongan yang sesuai boleh dirancang.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Adakah program ini hanya untuk menurunkan berat?',
        answer:
          'Tidak semestinya. Fokus boleh merangkumi kesihatan metabolik, tabiat, kekuatan fizikal atau pencegahan kenaikan berat, bergantung pada penilaian dan matlamat individu.',
      },
      {
        question: 'Adakah saya akan diberikan ubat pelangsing?',
        answer:
          'Ubat hanya dipertimbangkan jika ada petunjuk klinikal dan selepas risiko serta manfaat dibincangkan. Sesetengah pesakit tidak sesuai menggunakan ubat tertentu.',
      },
      {
        question: 'Berapa cepat berat saya akan berubah?',
        answer:
          'Respons berbeza antara individu. Doktor akan membantu menetapkan matlamat realistik dan memantau kesihatan, tanpa menjanjikan kadar atau hasil tertentu.',
      },
      {
        question: 'Perlukah saya berpuasa sebelum lawatan?',
        answer:
          'Biasanya tidak untuk perbincangan awal. Jika ujian tertentu diperlukan, pasukan klinik akan memberi arahan khusus tentang persediaan.',
      },
    ],
    relatedSlugs: ['swab-test-demam-kuantan', 'rawatan-telinga-kuantan'],
    reviewedByLabel:
      'Maklumat kesihatan umum — pelan dan pemantauan disesuaikan selepas penilaian doktor.',
  },
  'sunat-kuantan': {
    slug: 'sunat-kuantan',
    title: 'Klinik Sunat Kuantan untuk Bayi, Kanak-kanak & Dewasa | Klinik Awfa',
    metaDescription:
      'Penilaian dan perkhidmatan sunat bayi, kanak-kanak dan dewasa di Klinik Awfa, KotaSAS, Kuantan, termasuk persediaan dan penjagaan selepas prosedur.',
    eyebrow: 'Perkhidmatan sunat di KotaSAS',
    heading: 'Sunat di Kuantan untuk bayi, kanak-kanak dan dewasa',
    introduction:
      'Keperluan persediaan, kaedah dan penjagaan selepas sunat berbeza mengikut umur serta keadaan kesihatan. Penilaian doktor diperlukan untuk memastikan prosedur boleh dirancang dengan teliti dan pesakit atau penjaga memahami pilihan, risiko serta tanda yang perlu dipantau.',
    sections: [
      {
        id: 'sunat-bayi',
        heading: 'Sunat bayi',
        paragraphs: [
          'Bagi bayi, doktor akan menilai umur, berat, penyusuan, sejarah kelahiran, masalah pendarahan dalam keluarga dan keadaan kemaluan. Bayi yang tidak sihat, demam, kuning yang masih memerlukan penilaian atau mempunyai bentuk anatomi tertentu mungkin perlu menangguhkan prosedur atau dirujuk.',
          'Penjaga akan diterangkan tentang persediaan, kaedah yang dipertimbangkan dan cara menjaga kawasan selepas prosedur. Jangan sapukan krim, herba atau ubat tanpa arahan klinikal.',
        ],
      },
      {
        id: 'sunat-kanak-kanak',
        heading: 'Sunat kanak-kanak',
        paragraphs: [
          'Persediaan kanak-kanak merangkumi penerangan yang sesuai dengan umur, semakan kesihatan dan perancangan sokongan penjaga. Maklumkan kepada doktor jika anak sangat cemas, mempunyai alahan, mengambil ubat atau pernah mengalami pendarahan yang sukar berhenti.',
          'Doktor akan menilai sama ada prosedur boleh dilakukan di klinik dan berbincang tentang kawalan sakit serta penjagaan luka. Kerjasama dan keselamatan kanak-kanak menjadi sebahagian daripada pertimbangan kesesuaian.',
        ],
      },
      {
        id: 'sunat-dewasa',
        heading: 'Sunat dewasa',
        paragraphs: [
          'Bagi orang dewasa, konsultasi memberi ruang untuk membincangkan sebab prosedur, sejarah kesihatan, ubat, pekerjaan dan tempoh pemulihan yang perlu dirancang. Diabetes, ubat pencair darah, jangkitan aktif atau masalah kulit perlu dimaklumkan kepada doktor.',
          'Privasi dan persetujuan pesakit dihormati. Kaedah, risiko yang relevan, penjagaan luka dan jangkaan aktiviti akan diterangkan berdasarkan penilaian individu.',
        ],
      },
      {
        id: 'sebelum-prosedur',
        heading: 'Persediaan sebelum sunat',
        paragraphs: [
          'Ikuti arahan klinik tentang makan, minum, kebersihan dan ubat. Jangan menghentikan ubat preskripsi tanpa arahan doktor. Bawa maklumat alahan dan senarai ubat; bagi kanak-kanak, penjaga yang sah perlu hadir untuk perbincangan serta persetujuan.',
          'Kesesuaian prosedur dan masa pelaksanaannya bergantung pada penilaian doktor. Pemeriksaan awal mungkin membawa kepada penangguhan atau rujukan jika itu lebih selamat.',
        ],
      },
      {
        id: 'penjagaan-selepas',
        heading: 'Penjagaan selepas sunat',
        paragraphs: [
          'Pesakit atau penjaga akan menerima arahan tentang kebersihan, balutan jika digunakan, ubat dan aktiviti. Sedikit ketidakselesaan atau bengkak boleh berlaku, tetapi tahap yang dijangka dan tempoh pemantauan akan diterangkan oleh doktor mengikut kaedah serta keadaan pesakit.',
          'Hadiri susulan jika dijadualkan. Hubungi klinik jika anda tidak pasti tentang rupa luka atau cara penjagaan, dan elakkan menggunakan bahan tradisional pada luka tanpa nasihat.',
        ],
      },
      {
        id: 'tanda-amaran',
        heading: 'Tanda amaran selepas prosedur',
        paragraphs: [
          'Dapatkan rawatan segera jika pendarahan tidak berhenti dengan langkah yang diarahkan, pesakit sukar kencing, menjadi sangat lemah, demam, sakit semakin kuat atau luka menunjukkan kemerahan yang merebak dan lelehan bernanah. Untuk bayi, kurang menyusu atau lampin yang kekal kering juga memerlukan perhatian.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Adakah konsultasi diperlukan sebelum tarikh sunat?',
        answer:
          'Ya, penilaian membantu doktor menyemak kesihatan, anatomi, ubat dan faktor pendarahan serta menerangkan persediaan. Dalam sesetengah keadaan, prosedur perlu ditangguhkan atau dirujuk.',
      },
      {
        question: 'Kaedah sunat mana yang akan digunakan?',
        answer:
          'Pilihan kaedah bergantung pada umur, anatomi, keadaan klinikal, ketersediaan dan pertimbangan doktor. Pilihan yang sesuai akan dibincangkan semasa konsultasi.',
      },
      {
        question: 'Berapa lama perlu berehat selepas sunat?',
        answer:
          'Tempoh kembali ke sekolah, kerja, sukan atau aktiviti seksual berbeza mengikut umur, kaedah, jenis aktiviti dan pemulihan luka. Ikuti arahan khusus yang diberikan selepas prosedur.',
      },
      {
        question: 'Bolehkah sunat dilakukan jika sedang demam atau batuk?',
        answer:
          'Maklumkan simptom kepada klinik sebelum hadir. Doktor akan menilai sama ada prosedur wajar diteruskan atau ditangguhkan demi keselamatan.',
      },
    ],
    relatedSlugs: ['minor-surgery-kutil-kuantan', 'rawatan-telinga-kuantan'],
    reviewedByLabel:
      'Maklumat kesihatan umum — prosedur dan kaedah dipilih selepas penilaian doktor serta persetujuan pesakit atau penjaga.',
  },
};
