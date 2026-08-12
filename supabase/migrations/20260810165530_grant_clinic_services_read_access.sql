-- Service content is publicly readable through RLS; browser writes remain
-- disabled because CMS publishing uses the role-checked publishing function.
GRANT SELECT ON TABLE public.clinic_services TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.clinic_services FROM anon, authenticated;
