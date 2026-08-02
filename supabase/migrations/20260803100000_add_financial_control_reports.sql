-- Canonical visit-level financial facts for management reporting.
-- Public report RPCs are added separately; this owner-only boundary is not an API.

CREATE SCHEMA IF NOT EXISTS private;

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

  -- Inclusive endpoints permit at most 366 calendar dates.
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
      (timezone('Asia/Kuala_Lumpur', qe.created_at))::date AS completed_date,
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
    JOIN public.patients patient
      ON patient.id = c.patient_id
    LEFT JOIN public.doctors doctor
      ON doctor.id = c.doctor_id
    WHERE c.deleted_at IS NULL
      AND c.status = 'completed'
      AND qe.created_at < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
  ),
  visit_state AS MATERIALIZED (
    SELECT
      visit.*,
      public.completed_bill_correction_state(
        visit.queue_entry_id,
        visit.consultation_id
      ) AS correction_state
    FROM completed_visits visit
  ),
  visit_facts AS (
    SELECT
      visit.*,
      payment.paid_to_date AS payment_paid_to_date,
      payment.paid_in_period AS payment_paid_in_period,
      payment.payment_type AS latest_payment_type,
      payment.payment_method AS latest_payment_method,
      claim.id AS claim_id,
      claim.panel_id AS claim_panel_id,
      claim.amount AS claim_amount,
      claim.received_amount AS claim_received_amount,
      claim.status AS claim_status,
      claim.updated_at AS claim_updated_at,
      provider.name AS claim_provider_name,
      item.cogs,
      item.missing_cost_count,
      item.zero_price_count,
      correction.refund,
      correction.correction_count
    FROM visit_state visit
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(p.amount), 0)::numeric AS paid_to_date,
        COALESCE(
          SUM(p.amount) FILTER (
            WHERE (timezone('Asia/Kuala_Lumpur', p.created_at))::date
              BETWEEN _start_date AND _end_date
          ),
          0
        )::numeric AS paid_in_period,
        (array_agg(p.payment_type ORDER BY p.created_at DESC, p.id DESC))[1]
          AS payment_type,
        (array_agg(p.payment_method ORDER BY p.created_at DESC, p.id DESC))[1]
          AS payment_method
      FROM public.payments p
      WHERE p.deleted_at IS NULL
        AND (
          (
            p.queue_entry_id = visit.queue_entry_id
            AND (
              p.consultation_id IS NULL
              OR p.consultation_id = visit.consultation_id
            )
          )
          OR (
            p.queue_entry_id IS NULL
            AND p.consultation_id = visit.consultation_id
          )
        )
        AND p.created_at < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
    ) payment ON true
    LEFT JOIN LATERAL (
      SELECT
        pc.id,
        pc.panel_id,
        pc.amount::numeric AS amount,
        COALESCE(pc.received_amount, 0)::numeric AS received_amount,
        pc.status::text AS status,
        pc.updated_at
      FROM public.panel_claims pc
      WHERE pc.queue_entry_id = visit.queue_entry_id
        AND pc.status::text NOT IN ('rejected', 'cancelled')
        AND pc.created_at < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
      ORDER BY pc.updated_at DESC, pc.id DESC
      LIMIT 1
    ) claim ON true
    LEFT JOIN public.insurance_providers provider
      ON provider.id = COALESCE(claim.panel_id, visit.queue_panel_id)
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(
          SUM(
            round(
              COALESCE(ci.unit_cost, 0)
              * CASE
                  WHEN ci.item_id IS NOT NULL THEN
                    GREATEST(
                      LEAST(
                        COALESCE(ci.dispensed_qty, ci.quantity),
                        GREATEST(ci.quantity, 0)
                      ),
                      0
                    )
                  ELSE GREATEST(ci.quantity, 0)
                END,
              2
            )
          ) FILTER (
            WHERE ci.billing_adjustment_kind IS NULL
              OR ci.billing_adjustment_kind = 'other_charge'
          ),
          0
        )::numeric AS cogs,
        COUNT(*) FILTER (
          WHERE ci.item_id IS NOT NULL
            AND GREATEST(
              LEAST(
                COALESCE(ci.dispensed_qty, ci.quantity),
                GREATEST(ci.quantity, 0)
              ),
              0
            ) > 0
            AND COALESCE(ci.unit_cost, 0) <= 0
        )::integer AS missing_cost_count,
        COUNT(*) FILTER (
          WHERE ci.price = 0
            AND (
              ci.billing_adjustment_kind IS NULL
              OR ci.billing_adjustment_kind = 'other_charge'
            )
            AND CASE
                  WHEN ci.item_id IS NOT NULL THEN
                    GREATEST(
                      LEAST(
                        COALESCE(ci.dispensed_qty, ci.quantity),
                        GREATEST(ci.quantity, 0)
                      ),
                      0
                    )
                  ELSE GREATEST(ci.quantity, 0)
                END > 0
        )::integer AS zero_price_count
      FROM public.consultation_items ci
      WHERE ci.consultation_id = visit.consultation_id
        AND ci.deleted_at IS NULL
    ) item ON true
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(
          SUM(
            GREATEST(
              COALESCE((audit.before_state->>'paid')::numeric, 0)
              - COALESCE((audit.after_state->>'paid')::numeric, 0),
              0
            )
          ),
          0
        )::numeric AS refund,
        COUNT(*)::integer AS correction_count
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
      COALESCE((fact.correction_state->>'total')::numeric, 0) AS billed_amount,
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
        WHEN fact.claim_id IS NOT NULL
          OR fact.queue_payment_method = 'panel'
          OR fact.latest_payment_type = 'panel'
        THEN GREATEST(
          COALESCE(fact.payment_paid_to_date, 0),
          COALESCE(fact.claim_received_amount, 0)
        )
        ELSE COALESCE(fact.payment_paid_to_date, 0)
      END::numeric AS normalized_paid_to_date,
      CASE
        WHEN fact.claim_id IS NOT NULL
          OR fact.queue_payment_method = 'panel'
          OR fact.latest_payment_type = 'panel'
        THEN GREATEST(
          COALESCE(fact.payment_paid_in_period, 0),
          CASE
            WHEN (timezone('Asia/Kuala_Lumpur', fact.claim_updated_at))::date
              BETWEEN _start_date AND _end_date
            THEN COALESCE(fact.claim_received_amount, 0)
            ELSE 0
          END
        )
        ELSE COALESCE(fact.payment_paid_in_period, 0)
      END::numeric AS normalized_paid_in_period,
      CASE
        WHEN fact.claim_status IN ('pending', 'submitted', 'approved') THEN
          GREATEST(
            COALESCE(fact.claim_amount, 0)
            - COALESCE(fact.claim_received_amount, 0),
            0
          )
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
    COALESCE(NULLIF(btrim(normalized.doctor_name), ''), 'Unknown doctor') AS doctor_name,
    normalized.normalized_payment_type AS payment_type,
    COALESCE(normalized.latest_payment_method, normalized.queue_payment_method) AS payment_method,
    COALESCE(normalized.claim_panel_id, normalized.queue_panel_id) AS panel_provider_id,
    normalized.claim_provider_name AS panel_provider_name,
    round(normalized.billed_amount, 2) AS billed,
    round(normalized.normalized_paid_to_date, 2) AS paid_to_date,
    round(normalized.normalized_paid_in_period, 2) AS paid_in_period,
    CASE
      WHEN normalized.completed_date < _start_date
      THEN round(normalized.normalized_paid_in_period, 2)
      ELSE 0::numeric
    END AS older_debt_collected_in_period,
    round(COALESCE(normalized.cogs, 0), 2) AS cogs,
    round(normalized.discount_amount, 2) AS discount,
    round(normalized.tax_amount, 2) AS tax,
    round(COALESCE(normalized.refund, 0), 2) AS refund,
    CASE
      WHEN normalized.normalized_payment_type = 'panel'
        AND normalized.claim_id IS NOT NULL
      THEN round(normalized.normalized_panel_outstanding, 2)
      ELSE round(
        GREATEST(
          normalized.billed_amount - normalized.normalized_paid_to_date,
          0
        ),
        2
      )
    END AS outstanding,
    round(normalized.normalized_panel_outstanding, 2) AS panel_outstanding,
    COALESCE(normalized.missing_cost_count, 0)::integer AS missing_cost_count,
    COALESCE(normalized.zero_price_count, 0)::integer AS zero_price_count,
    COALESCE(normalized.correction_count, 0)::integer AS correction_count
  FROM normalized;
END;
$function$;

ALTER FUNCTION private.financial_control_visit_facts(date, date, date)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION private.financial_control_visit_facts(date,date,date) FROM PUBLIC, anon, authenticated;

-- Existing production indexes already cover this boundary's query paths:
-- idx_queue_entries_status_created / idx_queue_entries_kl_date,
-- payments_queue_entry_id_active_idx / payments_consultation_id_active_idx,
-- panel_claims_queue_entry_unique_idx, and the active consultation/item indexes.
