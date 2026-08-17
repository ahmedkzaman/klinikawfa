-- Expose only the receipt total required by Insight Finance. The immutable
-- event ledger is authoritative here: panel_claims.received_amount is
-- cumulative and panel_claims.received_date contains only the latest receipt.
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
  IF auth.uid() IS NULL OR NOT public.can_view_insights(auth.uid()) THEN
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
    SELECT jsonb_build_object(
      'total_received', round(COALESCE(SUM(event.receipt_delta), 0), 2)
    )
    FROM private.financial_panel_claim_events AS event
    WHERE event.event_kind IN ('receipt', 'receipt_reversal')
      AND event.attribution_complete
      AND timezone('Asia/Kuala_Lumpur', event.occurred_at)::date
        BETWEEN _start_date AND _end_date
  );
END;
$function$;

ALTER FUNCTION public.get_panel_receipt_summary(date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_panel_receipt_summary(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_panel_receipt_summary(date, date) TO authenticated;

COMMENT ON FUNCTION public.get_panel_receipt_summary(date, date) IS
  'Returns a role-safe period aggregate over immutable, individually dated panel receipt events.';

DO $postflight$
BEGIN
  IF to_regprocedure('public.get_panel_receipt_summary(date,date)') IS NULL THEN
    RAISE EXCEPTION 'PANEL_RECEIPT_SUMMARY_RPC_MISSING';
  END IF;

  IF has_function_privilege('anon', 'public.get_panel_receipt_summary(date,date)', 'execute')
     OR has_function_privilege('public', 'public.get_panel_receipt_summary(date,date)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.get_panel_receipt_summary(date,date)', 'execute') THEN
    RAISE EXCEPTION 'PANEL_RECEIPT_SUMMARY_RPC_PRIVILEGE_INVALID';
  END IF;

  IF has_table_privilege('authenticated', 'private.financial_panel_claim_events', 'select')
     OR has_table_privilege('authenticated', 'public.panel_claim_portion_receipts', 'select') THEN
    RAISE EXCEPTION 'PANEL_RECEIPT_SOURCE_TABLE_EXPOSED';
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';
