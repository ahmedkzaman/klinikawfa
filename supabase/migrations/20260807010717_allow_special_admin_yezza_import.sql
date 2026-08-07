-- Keep the database-side import authorization aligned with the Edge Function.
-- Both procedures remain SECURITY DEFINER and still verify the supplied actor
-- against public.user_roles before approving or applying any batch.
DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.approve_yezza_import(uuid,text,text,jsonb,jsonb,jsonb)'::regprocedure,
    'public.apply_yezza_import(uuid,uuid,text,jsonb)'::regprocedure
  ] LOOP
    v_definition := pg_get_functiondef(v_signature);
    v_updated := replace(
      v_definition,
      'user_role.role::text IN (''admin'', ''doctor_admin'')',
      'user_role.role::text IN (''admin'', ''doctor_admin'', ''special_admin'')'
    );

    IF v_updated = v_definition THEN
      RAISE EXCEPTION 'Expected Yezza authorization predicate not found for %', v_signature;
    END IF;

    EXECUTE v_updated;
  END LOOP;
END
$migration$;
