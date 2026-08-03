-- Canonical visit-level financial facts for management reporting.
-- Mutable operational rows are projected through immutable financial events.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE private.financial_visit_completion_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  queue_entry_id uuid NOT NULL,
  consultation_id uuid NOT NULL UNIQUE,
  completed_at timestamptz,
  provenance text NOT NULL CHECK (provenance IN ('recorded', 'synthetic_backfill')),
  attribution_complete boolean NOT NULL,
  item_state jsonb,
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CHECK (item_state IS NULL OR jsonb_typeof(item_state) = 'array'),
  CHECK (
    (attribution_complete AND completed_at IS NOT NULL
      AND provenance = 'recorded' AND item_state IS NOT NULL)
    OR (NOT attribution_complete AND provenance = 'synthetic_backfill'
      AND item_state IS NULL)
  )
);

CREATE TABLE private.financial_payment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id uuid NOT NULL,
  queue_entry_id uuid,
  consultation_id uuid,
  event_kind text NOT NULL CHECK (
    event_kind IN ('receipt', 'correction', 'void', 'restoration', 'synthetic_backfill')
  ),
  amount_delta numeric NOT NULL,
  payment_type text,
  payment_method text,
  occurred_at timestamptz,
  provenance text NOT NULL CHECK (provenance IN ('recorded', 'synthetic_backfill')),
  attribution_complete boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CHECK (
    (attribution_complete AND occurred_at IS NOT NULL AND provenance = 'recorded')
    OR (NOT attribution_complete AND provenance = 'synthetic_backfill')
  )
);

CREATE TABLE private.financial_panel_claim_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  panel_claim_id uuid NOT NULL,
  queue_entry_id uuid,
  panel_id uuid NOT NULL,
  event_kind text NOT NULL CHECK (
    event_kind IN (
      'claim_created', 'claim_edit', 'receipt', 'receipt_reversal',
      'void', 'synthetic_backfill'
    )
  ),
  amount numeric NOT NULL,
  received_amount numeric NOT NULL,
  receipt_delta numeric NOT NULL,
  status text NOT NULL,
  due_date date,
  occurred_at timestamptz,
  provenance text NOT NULL CHECK (provenance IN ('recorded', 'synthetic_backfill')),
  attribution_complete boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CHECK (
    (attribution_complete AND occurred_at IS NOT NULL AND provenance = 'recorded')
    OR (NOT attribution_complete AND provenance = 'synthetic_backfill')
  )
);

CREATE TABLE private.financial_zero_price_package_child_events (
  consultation_item_id uuid PRIMARY KEY,
  consultation_id uuid NOT NULL,
  package_line_item_id uuid NOT NULL,
  package_id uuid NOT NULL,
  package_item_id uuid NOT NULL,
  completed_at timestamptz NOT NULL,
  provenance text NOT NULL CHECK (provenance = 'recorded_at_completion'),
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE INDEX financial_visit_completion_completed_idx
  ON private.financial_visit_completion_events (completed_at, consultation_id)
  WHERE attribution_complete;
CREATE INDEX financial_payment_queue_occurred_idx
  ON private.financial_payment_events (queue_entry_id, occurred_at, id)
  WHERE attribution_complete;
CREATE INDEX financial_payment_consultation_occurred_idx
  ON private.financial_payment_events (consultation_id, occurred_at, id)
  WHERE attribution_complete;
CREATE INDEX financial_panel_claim_queue_occurred_idx
  ON private.financial_panel_claim_events (queue_entry_id, occurred_at, id)
  WHERE attribution_complete;

REVOKE ALL PRIVILEGES ON TABLE
  private.financial_visit_completion_events,
  private.financial_payment_events,
  private.financial_panel_claim_events,
  private.financial_zero_price_package_child_events
FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE
  private.financial_visit_completion_events_id_seq,
  private.financial_payment_events_id_seq,
  private.financial_panel_claim_events_id_seq
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.prevent_financial_event_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $function$
BEGIN
  RAISE EXCEPTION 'FINANCIAL_EVENT_IMMUTABLE' USING ERRCODE = '42501';
END;
$function$;

CREATE OR REPLACE FUNCTION private.financial_control_completion_item_state(
  _consultation_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'item_name', item.item_name,
    'quantity', item.quantity,
    'price', item.price,
    'item_id', item.item_id,
    'service_id', item.service_id,
    'package_id', item.package_id,
    'dispensed_qty', item.dispensed_qty,
    'unit_cost', item.unit_cost,
    'adjustment_kind', item.billing_adjustment_kind,
    'charge_type_id', item.clinic_charge_type_id
  ) ORDER BY item.id), '[]'::jsonb)
  FROM public.consultation_items item
  WHERE item.consultation_id = _consultation_id
    AND item.deleted_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION private.financial_control_bill_state_as_of(
  _queue_entry_id uuid,
  _consultation_id uuid,
  _as_of_date date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $function$
  WITH completion AS MATERIALIZED (
    SELECT event.item_state
    FROM private.financial_visit_completion_events event
    WHERE event.queue_entry_id = _queue_entry_id
      AND event.consultation_id = _consultation_id
    LIMIT 1
  ), completion_totals AS (
    SELECT
      COALESCE(SUM((item->>'price')::numeric * (item->>'quantity')::numeric), 0)
        AS total,
      GREATEST(-COALESCE(SUM((item->>'price')::numeric * (item->>'quantity')::numeric)
        FILTER (WHERE item->>'adjustment_kind' = 'discount'), 0), 0) AS discount_rm,
      GREATEST(COALESCE(SUM((item->>'price')::numeric * (item->>'quantity')::numeric)
        FILTER (WHERE item->>'adjustment_kind' = 'tax'), 0), 0) AS tax_rm
    FROM completion
    CROSS JOIN LATERAL jsonb_array_elements(completion.item_state) item
  ), selected AS MATERIALIZED (
    SELECT
      completion.item_state AS completion_items,
      COALESCE(
        (
          SELECT audit.after_state
          FROM public.completed_bill_correction_audit audit
          WHERE audit.queue_entry_id = _queue_entry_id
            AND audit.consultation_id = _consultation_id
            AND audit.created_at
              < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
          ORDER BY audit.created_at DESC, audit.id DESC
          LIMIT 1
        ),
        (
          SELECT audit.before_state
          FROM public.completed_bill_correction_audit audit
          WHERE audit.queue_entry_id = _queue_entry_id
            AND audit.consultation_id = _consultation_id
            AND audit.created_at
              >= ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
          ORDER BY audit.created_at, audit.id
          LIMIT 1
        ),
        CASE WHEN completion.item_state IS NOT NULL THEN jsonb_build_object(
          'total', totals.total,
          'discount_rm', totals.discount_rm,
          'tax_rm', totals.tax_rm,
          'items', completion.item_state
        ) END
      ) AS bill_state
    FROM completion
    LEFT JOIN completion_totals totals ON true
  ), enriched_items AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', canonical.item->>'id',
      'item_name', COALESCE(canonical.item->>'item_name', original.item->>'item_name'),
      'quantity', (canonical.item->>'quantity')::numeric,
      'price', (canonical.item->>'price')::numeric,
      'item_id', COALESCE(canonical.item->>'item_id', original.item->>'item_id'),
      'service_id', COALESCE(canonical.item->>'service_id', original.item->>'service_id'),
      'package_id', COALESCE(canonical.item->>'package_id', original.item->>'package_id'),
      'charge_type_id', COALESCE(
        canonical.item->>'charge_type_id',
        canonical.item->>'clinic_charge_type_id',
        original.item->>'charge_type_id'
      ),
      'dispensed_qty', COALESCE(
        (canonical.item->>'dispensed_qty')::numeric,
        (original.item->>'dispensed_qty')::numeric
      ),
      'unit_cost', COALESCE(
        (canonical.item->>'unit_cost')::numeric,
        (original.item->>'unit_cost')::numeric,
        0
      ),
      'adjustment_kind', COALESCE(
        canonical.item->>'adjustment_kind',
        canonical.item->>'billing_adjustment_kind',
        original.item->>'adjustment_kind'
      )
    ) ORDER BY canonical.item->>'id'), '[]'::jsonb) AS value
    FROM selected
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(selected.bill_state->'items', selected.completion_items, '[]'::jsonb)
    ) canonical(item)
    LEFT JOIN LATERAL (
      SELECT completion_item AS item
      FROM jsonb_array_elements(COALESCE(selected.completion_items, '[]'::jsonb)) completion_item
      WHERE completion_item->>'id' = canonical.item->>'id'
      LIMIT 1
    ) original ON true
  )
  SELECT CASE WHEN selected.bill_state IS NULL THEN NULL ELSE
    selected.bill_state || jsonb_build_object('items', enriched_items.value)
  END
  FROM selected
  CROSS JOIN enriched_items;
$function$;

