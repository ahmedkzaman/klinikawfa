-- Migration 6: Atomic Intake RPC (B.5)

CREATE OR REPLACE FUNCTION public.intake_appointment_to_queue(
  p_appointment_id uuid,
  p_patient_id uuid,
  p_visit_purpose text DEFAULT 'consultation',
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_id uuid;
  v_appt_status text;
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

  INSERT INTO public.queue_entries (
    patient_id, visit_purpose, visit_notes,
    source_appointment_id, created_by, clinic_status
  )
  VALUES (
    p_patient_id, p_visit_purpose, p_notes,
    p_appointment_id, auth.uid(), 'registered'
  )
  RETURNING id INTO v_queue_id;

  UPDATE public.appointments
     SET status = 'checked_in'
   WHERE id = p_appointment_id;

  RETURN v_queue_id;
END;
$$;

ALTER FUNCTION public.intake_appointment_to_queue(uuid, uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.intake_appointment_to_queue(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intake_appointment_to_queue(uuid, uuid, text, text) TO authenticated;