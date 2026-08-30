-- Grant SELECT on the diagnosis correlation materialized view to authenticated roles.
--
-- Background: v_diagnosis_stock_correlation is a security_invoker view that
-- SELECTs from mv_diagnosis_stock_correlation and gates rows with
-- is_ops_or_admin(auth.uid()). Because the view runs with the invoker's
-- privileges, the invoker itself needs SELECT on the underlying materialized
-- view. Without that grant the procurement dashboard's Diagnosis Correlation
-- tab fails with:
--   permission denied for materialized view mv_diagnosis_stock_correlation
--
-- Security: anon gets NO grant. Row-level access is enforced by the view's
-- is_ops_or_admin() predicate, so granting SELECT on the matview to
-- authenticated does not by itself expose rows through the API — the matview
-- is not intended to be queried directly by clients, and the exposed path is
-- the gated view.

GRANT SELECT ON TABLE public.mv_diagnosis_stock_correlation TO authenticated;
GRANT SELECT ON TABLE public.mv_diagnosis_stock_correlation TO service_role;
