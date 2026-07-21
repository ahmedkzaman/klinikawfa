CREATE OR REPLACE FUNCTION public.create_general_website_page(
  p_slug text,
  p_draft_content jsonb
)
RETURNS TABLE (
  id uuid,
  kind text,
  slug text,
  status text,
  revision integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $creator$
DECLARE
  v_page public.website_pages%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT (SELECT private.can_manage_website())
  THEN
    RAISE EXCEPTION 'Website editor authorization required'
      USING ERRCODE = '42501';
  END IF;

  IF p_slug IS NULL
    OR length(p_slug) < 1
    OR length(p_slug) > 100
    OR p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    OR p_slug IN (
      'auth', 'staff', 'clinic', 'appointment', 'services', 'doctors',
      'doctor-on-duty', 'gallery', 'health-tips', 'blog', 'editor', 'privacy',
      'terms', 'video-call', 'tv', 'reset-password', 'locum-register',
      'api', 'functions'
    )
  THEN
    RAISE EXCEPTION 'Invalid general page slug'
      USING ERRCODE = '22023';
  END IF;

  IF NOT private.website_page_payload_is_valid('content', p_draft_content)
  THEN
    RAISE EXCEPTION 'Invalid general page draft'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.website_pages (kind, slug)
  VALUES ('content', p_slug)
  RETURNING * INTO v_page;

  INSERT INTO public.website_page_drafts (page_id, draft_content, base_revision)
  VALUES (v_page.id, p_draft_content, v_page.revision);

  RETURN QUERY
  SELECT v_page.id, v_page.kind, v_page.slug, v_page.status, v_page.revision;
END;
$creator$;

REVOKE ALL ON FUNCTION public.create_general_website_page(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_general_website_page(text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_general_website_page(text, jsonb) TO authenticated;
