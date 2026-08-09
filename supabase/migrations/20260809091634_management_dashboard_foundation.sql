-- Monthly management dashboard inputs, append-only audit history, and
-- prospective internal appointment attendance linkage.

CREATE OR REPLACE FUNCTION public.can_view_management_dashboard(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role::text = ANY (ARRAY[
        'admin', 'special_admin', 'doctor_admin', 'resident_doctor', 'staff',
        'ops_staff', 'operations', 'purchaser', 'staff_nurse'
      ])
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_edit_management_dashboard(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role::text = ANY (ARRAY['admin', 'special_admin', 'doctor_admin'])
  );
$function$;

REVOKE ALL ON FUNCTION public.can_view_management_dashboard(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_management_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_management_dashboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_management_dashboard(uuid) TO authenticated;

CREATE TABLE public.management_dashboard_monthly_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_start date NOT NULL
    CHECK (month_start = date_trunc('month', month_start)::date),
  metric_key text NOT NULL CHECK (metric_key = ANY (ARRAY[
    'gross_revenue_target','locum_pay','stock_purchase_manual','stock_availability_feedback',
    'initiative_a','initiative_b','initiative_c','google_rating','google_reviews',
    'facebook_followers','instagram_followers','tiktok_followers','facebook_posts',
    'instagram_posts','tiktok_posts','threads_posts','facebook_leads','hq_shooting',
    'outreach_visits','community_health_events','visibility_2','visibility_3','visibility_4',
    'marketing_meeting','staff_meeting_w1','staff_cme_w2','staff_cme_w4','nsep_w3',
    'doctor_alignment','doctor_cme_1','doctor_cme_2','v2v_session','clinic_manager_meeting'
  ])),
  target_numeric numeric,
  actual_numeric numeric,
  status text CHECK (
    status IS NULL OR status IN ('not_started', 'in_progress', 'done', 'blocked')
  ),
  notes text NOT NULL DEFAULT '',
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (month_start, metric_key)
);

CREATE INDEX management_dashboard_metrics_month_idx
  ON public.management_dashboard_monthly_metrics(month_start);

CREATE TABLE public.management_dashboard_metric_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  metric_id uuid,
  month_start date NOT NULL,
  metric_key text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_value jsonb,
  new_value jsonb,
  edited_by uuid NOT NULL REFERENCES auth.users(id),
  edited_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX management_dashboard_audit_month_idx
  ON public.management_dashboard_metric_audit(month_start, edited_at DESC);

ALTER TABLE public.management_dashboard_monthly_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_dashboard_metric_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY management_dashboard_metrics_read
  ON public.management_dashboard_monthly_metrics
  FOR SELECT TO authenticated
  USING (public.can_view_management_dashboard((SELECT auth.uid())));

CREATE POLICY management_dashboard_metrics_insert
  ON public.management_dashboard_monthly_metrics
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_edit_management_dashboard((SELECT auth.uid()))
    AND updated_by = (SELECT auth.uid())
  );

CREATE POLICY management_dashboard_metrics_update
  ON public.management_dashboard_monthly_metrics
  FOR UPDATE TO authenticated
  USING (public.can_edit_management_dashboard((SELECT auth.uid())))
  WITH CHECK (
    public.can_edit_management_dashboard((SELECT auth.uid()))
    AND updated_by = (SELECT auth.uid())
  );

CREATE POLICY management_dashboard_metrics_delete
  ON public.management_dashboard_monthly_metrics
  FOR DELETE TO authenticated
  USING (public.can_edit_management_dashboard((SELECT auth.uid())));

