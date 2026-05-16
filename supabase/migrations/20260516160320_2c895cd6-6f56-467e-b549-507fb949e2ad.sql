
-- 1. Materialized view: diagnosis ↔ inventory correlation (90-day window)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_diagnosis_stock_correlation AS
WITH disp AS (
  SELECT
    it.id,
    it.inventory_item_id,
    it.consultation_id,
    ABS(it.qty_change)::int                              AS qty,
    it.created_at,
    COALESCE(d.group_category, '__UNLINKED__')           AS diagnosis_group
  FROM public.inventory_transactions it
  LEFT JOIN public.consultations c
         ON c.id = it.consultation_id AND c.deleted_at IS NULL
  LEFT JOIN public.diagnoses d
         ON d.id = c.diagnosis_id
  WHERE it.transaction_type = 'dispense'
    AND it.created_at >= now() - interval '90 days'
),
items AS (
  SELECT id, name FROM public.inventory_items
),
group_totals AS (
  SELECT diagnosis_group,
         COUNT(DISTINCT consultation_id) FILTER (WHERE consultation_id IS NOT NULL) AS total_cases_for_group_90d
  FROM disp
  GROUP BY diagnosis_group
),
item_totals AS (
  SELECT inventory_item_id,
         COUNT(DISTINCT consultation_id) FILTER (WHERE consultation_id IS NOT NULL) AS total_cases_with_item_90d
  FROM disp
  GROUP BY inventory_item_id
),
overall AS (
  SELECT COUNT(DISTINCT consultation_id) FILTER (WHERE consultation_id IS NOT NULL) AS total_cases_90d
  FROM disp
),
month_cases AS (
  SELECT diagnosis_group,
         COUNT(DISTINCT consultation_id) FILTER (
           WHERE consultation_id IS NOT NULL
             AND date_trunc('month', created_at) = date_trunc('month', now())
         ) AS case_count_current_month,
         COUNT(DISTINCT consultation_id) FILTER (
           WHERE consultation_id IS NOT NULL
             AND date_trunc('month', created_at) = date_trunc('month', now() - interval '1 month')
         ) AS case_count_prior_month
  FROM disp
  GROUP BY diagnosis_group
),
pair AS (
  SELECT diagnosis_group,
         inventory_item_id,
         SUM(qty)::int                          AS item_usage_count,
         COUNT(DISTINCT consultation_id) FILTER (WHERE consultation_id IS NOT NULL) AS co_occurrence_cases
  FROM disp
  GROUP BY diagnosis_group, inventory_item_id
)
SELECT
  p.diagnosis_group,
  p.inventory_item_id,
  i.name                                         AS item_name,
  COALESCE(mc.case_count_current_month, 0)       AS case_count_current_month,
  COALESCE(mc.case_count_prior_month, 0)         AS case_count_prior_month,
  CASE
    WHEN COALESCE(mc.case_count_prior_month, 0) = 0 THEN NULL
    ELSE ROUND(
      ((mc.case_count_current_month - mc.case_count_prior_month)::numeric
        / mc.case_count_prior_month::numeric) * 100,
      2)
  END                                            AS case_trend_pct,
  p.item_usage_count,
  p.co_occurrence_cases,
  COALESCE(gt.total_cases_for_group_90d, 0)      AS total_cases_for_group_90d,
  COALESCE(it.total_cases_with_item_90d, 0)      AS total_cases_with_item_90d,
  COALESCE(o.total_cases_90d, 0)                 AS total_cases_90d,
  CASE
    WHEN COALESCE(gt.total_cases_for_group_90d, 0) = 0 THEN NULL
    ELSE ROUND((p.co_occurrence_cases::numeric / gt.total_cases_for_group_90d::numeric) * 100, 2)
  END                                            AS confidence_pct,
  CASE
    WHEN COALESCE(gt.total_cases_for_group_90d, 0) = 0
      OR COALESCE(it.total_cases_with_item_90d, 0) = 0
      OR COALESCE(o.total_cases_90d, 0) = 0
    THEN NULL
    ELSE ROUND(
      ((p.co_occurrence_cases::numeric / gt.total_cases_for_group_90d::numeric)
        / (it.total_cases_with_item_90d::numeric / o.total_cases_90d::numeric)),
      3)
  END                                            AS lift_score,
  now()                                          AS last_refreshed_at
FROM pair p
LEFT JOIN items        i  ON i.id = p.inventory_item_id
LEFT JOIN group_totals gt ON gt.diagnosis_group = p.diagnosis_group
LEFT JOIN item_totals  it ON it.inventory_item_id = p.inventory_item_id
LEFT JOIN month_cases  mc ON mc.diagnosis_group = p.diagnosis_group
CROSS JOIN overall o
WHERE p.inventory_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mv_diag_stock_corr_uidx
  ON public.mv_diagnosis_stock_correlation (diagnosis_group, inventory_item_id);
CREATE INDEX IF NOT EXISTS mv_diag_stock_corr_group_idx
  ON public.mv_diagnosis_stock_correlation (diagnosis_group);
CREATE INDEX IF NOT EXISTS mv_diag_stock_corr_item_idx
  ON public.mv_diagnosis_stock_correlation (inventory_item_id);
CREATE INDEX IF NOT EXISTS mv_diag_stock_corr_lift_idx
  ON public.mv_diagnosis_stock_correlation (lift_score DESC NULLS LAST);

-- 2. Security wrapper view (MVs cannot enforce RLS directly)
CREATE OR REPLACE VIEW public.v_diagnosis_stock_correlation
WITH (security_invoker = on) AS
SELECT *
FROM public.mv_diagnosis_stock_correlation
WHERE public.is_ops_or_admin(auth.uid());

GRANT SELECT ON public.v_diagnosis_stock_correlation TO authenticated;
REVOKE ALL ON public.mv_diagnosis_stock_correlation FROM anon, authenticated;

-- 3. Manual refresh RPC (ops/admin only)
CREATE OR REPLACE FUNCTION public.refresh_diagnosis_correlation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_ops_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_diagnosis_stock_correlation;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_diagnosis_correlation() TO authenticated;

-- 4. Parity check (informational)
DO $$
DECLARE
  v_mv int;
  v_raw int;
BEGIN
  SELECT COALESCE(SUM(item_usage_count), 0) INTO v_mv
    FROM public.mv_diagnosis_stock_correlation;
  SELECT COALESCE(SUM(ABS(qty_change)), 0) INTO v_raw
    FROM public.inventory_transactions
   WHERE transaction_type = 'dispense'
     AND created_at >= now() - interval '90 days';
  RAISE NOTICE 'mv_diagnosis_stock_correlation parity: MV=% vs ledger=% (delta=%)',
    v_mv, v_raw, v_raw - v_mv;
END $$;