CREATE OR REPLACE FUNCTION public.get_financial_control_details(
  _start_date date,
  _end_date date,
  _as_of_date date,
  _metric text,
  _group_by text,
  _alert_key text,
  _page integer,
  _page_size integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_insights(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF _start_date IS NULL OR _end_date IS NULL OR _as_of_date IS NULL THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_DATES_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF _start_date > _end_date THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_DATE_RANGE_REVERSED' USING ERRCODE = '22023';
  END IF;
  IF _as_of_date < _end_date THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_AS_OF_BEFORE_END' USING ERRCODE = '22023';
  END IF;
  IF (_end_date - _start_date) > 365 THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_DATE_RANGE_TOO_LARGE' USING ERRCODE = '22023';
  END IF;
  IF _metric IS NULL OR _metric NOT IN (
    'billed_revenue', 'cash_collected', 'cohort_outstanding',
    'total_outstanding', 'cogs', 'gross_profit', 'adjustments', 'alerts', 'margin'
  ) THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_INVALID_METRIC' USING ERRCODE = '22023';
  END IF;
  IF _group_by IS NULL OR _group_by NOT IN (
    'visit', 'medicine', 'procedure', 'package', 'doctor', 'payment_type', 'panel_provider'
  ) THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_INVALID_GROUP' USING ERRCODE = '22023';
  END IF;
  IF _alert_key IS NOT NULL AND _alert_key NOT IN (
    'unpaid_self_pay', 'unsubmitted_panel', 'overdue_panel', 'missing_cost',
    'zero_price', 'negative_margin', 'large_discount', 'refund_void_correction',
    'payment_mismatch', 'duplicate_or_excess_payment'
  ) THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_INVALID_ALERT' USING ERRCODE = '22023';
  END IF;
  IF _page IS NULL OR _page < 1 THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_INVALID_PAGE' USING ERRCODE = '22023';
  END IF;
  IF _page_size IS NULL OR _page_size < 1 OR _page_size > 100 THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_INVALID_PAGE_SIZE' USING ERRCODE = '22023';
  END IF;

  IF _group_by = 'visit' THEN
    WITH report_rows AS MATERIALIZED (
      SELECT *
      FROM private.financial_control_report_rows(_start_date, _end_date, _as_of_date)
    ),
    filtered AS MATERIALIZED (
      SELECT
        report.*,
        CASE _metric
          WHEN 'billed_revenue' THEN report.billed
          WHEN 'cash_collected' THEN report.paid_in_period
          WHEN 'cohort_outstanding' THEN report.outstanding
          WHEN 'total_outstanding' THEN report.outstanding
          WHEN 'cogs' THEN report.cogs
          WHEN 'gross_profit' THEN report.billed - report.cogs
          WHEN 'adjustments' THEN report.discount + report.tax + report.refund
          WHEN 'alerts' THEN CASE COALESCE(_alert_key, '')
            WHEN 'unpaid_self_pay' THEN report.outstanding
            WHEN 'unsubmitted_panel' THEN report.panel_outstanding
            WHEN 'overdue_panel' THEN report.panel_outstanding
            WHEN 'missing_cost' THEN report.billed
            WHEN 'zero_price' THEN 0
            WHEN 'negative_margin' THEN GREATEST(report.cogs - report.billed, 0)
            WHEN 'large_discount' THEN report.discount
            WHEN 'refund_void_correction' THEN report.refund
            WHEN 'payment_mismatch' THEN ABS(report.billed - report.paid_to_date)
            WHEN 'duplicate_or_excess_payment' THEN
              GREATEST(report.paid_to_date - report.billed, 0)
            ELSE GREATEST(
              report.outstanding,
              ABS(report.billed - report.paid_to_date),
              report.refund,
              report.discount,
              report.cogs - report.billed,
              0
            )
          END
          WHEN 'margin' THEN report.billed - report.cogs
        END::numeric AS amount
      FROM report_rows report
      WHERE NOT report.attribution_complete
         OR CASE _metric
           WHEN 'billed_revenue' THEN report.is_cohort
           WHEN 'cash_collected' THEN report.paid_in_period <> 0
           WHEN 'cohort_outstanding' THEN report.is_cohort AND report.outstanding > 0.01
           WHEN 'total_outstanding' THEN report.outstanding > 0.01
           WHEN 'cogs' THEN report.is_cohort
           WHEN 'gross_profit' THEN report.is_cohort
           WHEN 'adjustments' THEN
             report.discount <> 0 OR report.tax <> 0 OR report.refund <> 0
               OR report.correction_count > 0
           WHEN 'alerts' THEN report.is_cohort AND (
             (_alert_key IS NULL AND cardinality(report.alert_keys) > 0)
             OR _alert_key = ANY(report.alert_keys)
           )
           WHEN 'margin' THEN report.is_cohort
         END
    ),
    ordered AS MATERIALIZED (
      SELECT
        filtered.*,
        ROW_NUMBER() OVER (
          ORDER BY amount DESC NULLS LAST,
            completed_date DESC NULLS LAST,
            queue_entry_id
        ) AS row_number
      FROM filtered
    ),
    totals AS (
      SELECT
        COUNT(*)::integer AS total,
        COUNT(*) FILTER (WHERE NOT attribution_complete)::integer AS incomplete_rows,
        SUM(billed) FILTER (WHERE attribution_complete) AS billed,
        SUM(paid_to_date) FILTER (WHERE attribution_complete) AS paid,
        SUM(outstanding) FILTER (WHERE attribution_complete) AS outstanding,
        SUM(cogs) FILTER (WHERE attribution_complete) AS cogs,
        SUM(billed - cogs) FILTER (WHERE attribution_complete) AS profit,
        COALESCE(bool_and(cost_complete) FILTER (WHERE attribution_complete), true)
          AS costs_complete
      FROM filtered
    ),
    page_rows AS (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'queueEntryId', queue_entry_id,
          'consultationId', consultation_id,
          'completedDate', completed_date,
          'patientName', patient_name,
          'doctorName', doctor_name,
          'paymentType', payment_type,
          'paymentMethod', payment_method,
          'panelProviderName', panel_provider_name,
          'claimStatus', claim_status,
          'claimCreatedDate', claim_created_date,
          'claimDueDate', claim_due_date,
          'groupKey', queue_entry_id,
          'groupLabel', patient_name,
          'billed', billed,
          'paid', paid_to_date,
          'paidInPeriod', paid_in_period,
          'outstanding', outstanding,
          'cogs', cogs,
          'profit', CASE WHEN billed IS NULL OR cogs IS NULL THEN NULL
            ELSE round(billed - cogs, 2) END,
          'marginPct', CASE WHEN cost_complete AND billed <> 0
            THEN round((billed - cogs) * 100 / billed, 1) END,
          'discount', discount,
          'tax', tax,
          'refund', refund,
          'corrections', correction_count,
          'missingCostCount', missing_cost_count,
          'zeroPriceCount', zero_price_count,
          'amount', round(amount, 2),
          'alertKeys', to_jsonb(alert_keys),
          'attributionComplete', attribution_complete,
          'costComplete', cost_complete,
          'visitCount', 1
        )
        ORDER BY row_number
      ), '[]'::jsonb) AS rows
      FROM ordered
      WHERE row_number BETWEEN ((_page - 1) * _page_size + 1) AND (_page * _page_size)
    )
    SELECT jsonb_build_object(
      'rows', page_rows.rows,
      'total', totals.total,
      'page', _page,
      'pageSize', _page_size,
      'totals', jsonb_build_object(
        'billed', CASE WHEN totals.billed IS NULL AND totals.incomplete_rows > 0
          THEN NULL ELSE round(COALESCE(totals.billed, 0), 2) END,
        'paid', CASE WHEN totals.paid IS NULL AND totals.incomplete_rows > 0
          THEN NULL ELSE round(COALESCE(totals.paid, 0), 2) END,
        'outstanding', CASE WHEN totals.outstanding IS NULL AND totals.incomplete_rows > 0
          THEN NULL ELSE round(COALESCE(totals.outstanding, 0), 2) END,
        'cogs', CASE WHEN totals.cogs IS NULL AND totals.incomplete_rows > 0
          THEN NULL ELSE round(COALESCE(totals.cogs, 0), 2) END,
        'profit', CASE WHEN totals.profit IS NULL AND totals.incomplete_rows > 0
          THEN NULL ELSE round(COALESCE(totals.profit, 0), 2) END,
        'attributionComplete', totals.incomplete_rows = 0,
        'costComplete', totals.incomplete_rows = 0 AND totals.costs_complete,
        'incompleteRows', totals.incomplete_rows
      )
    ) INTO v_result
    FROM totals CROSS JOIN page_rows;

  ELSIF _group_by IN ('doctor', 'payment_type', 'panel_provider') THEN
    WITH report_rows AS MATERIALIZED (
      SELECT *
      FROM private.financial_control_report_rows(_start_date, _end_date, _as_of_date)
    ),
    filtered AS MATERIALIZED (
      SELECT
        report.*,
        CASE
          WHEN NOT report.attribution_complete THEN 'unavailable'
          WHEN _group_by = 'doctor' THEN COALESCE(report.doctor_id::text, 'unknown-doctor')
          WHEN _group_by = 'payment_type' THEN COALESCE(report.payment_type, 'unknown-payment-type')
          ELSE COALESCE(report.panel_provider_id::text, 'no-panel-provider')
        END AS group_key,
        CASE
          WHEN NOT report.attribution_complete THEN 'Unavailable attribution'
          WHEN _group_by = 'doctor' THEN report.doctor_name
          WHEN _group_by = 'payment_type' THEN COALESCE(report.payment_type, 'Unknown payment type')
          ELSE COALESCE(report.panel_provider_name, 'No panel provider')
        END AS group_label,
        CASE _metric
          WHEN 'billed_revenue' THEN report.billed
          WHEN 'cash_collected' THEN report.paid_in_period
          WHEN 'cohort_outstanding' THEN report.outstanding
          WHEN 'total_outstanding' THEN report.outstanding
          WHEN 'cogs' THEN report.cogs
          WHEN 'gross_profit' THEN report.billed - report.cogs
          WHEN 'adjustments' THEN report.discount + report.tax + report.refund
          WHEN 'alerts' THEN CASE _alert_key
            WHEN 'unpaid_self_pay' THEN report.outstanding
            WHEN 'unsubmitted_panel' THEN report.panel_outstanding
            WHEN 'overdue_panel' THEN report.panel_outstanding
            WHEN 'missing_cost' THEN report.billed
            WHEN 'zero_price' THEN 0
            WHEN 'negative_margin' THEN GREATEST(report.cogs - report.billed, 0)
            WHEN 'large_discount' THEN report.discount
            WHEN 'refund_void_correction' THEN report.refund
            WHEN 'payment_mismatch' THEN ABS(report.billed - report.paid_to_date)
            WHEN 'duplicate_or_excess_payment' THEN
              GREATEST(report.paid_to_date - report.billed, 0)
            ELSE GREATEST(
              report.outstanding,
              ABS(report.billed - report.paid_to_date),
              report.refund,
              report.discount,
              report.cogs - report.billed,
              0
            )
          END
          WHEN 'margin' THEN report.billed - report.cogs
        END::numeric AS amount
      FROM report_rows report
      WHERE NOT report.attribution_complete
         OR CASE _metric
           WHEN 'billed_revenue' THEN report.is_cohort
           WHEN 'cash_collected' THEN report.paid_in_period <> 0
           WHEN 'cohort_outstanding' THEN report.is_cohort AND report.outstanding > 0.01
           WHEN 'total_outstanding' THEN report.outstanding > 0.01
           WHEN 'cogs' THEN report.is_cohort
           WHEN 'gross_profit' THEN report.is_cohort
           WHEN 'adjustments' THEN
             report.discount <> 0 OR report.tax <> 0 OR report.refund <> 0
               OR report.correction_count > 0
           WHEN 'alerts' THEN report.is_cohort AND (
             (_alert_key IS NULL AND cardinality(report.alert_keys) > 0)
             OR _alert_key = ANY(report.alert_keys)
           )
           WHEN 'margin' THEN report.is_cohort
         END
    ),
    grouped AS MATERIALIZED (
      SELECT
        group_key,
        MIN(group_label) AS group_label,
        (array_agg(queue_entry_id ORDER BY queue_entry_id))[1] AS queue_entry_id,
        MAX(completed_date) AS completed_date,
        COUNT(*)::integer AS visit_count,
        bool_and(attribution_complete) AS attribution_complete,
        bool_and(cost_complete) AS cost_complete,
        SUM(billed) AS billed,
        SUM(paid_to_date) AS paid,
        SUM(outstanding) AS outstanding,
        SUM(cogs) AS cogs,
        SUM(billed - cogs) AS profit,
        SUM(discount) AS discount,
        SUM(tax) AS tax,
        SUM(refund) AS refund,
        SUM(correction_count)::integer AS corrections,
        SUM(missing_cost_count)::integer AS missing_cost_count,
        SUM(zero_price_count)::integer AS zero_price_count,
        jsonb_path_query_array(
          jsonb_agg(to_jsonb(alert_keys)),
          '$[*][*]'
        ) AS alert_keys,
        SUM(amount) AS amount
      FROM filtered
      GROUP BY group_key
    ),
    ordered AS MATERIALIZED (
      SELECT grouped.*, ROW_NUMBER() OVER (
        ORDER BY amount DESC NULLS LAST,
          completed_date DESC NULLS LAST,
          queue_entry_id
      ) AS row_number
      FROM grouped
    ),
    totals AS (
      SELECT
        COUNT(*)::integer AS total,
        COUNT(*) FILTER (WHERE NOT attribution_complete)::integer AS incomplete_rows,
        SUM(billed) FILTER (WHERE attribution_complete) AS billed,
        SUM(paid) FILTER (WHERE attribution_complete) AS paid,
        SUM(outstanding) FILTER (WHERE attribution_complete) AS outstanding,
        SUM(cogs) FILTER (WHERE attribution_complete) AS cogs,
        SUM(profit) FILTER (WHERE attribution_complete) AS profit,
        COALESCE(bool_and(cost_complete) FILTER (WHERE attribution_complete), true)
          AS costs_complete
      FROM grouped
    ),
    page_rows AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'queueEntryId', queue_entry_id,
        'consultationId', NULL,
        'completedDate', completed_date,
        'patientName', NULL,
        'doctorName', CASE WHEN _group_by = 'doctor' THEN group_label END,
        'paymentType', CASE WHEN _group_by = 'payment_type' THEN group_label END,
        'paymentMethod', NULL,
        'panelProviderName', CASE WHEN _group_by = 'panel_provider' THEN group_label END,
        'groupKey', group_key,
        'groupLabel', group_label,
        'billed', round(billed, 2),
        'paid', round(paid, 2),
        'outstanding', round(outstanding, 2),
        'cogs', round(cogs, 2),
        'profit', round(profit, 2),
        'marginPct', CASE WHEN cost_complete AND billed <> 0
          THEN round(profit * 100 / billed, 1) END,
        'discount', round(discount, 2),
        'tax', round(tax, 2),
        'refund', round(refund, 2),
        'corrections', corrections,
        'missingCostCount', missing_cost_count,
        'zeroPriceCount', zero_price_count,
        'amount', round(amount, 2),
        'alertKeys', to_jsonb(alert_keys),
        'attributionComplete', attribution_complete,
        'costComplete', cost_complete,
        'visitCount', visit_count
      ) ORDER BY row_number), '[]'::jsonb) AS rows
      FROM ordered
      WHERE row_number BETWEEN ((_page - 1) * _page_size + 1) AND (_page * _page_size)
    )
    SELECT jsonb_build_object(
      'rows', page_rows.rows,
      'total', totals.total,
      'page', _page,
      'pageSize', _page_size,
      'totals', jsonb_build_object(
        'billed', CASE WHEN totals.billed IS NULL AND totals.incomplete_rows > 0
          THEN NULL ELSE round(COALESCE(totals.billed, 0), 2) END,
        'paid', CASE WHEN totals.paid IS NULL AND totals.incomplete_rows > 0
          THEN NULL ELSE round(COALESCE(totals.paid, 0), 2) END,
        'outstanding', CASE WHEN totals.outstanding IS NULL AND totals.incomplete_rows > 0
          THEN NULL ELSE round(COALESCE(totals.outstanding, 0), 2) END,
        'cogs', CASE WHEN totals.cogs IS NULL AND totals.incomplete_rows > 0
          THEN NULL ELSE round(COALESCE(totals.cogs, 0), 2) END,
        'profit', CASE WHEN totals.profit IS NULL AND totals.incomplete_rows > 0
          THEN NULL ELSE round(COALESCE(totals.profit, 0), 2) END,
        'attributionComplete', totals.incomplete_rows = 0,
        'costComplete', totals.incomplete_rows = 0 AND totals.costs_complete,
        'incompleteRows', totals.incomplete_rows
      )
    ) INTO v_result
    FROM totals CROSS JOIN page_rows;

  ELSE
    WITH report_rows AS MATERIALIZED (
      SELECT *
      FROM private.financial_control_report_rows(_start_date, _end_date, _as_of_date)
    ),
    filtered AS MATERIALIZED (
      SELECT report.*
      FROM report_rows report
      WHERE NOT report.attribution_complete
         OR CASE _metric
           WHEN 'billed_revenue' THEN report.is_cohort
           WHEN 'cash_collected' THEN report.paid_in_period <> 0
           WHEN 'cohort_outstanding' THEN report.is_cohort AND report.outstanding > 0.01
           WHEN 'total_outstanding' THEN report.outstanding > 0.01
           WHEN 'cogs' THEN report.is_cohort
           WHEN 'gross_profit' THEN report.is_cohort
           WHEN 'adjustments' THEN
             report.discount <> 0 OR report.tax <> 0 OR report.refund <> 0
               OR report.correction_count > 0
           WHEN 'alerts' THEN report.is_cohort AND (
             (_alert_key IS NULL AND cardinality(report.alert_keys) > 0)
             OR _alert_key = ANY(report.alert_keys)
           )
           WHEN 'margin' THEN report.is_cohort
         END
    ),
    charge_lines AS MATERIALIZED (
      SELECT
        report.*,
        value->>'id' AS line_id,
        value->>'item_name' AS item_name,
        NULLIF(value->>'item_id', '')::uuid AS item_id,
        NULLIF(value->>'service_id', '')::uuid AS service_id,
        NULLIF(value->>'package_id', '')::uuid AS package_id,
        NULLIF(value->>'charge_type_id', '')::uuid AS charge_type_id,
        CASE
          WHEN NULLIF(value->>'package_id', '') IS NOT NULL THEN 'package'
          WHEN NULLIF(value->>'item_id', '') IS NOT NULL THEN 'medicine'
          ELSE 'procedure'
        END AS line_category,
        (value->>'quantity')::numeric AS quantity,
        (value->>'dispensed_qty')::numeric AS dispensed_qty,
        (value->>'price')::numeric AS price,
        COALESCE((value->>'unit_cost')::numeric, 0) AS unit_cost,
        round((value->>'price')::numeric * GREATEST((value->>'quantity')::numeric, 0), 2)
          AS gross_line,
        SUM(round(
          (value->>'price')::numeric * GREATEST((value->>'quantity')::numeric, 0), 2
        )) OVER (PARTITION BY report.queue_entry_id) AS gross_total,
        ROW_NUMBER() OVER (
          PARTITION BY report.queue_entry_id ORDER BY value->>'id'
        ) AS line_number,
        ROW_NUMBER() OVER (
          PARTITION BY report.queue_entry_id,
            CASE
              WHEN NULLIF(value->>'package_id', '') IS NOT NULL THEN 'package'
              WHEN NULLIF(value->>'item_id', '') IS NOT NULL THEN 'medicine'
              ELSE 'procedure'
            END
          ORDER BY value->>'id'
        ) AS category_line_number,
        COUNT(*) OVER (PARTITION BY report.queue_entry_id) AS line_count
      FROM filtered report
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(report.item_state, '[]'::jsonb)) value
      WHERE report.attribution_complete
        AND (
          value->>'adjustment_kind' IS NULL
          OR value->>'adjustment_kind' = 'other_charge'
        )
    ),
    weighted AS MATERIALIZED (
      SELECT
        line.*,
        CASE WHEN line.gross_total <> 0
          THEN line.gross_line / line.gross_total
          ELSE 1::numeric / line.line_count
        END AS allocation_ratio
      FROM charge_lines line
    ),
    preliminary AS MATERIALIZED (
      SELECT
        line.*,
        round(line.billed * line.allocation_ratio, 2) AS preliminary_billed,
        round(line.paid_to_date * line.allocation_ratio, 2) AS preliminary_paid,
        round(line.paid_in_period * line.allocation_ratio, 2) AS preliminary_paid_in_period,
        round(line.outstanding * line.allocation_ratio, 2) AS preliminary_outstanding,
        round(line.discount * line.allocation_ratio, 2) AS preliminary_discount,
        round(line.tax * line.allocation_ratio, 2) AS preliminary_tax,
        round(line.refund * line.allocation_ratio, 2) AS preliminary_refund,
        round(
          GREATEST(line.cogs - line.billed, 0) * line.allocation_ratio,
          2
        ) AS preliminary_negative_margin
      FROM weighted line
    ),
    allocated AS MATERIALIZED (
      SELECT
        line.*,
        CASE WHEN line.line_number = line.line_count THEN
          line.billed - (
            SUM(line.preliminary_billed) OVER (PARTITION BY line.queue_entry_id)
              - line.preliminary_billed
          ) ELSE line.preliminary_billed END AS allocated_billed,
        CASE WHEN line.line_number = line.line_count THEN
          line.paid_to_date - (
            SUM(line.preliminary_paid) OVER (PARTITION BY line.queue_entry_id)
              - line.preliminary_paid
          ) ELSE line.preliminary_paid END AS allocated_paid,
        CASE WHEN line.line_number = line.line_count THEN
          line.paid_in_period - (
            SUM(line.preliminary_paid_in_period) OVER (PARTITION BY line.queue_entry_id)
              - line.preliminary_paid_in_period
          ) ELSE line.preliminary_paid_in_period END AS allocated_paid_in_period,
        CASE WHEN line.line_number = line.line_count THEN
          line.outstanding - (
            SUM(line.preliminary_outstanding) OVER (PARTITION BY line.queue_entry_id)
              - line.preliminary_outstanding
          ) ELSE line.preliminary_outstanding END AS allocated_outstanding,
        CASE WHEN line.line_number = line.line_count THEN
          line.discount - (
            SUM(line.preliminary_discount) OVER (PARTITION BY line.queue_entry_id)
              - line.preliminary_discount
          ) ELSE line.preliminary_discount END AS allocated_discount,
        CASE WHEN line.line_number = line.line_count THEN
          line.tax - (
            SUM(line.preliminary_tax) OVER (PARTITION BY line.queue_entry_id)
              - line.preliminary_tax
          ) ELSE line.preliminary_tax END AS allocated_tax,
        CASE WHEN line.line_number = line.line_count THEN
          line.refund - (
            SUM(line.preliminary_refund) OVER (PARTITION BY line.queue_entry_id)
              - line.preliminary_refund
          ) ELSE line.preliminary_refund END AS allocated_refund,
        CASE WHEN line.line_number = line.line_count THEN
          GREATEST(line.cogs - line.billed, 0) - (
            SUM(line.preliminary_negative_margin) OVER (PARTITION BY line.queue_entry_id)
              - line.preliminary_negative_margin
          ) ELSE line.preliminary_negative_margin END AS allocated_negative_margin
      FROM preliminary line
    ),
    item_rows AS MATERIALIZED (
      SELECT
        item.queue_entry_id,
        item.completed_date,
        CASE
          WHEN item.line_category = 'medicine' THEN item.item_id::text
          WHEN item.line_category = 'package' THEN item.package_id::text
          WHEN item.service_id IS NOT NULL THEN item.service_id::text
          WHEN item.charge_type_id IS NOT NULL THEN 'charge_type:' || item.charge_type_id::text
          ELSE 'charge_line:' || item.line_id
        END AS group_key,
        item.item_name AS group_label,
        true AS attribution_complete,
        item.item_id IS NULL OR item.unit_cost > 0 OR GREATEST(
          LEAST(COALESCE(item.dispensed_qty, item.quantity), GREATEST(item.quantity, 0)), 0
        ) = 0 AS cost_complete,
        item.allocated_billed AS billed,
        item.allocated_paid AS paid,
        item.allocated_paid_in_period AS paid_in_period,
        item.allocated_outstanding AS outstanding,
        round(item.unit_cost * CASE WHEN item.item_id IS NOT NULL THEN GREATEST(
          LEAST(COALESCE(item.dispensed_qty, item.quantity), GREATEST(item.quantity, 0)), 0
        ) ELSE GREATEST(item.quantity, 0) END, 2) AS cogs,
        item.allocated_discount AS discount,
        item.allocated_tax AS tax,
        item.allocated_refund AS refund,
        CASE WHEN item.category_line_number = 1
          THEN item.correction_count ELSE 0 END AS corrections,
        CASE WHEN item.item_id IS NOT NULL
          AND GREATEST(
            LEAST(COALESCE(item.dispensed_qty, item.quantity), GREATEST(item.quantity, 0)), 0
          ) > 0 AND item.unit_cost <= 0 THEN 1 ELSE 0 END AS missing_cost_count,
        CASE WHEN item.price = 0
          AND NOT EXISTS (
            SELECT 1
            FROM private.financial_zero_price_package_child_events package_child
            WHERE package_child.consultation_item_id = item.line_id::uuid
              AND package_child.consultation_id = item.consultation_id
          )
          AND CASE WHEN item.item_id IS NOT NULL THEN GREATEST(
            LEAST(COALESCE(item.dispensed_qty, item.quantity), GREATEST(item.quantity, 0)), 0
          ) ELSE GREATEST(item.quantity, 0) END > 0 THEN 1 ELSE 0 END AS zero_price_count,
        item.allocated_negative_margin AS negative_margin,
        item.alert_keys,
        item.allocation_ratio,
        item.billed AS visit_billed,
        item.paid_to_date AS visit_paid,
        item.panel_outstanding AS visit_panel_outstanding
      FROM allocated item
      WHERE _group_by = item.line_category
      UNION ALL
      SELECT
        report.queue_entry_id, report.completed_date, 'unavailable',
        'Unavailable attribution', false, false,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        0, 0, 0, NULL, report.alert_keys, NULL, NULL, NULL, NULL
      FROM filtered report
      WHERE NOT report.attribution_complete
    ),
    valued AS MATERIALIZED (
      SELECT
        item.*,
        item.billed - item.cogs AS profit,
        CASE _metric
          WHEN 'billed_revenue' THEN item.billed
          WHEN 'cash_collected' THEN item.paid_in_period
          WHEN 'cohort_outstanding' THEN item.outstanding
          WHEN 'total_outstanding' THEN item.outstanding
          WHEN 'cogs' THEN item.cogs
          WHEN 'gross_profit' THEN item.billed - item.cogs
          WHEN 'adjustments' THEN item.discount + item.tax + item.refund
          WHEN 'alerts' THEN CASE _alert_key
            WHEN 'unpaid_self_pay' THEN item.outstanding
            WHEN 'unsubmitted_panel' THEN item.visit_panel_outstanding * item.allocation_ratio
            WHEN 'overdue_panel' THEN item.visit_panel_outstanding * item.allocation_ratio
            WHEN 'missing_cost' THEN item.billed
            WHEN 'zero_price' THEN 0
            WHEN 'negative_margin' THEN item.negative_margin
            WHEN 'large_discount' THEN item.discount
            WHEN 'refund_void_correction' THEN item.refund
            WHEN 'payment_mismatch' THEN
              ABS(item.visit_billed - item.visit_paid) * item.allocation_ratio
            WHEN 'duplicate_or_excess_payment' THEN
              GREATEST(item.visit_paid - item.visit_billed, 0) * item.allocation_ratio
            ELSE GREATEST(item.outstanding, item.cogs - item.billed,
              item.discount, item.refund, 0)
          END
          WHEN 'margin' THEN item.billed - item.cogs
        END::numeric AS amount
      FROM item_rows item
    ),
    grouped AS MATERIALIZED (
      SELECT
        group_key,
        MIN(group_label) AS group_label,
        (array_agg(queue_entry_id ORDER BY queue_entry_id))[1] AS queue_entry_id,
        MAX(completed_date) AS completed_date,
        COUNT(DISTINCT queue_entry_id)::integer AS visit_count,
        bool_and(attribution_complete) AS attribution_complete,
        bool_and(cost_complete) AS cost_complete,
        SUM(billed) AS billed,
        SUM(paid) AS paid,
        SUM(outstanding) AS outstanding,
        SUM(cogs) AS cogs,
        SUM(profit) AS profit,
        SUM(discount) AS discount,
        SUM(tax) AS tax,
        SUM(refund) AS refund,
        SUM(corrections)::integer AS corrections,
        SUM(missing_cost_count)::integer AS missing_cost_count,
        SUM(zero_price_count)::integer AS zero_price_count,
        jsonb_path_query_array(
          jsonb_agg(to_jsonb(alert_keys)),
          '$[*][*]'
        ) AS alert_keys,
        SUM(amount) AS amount
      FROM valued
      GROUP BY group_key
    ),
    ordered AS MATERIALIZED (
      SELECT grouped.*, ROW_NUMBER() OVER (
        ORDER BY amount DESC NULLS LAST,
          completed_date DESC NULLS LAST,
          queue_entry_id,
          group_key
      ) AS row_number
      FROM grouped
    ),
    totals AS (
      SELECT
        COUNT(*)::integer AS total,
        COUNT(*) FILTER (WHERE NOT attribution_complete)::integer AS incomplete_rows,
        SUM(billed) FILTER (WHERE attribution_complete) AS billed,
        SUM(paid) FILTER (WHERE attribution_complete) AS paid,
        SUM(outstanding) FILTER (WHERE attribution_complete) AS outstanding,
        SUM(cogs) FILTER (WHERE attribution_complete) AS cogs,
        SUM(profit) FILTER (WHERE attribution_complete) AS profit,
        COALESCE(bool_and(cost_complete) FILTER (WHERE attribution_complete), true)
          AS costs_complete
      FROM grouped
    ),
    page_rows AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'queueEntryId', queue_entry_id,
        'consultationId', NULL,
        'completedDate', completed_date,
        'patientName', NULL,
        'doctorName', NULL,
        'paymentType', NULL,
        'paymentMethod', NULL,
        'panelProviderName', NULL,
        'groupKey', group_key,
        'groupLabel', group_label,
        'billed', round(billed, 2),
        'paid', round(paid, 2),
        'outstanding', round(outstanding, 2),
        'cogs', round(cogs, 2),
        'profit', round(profit, 2),
        'marginPct', CASE WHEN cost_complete AND billed <> 0
          THEN round(profit * 100 / billed, 1) END,
        'discount', round(discount, 2),
        'tax', round(tax, 2),
        'refund', round(refund, 2),
        'corrections', corrections,
        'missingCostCount', missing_cost_count,
        'zeroPriceCount', zero_price_count,
        'amount', round(amount, 2),
        'alertKeys', to_jsonb(alert_keys),
        'attributionComplete', attribution_complete,
        'costComplete', cost_complete,
        'visitCount', visit_count
      ) ORDER BY row_number), '[]'::jsonb) AS rows
      FROM ordered
      WHERE row_number BETWEEN ((_page - 1) * _page_size + 1) AND (_page * _page_size)
    )
    SELECT jsonb_build_object(
      'rows', page_rows.rows,
      'total', totals.total,
      'page', _page,
      'pageSize', _page_size,
      'totals', jsonb_build_object(
        'billed', CASE WHEN totals.billed IS NULL AND totals.incomplete_rows > 0
          THEN NULL ELSE round(COALESCE(totals.billed, 0), 2) END,
        'paid', CASE WHEN totals.paid IS NULL AND totals.incomplete_rows > 0
          THEN NULL ELSE round(COALESCE(totals.paid, 0), 2) END,
        'outstanding', CASE WHEN totals.outstanding IS NULL AND totals.incomplete_rows > 0
          THEN NULL ELSE round(COALESCE(totals.outstanding, 0), 2) END,
        'cogs', CASE WHEN totals.cogs IS NULL AND totals.incomplete_rows > 0
          THEN NULL ELSE round(COALESCE(totals.cogs, 0), 2) END,
        'profit', CASE WHEN totals.profit IS NULL AND totals.incomplete_rows > 0
          THEN NULL ELSE round(COALESCE(totals.profit, 0), 2) END,
        'attributionComplete', totals.incomplete_rows = 0,
        'costComplete', totals.incomplete_rows = 0 AND totals.costs_complete,
        'incompleteRows', totals.incomplete_rows
      )
    ) INTO v_result
    FROM totals CROSS JOIN page_rows;
  END IF;

  RETURN v_result;
