-- Yezza may contain multiple source patient IDs for the same Malaysian IC,
-- and an IC may already exist in Klinik Awfa. Preserve the existing canonical
-- patient row and attach each Yezza source identity to it without overwriting
-- the patient's name, phone number, DOB, or other profile fields.
DO $migration$
DECLARE
  v_signature constant regprocedure :=
    'public.apply_yezza_import(uuid,uuid,text,jsonb)'::regprocedure;
  v_definition text;
  v_updated text;
BEGIN
  v_definition := pg_get_functiondef(v_signature);
  v_updated := replace(
    v_definition,
    E'        )\n        RETURNING id INTO v_intended_patient_id;',
    E'        )\n        ON CONFLICT (national_id) WHERE national_id IS NOT NULL\n        DO UPDATE SET national_id = EXCLUDED.national_id\n        RETURNING id INTO v_intended_patient_id;'
  );

  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Expected Yezza patient insert clause not found';
  END IF;

  EXECUTE v_updated;
END
$migration$;
