-- Raise statement_timeout for the heavy insight performance RPC so the 90-day
-- default range used by Planning/Performance tabs no longer aborts under the
-- default 8s Postgres timeout.
--
-- Background:
--   - get_insight_performance_filtered averages 5-8s on 7-day ranges, then grows
--     past the 8s statement_timeout once the range exceeds ~14 days.
--   - Insight.tsx now starts users at a 90-day range (needed by Planning regression).
--   - This migration bumps the per-function timeout to 60s, which is enough headroom
--     for 90-day windows but still bounds runaway queries.
--
-- Approach: SET statement_timeout on the function itself (only applies while this
-- RPC runs; other queries keep the default 8s). The body delegates to
-- _get_insight_performance_filtered_round4 so we don't duplicate logic.
--
-- Re-applying is safe: the SET replaces any prior statement_timeout setting.

CREATE OR REPLACE FUNCTION public.get_insight_performance_filtered(
  _start_date date,
  _end_date date,
  _doctor_id uuid,
  _payment_type text,
  _activity_type text,
  _include_comparison boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '60s'
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  _result := public._get_insight_performance_filtered_round4(
    _start_date, _end_date, _doctor_id, _payment_type, _activity_type, _include_comparison
  );
  RETURN _result;
END;
$$;

ALTER FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) IS
  'Filtered insight performance for the Performance tab. statement_timeout=60s so 90-day ranges do not abort under the default 8s Postgres timeout. Delegates to _get_insight_performance_filtered_round4.';