CREATE POLICY management_dashboard_audit_read
  ON public.management_dashboard_metric_audit
  FOR SELECT TO authenticated
  USING (public.can_view_management_dashboard((SELECT auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.management_dashboard_monthly_metrics TO authenticated;
GRANT SELECT ON public.management_dashboard_metric_audit TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.management_dashboard_metric_audit FROM authenticated;
REVOKE ALL ON public.management_dashboard_monthly_metrics FROM anon;
REVOKE ALL ON public.management_dashboard_metric_audit FROM anon;

CREATE OR REPLACE FUNCTION public.audit_management_dashboard_metric()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR NOT public.can_edit_management_dashboard(actor) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.management_dashboard_metric_audit (
    metric_id, month_start, metric_key, operation, old_value, new_value, edited_by
  ) VALUES (
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.month_start, OLD.month_start),
    COALESCE(NEW.metric_key, OLD.metric_key),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    actor
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_management_dashboard_metric() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER management_dashboard_metric_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.management_dashboard_monthly_metrics
FOR EACH ROW EXECUTE FUNCTION public.audit_management_dashboard_metric();

CREATE OR REPLACE FUNCTION public.set_management_dashboard_metric(
  _month_start date,
  _metric_key text,
  _target_numeric numeric DEFAULT NULL,
  _actual_numeric numeric DEFAULT NULL,
  _status text DEFAULT NULL,
  _notes text DEFAULT ''
)
RETURNS public.management_dashboard_monthly_metrics
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  result public.management_dashboard_monthly_metrics;
BEGIN
  IF NOT public.can_edit_management_dashboard((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.management_dashboard_monthly_metrics (
    month_start, metric_key, target_numeric, actual_numeric, status, notes, updated_by
  ) VALUES (
    date_trunc('month', _month_start)::date,
    _metric_key,
    _target_numeric,
    _actual_numeric,
    _status,
    COALESCE(_notes, ''),
    (SELECT auth.uid())
  )
  ON CONFLICT (month_start, metric_key) DO UPDATE SET
    target_numeric = EXCLUDED.target_numeric,
    actual_numeric = EXCLUDED.actual_numeric,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    updated_by = EXCLUDED.updated_by,
    updated_at = now()
  RETURNING * INTO result;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_management_dashboard_metric(
  _month_start date,
  _metric_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  removed integer;
BEGIN
  IF NOT public.can_edit_management_dashboard((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.management_dashboard_monthly_metrics
  WHERE month_start = date_trunc('month', _month_start)::date
    AND metric_key = _metric_key;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_management_dashboard_metric(date,text,numeric,numeric,text,text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_management_dashboard_metric(date,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_management_dashboard_metric(date,text,numeric,numeric,text,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_management_dashboard_metric(date,text)
  TO authenticated;

ALTER TABLE public.clinic_appointments
  ADD COLUMN IF NOT EXISTS queue_entry_id uuid
    REFERENCES public.queue_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS management_dashboard_clinic_appointment_queue_uidx
  ON public.clinic_appointments(queue_entry_id)
  WHERE queue_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS management_dashboard_clinic_appointment_month_idx
  ON public.clinic_appointments(appointment_date, status);

CREATE OR REPLACE FUNCTION public.link_clinic_appointment_checkin(
  _appointment_id uuid,
  _queue_entry_id uuid
)
RETURNS public.clinic_appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  appointment_row public.clinic_appointments;
  queue_patient_id uuid;
BEGIN
  IF NOT public.is_ops_or_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO appointment_row
  FROM public.clinic_appointments
  WHERE id = _appointment_id
  FOR UPDATE;

  IF appointment_row.id IS NULL THEN
    RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT patient_id INTO queue_patient_id
  FROM public.queue_entries
  WHERE id = _queue_entry_id;

  IF queue_patient_id IS NULL OR queue_patient_id <> appointment_row.patient_id THEN
    RAISE EXCEPTION 'APPOINTMENT_QUEUE_PATIENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  UPDATE public.clinic_appointments
  SET queue_entry_id = _queue_entry_id,
      checked_in_at = COALESCE(checked_in_at, now()),
      status = 'in_progress',
      updated_at = now()
  WHERE id = _appointment_id
  RETURNING * INTO appointment_row;

  RETURN appointment_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.link_clinic_appointment_checkin(uuid,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_clinic_appointment_checkin(uuid,uuid)
  TO authenticated;