END;
$function$;

CREATE TRIGGER prevent_financial_visit_completion_event_change
  BEFORE UPDATE OR DELETE ON private.financial_visit_completion_events
  FOR EACH ROW EXECUTE FUNCTION private.prevent_financial_event_change();
CREATE TRIGGER prevent_financial_payment_event_change
  BEFORE UPDATE OR DELETE ON private.financial_payment_events
  FOR EACH ROW EXECUTE FUNCTION private.prevent_financial_event_change();
CREATE TRIGGER prevent_financial_panel_claim_event_change
  BEFORE UPDATE OR DELETE ON private.financial_panel_claim_events
  FOR EACH ROW EXECUTE FUNCTION private.prevent_financial_event_change();
CREATE TRIGGER prevent_financial_zero_price_package_child_event_change
  BEFORE UPDATE OR DELETE ON private.financial_zero_price_package_child_events
  FOR EACH ROW EXECUTE FUNCTION private.prevent_financial_event_change();

CREATE OR REPLACE FUNCTION private.capture_financial_visit_completion_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_queue_entry_id uuid;
  v_consultation_id uuid;
  v_queue_status text;
  v_consultation_status text;
  v_completed_at timestamptz;
  v_completion_inserted integer;
BEGIN
  IF TG_TABLE_NAME = 'consultations' THEN
    v_consultation_id := NEW.id;
    v_queue_entry_id := NEW.queue_entry_id;
  ELSE
    v_queue_entry_id := NEW.id;
    SELECT c.id
      INTO v_consultation_id
    FROM public.consultations c
    WHERE c.queue_entry_id = NEW.id
      AND c.deleted_at IS NULL
    ORDER BY c.id
    LIMIT 1;
  END IF;

  IF v_consultation_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT qe.clinic_status::text, c.status
    INTO v_queue_status, v_consultation_status
  FROM public.queue_entries qe
  JOIN public.consultations c ON c.id = v_consultation_id
  WHERE qe.id = v_queue_entry_id
    AND qe.deleted_at IS NULL
    AND c.deleted_at IS NULL;

  IF v_queue_status = 'completed' AND v_consultation_status = 'completed' THEN
    v_completed_at := statement_timestamp();
    INSERT INTO private.financial_visit_completion_events (
      queue_entry_id,
      consultation_id,
      completed_at,
      provenance,
      attribution_complete,
      item_state
    )
    VALUES (
      v_queue_entry_id,
      v_consultation_id,
      v_completed_at,
      'recorded',
      true,
      private.financial_control_completion_item_state(v_consultation_id)
    )
    ON CONFLICT (consultation_id) DO NOTHING;

    GET DIAGNOSTICS v_completion_inserted = ROW_COUNT;
    IF v_completion_inserted = 1 THEN
      INSERT INTO private.financial_zero_price_package_child_events (
        consultation_item_id,
        consultation_id,
        package_line_item_id,
        package_id,
        package_item_id,
        completed_at,
        provenance
      )
      SELECT DISTINCT ON (child.id)
        child.id,
        child.consultation_id,
        package_line.id,
        package_line.package_id,
        package_item.id,
        v_completed_at,
        'recorded_at_completion'
      FROM public.consultation_items child
      JOIN public.consultation_items package_line
        ON package_line.consultation_id = child.consultation_id
       AND package_line.id <> child.id
       AND package_line.deleted_at IS NULL
       AND package_line.package_id IS NOT NULL
       AND package_line.price > 0
       AND package_line.quantity > 0
      JOIN public.package_items package_item
        ON package_item.package_id = package_line.package_id
       AND (
         (child.item_id IS NOT NULL
           AND package_item.inventory_item_id = child.item_id)
         OR (child.service_id IS NOT NULL
           AND package_item.service_id = child.service_id)
       )
      WHERE child.consultation_id = v_consultation_id
        AND child.deleted_at IS NULL
        AND child.price = 0
        AND child.quantity > 0
        AND (
          child.billing_adjustment_kind IS NULL
          OR child.billing_adjustment_kind = 'other_charge'
        )
      ORDER BY child.id, package_line.id, package_item.id
      ON CONFLICT (consultation_item_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.capture_financial_payment_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_before_amount numeric := 0;
  v_after_amount numeric := 0;
  v_delta numeric;
  v_event_kind text;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.deleted_at IS NULL THEN
    v_before_amount := OLD.amount;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.deleted_at IS NULL THEN
    v_after_amount := NEW.amount;
  END IF;
  v_delta := v_after_amount - v_before_amount;

  IF TG_OP = 'INSERT' THEN
    v_event_kind := 'receipt';
  ELSIF TG_OP = 'DELETE' OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
    v_event_kind := 'void';
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    v_event_kind := 'restoration';
  ELSE
    v_event_kind := 'correction';
  END IF;

  IF TG_OP = 'INSERT'
     OR TG_OP = 'DELETE'
     OR v_delta <> 0
     OR OLD.payment_type IS DISTINCT FROM NEW.payment_type
     OR OLD.payment_method IS DISTINCT FROM NEW.payment_method
     OR OLD.queue_entry_id IS DISTINCT FROM NEW.queue_entry_id
     OR OLD.consultation_id IS DISTINCT FROM NEW.consultation_id THEN
    INSERT INTO private.financial_payment_events (
      payment_id,
      queue_entry_id,
      consultation_id,
      event_kind,
      amount_delta,
      payment_type,
      payment_method,
      occurred_at,
      provenance,
      attribution_complete
    )
    VALUES (
      CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
      CASE WHEN TG_OP = 'DELETE' THEN OLD.queue_entry_id ELSE NEW.queue_entry_id END,
      CASE WHEN TG_OP = 'DELETE' THEN OLD.consultation_id ELSE NEW.consultation_id END,
      v_event_kind,
      v_delta,
      CASE WHEN TG_OP = 'DELETE' THEN OLD.payment_type ELSE NEW.payment_type END,
      CASE WHEN TG_OP = 'DELETE' THEN OLD.payment_method ELSE NEW.payment_method END,
      CASE WHEN TG_OP = 'INSERT' THEN NEW.created_at ELSE statement_timestamp() END,
      'recorded',
      true
    );
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

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
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_before_received := COALESCE(OLD.received_amount, 0);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_after_received := COALESCE(NEW.received_amount, 0);
  END IF;
  v_delta := v_after_received - v_before_received;

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
  VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.queue_entry_id ELSE NEW.queue_entry_id END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.panel_id ELSE NEW.panel_id END,
    v_event_kind,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.amount ELSE NEW.amount END,
    v_after_received,
    v_delta,
    CASE WHEN TG_OP = 'DELETE' THEN 'cancelled' ELSE NEW.status::text END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.due_date ELSE NEW.due_date END,
    statement_timestamp(),
    'recorded',
    true
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

ALTER FUNCTION private.prevent_financial_event_change() OWNER TO postgres;
ALTER FUNCTION private.financial_control_completion_item_state(uuid) OWNER TO postgres;
ALTER FUNCTION private.financial_control_bill_state_as_of(uuid, uuid, date) OWNER TO postgres;
ALTER FUNCTION private.capture_financial_visit_completion_event() OWNER TO postgres;
ALTER FUNCTION private.capture_financial_payment_event() OWNER TO postgres;
ALTER FUNCTION private.capture_financial_panel_claim_event() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.prevent_financial_event_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.financial_control_completion_item_state(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.financial_control_bill_state_as_of(uuid, uuid, date)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.capture_financial_visit_completion_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.capture_financial_payment_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.capture_financial_panel_claim_event() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER capture_financial_visit_completion_from_queue
  AFTER INSERT OR UPDATE OF clinic_status ON public.queue_entries
  FOR EACH ROW EXECUTE FUNCTION private.capture_financial_visit_completion_event();
CREATE TRIGGER capture_financial_visit_completion_from_consultation
  AFTER INSERT OR UPDATE OF status ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION private.capture_financial_visit_completion_event();
CREATE TRIGGER capture_financial_payment_event
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.capture_financial_payment_event();
CREATE TRIGGER capture_financial_panel_claim_event
  AFTER INSERT OR UPDATE OR DELETE ON public.panel_claims
  FOR EACH ROW EXECUTE FUNCTION private.capture_financial_panel_claim_event();

-- Existing rows cannot be assigned completion or panel-receipt dates safely.
INSERT INTO private.financial_visit_completion_events (
  queue_entry_id,
  consultation_id,
  completed_at,
  provenance,
  attribution_complete,
  item_state
)
SELECT qe.id, c.id, NULL, 'synthetic_backfill', false, NULL
FROM public.consultations c
JOIN public.queue_entries qe ON qe.id = c.queue_entry_id
WHERE c.deleted_at IS NULL
  AND qe.deleted_at IS NULL
  AND c.status = 'completed'
  AND qe.clinic_status = 'completed'
ON CONFLICT (consultation_id) DO NOTHING;

INSERT INTO private.financial_payment_events (
  payment_id,
  queue_entry_id,
  consultation_id,
  event_kind,
  amount_delta,
  payment_type,
  payment_method,
  occurred_at,
  provenance,
  attribution_complete
)
SELECT
  p.id,
  p.queue_entry_id,
  p.consultation_id,
  'synthetic_backfill',
  CASE WHEN p.deleted_at IS NULL THEN p.amount ELSE 0 END,
  p.payment_type,
  p.payment_method,
  p.created_at,
  'synthetic_backfill',
  false
FROM public.payments p;

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
  pc.id,
  pc.queue_entry_id,
  pc.panel_id,
  'synthetic_backfill',
  pc.amount,
  COALESCE(pc.received_amount, 0),
  0,
  pc.status::text,
  pc.due_date,
  NULL,
  'synthetic_backfill',
  false
FROM public.panel_claims pc;

CREATE OR REPLACE FUNCTION private.financial_control_visit_facts(
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
  correction_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $function$
BEGIN
  IF _start_date IS NULL OR _end_date IS NULL OR _as_of_date IS NULL THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_DATES_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF _start_date > _end_date THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_DATE_RANGE_REVERSED' USING ERRCODE = '22023';
  END IF;
  IF _as_of_date < _end_date THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_AS_OF_BEFORE_END' USING ERRCODE = '22023';
  END IF;
  IF (_end_date - _start_date) > 365 THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_DATE_RANGE_TOO_LARGE' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_view_insights(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH completed_visits AS MATERIALIZED (
    SELECT
      qe.id AS queue_entry_id,
      c.id AS consultation_id,
      CASE
        WHEN completion.attribution_complete
        THEN (timezone('Asia/Kuala_Lumpur', completion.completed_at))::date
      END AS completed_date,
      completion.attribution_complete AS completion_complete,
      c.patient_id,
      patient.name AS patient_name,
      c.doctor_id,
      doctor.name AS doctor_name,
      qe.payment_method AS queue_payment_method,
      qe.panel_id AS queue_panel_id
    FROM public.consultations c
    JOIN public.queue_entries qe
      ON qe.id = c.queue_entry_id
     AND qe.deleted_at IS NULL
     AND qe.clinic_status = 'completed'
    JOIN private.financial_visit_completion_events completion
      ON completion.consultation_id = c.id
     AND completion.queue_entry_id = qe.id
    JOIN public.patients patient ON patient.id = c.patient_id
    LEFT JOIN public.doctors doctor ON doctor.id = c.doctor_id
    WHERE c.deleted_at IS NULL
      AND c.status = 'completed'
      AND (
        NOT completion.attribution_complete
        OR completion.completed_at
          < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
      )
  ),
  visit_state AS MATERIALIZED (
    SELECT
      visit.*,
      private.financial_control_bill_state_as_of(
        visit.queue_entry_id,
        visit.consultation_id,
        _as_of_date
      ) AS correction_state
    FROM completed_visits visit
  ),
  visit_facts AS (
    SELECT
      visit.*,
      payment.paid_to_date AS payment_paid_to_date,
      payment.paid_in_period AS payment_paid_in_period,
      payment.refund_in_period AS payment_refund_in_period,
      payment.to_date_incomplete AS payment_to_date_incomplete,
      payment.period_incomplete AS payment_period_incomplete,
      payment.payment_type AS latest_payment_type,
      payment.payment_method AS latest_payment_method,
      claim.panel_claim_id AS claim_id,
      claim.panel_id AS claim_panel_id,
      claim.amount AS claim_amount,
      claim.received_amount AS claim_received_amount,
      claim.status AS claim_status,
      claim.received_in_period AS claim_received_in_period,
      claim.refund_in_period AS claim_refund_in_period,
      claim.state_incomplete AS claim_state_incomplete,
      claim.period_incomplete AS claim_period_incomplete,
      provider.name AS claim_provider_name,
      item.cogs,
      item.missing_cost_count,
      item.zero_price_count,
      correction.correction_count
    FROM visit_state visit
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(event.amount_delta) FILTER (
          WHERE event.attribution_complete
            AND event.occurred_at
              < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
        ), 0)::numeric AS paid_to_date,
        COALESCE(SUM(event.amount_delta) FILTER (
          WHERE event.attribution_complete
            AND (timezone('Asia/Kuala_Lumpur', event.occurred_at))::date
              BETWEEN _start_date AND _end_date
        ), 0)::numeric AS paid_in_period,
        COALESCE(SUM(GREATEST(-event.amount_delta, 0)) FILTER (
          WHERE event.attribution_complete
            AND (timezone('Asia/Kuala_Lumpur', event.occurred_at))::date
              BETWEEN _start_date AND _end_date
        ), 0)::numeric AS refund_in_period,
        COALESCE(bool_or(NOT event.attribution_complete AND (
          event.occurred_at IS NULL
          OR event.occurred_at
            < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
        )), false) AS to_date_incomplete,
        COALESCE(bool_or(NOT event.attribution_complete AND (
          event.occurred_at IS NULL
          OR (timezone('Asia/Kuala_Lumpur', event.occurred_at))::date
            BETWEEN _start_date AND _end_date
        )), false) AS period_incomplete,
        (array_agg(event.payment_type ORDER BY event.occurred_at DESC, event.id DESC)
          FILTER (WHERE event.attribution_complete AND event.occurred_at
            < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')))[1]
          AS payment_type,
        (array_agg(event.payment_method ORDER BY event.occurred_at DESC, event.id DESC)
          FILTER (WHERE event.attribution_complete AND event.occurred_at
            < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')))[1]
          AS payment_method
      FROM private.financial_payment_events event
      WHERE (
        (
          event.queue_entry_id = visit.queue_entry_id
          AND (
            event.consultation_id IS NULL
            OR event.consultation_id = visit.consultation_id
          )
        )
        OR (
          event.queue_entry_id IS NULL
          AND event.consultation_id = visit.consultation_id
        )
      )
    ) payment ON true
    LEFT JOIN LATERAL (
      WITH eligible AS (
        SELECT event.*
        FROM private.financial_panel_claim_events event
        WHERE event.queue_entry_id = visit.queue_entry_id
          AND (
            event.occurred_at IS NULL
            OR event.occurred_at
              < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
          )
      ), latest AS (
        SELECT event.*
        FROM eligible event
        ORDER BY event.occurred_at DESC NULLS LAST, event.id DESC
        LIMIT 1
      )
      SELECT
        latest.panel_claim_id,
        latest.panel_id,
        latest.amount,
        latest.received_amount,
        latest.status,
        NOT latest.attribution_complete AS state_incomplete,
        COALESCE(SUM(event.receipt_delta) FILTER (
          WHERE event.attribution_complete
            AND (timezone('Asia/Kuala_Lumpur', event.occurred_at))::date
              BETWEEN _start_date AND _end_date
        ), 0)::numeric AS received_in_period,
        COALESCE(SUM(GREATEST(-event.receipt_delta, 0)) FILTER (
          WHERE event.attribution_complete
            AND (timezone('Asia/Kuala_Lumpur', event.occurred_at))::date
              BETWEEN _start_date AND _end_date
        ), 0)::numeric AS refund_in_period,
        COALESCE(bool_or(NOT event.attribution_complete), false)
          AS period_incomplete
      FROM latest
      LEFT JOIN eligible event ON true
      GROUP BY
        latest.panel_claim_id,
        latest.panel_id,
        latest.amount,
        latest.received_amount,
        latest.status,
        latest.attribution_complete
    ) claim ON true
    LEFT JOIN public.insurance_providers provider
      ON provider.id = COALESCE(claim.panel_id, visit.queue_panel_id)
    LEFT JOIN LATERAL (
      WITH item_rows AS (
        SELECT
          (value->>'id')::uuid AS id,
          visit.consultation_id,
          NULLIF(value->>'item_id', '')::uuid AS item_id,
          (value->>'quantity')::numeric AS quantity,
          (value->>'dispensed_qty')::numeric AS dispensed_qty,
          (value->>'price')::numeric AS price,
          (value->>'unit_cost')::numeric AS unit_cost,
          value->>'adjustment_kind' AS billing_adjustment_kind,
          EXISTS (
            SELECT 1
            FROM private.financial_zero_price_package_child_events package_child
            WHERE package_child.consultation_item_id = (value->>'id')::uuid
              AND package_child.consultation_id = visit.consultation_id
          ) AS is_zero_price_package_child
        FROM jsonb_array_elements(COALESCE(
          visit.correction_state->'items',
          '[]'::jsonb
        )) value
      )
      SELECT
        COALESCE(SUM(
          round(
            COALESCE(item.unit_cost, 0)
            * CASE
                WHEN item.item_id IS NOT NULL THEN
                  GREATEST(
                    LEAST(
                      COALESCE(item.dispensed_qty, item.quantity),
                      GREATEST(item.quantity, 0)
                    ),
                    0
                  )
                ELSE GREATEST(item.quantity, 0)
              END,
            2
          )
        ) FILTER (
          WHERE (
              item.billing_adjustment_kind IS NULL
              OR item.billing_adjustment_kind = 'other_charge'
            )
        ), 0)::numeric AS cogs,
        COUNT(*) FILTER (
          WHERE item.item_id IS NOT NULL
            AND GREATEST(
              LEAST(
                COALESCE(item.dispensed_qty, item.quantity),
                GREATEST(item.quantity, 0)
              ),
              0
            ) > 0
            AND COALESCE(item.unit_cost, 0) <= 0
        )::integer AS missing_cost_count,
        COUNT(*) FILTER (
          WHERE NOT item.is_zero_price_package_child
            AND item.price = 0
            AND (
              item.billing_adjustment_kind IS NULL
              OR item.billing_adjustment_kind = 'other_charge'
            )
            AND CASE
                  WHEN item.item_id IS NOT NULL THEN
                    GREATEST(
                      LEAST(
                        COALESCE(item.dispensed_qty, item.quantity),
                        GREATEST(item.quantity, 0)
                      ),
                      0
                    )
                  ELSE GREATEST(item.quantity, 0)
                END > 0
        )::integer AS zero_price_count
      FROM item_rows item
    ) item ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::integer AS correction_count
      FROM public.completed_bill_correction_audit audit
      WHERE audit.queue_entry_id = visit.queue_entry_id
        AND audit.consultation_id = visit.consultation_id
        AND (timezone('Asia/Kuala_Lumpur', audit.created_at))::date
          BETWEEN _start_date AND _end_date
        AND audit.created_at
          < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
    ) correction ON true
  ),
  normalized AS (
    SELECT
      fact.*,
      (fact.correction_state->>'total')::numeric AS billed_amount,
      COALESCE((fact.correction_state->>'discount_rm')::numeric, 0) AS discount_amount,
      COALESCE((fact.correction_state->>'tax_rm')::numeric, 0) AS tax_amount,
      CASE
        WHEN fact.claim_id IS NOT NULL
          OR fact.queue_payment_method = 'panel'
          OR fact.latest_payment_type = 'panel'
        THEN 'panel'
        ELSE COALESCE(fact.latest_payment_type, 'self_pay')
      END AS normalized_payment_type,
      CASE
        WHEN fact.payment_to_date_incomplete
          OR (fact.claim_id IS NOT NULL AND fact.claim_state_incomplete)
        THEN NULL
        ELSE COALESCE(fact.payment_paid_to_date, 0)
          + COALESCE(fact.claim_received_amount, 0)
      END::numeric AS normalized_paid_to_date,
      CASE
        WHEN fact.payment_period_incomplete
          OR (fact.claim_id IS NOT NULL AND fact.claim_period_incomplete)
        THEN NULL
        ELSE COALESCE(fact.payment_paid_in_period, 0)
          + COALESCE(fact.claim_received_in_period, 0)
      END::numeric AS normalized_paid_in_period,
      CASE
        WHEN fact.claim_id IS NULL THEN 0
        WHEN fact.claim_state_incomplete THEN NULL
        WHEN fact.claim_status NOT IN ('rejected', 'cancelled') THEN
          GREATEST(fact.claim_amount - fact.claim_received_amount, 0)
        ELSE 0
      END::numeric AS normalized_panel_outstanding
    FROM visit_facts fact
  )
  SELECT
    normalized.queue_entry_id,
    normalized.consultation_id,
    normalized.completed_date,
    normalized.patient_id,
    normalized.patient_name,
    normalized.doctor_id,
    COALESCE(NULLIF(btrim(normalized.doctor_name), ''), 'Unknown doctor'),
    normalized.normalized_payment_type,
    COALESCE(normalized.latest_payment_method, normalized.queue_payment_method),
    COALESCE(normalized.claim_panel_id, normalized.queue_panel_id),
    normalized.claim_provider_name,
    CASE WHEN normalized.completion_complete
      THEN round(normalized.billed_amount, 2) END,
    CASE WHEN normalized.completion_complete
      THEN round(normalized.normalized_paid_to_date, 2) END,
    CASE WHEN normalized.completion_complete
      THEN round(normalized.normalized_paid_in_period, 2) END,
    CASE
      WHEN NOT normalized.completion_complete THEN NULL
      WHEN normalized.completed_date < _start_date
        THEN round(normalized.normalized_paid_in_period, 2)
      ELSE 0::numeric
    END,
    CASE WHEN normalized.completion_complete
      THEN round(COALESCE(normalized.cogs, 0), 2) END,
    CASE WHEN normalized.completion_complete
      THEN round(normalized.discount_amount, 2) END,
    CASE WHEN normalized.completion_complete
      THEN round(normalized.tax_amount, 2) END,
    CASE WHEN normalized.completion_complete THEN round(
      COALESCE(normalized.payment_refund_in_period, 0)
      + COALESCE(normalized.claim_refund_in_period, 0),
      2
    ) END,
    CASE
      WHEN NOT normalized.completion_complete THEN NULL
      WHEN normalized.normalized_payment_type = 'panel'
        AND normalized.claim_id IS NULL THEN NULL
      WHEN normalized.normalized_payment_type = 'panel'
        THEN round(normalized.normalized_panel_outstanding, 2)
      WHEN normalized.normalized_paid_to_date IS NULL THEN NULL
      ELSE round(GREATEST(
        normalized.billed_amount - normalized.normalized_paid_to_date,
        0
      ), 2)
    END,
    CASE WHEN normalized.completion_complete
      THEN round(normalized.normalized_panel_outstanding, 2) END,
    CASE WHEN normalized.completion_complete
      THEN COALESCE(normalized.missing_cost_count, 0)::integer END,
    CASE WHEN normalized.completion_complete
      THEN COALESCE(normalized.zero_price_count, 0)::integer END,
    CASE WHEN normalized.completion_complete
      THEN COALESCE(normalized.correction_count, 0)::integer END
  FROM normalized;
END;
$function$;

ALTER FUNCTION private.financial_control_visit_facts(date, date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.financial_control_visit_facts(date,date,date) FROM PUBLIC, anon, authenticated;

-- Shared visit-level predicates keep summary alerts and detail filters identical.
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
  WITH facts AS MATERIALIZED (
    SELECT *
    FROM private.financial_control_visit_facts(_start_date, _end_date, _as_of_date)
  ),
  claim_events AS MATERIALIZED (
    SELECT event.*
    FROM private.financial_panel_claim_events event
    WHERE event.attribution_complete
      AND event.occurred_at
        < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
  ),
  claim_latest AS (
    SELECT DISTINCT ON (event.queue_entry_id)
      event.queue_entry_id,
      event.panel_claim_id,
      event.status,
      event.due_date
    FROM claim_events event
    WHERE event.queue_entry_id IS NOT NULL
    ORDER BY event.queue_entry_id, event.occurred_at DESC, event.id DESC
  ),
  claim_created AS (
    SELECT
      event.panel_claim_id,
      MIN((timezone('Asia/Kuala_Lumpur', event.occurred_at))::date)
        FILTER (WHERE event.event_kind = 'claim_created') AS created_date
    FROM claim_events event
    GROUP BY event.panel_claim_id
  ),
  payment_states AS MATERIALIZED (
    SELECT
      event.payment_id,
      (array_agg(event.queue_entry_id ORDER BY event.occurred_at DESC, event.id DESC))[1]
        AS queue_entry_id,
      (array_agg(event.payment_type ORDER BY event.occurred_at DESC, event.id DESC))[1]
        AS payment_type,
      (array_agg(event.payment_method ORDER BY event.occurred_at DESC, event.id DESC))[1]
        AS payment_method,
      SUM(event.amount_delta)::numeric AS active_amount,
      MIN(event.occurred_at) FILTER (WHERE event.event_kind = 'receipt') AS received_at
    FROM private.financial_payment_events event
    WHERE event.attribution_complete
      AND event.occurred_at
        < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
    GROUP BY event.payment_id
  ),
  duplicate_visits AS (
    SELECT
      first_payment.queue_entry_id,
      SUM(LEAST(first_payment.active_amount, second_payment.active_amount))::numeric
        AS duplicate_amount
    FROM payment_states first_payment
    JOIN payment_states second_payment
      ON first_payment.payment_id < second_payment.payment_id
     AND first_payment.queue_entry_id = second_payment.queue_entry_id
     AND first_payment.active_amount = second_payment.active_amount
     AND first_payment.payment_type IS NOT DISTINCT FROM second_payment.payment_type
     AND first_payment.payment_method IS NOT DISTINCT FROM second_payment.payment_method
     AND ABS(EXTRACT(EPOCH FROM (
       first_payment.received_at - second_payment.received_at
     ))) <= 300
    WHERE first_payment.queue_entry_id IS NOT NULL
      AND first_payment.active_amount > 0
      AND second_payment.active_amount > 0
      AND first_payment.received_at IS NOT NULL
      AND second_payment.received_at IS NOT NULL
    GROUP BY first_payment.queue_entry_id
  ),
  enriched AS (
    SELECT
      fact.*,
      completion.completed_at,
      state.bill_state->'items' AS item_state,
      claim.status AS claim_status,
      created.created_date AS claim_created_date,
      claim.due_date AS claim_due_date,
      duplicate_visit.duplicate_amount,
      EXISTS (
        SELECT 1
        FROM private.financial_payment_events event
        WHERE event.attribution_complete
          AND event.event_kind IN ('correction', 'void', 'restoration')
          AND (timezone('Asia/Kuala_Lumpur', event.occurred_at))::date
            BETWEEN _start_date AND _end_date
          AND (
            (
              event.queue_entry_id = fact.queue_entry_id
              AND (
                event.consultation_id IS NULL
                OR event.consultation_id = fact.consultation_id
              )
            )
            OR (
              event.queue_entry_id IS NULL
              AND event.consultation_id = fact.consultation_id
            )
          )
      ) OR EXISTS (
        SELECT 1
        FROM private.financial_panel_claim_events event
        WHERE event.attribution_complete
          AND event.event_kind IN ('receipt_reversal', 'void')
          AND event.queue_entry_id = fact.queue_entry_id
          AND (timezone('Asia/Kuala_Lumpur', event.occurred_at))::date
            BETWEEN _start_date AND _end_date
      ) AS has_payment_change,
      (
        fact.completed_date IS NOT NULL
        AND fact.billed IS NOT NULL
        AND fact.paid_to_date IS NOT NULL
        AND fact.paid_in_period IS NOT NULL
        AND fact.older_debt_collected_in_period IS NOT NULL
        AND fact.cogs IS NOT NULL
        AND fact.discount IS NOT NULL
        AND fact.tax IS NOT NULL
        AND fact.refund IS NOT NULL
        AND fact.outstanding IS NOT NULL
        AND fact.panel_outstanding IS NOT NULL
        AND fact.missing_cost_count IS NOT NULL
        AND fact.zero_price_count IS NOT NULL
        AND fact.correction_count IS NOT NULL
      ) AS row_attribution_complete
    FROM facts fact
    LEFT JOIN private.financial_visit_completion_events completion
      ON completion.queue_entry_id = fact.queue_entry_id
     AND completion.consultation_id = fact.consultation_id
    LEFT JOIN LATERAL (
      SELECT private.financial_control_bill_state_as_of(
        fact.queue_entry_id,
        fact.consultation_id,
        _as_of_date
      ) AS bill_state
    ) state ON true
    LEFT JOIN claim_latest claim ON claim.queue_entry_id = fact.queue_entry_id
    LEFT JOIN claim_created created ON created.panel_claim_id = claim.panel_claim_id
    LEFT JOIN duplicate_visits duplicate_visit
      ON duplicate_visit.queue_entry_id = fact.queue_entry_id
  ),
  predicates AS (
    SELECT
      enriched.*,
      enriched.completed_date BETWEEN _start_date AND _end_date AS row_is_cohort,
      enriched.row_attribution_complete
        AND COALESCE(enriched.missing_cost_count, 0) = 0 AS row_cost_complete,
      array_remove(ARRAY[
        CASE WHEN enriched.row_attribution_complete
          AND enriched.payment_type <> 'panel'
          AND enriched.outstanding > 0.01
          AND enriched.completed_at <=
            ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
              - interval '24 hours'
          THEN 'unpaid_self_pay' END,
        CASE WHEN enriched.row_attribution_complete
          AND enriched.payment_type = 'panel'
          AND enriched.claim_status = 'pending'
          AND (
            SELECT COUNT(*)
            FROM generate_series(
              enriched.claim_created_date + 1,
              _as_of_date,
              interval '1 day'
            ) business_day(day_value)
            WHERE EXTRACT(ISODOW FROM business_day.day_value) BETWEEN 1 AND 5
          ) >= 2
          THEN 'unsubmitted_panel' END,
        CASE WHEN enriched.row_attribution_complete
          AND enriched.payment_type = 'panel'
          AND enriched.claim_status IN ('pending', 'submitted', 'approved')
          AND enriched.claim_due_date < _as_of_date
          THEN 'overdue_panel' END,
        CASE WHEN enriched.row_attribution_complete
          AND enriched.missing_cost_count > 0
          THEN 'missing_cost' END,
        CASE WHEN enriched.row_attribution_complete
          AND enriched.zero_price_count > 0
          THEN 'zero_price' END,
        CASE WHEN enriched.row_attribution_complete
          AND enriched.billed - enriched.cogs < -0.01
          THEN 'negative_margin' END,
        CASE WHEN enriched.row_attribution_complete
          AND enriched.discount > 0
          AND (
            enriched.discount >= 50
            OR (
              enriched.billed + enriched.discount - enriched.tax > 0
              AND enriched.discount >=
                (enriched.billed + enriched.discount - enriched.tax) * 0.10
            )
          )
          THEN 'large_discount' END,
        CASE WHEN enriched.row_attribution_complete
          AND (
            enriched.refund > 0.01
            OR enriched.correction_count > 0
            OR enriched.has_payment_change
          )
          THEN 'refund_void_correction' END,
        CASE WHEN enriched.row_attribution_complete
          AND ABS(enriched.billed - enriched.paid_to_date) > 0.01
          THEN 'payment_mismatch' END,
        CASE WHEN enriched.row_attribution_complete
          AND (
            enriched.duplicate_amount > 0
            OR enriched.paid_to_date - enriched.billed > 0.01
          )
          THEN 'duplicate_or_excess_payment' END
      ], NULL)::text[] AS row_alert_keys
    FROM enriched
  )
  SELECT
    predicates.queue_entry_id,
    predicates.consultation_id,
    predicates.completed_date,
    predicates.patient_id,
    predicates.patient_name,
    predicates.doctor_id,
    predicates.doctor_name,
    predicates.payment_type,
    predicates.payment_method,
    predicates.panel_provider_id,
    predicates.panel_provider_name,
    predicates.billed,
    predicates.paid_to_date,
    predicates.paid_in_period,
    predicates.older_debt_collected_in_period,
    predicates.cogs,
    predicates.discount,
    predicates.tax,
    predicates.refund,
    predicates.outstanding,
    predicates.panel_outstanding,
    predicates.missing_cost_count,
    predicates.zero_price_count,
    predicates.correction_count,
    predicates.claim_status,
    predicates.claim_created_date,
    predicates.claim_due_date,
    predicates.row_is_cohort,
    predicates.row_attribution_complete,
    predicates.row_cost_complete,
    predicates.row_alert_keys,
    predicates.item_state
  FROM predicates;
$function$;

ALTER FUNCTION private.financial_control_report_rows(date, date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.financial_control_report_rows(date,date,date)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_financial_control_summary(
  _start_date date,
  _end_date date,
  _comparison_start date,
  _comparison_end date,
  _as_of_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_insights(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF _start_date IS NULL OR _end_date IS NULL
     OR _comparison_start IS NULL OR _comparison_end IS NULL
     OR _as_of_date IS NULL THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_DATES_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF _start_date > _end_date OR _comparison_start > _comparison_end THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_DATE_RANGE_REVERSED' USING ERRCODE = '22023';
  END IF;
  IF _as_of_date < _end_date THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_AS_OF_BEFORE_END' USING ERRCODE = '22023';
  END IF;
  IF (_end_date - _start_date) > 365
     OR (_comparison_end - _comparison_start) > 365 THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_DATE_RANGE_TOO_LARGE' USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH selected AS MATERIALIZED (
      SELECT *
      FROM private.financial_control_report_rows(_start_date, _end_date, _as_of_date)
    ),
    comparison_rows AS MATERIALIZED (
      SELECT *
      FROM private.financial_control_report_rows(
        _comparison_start,
        _comparison_end,
        _comparison_end
      )
    ),
    selected_stats AS MATERIALIZED (
      SELECT
        COUNT(*) FILTER (WHERE is_cohort AND attribution_complete)::integer
          AS completed_visits,
        COUNT(*) FILTER (WHERE NOT attribution_complete)::integer
          AS incomplete_visits,
        COALESCE(SUM(missing_cost_count) FILTER (
          WHERE is_cohort AND attribution_complete
        ), 0)::integer AS missing_cost_items,
        SUM(billed) FILTER (WHERE is_cohort AND attribution_complete) AS billed_revenue,
        SUM(paid_in_period) FILTER (WHERE attribution_complete) AS cash_collected,
        SUM(paid_in_period) FILTER (WHERE is_cohort AND attribution_complete)
          AS cohort_collected,
        SUM(older_debt_collected_in_period) FILTER (WHERE attribution_complete)
          AS older_debt_collected,
        SUM(cogs) FILTER (WHERE is_cohort AND attribution_complete) AS cogs,
        SUM(billed - cogs) FILTER (WHERE is_cohort AND attribution_complete)
          AS gross_profit,
        SUM(outstanding) FILTER (WHERE is_cohort AND attribution_complete)
          AS cohort_outstanding,
        SUM(outstanding) FILTER (WHERE attribution_complete) AS total_outstanding,
        SUM(outstanding) FILTER (
          WHERE attribution_complete AND payment_type <> 'panel'
        ) AS self_pay_outstanding,
        SUM(panel_outstanding) FILTER (
          WHERE attribution_complete AND payment_type = 'panel'
        ) AS panel_outstanding,
        SUM(discount) FILTER (WHERE is_cohort AND attribution_complete) AS discounts,
        SUM(tax) FILTER (WHERE is_cohort AND attribution_complete) AS taxes,
        SUM(refund) FILTER (WHERE attribution_complete) AS refunds,
        SUM(correction_count) FILTER (WHERE attribution_complete)::integer AS corrections
      FROM selected
    ),
    comparison_stats AS MATERIALIZED (
      SELECT
        COUNT(*) FILTER (WHERE is_cohort AND attribution_complete)::integer
          AS completed_visits,
        COUNT(*) FILTER (WHERE NOT attribution_complete)::integer
          AS incomplete_visits,
        COALESCE(SUM(missing_cost_count) FILTER (
          WHERE is_cohort AND attribution_complete
        ), 0)::integer AS missing_cost_items,
        SUM(billed) FILTER (WHERE is_cohort AND attribution_complete) AS billed_revenue,
        SUM(paid_in_period) FILTER (WHERE attribution_complete) AS cash_collected,
        SUM(paid_in_period) FILTER (WHERE is_cohort AND attribution_complete)
          AS cohort_collected,
        SUM(older_debt_collected_in_period) FILTER (WHERE attribution_complete)
          AS older_debt_collected,
        SUM(cogs) FILTER (WHERE is_cohort AND attribution_complete) AS cogs,
        SUM(billed - cogs) FILTER (WHERE is_cohort AND attribution_complete)
          AS gross_profit,
        SUM(outstanding) FILTER (WHERE is_cohort AND attribution_complete)
          AS cohort_outstanding,
        SUM(outstanding) FILTER (WHERE attribution_complete) AS total_outstanding
      FROM comparison_rows
    ),
    alert_definitions(alert_key, severity, urgency) AS (
      VALUES
        ('duplicate_or_excess_payment'::text, 'critical'::text, 1),
        ('negative_margin', 'critical', 2),
        ('overdue_panel', 'high', 3),
        ('unpaid_self_pay', 'high', 4),
        ('unsubmitted_panel', 'high', 5),
        ('missing_cost', 'high', 6),
        ('payment_mismatch', 'medium', 7),
        ('refund_void_correction', 'medium', 8),
        ('large_discount', 'medium', 9),
        ('zero_price', 'low', 10)
    ),
    alerts AS (
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', definition.alert_key,
          'severity', definition.severity,
          'count', COALESCE(matched.match_count, 0),
          'amount', round(COALESCE(matched.amount, 0), 2),
          'oldestAgeDays', COALESCE(matched.oldest_age_days, 0),
          'attributionComplete', stats.incomplete_visits = 0,
          'incompleteRows', stats.incomplete_visits
        )
        ORDER BY definition.urgency
      ) AS value
      FROM alert_definitions definition
      CROSS JOIN selected_stats stats
      LEFT JOIN LATERAL (
        SELECT
          COUNT(report.queue_entry_id)::integer AS match_count,
          SUM(CASE definition.alert_key
            WHEN 'unpaid_self_pay' THEN report.outstanding
            WHEN 'unsubmitted_panel' THEN report.panel_outstanding
            WHEN 'overdue_panel' THEN report.panel_outstanding
            WHEN 'missing_cost' THEN report.billed
            WHEN 'zero_price' THEN 0
            WHEN 'negative_margin' THEN GREATEST(report.cogs - report.billed, 0)
            WHEN 'large_discount' THEN report.discount
            WHEN 'refund_void_correction' THEN report.refund
            WHEN 'payment_mismatch' THEN ABS(report.billed - report.paid_to_date)
            WHEN 'duplicate_or_excess_payment' THEN
              GREATEST(report.paid_to_date - report.billed, 0)
          END)::numeric AS amount,
          MAX(_as_of_date - COALESCE(
            report.claim_created_date,
            report.completed_date
          ))::integer AS oldest_age_days
        FROM selected report
        WHERE report.is_cohort
          AND definition.alert_key = ANY(report.alert_keys)
      ) matched ON true
      GROUP BY stats.incomplete_visits
    )
    SELECT jsonb_build_object(
      'period', jsonb_build_object(
        'billedRevenue', CASE
          WHEN period.completed_visits = 0 AND period.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(period.billed_revenue, 0), 2)
        END,
        'cashCollected', CASE
          WHEN period.cash_collected IS NULL AND period.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(period.cash_collected, 0), 2)
        END,
        'cohortCollected', CASE
          WHEN period.completed_visits = 0 AND period.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(period.cohort_collected, 0), 2)
        END,
        'olderDebtCollected', CASE
          WHEN period.older_debt_collected IS NULL AND period.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(period.older_debt_collected, 0), 2)
        END,
        'collectionRate', CASE
          WHEN period.billed_revenue > 0 THEN
            round(COALESCE(period.cohort_collected, 0) * 100 / period.billed_revenue, 1)
          WHEN period.completed_visits = 0 AND period.incomplete_visits > 0 THEN NULL
          ELSE 0::numeric
        END,
        'cogs', CASE
          WHEN period.completed_visits = 0 AND period.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(period.cogs, 0), 2)
        END,
        'grossProfit', CASE
          WHEN period.completed_visits = 0 AND period.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(period.gross_profit, 0), 2)
        END,
        'grossMarginPct', CASE
          WHEN period.billed_revenue > 0 THEN
            round(COALESCE(period.gross_profit, 0) * 100 / period.billed_revenue, 1)
          WHEN period.completed_visits = 0 AND period.incomplete_visits > 0 THEN NULL
          ELSE 0::numeric
        END,
        'cohortOutstanding', CASE
          WHEN period.completed_visits = 0 AND period.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(period.cohort_outstanding, 0), 2)
        END,
        'totalOutstanding', CASE
          WHEN period.total_outstanding IS NULL AND period.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(period.total_outstanding, 0), 2)
        END,
        'averageBill', CASE
          WHEN period.completed_visits > 0 THEN
            round(period.billed_revenue / period.completed_visits, 2)
          WHEN period.incomplete_visits > 0 THEN NULL
          ELSE 0::numeric
        END,
        'completedVisits', period.completed_visits,
        'attributionComplete', period.incomplete_visits = 0,
        'costComplete', period.incomplete_visits = 0 AND period.missing_cost_items = 0,
        'incompleteVisits', period.incomplete_visits,
        'missingCostItems', period.missing_cost_items
      ),
      'comparison', jsonb_build_object(
        'billedRevenue', CASE
          WHEN comparison.completed_visits = 0 AND comparison.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(comparison.billed_revenue, 0), 2)
        END,
        'cashCollected', CASE
          WHEN comparison.cash_collected IS NULL AND comparison.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(comparison.cash_collected, 0), 2)
        END,
        'cohortCollected', CASE
          WHEN comparison.completed_visits = 0 AND comparison.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(comparison.cohort_collected, 0), 2)
        END,
        'olderDebtCollected', CASE
          WHEN comparison.older_debt_collected IS NULL AND comparison.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(comparison.older_debt_collected, 0), 2)
        END,
        'collectionRate', CASE
          WHEN comparison.billed_revenue > 0 THEN
            round(COALESCE(comparison.cohort_collected, 0) * 100 / comparison.billed_revenue, 1)
          WHEN comparison.completed_visits = 0 AND comparison.incomplete_visits > 0 THEN NULL
          ELSE 0::numeric
        END,
        'cogs', CASE
          WHEN comparison.completed_visits = 0 AND comparison.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(comparison.cogs, 0), 2)
        END,
        'grossProfit', CASE
          WHEN comparison.completed_visits = 0 AND comparison.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(comparison.gross_profit, 0), 2)
        END,
        'grossMarginPct', CASE
          WHEN comparison.billed_revenue > 0 THEN
            round(COALESCE(comparison.gross_profit, 0) * 100 / comparison.billed_revenue, 1)
          WHEN comparison.completed_visits = 0 AND comparison.incomplete_visits > 0 THEN NULL
          ELSE 0::numeric
        END,
        'cohortOutstanding', CASE
          WHEN comparison.completed_visits = 0 AND comparison.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(comparison.cohort_outstanding, 0), 2)
        END,
        'totalOutstanding', CASE
          WHEN comparison.total_outstanding IS NULL AND comparison.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(comparison.total_outstanding, 0), 2)
        END,
        'averageBill', CASE
          WHEN comparison.completed_visits > 0 THEN
            round(comparison.billed_revenue / comparison.completed_visits, 2)
          WHEN comparison.incomplete_visits > 0 THEN NULL
          ELSE 0::numeric
        END,
        'completedVisits', comparison.completed_visits,
        'attributionComplete', comparison.incomplete_visits = 0,
        'costComplete', comparison.incomplete_visits = 0
          AND comparison.missing_cost_items = 0,
        'incompleteVisits', comparison.incomplete_visits,
        'missingCostItems', comparison.missing_cost_items
      ),
      'reconciliation', jsonb_build_object(
        'billedCohort', CASE
          WHEN period.completed_visits = 0 AND period.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(period.billed_revenue, 0), 2)
        END,
        'cashCollected', round(COALESCE(period.cash_collected, 0), 2),
        'cohortCollected', CASE
          WHEN period.completed_visits = 0 AND period.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(period.cohort_collected, 0), 2)
        END,
        'olderDebtCollected', round(COALESCE(period.older_debt_collected, 0), 2),
        'discounts', round(COALESCE(period.discounts, 0), 2),
        'taxes', round(COALESCE(period.taxes, 0), 2),
        'refunds', round(COALESCE(period.refunds, 0), 2),
        'adjustments', round(
          COALESCE(period.taxes, 0)
            - COALESCE(period.discounts, 0)
            - COALESCE(period.refunds, 0),
          2
        ),
        'corrections', COALESCE(period.corrections, 0),
        'cohortOutstanding', CASE
          WHEN period.completed_visits = 0 AND period.incomplete_visits > 0 THEN NULL
          ELSE round(COALESCE(period.cohort_outstanding, 0), 2)
        END,
        'selfPayOutstanding', round(COALESCE(period.self_pay_outstanding, 0), 2),
        'panelOutstanding', round(COALESCE(period.panel_outstanding, 0), 2),
        'totalOutstanding', round(COALESCE(period.total_outstanding, 0), 2),
        'attributionComplete', period.incomplete_visits = 0,
        'incompleteVisits', period.incomplete_visits
      ),
      'alerts', alert_rows.value,
      'generated_at', statement_timestamp()
    )
    FROM selected_stats period
    CROSS JOIN comparison_stats comparison
    CROSS JOIN alerts alert_rows
  );
