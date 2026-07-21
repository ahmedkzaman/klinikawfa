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
  v_page_id uuid;
  v_page_kind text;
  v_page_slug text;
  v_page_status text;
  v_page_revision integer;
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

  INSERT INTO public.website_pages AS created_page (kind, slug)
  VALUES ('content', p_slug)
  RETURNING
    created_page.id,
    created_page.kind,
    created_page.slug,
    created_page.status,
    created_page.revision
  INTO
    v_page_id,
    v_page_kind,
    v_page_slug,
    v_page_status,
    v_page_revision;

  INSERT INTO public.website_page_drafts (page_id, draft_content, base_revision)
  VALUES (v_page_id, p_draft_content, v_page_revision);

  RETURN QUERY
  SELECT
    v_page_id,
    v_page_kind,
    v_page_slug,
    v_page_status,
    v_page_revision;
END;
$creator$;

REVOKE ALL ON FUNCTION public.create_general_website_page(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_general_website_page(text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_general_website_page(text, jsonb) TO authenticated;
