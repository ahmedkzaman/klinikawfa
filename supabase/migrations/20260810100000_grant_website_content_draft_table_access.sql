-- RLS policies decide which website managers may access drafts; these table
-- grants allow authenticated requests to reach those policies first.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.website_content_drafts TO authenticated;
REVOKE ALL ON TABLE public.website_content_drafts FROM anon;
