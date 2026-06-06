CREATE OR REPLACE FUNCTION public._promote_appointment_to_clinic_internal(
  p_appointment_id uuid,
  p_payment_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  a record;
  v_patient_id uuid;
  v_clinic_appt_id uuid;
BEGIN
  SELECT * INTO a FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

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

  IF v_patient_id IS NULL THEN
    INSERT INTO public.patients (name, phone, national_id, id_type, notes)
    VALUES (
      a.patient_name,
      a.patient_phone,
      NULLIF(trim(a.patient_ic), ''),
      CASE WHEN a.patient_ic ~ '^\d{12}$' THEN 'mykad' ELSE 'passport' END,
      'Auto-created from public booking ' || a.id::text
    )
    RETURNING id INTO v_patient_id;
  END IF;

  INSERT INTO public.clinic_appointments (
    patient_id, doctor_id, appointment_date, appointment_time, status, notes, source_appointment_id
  )
  VALUES (
    v_patient_id, NULL, a.appointment_date, a.appointment_time, 'scheduled',
    COALESCE('Public booking — ' || a.service || COALESCE(E'\n' || a.message, ''), a.service),
    a.id
  )
  RETURNING id INTO v_clinic_appt_id;

  UPDATE public.appointments
     SET status = 'confirmed',
         payment_reference = COALESCE(p_payment_reference, payment_reference),
         updated_at = now()
   WHERE id = p_appointment_id;

  RETURN v_clinic_appt_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.promote_appointment_to_clinic(
  p_appointment_id uuid,
  p_payment_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_ops_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  RETURN public._promote_appointment_to_clinic_internal(p_appointment_id, p_payment_reference);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_auto_promote_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'confirmed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.clinic_appointments WHERE source_appointment_id = NEW.id
    ) THEN
      PERFORM public._promote_appointment_to_clinic_internal(NEW.id, NEW.payment_reference);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS auto_promote_confirmed_appointment ON public.appointments;
CREATE TRIGGER auto_promote_confirmed_appointment
AFTER INSERT OR UPDATE OF status ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.trg_auto_promote_appointment();

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT a.id
    FROM public.appointments a
    LEFT JOIN public.clinic_appointments ca ON ca.source_appointment_id = a.id
    WHERE a.status = 'confirmed' AND ca.id IS NULL
  LOOP
    PERFORM public._promote_appointment_to_clinic_internal(r.id, NULL);
  END LOOP;
END;
$$;