DO $$
DECLARE
  v_matched integer;
BEGIN
  WITH updated AS (
    UPDATE public.clinic_services AS cs
    SET services_list = v.new_list
    FROM (
      VALUES
        ('rawatan-am'::text, ARRAY[
          'Konsultasi Sakit Tekak / Demam / Selsema',
          'Terapi Nebuliser & Sedutan Kahak',
          'Ujian Denggi / Darah Penuh (FBC)',
          'Ujian Pantas (Influenza A & B / COVID-19 / Adenovirus / RSV)',
          'Pencucian Hidung'
        ]::text[]),
        ('prosedur-minor'::text, ARRAY[
          'Khatan Kanak-Kanak',
          'Khatan Dewasa',
          'Pembedahan Kecil / Ketuat',
          'Penjagaan Telinga (Microsuction)'
        ]::text[]),
        ('pemeriksaan-kesihatan'::text, ARRAY[
          'Pemeriksaan Bakal Haji 2026',
          'Pemeriksaan Kesihatan Pelajar',
          'Pemeriksaan Pra-Pekerjaan & Kecergasan Bekerja',
          'Pemeriksaan Darah Menyeluruh'
        ]::text[])
    ) AS v(slug, new_list)
    WHERE cs.slug = v.slug
    RETURNING 1
  )
  SELECT count(*) INTO v_matched FROM updated;

  IF v_matched <> 3 THEN
    RAISE EXCEPTION 'Expected exactly 3 rows matched, got %', v_matched;
  END IF;
END $$;