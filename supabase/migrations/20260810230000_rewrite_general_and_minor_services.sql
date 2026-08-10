UPDATE public.clinic_services
SET
  title_ms = 'Rawatan Umum & Penyakit Akut',
  title_en = 'General & Acute Illness Treatment',
  description_ms = $ms$<p class="ql-size-large">Klinik Awfa menyediakan rawatan umum yang menyeluruh untuk pesakit dewasa dan kanak-kanak, termasuk masalah kesihatan harian serta penyakit akut yang memerlukan penilaian doktor.</p><p class="ql-size-large">Kami bermula dengan semakan gejala, sejarah kesihatan dan pemeriksaan fizikal sebelum menerangkan pilihan rawatan, ubat-ubatan serta tanda amaran yang perlu diperhatikan.</p><h1 class="ql-size-huge">Rawatan yang disediakan</h1>$ms$,
  description_en = $en$<p class="ql-size-large">Klinik Awfa provides comprehensive general care for adults and children, including everyday health concerns and acute illnesses that require medical assessment.</p><p class="ql-size-large">We begin with a review of symptoms, medical history and physical examination before explaining treatment options, medicines and warning signs to watch for.</p><h1 class="ql-size-huge">Treatment provided</h1>$en$,
  call_to_action_ms = 'Hubungi kami untuk mendapatkan nasihat atau tempah temujanji',
  call_to_action_en = 'Contact us for advice or book an appointment',
  services_list_ms = ARRAY[
    'Konsultasi sakit tekak, batuk, selesema dan demam',
    'Rawatan jangkitan pernafasan, sinus dan alahan',
    'Rawatan muntah, cirit-birit, sakit perut dan dehidrasi ringan',
    'Terapi nebuliser dan sedutan kahak apabila sesuai',
    'Ujian pantas Influenza, COVID-19, RSV dan Adenovirus',
    'Ujian denggi, ujian darah penuh dan pemeriksaan asas',
    'Pencucian hidung serta nasihat penjagaan di rumah',
    'Pemantauan susulan dan rujukan apabila diperlukan'
  ],
  services_list_en = ARRAY[
    'Consultation for sore throat, cough, cold and fever',
    'Assessment and treatment for respiratory infections, sinus symptoms and allergies',
    'Care for vomiting, diarrhoea, stomach pain and mild dehydration',
    'Nebuliser therapy and sputum suction when clinically appropriate',
    'Rapid Influenza, COVID-19, RSV and Adenovirus testing',
    'Dengue testing, full blood count and basic investigations',
    'Nasal cleansing and practical home-care advice',
    'Follow-up monitoring and referral when required'
  ]
WHERE slug = 'rawatan-am';

UPDATE public.clinic_services
SET
  title_ms = 'Prosedur Minor & Pembedahan',
  title_en = 'Minor Procedures & Surgery',
  description_ms = $ms$<p class="ql-size-large">Klinik Awfa menyediakan prosedur minor dan pembedahan kecil yang terpilih untuk membantu merawat masalah kulit, luka, telinga dan keadaan lain yang sesuai dilakukan di klinik.</p><p class="ql-size-large">Setiap prosedur dimulakan dengan pemeriksaan doktor, penerangan manfaat dan risiko, serta persetujuan pesakit. Penjagaan luka, ubat dan arahan susulan akan diterangkan selepas prosedur.</p><h1 class="ql-size-huge">Prosedur yang disediakan</h1>$ms$,
  description_en = $en$<p class="ql-size-large">Klinik Awfa provides selected minor procedures and small surgical treatments for suitable skin, wound, ear and other clinic-based conditions.</p><p class="ql-size-large">Every procedure begins with a doctor’s assessment, an explanation of benefits and risks, and patient consent. Wound care, medicines and follow-up instructions will be explained after the procedure.</p><h1 class="ql-size-huge">Procedures provided</h1>$en$,
  call_to_action_ms = 'Hubungi kami untuk penilaian prosedur',
  call_to_action_en = 'Contact us for a procedure assessment',
  services_list_ms = ARRAY[
    'Pembedahan kecil untuk ketumbuhan dan ketuat yang sesuai',
    'Rawatan luka, jahitan dan penukaran balutan',
    'Pembuangan benda asing atau kuku cengkam apabila sesuai',
    'Penjagaan telinga dan microsuction',
    'Khatan bayi dan kanak-kanak',
    'Khatan dewasa',
    'Biopsi atau penghantaran sampel untuk ujian apabila diperlukan',
    'Pemeriksaan susulan dan rujukan untuk kes yang lebih kompleks'
  ],
  services_list_en = ARRAY[
    'Minor removal of suitable lumps and warts',
    'Wound care, suturing and dressing changes',
    'Removal of foreign bodies or ingrown nails when appropriate',
    'Ear care and microsuction',
    'Baby and child circumcision',
    'Adult circumcision',
    'Biopsy or specimen submission for testing when required',
    'Follow-up review and referral for more complex cases'
  ]
WHERE slug = 'prosedur-minor';
