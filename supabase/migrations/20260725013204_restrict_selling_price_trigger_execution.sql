-- This function is an internal trigger implementation, not a client RPC.
REVOKE ALL ON FUNCTION public.trg_resolve_selling_price() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_resolve_selling_price() FROM anon, authenticated;
