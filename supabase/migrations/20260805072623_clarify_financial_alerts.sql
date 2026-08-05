-- Financial alert classifications must be mutually actionable. The original
-- report treated every unpaid/outstanding visit as a payment mismatch, so the
-- same panel claim appeared in multiple alert worklists.
ALTER FUNCTION private.financial_control_report_rows(date, date, date)
  RENAME TO financial_control_report_rows_before_alert_clarity;

ALTER FUNCTION private.financial_control_report_rows_before_alert_clarity(date, date, date)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION private.financial_control_report_rows_before_alert_clarity(date,date,date)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.financial_control_report_rows(
  _start_date date,
  _end_date date,
  _as_of_date date
)
RETURNS TABLE (
  queue_entry_id uuid,
  consultation_id uuid,
  completed_date date,
  patient_id uuid,
  patient_name text,
  doctor_id uuid,
  doctor_name text,
  payment_type text,
  payment_method text,
  panel_provider_id uuid,
  panel_provider_name text,
  billed numeric,
  paid_to_date numeric,
  paid_in_period numeric,
  older_debt_collected_in_period numeric,
  cogs numeric,
  discount numeric,
  tax numeric,
  refund numeric,
  outstanding numeric,
  panel_outstanding numeric,
  missing_cost_count integer,
  zero_price_count integer,
  correction_count integer,
  claim_status text,
  claim_created_date date,
  claim_due_date date,
  is_cohort boolean,
  attribution_complete boolean,
  cost_complete boolean,
  alert_keys text[],
  item_state jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $function$
  SELECT
    report.queue_entry_id,
    report.consultation_id,
    report.completed_date,
    report.patient_id,
    report.patient_name,
    report.doctor_id,
    report.doctor_name,
    report.payment_type,
    report.payment_method,
    report.panel_provider_id,
    report.panel_provider_name,
    report.billed,
    report.paid_to_date,
    report.paid_in_period,
    report.older_debt_collected_in_period,
    report.cogs,
    report.discount,
    report.tax,
    report.refund,
    report.outstanding,
    report.panel_outstanding,
    report.missing_cost_count,
    report.zero_price_count,
    report.correction_count,
    report.claim_status,
    report.claim_created_date,
    report.claim_due_date,
    report.is_cohort,
    report.attribution_complete,
    report.cost_complete,
    ARRAY(
      SELECT adjusted.key_value
      FROM (
        SELECT existing.key_value, existing.sort_order
        FROM unnest(report.alert_keys) WITH ORDINALITY
          AS existing(key_value, sort_order)
        WHERE existing.key_value <> 'payment_mismatch'

        UNION ALL

        SELECT 'payment_mismatch'::text, 100::bigint
        WHERE report.attribution_complete
          AND report.payment_type <> 'panel'
          AND abs(report.billed - report.paid_to_date - report.outstanding) > 0.01
          AND NOT (
            'duplicate_or_excess_payment' = ANY(report.alert_keys)
          )
          AND NOT ('unpaid_self_pay' = ANY(report.alert_keys))
          AND NOT ('unsubmitted_panel' = ANY(report.alert_keys))
          AND NOT ('overdue_panel' = ANY(report.alert_keys))
      ) AS adjusted
      ORDER BY adjusted.sort_order
    )::text[] AS alert_keys,
    report.item_state
  FROM private.financial_control_report_rows_before_alert_clarity(
    _start_date,
    _end_date,
    _as_of_date
  ) AS report;
$function$;

ALTER FUNCTION private.financial_control_report_rows(date, date, date)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION private.financial_control_report_rows(date,date,date)
  FROM PUBLIC, anon, authenticated;
