-- Registered locum doctors are valid historical consulting doctors for the
-- offline-transcription workflow. Keep the same active, linked, exactly-one-
-- clinical-role boundary used for permanent doctors.

BEGIN;

DO $preflight$
BEGIN
  IF to_regprocedure('public.is_eligible_offline_consultation_doctor(uuid)') IS NULL
     OR to_regprocedure('public.is_current_offline_consultation_doctor(uuid,uuid)') IS NULL
     OR to_regclass('public.doctors') IS NULL
     OR to_regclass('public.user_roles') IS NULL
     OR to_regclass('public.consultations') IS NULL THEN
    RAISE EXCEPTION 'offline locum eligibility preflight failed: required objects are missing';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.is_eligible_offline_consultation_doctor(
  p_doctor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.doctors AS doctor
    WHERE doctor.id = p_doctor_id
      AND doctor.user_id IS NOT NULL
      AND doctor.status::text = 'active'
      AND (
        SELECT count(*) = 1
          AND min(role::text) IN ('locum', 'resident_doctor', 'doctor_admin')
        FROM public.user_roles
        WHERE user_id = doctor.user_id
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_current_offline_consultation_doctor(
  p_consultation_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.consultations AS consultation
    JOIN public.doctors AS doctor ON doctor.id = consultation.doctor_id
    WHERE consultation.id = p_consultation_id
      AND doctor.user_id = p_user_id
      AND (
        SELECT count(*) = 1
          AND min(role::text) IN ('locum', 'resident_doctor', 'doctor_admin')
        FROM public.user_roles
        WHERE user_id = doctor.user_id
      )
  )
$function$;

ALTER FUNCTION public.is_eligible_offline_consultation_doctor(uuid) OWNER TO postgres;
ALTER FUNCTION public.is_current_offline_consultation_doctor(uuid, uuid) OWNER TO postgres;

-- These helpers are authorization internals. Existing callers reach them only
-- through the already-guarded offline-consultation RPCs and RLS policies.
REVOKE ALL ON FUNCTION public.is_eligible_offline_consultation_doctor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_current_offline_consultation_doctor(uuid, uuid) FROM PUBLIC;

DO $postflight$
DECLARE
  v_eligibility_definition text;
  v_current_definition text;
BEGIN
  SELECT pg_get_functiondef('public.is_eligible_offline_consultation_doctor(uuid)'::regprocedure)
    INTO v_eligibility_definition;
  SELECT pg_get_functiondef('public.is_current_offline_consultation_doctor(uuid,uuid)'::regprocedure)
    INTO v_current_definition;

  IF position('locum' IN v_eligibility_definition) = 0
     OR position('locum' IN v_current_definition) = 0 THEN
    RAISE EXCEPTION 'offline locum eligibility postflight failed: locum boundary is missing';
  END IF;
END
$postflight$;

COMMIT;