END;
$function$;

ALTER FUNCTION public.get_financial_control_summary(date, date, date, date, date)
  OWNER TO postgres;
ALTER FUNCTION public.get_financial_control_details(
  date, date, date, text, text, text, integer, integer
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_financial_control_summary(date,date,date,date,date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_financial_control_summary(date,date,date,date,date)
  TO authenticated;
REVOKE ALL ON FUNCTION public.get_financial_control_details(date,date,date,text,text,text,integer,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_financial_control_details(date,date,date,text,text,text,integer,integer)
  TO authenticated;

-- Migration postflight: signatures, least privilege, private isolation, and the
-- mandatory Insight gate must all survive future edits to this migration.
DO $postflight$
BEGIN
  IF to_regprocedure('public.get_financial_control_summary(date,date,date,date,date)') IS NULL
     OR to_regprocedure('public.get_financial_control_details(date,date,date,text,text,text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_RPC_SIGNATURE_MISSING';
  END IF;

  IF has_function_privilege('anon', 'public.get_financial_control_summary(date,date,date,date,date)', 'execute')
     OR has_function_privilege('public', 'public.get_financial_control_summary(date,date,date,date,date)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.get_financial_control_summary(date,date,date,date,date)', 'execute')
     OR has_function_privilege('anon', 'public.get_financial_control_details(date,date,date,text,text,text,integer,integer)', 'execute')
     OR has_function_privilege('public', 'public.get_financial_control_details(date,date,date,text,text,text,integer,integer)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.get_financial_control_details(date,date,date,text,text,text,integer,integer)', 'execute') THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_RPC_GRANTS_INVALID';
  END IF;

  IF has_function_privilege('anon', 'private.financial_control_visit_facts(date,date,date)', 'execute')
     OR has_function_privilege('authenticated', 'private.financial_control_visit_facts(date,date,date)', 'execute')
     OR has_function_privilege('public', 'private.financial_control_visit_facts(date,date,date)', 'execute')
     OR has_function_privilege('anon', 'private.financial_control_report_rows(date,date,date)', 'execute')
     OR has_function_privilege('authenticated', 'private.financial_control_report_rows(date,date,date)', 'execute')
     OR has_function_privilege('public', 'private.financial_control_report_rows(date,date,date)', 'execute')
     OR has_function_privilege('anon', 'private.financial_control_completion_item_state(uuid)', 'execute')
     OR has_function_privilege('authenticated', 'private.financial_control_completion_item_state(uuid)', 'execute')
     OR has_function_privilege('public', 'private.financial_control_completion_item_state(uuid)', 'execute')
     OR has_function_privilege('anon', 'private.financial_control_bill_state_as_of(uuid,uuid,date)', 'execute')
     OR has_function_privilege('authenticated', 'private.financial_control_bill_state_as_of(uuid,uuid,date)', 'execute')
     OR has_function_privilege('public', 'private.financial_control_bill_state_as_of(uuid,uuid,date)', 'execute') THEN
    RAISE EXCEPTION 'FINANCIAL_CONTROL_PRIVATE_FUNCTION_EXPOSED';
  END IF;

  BEGIN
    PERFORM public.get_financial_control_summary(
      current_date,
      current_date,
      current_date - 1,
      current_date - 1,
      current_date
    );
    RAISE EXCEPTION 'FINANCIAL_CONTROL_INSIGHT_GATE_MISSING';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
END;
$postflight$;
