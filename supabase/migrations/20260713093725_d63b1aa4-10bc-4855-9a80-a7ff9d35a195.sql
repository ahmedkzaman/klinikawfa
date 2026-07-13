
UPDATE public.clinic_services
SET services_list = ARRAY[
  'Konsultasi Sakit Tekak, Selsema & Demam',
  'Terapi Nebuliser & Sedutan Kahak',
  'Ujian Darah Penuh (FBC)',
  'Ujian Pantas: Influenza, COVID, RSV, Adenovirus',
  'Pencucian Hidung'
]
WHERE slug = 'rawatan-am';

UPDATE public.clinic_services
SET services_list = ARRAY[
  'Khatan Kanak-Kanak',
  'Khatan Dewasa',
  'Pembedahan Kecil (Ketumbuhan & Ketuat)',
  'Penjagaan Telinga (Microsuction)'
]
WHERE slug = 'prosedur-minor';

UPDATE public.clinic_services
SET services_list = ARRAY[
  'Pemeriksaan Kesihatan Haji 2026',
  'Pemeriksaan Kesihatan Pelajar',
  'Pemeriksaan Pra-Pekerjaan & Kecergasan Bekerja',
  'Pemeriksaan Darah Menyeluruh'
]
WHERE slug = 'pemeriksaan-kesihatan';
