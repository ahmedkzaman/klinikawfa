CREATE OR REPLACE FUNCTION public.get_doctor_clinical_activity(
  _start_date date, _end_date date
)
RETURNS TABLE (
  activity_id uuid, activity_kind text, activity_date date, activity_name text,
  consultation_id uuid, queue_entry_id uuid, queue_created_at timestamptz,
  queue_sequence integer, doctor_id uuid, doctor_name text, patient_name text,
  unit_price numeric, quantity numeric, total_price numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_insights(auth.uid()) THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501'; END IF;
  IF _start_date IS NULL OR _end_date IS NULL OR _start_date > _end_date THEN RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = '22007'; END IF;
  IF (_end_date - _start_date) > 365 THEN RAISE EXCEPTION 'DATE_RANGE_TOO_LARGE' USING ERRCODE = '22023'; END IF;
  RETURN QUERY
  SELECT activity.* FROM (
    SELECT ci.id, 'procedure'::text, (qe.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date, s.name,
      c.id, qe.id, qe.created_at, qe.queue_sequence, c.doctor_id,
      CASE WHEN c.doctor_id IS NULL THEN 'Unassigned' ELSE COALESCE(NULLIF(btrim(profile.full_name), ''), NULLIF(btrim(doctor.name), ''), 'Unknown doctor') END,
      COALESCE(NULLIF(btrim(patient.name), ''), 'Unknown patient'), ci.price::numeric,
      COALESCE(ci.quantity, 1)::numeric, (ci.price * COALESCE(ci.quantity, 1))::numeric
    FROM public.consultation_items ci JOIN public.consultations c ON c.id = ci.consultation_id
      JOIN public.queue_entries qe ON qe.id = c.queue_entry_id JOIN public.services s ON s.id = ci.service_id
      LEFT JOIN public.doctors doctor ON doctor.id = c.doctor_id LEFT JOIN public.profiles profile ON profile.id = doctor.user_id
      LEFT JOIN public.patients patient ON patient.id = c.patient_id
    WHERE lower(trim(s.category)) = 'procedure' AND ci.deleted_at IS NULL AND c.deleted_at IS NULL AND c.status = 'completed'
      AND qe.created_at >= (_start_date::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur') AND qe.created_at < ((_end_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
    UNION ALL
    SELECT cd.id, lower(cd.type), (cd.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
      COALESCE(NULLIF(btrim(cd.template_name), ''), CASE lower(cd.type) WHEN 'mc' THEN 'Medical certificate' WHEN 'quarantine' THEN 'Quarantine letter' WHEN 'referral' THEN 'Referral letter' END),
      c.id, qe.id, qe.created_at, qe.queue_sequence, c.doctor_id,
      CASE WHEN c.doctor_id IS NULL THEN 'Unassigned' ELSE COALESCE(NULLIF(btrim(profile.full_name), ''), NULLIF(btrim(doctor.name), ''), 'Unknown doctor') END,
      COALESCE(NULLIF(btrim(patient.name), ''), 'Unknown patient'), NULL::numeric, NULL::numeric, NULL::numeric
    FROM public.consultation_documents cd JOIN public.consultations c ON c.id = cd.consultation_id
      JOIN public.queue_entries qe ON qe.id = c.queue_entry_id LEFT JOIN public.doctors doctor ON doctor.id = c.doctor_id
      LEFT JOIN public.profiles profile ON profile.id = doctor.user_id LEFT JOIN public.patients patient ON patient.id = c.patient_id
    WHERE lower(coalesce(cd.type, '')) IN ('mc', 'quarantine', 'referral') AND c.deleted_at IS NULL AND c.status = 'completed'
      AND cd.created_at >= (_start_date::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur') AND cd.created_at < ((_end_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
  ) AS activity(activity_id, activity_kind, activity_date, activity_name, consultation_id, queue_entry_id, queue_created_at, queue_sequence, doctor_id, doctor_name, patient_name, unit_price, quantity, total_price)
  ORDER BY activity.activity_date, activity.activity_kind, activity.activity_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_doctor_clinical_activity(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_doctor_clinical_activity(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_clinical_activity(date, date) TO authenticated;
