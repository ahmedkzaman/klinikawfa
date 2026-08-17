-- Align the detailed/CSV doctor activity cohort with Insight aggregates by
-- excluding payment-only queue entries. Additive only.

ALTER FUNCTION public.get_doctor_clinical_activity(date, date)
  RENAME TO _get_doctor_clinical_activity_before_payment_only_filter;

REVOKE ALL ON FUNCTION public._get_doctor_clinical_activity_before_payment_only_filter(date, date)
  FROM PUBLIC, anon, authenticated;

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
  patient_name text,
  unit_price numeric,
  quantity numeric,
  total_price numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT activity.*
  FROM public._get_doctor_clinical_activity_before_payment_only_filter(
    _start_date,
    _end_date
  ) AS activity
  JOIN public.queue_entries AS queue_entry
    ON queue_entry.id = activity.queue_entry_id
  WHERE queue_entry.visit_type <> 'payment_only'
  ORDER BY activity.activity_date, activity.activity_kind, activity.activity_id;
$function$;

ALTER FUNCTION public.get_doctor_clinical_activity(date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_doctor_clinical_activity(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_clinical_activity(date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
