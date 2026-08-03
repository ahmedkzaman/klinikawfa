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
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CHECK (
    (attribution_complete AND completed_at IS NOT NULL AND provenance = 'recorded')
    OR (NOT attribution_complete AND provenance = 'synthetic_backfill')
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
  occurred_at timestamptz,
  provenance text NOT NULL CHECK (provenance IN ('recorded', 'synthetic_backfill')),
  attribution_complete boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CHECK (
    (attribution_complete AND occurred_at IS NOT NULL AND provenance = 'recorded')
    OR (NOT attribution_complete AND provenance = 'synthetic_backfill')
  )
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
  private.financial_panel_claim_events
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

CREATE TRIGGER prevent_financial_visit_completion_event_change
  BEFORE UPDATE OR DELETE ON private.financial_visit_completion_events
  FOR EACH ROW EXECUTE FUNCTION private.prevent_financial_event_change();
CREATE TRIGGER prevent_financial_payment_event_change
  BEFORE UPDATE OR DELETE ON private.financial_payment_events
  FOR EACH ROW EXECUTE FUNCTION private.prevent_financial_event_change();
CREATE TRIGGER prevent_financial_panel_claim_event_change
  BEFORE UPDATE OR DELETE ON private.financial_panel_claim_events
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
    INSERT INTO private.financial_visit_completion_events (
      queue_entry_id,
      consultation_id,
      completed_at,
      provenance,
      attribution_complete
    )
    VALUES (
      v_queue_entry_id,
      v_consultation_id,
      statement_timestamp(),
      'recorded',
      true
    )
    ON CONFLICT (consultation_id) DO NOTHING;
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
    statement_timestamp(),
    'recorded',
    true
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

ALTER FUNCTION private.prevent_financial_event_change() OWNER TO postgres;
ALTER FUNCTION private.capture_financial_visit_completion_event() OWNER TO postgres;
ALTER FUNCTION private.capture_financial_payment_event() OWNER TO postgres;
ALTER FUNCTION private.capture_financial_panel_claim_event() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.prevent_financial_event_change() FROM PUBLIC, anon, authenticated;
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
  attribution_complete
)
SELECT qe.id, c.id, NULL, 'synthetic_backfill', false
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
      COALESCE(
        (
          SELECT audit.after_state
          FROM public.completed_bill_correction_audit audit
          WHERE audit.queue_entry_id = visit.queue_entry_id
            AND audit.consultation_id = visit.consultation_id
            AND audit.created_at
              < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
          ORDER BY audit.created_at DESC, audit.id DESC
          LIMIT 1
        ),
        (
          SELECT audit.before_state
          FROM public.completed_bill_correction_audit audit
          WHERE audit.queue_entry_id = visit.queue_entry_id
            AND audit.consultation_id = visit.consultation_id
            AND audit.created_at
              >= ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
          ORDER BY audit.created_at, audit.id
          LIMIT 1
        ),
        public.completed_bill_correction_state(
          visit.queue_entry_id,
          visit.consultation_id
        )
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
          ci.*,
          EXISTS (
            SELECT 1
            FROM public.consultation_items package_line
            JOIN public.package_items package_item
              ON package_item.package_id = package_line.package_id
             AND (
               package_item.inventory_item_id = ci.item_id
               OR package_item.service_id = ci.service_id
             )
            WHERE package_line.consultation_id = ci.consultation_id
              AND package_line.deleted_at IS NULL
              AND package_line.package_id IS NOT NULL
              AND package_line.price <> 0
          ) AS is_charged_package_child
        FROM public.consultation_items ci
        WHERE ci.consultation_id = visit.consultation_id
          AND ci.deleted_at IS NULL
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
          WHERE NOT item.is_charged_package_child
            AND (
              item.billing_adjustment_kind IS NULL
              OR item.billing_adjustment_kind = 'other_charge'
            )
        ), 0)::numeric AS cogs,
        COUNT(*) FILTER (
          WHERE NOT item.is_charged_package_child
            AND item.item_id IS NOT NULL
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
          WHERE NOT item.is_charged_package_child
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
