
-- 1. Link column on clinic_appointments
ALTER TABLE public.clinic_appointments
  ADD COLUMN IF NOT EXISTS source_appointment_id uuid
  REFERENCES public.appointments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_appointments_source_appt
  ON public.clinic_appointments(source_appointment_id)
  WHERE source_appointment_id IS NOT NULL;

-- 2. Promote RPC
CREATE OR REPLACE FUNCTION public.promote_appointment_to_clinic(
  p_appointment_id uuid,
  p_payment_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a record;
  v_patient_id uuid;
  v_clinic_appt_id uuid;
BEGIN
  IF NOT public.is_ops_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO a FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency: if already promoted, just return the existing clinic appt id
  SELECT id INTO v_clinic_appt_id
  FROM public.clinic_appointments
  WHERE source_appointment_id = p_appointment_id
  LIMIT 1;

  IF v_clinic_appt_id IS NOT NULL THEN
    UPDATE public.appointments
       SET status = 'confirmed',
           payment_reference = COALESCE(p_payment_reference, payment_reference),
           updated_at = now()
     WHERE id = p_appointment_id;
    RETURN v_clinic_appt_id;
  END IF;

  -- Match patient by IC, then by phone
  IF a.patient_ic IS NOT NULL AND length(trim(a.patient_ic)) > 0 THEN
    SELECT id INTO v_patient_id
    FROM public.patients
    WHERE national_id = a.patient_ic
    LIMIT 1;
  END IF;

  IF v_patient_id IS NULL AND a.patient_phone IS NOT NULL THEN
    SELECT id INTO v_patient_id
    FROM public.patients
    WHERE phone = a.patient_phone
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Create patient if no match
  IF v_patient_id IS NULL THEN
    INSERT INTO public.patients (name, phone, national_id, id_type, notes)
    VALUES (
      a.patient_name,
      a.patient_phone,
      NULLIF(trim(a.patient_ic), ''),
      CASE WHEN a.patient_ic ~ '^\d{12}$' THEN 'mykad' ELSE 'other' END,
      'Auto-created from public booking ' || a.id::text
    )
    RETURNING id INTO v_patient_id;
  END IF;

  -- Insert clinic_appointments row (doctor unassigned)
  INSERT INTO public.clinic_appointments (
    patient_id, doctor_id, appointment_date, appointment_time, status, notes, source_appointment_id
  )
  VALUES (
    v_patient_id, NULL, a.appointment_date, a.appointment_time, 'scheduled',
    COALESCE('Public booking — ' || a.service || COALESCE(E'\n' || a.message, ''), a.service),
    a.id
  )
  RETURNING id INTO v_clinic_appt_id;

  -- Confirm the public booking
  UPDATE public.appointments
     SET status = 'confirmed',
         payment_reference = COALESCE(p_payment_reference, payment_reference),
         updated_at = now()
   WHERE id = p_appointment_id;

  RETURN v_clinic_appt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_appointment_to_clinic(uuid, text) TO authenticated;
