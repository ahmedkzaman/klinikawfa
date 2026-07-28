CREATE OR REPLACE FUNCTION public.get_doctor_clinical_activity(
  _start_date date,
  _end_date date
)
RETURNS TABLE (
  activity_id uuid,
  activity_kind text,
  activity_date date,
  activity_name text,
  consultation_id uuid,
  queue_entry_id uuid,
  queue_created_at timestamptz,
  queue_sequence integer,
  doctor_id uuid,
  doctor_name text,
  patient_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.can_view_insights(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF _start_date IS NULL OR _end_date IS NULL OR _start_date > _end_date THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = '22007';
  END IF;

  IF (_end_date - _start_date) > 366 THEN
    RAISE EXCEPTION 'DATE_RANGE_TOO_LARGE' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    ci.id AS activity_id,
    'procedure'::text AS activity_kind,
    (qe.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS activity_date,
    s.name AS activity_name,
    c.id AS consultation_id,
    qe.id AS queue_entry_id,
    qe.created_at AS queue_created_at,
    qe.queue_sequence,
    c.doctor_id,
    COALESCE(profile.full_name, 'Unassigned') AS doctor_name,
    COALESCE(patient.name, 'Unknown patient') AS patient_name
  FROM public.consultation_items AS ci
  INNER JOIN public.consultations AS c
    ON c.id = ci.consultation_id
  INNER JOIN public.queue_entries AS qe
    ON qe.id = c.queue_entry_id
  INNER JOIN public.services AS s
    ON s.id = ci.item_id
  LEFT JOIN public.doctors AS doctor
    ON doctor.id = c.doctor_id
  LEFT JOIN public.profiles AS profile
    ON profile.id = doctor.user_id
  LEFT JOIN public.patients AS patient
    ON patient.id = c.patient_id
  WHERE s.category = 'Procedure'
    AND ci.deleted_at IS NULL
    AND c.deleted_at IS NULL
    AND c.status = 'completed'
    AND (qe.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
      BETWEEN _start_date AND _end_date

  UNION ALL

  SELECT
    cd.id AS activity_id,
    lower(cd.type) AS activity_kind,
    (cd.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS activity_date,
    COALESCE(
      NULLIF(cd.template_name, ''),
      CASE lower(cd.type)
        WHEN 'mc' THEN 'Medical certificate'
        WHEN 'quarantine' THEN 'Quarantine letter'
        WHEN 'referral' THEN 'Referral letter'
      END
    ) AS activity_name,
    c.id AS consultation_id,
    qe.id AS queue_entry_id,
    qe.created_at AS queue_created_at,
    qe.queue_sequence,
    c.doctor_id,
    COALESCE(profile.full_name, 'Unassigned') AS doctor_name,
    COALESCE(patient.name, 'Unknown patient') AS patient_name
  FROM public.consultation_documents AS cd
  INNER JOIN public.consultations AS c
    ON c.id = cd.consultation_id
  INNER JOIN public.queue_entries AS qe
    ON qe.id = c.queue_entry_id
  LEFT JOIN public.doctors AS doctor
    ON doctor.id = c.doctor_id
  LEFT JOIN public.profiles AS profile
    ON profile.id = doctor.user_id
  LEFT JOIN public.patients AS patient
    ON patient.id = c.patient_id
  WHERE lower(coalesce(cd.type, '')) IN ('mc', 'quarantine', 'referral')
    AND c.deleted_at IS NULL
    AND c.status = 'completed'
    AND (cd.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
      BETWEEN _start_date AND _end_date;
END;
$$;

REVOKE ALL ON FUNCTION public.get_doctor_clinical_activity(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_doctor_clinical_activity(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_clinical_activity(date, date) TO authenticated;
