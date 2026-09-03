-- Make per-doctor COGS, gross profit, and margin measurable.
--
-- Root cause: both RPCs gated COGS / gross_profit / margin_pct behind
-- "missing_cost = 0". A single dispensed inventory item with unit_cost <= 0
-- (9.3% of the active catalog has no cost_price) collapsed the whole doctor's
-- financial block to NULL, so the UI showed "Unavailable" for the busiest
-- doctors. The per-doctor summary row did not carry COGS/GP/margin at all.
--
-- Fix (partial-cost): always sum the KNOWN costs and derive GP/margin, and keep
-- surfacing missing_cost_count so the UI can flag the figures as partial.
-- This edits the STABLE _round3 bodies in place via pg_get_functiondef+replace
-- (the same surgical pattern used by prior insight migrations), so the thin
-- permission-checking wrappers (round4/round5/public) keep working unchanged.

-- ============================================================================
-- 1. DETAIL: _get_insight_performance_detail_filtered_round3
--    Always emit COGS/GP/margin from known costs (drop the "missing_cost = 0"
--    gate on the values themselves). missing_cost_count is unchanged.
-- ============================================================================
DO $migration$
DECLARE
  v_definition text;
  v_original text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public._get_insight_performance_detail_filtered_round3(date,date,text,text,uuid,text,text)'::regprocedure
  ) INTO v_definition;
  v_original := v_definition;

  -- COGS: drop the gate.
  v_definition := replace(v_definition,
    E'\'cogs\', CASE WHEN financial.missing_cost = 0 THEN round(financial.cogs, 2) END,',
    E'\'cogs\', round(financial.cogs, 2),');
  -- Gross profit: drop the gate.
  v_definition := replace(v_definition,
    E'\'gross_profit\', CASE WHEN financial.missing_cost = 0 THEN round(financial.revenue - financial.cogs, 2) END,',
    E'\'gross_profit\', round(financial.revenue - financial.cogs, 2),');
  -- Margin: keep the divide-by-zero guard only.
  v_definition := replace(v_definition,
    E'\'margin_pct\', CASE WHEN financial.missing_cost = 0 AND financial.revenue <> 0\n          THEN round((financial.revenue - financial.cogs) / financial.revenue * 100, 2) END,',
    E'\'margin_pct\', CASE WHEN financial.revenue <> 0\n          THEN round((financial.revenue - financial.cogs) / financial.revenue * 100, 2) END,');

  IF v_definition = v_original THEN
    RAISE EXCEPTION 'detail _round3 financial anchor not found; migration aborted';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

-- ============================================================================
-- 2. SUMMARY: _get_insight_performance_filtered_round3
--    Carry COGS + missing_cost through item_stats -> grouped -> named_rows so
--    each doctor row exposes cogs / gross_profit / margin_pct.
-- ============================================================================
DO $migration$
DECLARE
  v_definition text;
  v_original text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public._get_insight_performance_filtered_round3(date,date,uuid,text,text,boolean)'::regprocedure
  ) INTO v_definition;
  v_original := v_definition;

  -- 2a. item_stats: add cogs + missing_cost alongside revenue.
  v_definition := replace(v_definition,
    E'    SELECT selected.id, coalesce(sum(item.price * item.quantity), 0)::numeric AS revenue,\n      CASE WHEN coalesce(_activity_type, \'all\') = \'document\' THEN 0 ELSE',
    E'    SELECT selected.id, coalesce(sum(item.price * item.quantity), 0)::numeric AS revenue,\n      coalesce(sum(item.unit_cost * greatest(CASE WHEN item.item_id IS NOT NULL\n        THEN least(coalesce(item.dispensed_qty, item.quantity), greatest(item.quantity, 0))\n        ELSE item.quantity END, 0)), 0)::numeric AS cogs,\n      count(*) FILTER (WHERE item.item_id IS NOT NULL\n        AND greatest(least(coalesce(item.dispensed_qty, item.quantity), greatest(item.quantity, 0)), 0) > 0\n        AND item.unit_cost <= 0)::integer AS missing_cost,\n      CASE WHEN coalesce(_activity_type, \'all\') = \'document\' THEN 0 ELSE');

  -- 2b. grouped: aggregate the new per-visit stats.
  v_definition := replace(v_definition,
    E'      sum(item_stats.revenue)::numeric AS revenue, sum(item_stats.procedures)::numeric AS procedures,\n      sum(item_stats.documents)::integer AS documents',
    E'      sum(item_stats.revenue)::numeric AS revenue, sum(item_stats.procedures)::numeric AS procedures,\n      sum(item_stats.documents)::integer AS documents,\n      sum(item_stats.cogs)::numeric AS cogs, sum(item_stats.missing_cost)::integer AS missing_cost');

  -- 2c. named_rows: emit cogs / gross_profit / margin_pct (partial-cost) on the doctor row.
  v_definition := replace(v_definition,
    E'      \'procedures\', grouped.procedures, \'documents\', grouped.documents) AS doctor_row',
    E'      \'procedures\', grouped.procedures, \'documents\', grouped.documents,\n      \'cogs\', round(grouped.cogs, 2),\n      \'gross_profit\', round(grouped.revenue - grouped.cogs, 2),\n      \'margin_pct\', CASE WHEN grouped.revenue <> 0 THEN round((grouped.revenue - grouped.cogs) / grouped.revenue * 100, 2) END,\n      \'missing_cost_count\', grouped.missing_cost) AS doctor_row');

  IF v_definition = v_original THEN
    RAISE EXCEPTION 'summary _round3 anchor not found; migration aborted';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

-- Re-assert ownership and privileges on the edited stable bodies.
ALTER FUNCTION public._get_insight_performance_detail_filtered_round3(date, date, text, text, uuid, text, text) OWNER TO postgres;
ALTER FUNCTION public._get_insight_performance_filtered_round3(date, date, uuid, text, text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._get_insight_performance_detail_filtered_round3(date, date, text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._get_insight_performance_filtered_round3(date, date, uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
