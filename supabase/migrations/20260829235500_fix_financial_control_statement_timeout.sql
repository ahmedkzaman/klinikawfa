-- Fix: raise statement_timeout on financial control RPCs from 8s default to 60s.
--
-- Root cause (2026-08-29): get_insight_financial_control_summary returned HTTP 500
-- because the financial_control_report_rows query chain takes ~12s for a single-day
-- query and ~15s for a 30-day query, exceeding the 8s statement_timeout on the
-- `authenticated` role. This is the same class of issue addressed for the performance
-- RPCs in 20260820120000_insight_performance_indexes_and_timeouts.sql — the financial
-- control functions were missed in that pass.
--
-- Symptoms: /clinic/insight Command Centre shows
-- "Some Command Centre sources could not be loaded" with VISIT BILLING /
-- PATIENT COLLECTIONS / PANEL RECEIVABLE cards reading "Unavailable".
-- Console shows 500 on get_insight_financial_control_summary.

ALTER FUNCTION public.get_insight_financial_control_summary(date,date,date,date,date)
  SET statement_timeout = '60s';

ALTER FUNCTION public.get_financial_control_summary(date,date,date,date,date)
  SET statement_timeout = '60s';

ALTER FUNCTION public.get_insight_financial_control_details(date,date,date,text,text,text,integer,integer)
  SET statement_timeout = '60s';

ALTER FUNCTION public.get_financial_control_details(date,date,date,text,text,text,integer,integer)
  SET statement_timeout = '60s';

COMMENT ON FUNCTION public.get_insight_financial_control_summary(date,date,date,date,date) IS
  'Insight-scoped financial control summary. statement_timeout=60s (raised 2026-08-29: heavy CTE stack exceeds the default 8s, same pattern as 20260820120000).';

COMMENT ON FUNCTION public.get_financial_control_details(date,date,date,text,text,text,integer,integer) IS
  'Financial control details (drill-down). statement_timeout=60s (raised 2026-08-29: heavy CTE stack exceeds the default 8s).';
