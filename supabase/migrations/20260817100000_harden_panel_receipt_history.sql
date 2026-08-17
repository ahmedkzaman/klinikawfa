-- Finalize the Insight panel-receipt boundary after the initial aggregate RPC.
-- This migration is deliberately additive: 20260817090000 may already exist in
-- migration history, so its function is replaced here instead of rewriting it.

-- Current Insight roles receive the existing reports.view permission as a
-- default. ON CONFLICT preserves any role policy already configured by admins.
INSERT INTO public.clinic_role_permissions (role, permission_key, allowed)
SELECT role_name::public.app_role, 'reports.view', true
FROM unnest(ARRAY[
  'special_admin', 'admin', 'doctor_admin', 'resident_doctor',
  'ops_staff', 'operations'
]) AS supported(role_name)
ON CONFLICT (role, permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_view_insight_workspace(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles AS role_row
      WHERE role_row.user_id = _user_id
        AND role_row.role::text = ANY (ARRAY[
          'special_admin', 'admin', 'doctor_admin', 'resident_doctor',
          'ops_staff', 'operations'
        ])
    )
    AND public.has_clinic_permission('reports.view', _user_id);
$function$;

ALTER FUNCTION public.can_view_insight_workspace(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_view_insight_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_insight_workspace(uuid) TO authenticated;

-- Historical imports retained a cumulative received amount and receipt date,
-- but their converted claim-created event intentionally carried no cash delta.
-- Add one auditable event only when no receipt-like event exists; mixed history
-- is left untouched and reported explicitly as incomplete by the RPC below.
ALTER TABLE private.financial_panel_claim_events
  DROP CONSTRAINT IF EXISTS financial_panel_claim_events_provenance_check;
ALTER TABLE private.financial_panel_claim_events
  ADD CONSTRAINT financial_panel_claim_events_provenance_check
  CHECK (provenance IN (
    'recorded', 'synthetic_backfill', 'inferred_source_timestamp',
    'historical_receipt_date_backfill'
  ));

ALTER TABLE private.financial_panel_claim_events
  DROP CONSTRAINT IF EXISTS financial_panel_claim_events_check;
ALTER TABLE private.financial_panel_claim_events
  ADD CONSTRAINT financial_panel_claim_events_check
  CHECK (
    (attribution_complete AND occurred_at IS NOT NULL AND provenance IN (
      'recorded', 'inferred_source_timestamp', 'historical_receipt_date_backfill'
    ))
    OR (NOT attribution_complete AND provenance = 'synthetic_backfill')
  );

CREATE UNIQUE INDEX IF NOT EXISTS financial_panel_claim_historical_receipt_once_idx
  ON private.financial_panel_claim_events (panel_claim_id)
  WHERE provenance = 'historical_receipt_date_backfill';

INSERT INTO private.financial_panel_claim_events (
  panel_claim_id,
  queue_entry_id,
  panel_id,
  event_kind,
  amount,
  received_amount,
  receipt_delta,
  status,
  due_date,
  occurred_at,
  provenance,
  attribution_complete
)
SELECT
  claim.id,
  claim.queue_entry_id,
  claim.panel_id,
  'receipt',
  claim.amount,
  claim.received_amount,
  claim.received_amount,
  claim.status::text,
  claim.due_date,
  claim.received_date::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur',
  'historical_receipt_date_backfill',
  true
FROM public.panel_claims AS claim
WHERE claim.received_amount > 0
  AND claim.received_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM private.financial_panel_claim_events AS event
    WHERE event.panel_claim_id = claim.id
      AND event.event_kind IN ('receipt', 'receipt_reversal', 'void')
  )
ON CONFLICT DO NOTHING;

-- Keep split claims on their append-only portion receipt events. For unsplit
-- receipts, use the business-effective received_date rather than write time.
CREATE OR REPLACE FUNCTION private.capture_financial_panel_claim_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_before_received numeric := 0;
  v_after_received numeric := 0;
  v_delta numeric;
  v_event_kind text;
  v_is_split boolean := false;
  v_occurred_at timestamptz := statement_timestamp();
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_before_received := COALESCE(OLD.received_amount, 0);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_after_received := COALESCE(NEW.received_amount, 0);
    v_is_split := EXISTS (
      SELECT 1
      FROM public.panel_claim_portions AS portion
      WHERE portion.panel_claim_id = NEW.id
    );
  END IF;
  v_delta := v_after_received - v_before_received;

  IF TG_OP = 'UPDATE' AND OLD.queue_entry_id IS DISTINCT FROM NEW.queue_entry_id THEN
    INSERT INTO private.financial_panel_claim_events (
      panel_claim_id, queue_entry_id, panel_id, event_kind, amount,
      received_amount, receipt_delta, status, due_date, occurred_at,
      provenance, attribution_complete
    ) VALUES (
      OLD.id, OLD.queue_entry_id, OLD.panel_id, 'reassignment_out', OLD.amount,
      0, CASE WHEN v_is_split THEN 0 ELSE -v_before_received END,
      'cancelled', OLD.due_date, statement_timestamp(), 'recorded', true
    );
    INSERT INTO private.financial_panel_claim_events (
      panel_claim_id, queue_entry_id, panel_id, event_kind, amount,
      received_amount, receipt_delta, status, due_date, occurred_at,
      provenance, attribution_complete
    ) VALUES (
      NEW.id, NEW.queue_entry_id, NEW.panel_id, 'reassignment_in', NEW.amount,
      v_after_received, CASE WHEN v_is_split THEN 0 ELSE v_after_received END,
      NEW.status::text, NEW.due_date,
      statement_timestamp(), 'recorded', true
    );
    RETURN NEW;
  END IF;

  IF v_is_split AND TG_OP = 'UPDATE' THEN
    v_delta := 0;
  END IF;

  IF TG_OP = 'INSERT' AND v_delta = 0 THEN
    v_event_kind := 'claim_created';
  ELSIF TG_OP = 'DELETE' THEN
    v_event_kind := 'void';
  ELSIF v_delta > 0 THEN
    v_event_kind := 'receipt';
  ELSIF v_delta < 0 THEN
    v_event_kind := 'receipt_reversal';
  ELSE
    v_event_kind := 'claim_edit';
  END IF;

  IF v_event_kind = 'receipt' AND TG_OP <> 'DELETE' AND NEW.received_date IS NOT NULL THEN
    v_occurred_at := NEW.received_date::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur';
  END IF;

  INSERT INTO private.financial_panel_claim_events (
    panel_claim_id,
    queue_entry_id,
    panel_id,
    event_kind,
    amount,
    received_amount,
    receipt_delta,
    status,
    due_date,
    occurred_at,
    provenance,
    attribution_complete
  ) VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.queue_entry_id ELSE NEW.queue_entry_id END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.panel_id ELSE NEW.panel_id END,
    v_event_kind,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.amount ELSE NEW.amount END,
    v_after_received,
    v_delta,
    CASE WHEN TG_OP = 'DELETE' THEN 'cancelled' ELSE NEW.status::text END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.due_date ELSE NEW.due_date END,
    v_occurred_at,
    'recorded',
    true
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

ALTER FUNCTION private.capture_financial_panel_claim_event() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.capture_financial_panel_claim_event()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_panel_receipt_summary(
  _start_date date,
  _end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
BEGIN
  IF NOT public.can_view_insight_workspace((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF _start_date IS NULL OR _end_date IS NULL THEN
    RAISE EXCEPTION 'PANEL_RECEIPT_DATES_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF _start_date > _end_date THEN
    RAISE EXCEPTION 'PANEL_RECEIPT_DATE_RANGE_REVERSED' USING ERRCODE = '22023';
  END IF;
  IF (_end_date - _start_date) > 365 THEN
    RAISE EXCEPTION 'PANEL_RECEIPT_DATE_RANGE_TOO_LARGE' USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH claim_event_totals AS MATERIALIZED (
      SELECT event.panel_claim_id, COALESCE(SUM(event.receipt_delta), 0) AS received_total
      FROM private.financial_panel_claim_events AS event
      WHERE event.event_kind IN ('receipt', 'receipt_reversal', 'void')
      GROUP BY event.panel_claim_id
    ),
    history_quality AS (
      SELECT COUNT(*)::integer AS incomplete_claims
      FROM public.panel_claims AS claim
      LEFT JOIN claim_event_totals AS event_total ON event_total.panel_claim_id = claim.id
      WHERE COALESCE(claim.received_amount, 0) <> COALESCE(event_total.received_total, 0)
    ),
    period_receipts AS (
      SELECT COALESCE(SUM(event.receipt_delta), 0) AS total_received
      FROM private.financial_panel_claim_events AS event
      WHERE event.event_kind IN ('receipt', 'receipt_reversal', 'void')
        AND event.attribution_complete
        AND timezone('Asia/Kuala_Lumpur', event.occurred_at)::date
          BETWEEN _start_date AND _end_date
    )
    SELECT jsonb_build_object(
      'total_received', round(period.total_received, 2),
      'attribution_complete', quality.incomplete_claims = 0,
      'incomplete_claims', quality.incomplete_claims
    )
    FROM period_receipts AS period
    CROSS JOIN history_quality AS quality
  );
END;
$function$;

ALTER FUNCTION public.get_panel_receipt_summary(date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_panel_receipt_summary(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_panel_receipt_summary(date, date) TO authenticated;

DO $postflight$
BEGIN
  IF to_regprocedure('public.can_view_insight_workspace(uuid)') IS NULL
     OR to_regprocedure('public.get_panel_receipt_summary(date,date)') IS NULL THEN
    RAISE EXCEPTION 'PANEL_RECEIPT_FINAL_RPC_MISSING';
  END IF;

  IF has_function_privilege('anon', 'public.get_panel_receipt_summary(date,date)', 'execute')
     OR has_function_privilege('public', 'public.get_panel_receipt_summary(date,date)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.get_panel_receipt_summary(date,date)', 'execute') THEN
    RAISE EXCEPTION 'PANEL_RECEIPT_FINAL_RPC_PRIVILEGE_INVALID';
  END IF;

  IF has_table_privilege('authenticated', 'private.financial_panel_claim_events', 'select')
     OR has_table_privilege('authenticated', 'public.panel_claim_portion_receipts', 'select') THEN
    RAISE EXCEPTION 'PANEL_RECEIPT_SOURCE_TABLE_EXPOSED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.panel_claims AS claim
    WHERE claim.received_amount > 0
      AND claim.received_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM private.financial_panel_claim_events AS event
        WHERE event.panel_claim_id = claim.id
          AND event.event_kind IN ('receipt', 'receipt_reversal', 'void')
      )
  ) THEN
    RAISE EXCEPTION 'PANEL_RECEIPT_SAFE_HISTORY_NOT_BACKFILLED';
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';
