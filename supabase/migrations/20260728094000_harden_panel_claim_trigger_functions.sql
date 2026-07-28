-- Trigger functions are invoked by PostgreSQL triggers, never directly by API
-- clients. Remove the default PUBLIC execution grant.
REVOKE ALL ON FUNCTION public.trg_generate_panel_claim() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_generate_panel_claim() FROM anon;
REVOKE ALL ON FUNCTION public.trg_generate_panel_claim() FROM authenticated;

REVOKE ALL ON FUNCTION public.trg_queue_completion_ensure_panel_claim() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_queue_completion_ensure_panel_claim() FROM anon;
REVOKE ALL ON FUNCTION public.trg_queue_completion_ensure_panel_claim() FROM authenticated;
