-- Race-safe daily queue number generator
CREATE OR REPLACE FUNCTION public.get_next_queue_number()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE next_num integer;
BEGIN
  PERFORM pg_advisory_xact_lock(
    ('x' || to_char(CURRENT_DATE,'YYYYMMDD'))::bit(32)::int
  );
  SELECT COALESCE(MAX(queue_sequence), 0) + 1
    INTO next_num
  FROM public.queue_entries
  WHERE created_at::date = CURRENT_DATE;
  RETURN next_num;
END;
$$;

-- Patch appointment intake to populate queue_sequence atomically
CREATE OR REPLACE FUNCTION public.intake_appointment_to_queue(p_appointment_id uuid, p_patient_id uuid, p_visit_purpose text DEFAULT 'consultation'::text, p_notes text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_queue_id uuid;
  v_appt_status text;
  v_seq integer;
BEGIN
  IF NOT public.is_ops_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_appt_status
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_appt_status = 'checked_in' THEN
    RAISE EXCEPTION 'ALREADY_CHECKED_IN' USING ERRCODE = 'P0001';
  END IF;

  v_seq := public.get_next_queue_number();

  INSERT INTO public.queue_entries (
    patient_id, visit_purpose, visit_notes,
    source_appointment_id, created_by, clinic_status, queue_sequence
  )
  VALUES (
    p_patient_id, p_visit_purpose, p_notes,
    p_appointment_id, auth.uid(), 'registered', v_seq
  )
  RETURNING id INTO v_queue_id;

  UPDATE public.appointments
     SET status = 'checked_in'
   WHERE id = p_appointment_id;

  RETURN v_queue_id;
END;
$function$;