BEGIN;

CREATE OR REPLACE FUNCTION public.get_offline_consultation_audit(
  p_consultation_id uuid
)
RETURNS TABLE(
  id uuid,
  action text,
  actor_id uuid,
  actor_name text,
  created_at timestamptz,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_consultation public.consultations%ROWTYPE;
BEGIN
  SELECT *
    INTO v_consultation
  FROM public.consultations AS consultation
  WHERE consultation.id = p_consultation_id
    AND consultation.deleted_at IS NULL;

  IF v_actor_id IS NULL
     OR NOT FOUND
     OR v_consultation.entry_source <> 'offline_transcription' THEN
    RAISE EXCEPTION 'offline_consultation_audit_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    (
      v_consultation.entered_by = v_actor_id
      AND EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = v_actor_id AND role::text = 'ops_staff'
      )
    )
    OR public.is_current_offline_consultation_doctor(
      v_consultation.id,
      v_actor_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = v_actor_id AND role::text = 'doctor_admin'
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized_offline_consultation_audit'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT recent.id,
         recent.action,
         recent.actor_id,
         recent.actor_name,
         recent.created_at,
         recent.reason
  FROM (
    SELECT audit.id,
           audit.action,
           audit.actor_id,
           audit.actor_name,
           audit.created_at,
           audit.reason
    FROM public.consultation_approval_audit AS audit
    WHERE audit.consultation_id = p_consultation_id
    ORDER BY audit.created_at DESC, audit.id DESC
    LIMIT 50
  ) AS recent
  ORDER BY recent.created_at, recent.id;
END;
$function$;

ALTER FUNCTION public.get_offline_consultation_audit(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_offline_consultation_audit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_offline_consultation_audit(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_offline_consultation_audit(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_offline_consultation_audit(uuid) TO authenticated;

DO $postflight$
BEGIN
  IF to_regprocedure('public.get_offline_consultation_audit(uuid)') IS NULL THEN
    RAISE EXCEPTION 'offline audit bound postflight failed: RPC missing';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.get_offline_consultation_audit(uuid)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.get_offline_consultation_audit(uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'offline audit bound postflight failed: RPC privileges';
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;
