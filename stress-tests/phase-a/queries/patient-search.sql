-- usePatients: name/phone/reg_no/national_id ilike
SELECT id, name, phone, reg_no, national_id, date_of_birth
FROM public.patients
WHERE deleted_at IS NULL
  AND (name ILIKE :q OR phone ILIKE :q OR reg_no ILIKE :q OR national_id ILIKE :q)
ORDER BY created_at DESC
LIMIT 50;
