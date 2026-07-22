CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.can_manage_website()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role::text IN ('admin', 'special_admin', 'doctor_admin', 'website_editor')
  );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_tracking_settings()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role::text IN ('admin', 'special_admin', 'doctor_admin', 'website_editor')
  );
$$;

REVOKE ALL ON FUNCTION private.can_manage_website() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_tracking_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_manage_website() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_tracking_settings() TO authenticated;

CREATE OR REPLACE FUNCTION private.stamp_website_draft_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT private.can_manage_website() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  NEW.updated_by := (SELECT auth.uid());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.stamp_website_draft_actor() FROM PUBLIC;

CREATE TABLE public.website_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('home', 'system_content', 'content')),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  published_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'home' AND slug = 'home') OR kind <> 'home'),
  CHECK (
    kind <> 'content' OR slug NOT IN (
      'auth', 'staff', 'clinic', 'appointment', 'services', 'doctors',
      'doctor-on-duty', 'gallery', 'health-tips', 'blog', 'editor', 'privacy',
      'terms', 'video-call', 'tv', 'reset-password', 'locum-register',
      'api', 'functions'
    )
  )
);

CREATE TABLE public.website_page_drafts (
  page_id uuid PRIMARY KEY REFERENCES public.website_pages(id) ON DELETE CASCADE,
  draft_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  base_revision integer NOT NULL DEFAULT 0 CHECK (base_revision >= 0),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.website_content_drafts (
  resource_type text NOT NULL CHECK (resource_type IN ('service', 'team_member', 'blog_post', 'gallery_image', 'review')),
  resource_id uuid NOT NULL,
  draft_payload jsonb NOT NULL,
  base_revision integer NOT NULL DEFAULT 0 CHECK (base_revision >= 0),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_type, resource_id)
);

CREATE TABLE public.website_content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL CHECK (resource_type IN ('page', 'service', 'team_member', 'blog_post', 'gallery_image', 'review', 'navigation')),
  resource_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision >= 0),
  payload jsonb NOT NULL,
  published_by uuid NOT NULL REFERENCES auth.users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_type, resource_id, revision)
);

CREATE TABLE public.website_navigation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid REFERENCES public.website_pages(id) ON DELETE SET NULL,
  href text NOT NULL,
  label_ms text NOT NULL,
  label_en text,
  is_visible boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL CHECK (display_order >= 0),
  parent_id uuid REFERENCES public.website_navigation_items(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE public.website_navigation_drafts (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  draft_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  base_revision integer NOT NULL DEFAULT 0 CHECK (base_revision >= 0),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.website_review_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_review_id uuid REFERENCES public.reviews(id) ON DELETE SET NULL,
  name_ms text NOT NULL,
  name_en text,
  review_text_ms text NOT NULL,
  review_text_en text,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  source_label text NOT NULL DEFAULT 'Klinik Awfa',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  website_revision integer NOT NULL DEFAULT 0 CHECK (website_revision >= 0),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_review_id)
);

CREATE TABLE public.website_tracking_settings (
  provider text PRIMARY KEY CHECK (provider = 'meta_pixel'),
  enabled boolean NOT NULL DEFAULT false,
  pixel_id text CHECK (pixel_id IS NULL OR pixel_id ~ '^[0-9]{5,32}$'),
  consent_version integer NOT NULL DEFAULT 1 CHECK (consent_version > 0),
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR pixel_id IS NOT NULL)
);

CREATE INDEX idx_website_pages_published_by ON public.website_pages (published_by);
CREATE INDEX idx_website_page_drafts_updated_by ON public.website_page_drafts (updated_by);
CREATE INDEX idx_website_content_drafts_updated_by ON public.website_content_drafts (updated_by);
CREATE INDEX idx_website_content_versions_published_by ON public.website_content_versions (published_by);
CREATE INDEX idx_website_navigation_items_page_id ON public.website_navigation_items (page_id);
CREATE INDEX idx_website_navigation_items_parent_id ON public.website_navigation_items (parent_id);
CREATE INDEX idx_website_navigation_drafts_updated_by ON public.website_navigation_drafts (updated_by);
CREATE INDEX idx_website_tracking_settings_updated_by ON public.website_tracking_settings (updated_by);

INSERT INTO public.website_tracking_settings (provider, enabled, pixel_id, consent_version)
VALUES ('meta_pixel', false, NULL, 1)
ON CONFLICT (provider) DO NOTHING;

REVOKE ALL ON TABLE public.website_pages FROM anon, authenticated;
REVOKE ALL ON TABLE public.website_page_drafts FROM anon, authenticated;
REVOKE ALL ON TABLE public.website_content_drafts FROM anon, authenticated;
REVOKE ALL ON TABLE public.website_content_versions FROM anon, authenticated;
REVOKE ALL ON TABLE public.website_navigation_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.website_navigation_drafts FROM anon, authenticated;
REVOKE ALL ON TABLE public.website_review_presentations FROM anon, authenticated;
REVOKE ALL ON TABLE public.website_tracking_settings FROM anon, authenticated;

GRANT SELECT (
  id, kind, slug, published_content, status, revision, published_at,
  created_at, updated_at
) ON TABLE public.website_pages TO anon, authenticated;
GRANT INSERT (kind, slug) ON TABLE public.website_pages TO authenticated;

GRANT SELECT, DELETE ON TABLE public.website_page_drafts TO authenticated;
GRANT INSERT (page_id, draft_content, base_revision)
  ON TABLE public.website_page_drafts TO authenticated;
GRANT UPDATE (draft_content, base_revision)
  ON TABLE public.website_page_drafts TO authenticated;

GRANT SELECT, DELETE ON TABLE public.website_content_drafts TO authenticated;
GRANT INSERT (resource_type, resource_id, draft_payload, base_revision)
  ON TABLE public.website_content_drafts TO authenticated;
GRANT UPDATE (draft_payload, base_revision)
  ON TABLE public.website_content_drafts TO authenticated;

GRANT SELECT ON TABLE public.website_content_versions TO authenticated;

GRANT SELECT ON TABLE public.website_navigation_items TO anon, authenticated;

GRANT SELECT, DELETE ON TABLE public.website_navigation_drafts TO authenticated;
GRANT INSERT (singleton, draft_items, base_revision)
  ON TABLE public.website_navigation_drafts TO authenticated;
GRANT UPDATE (draft_items, base_revision)
  ON TABLE public.website_navigation_drafts TO authenticated;

GRANT SELECT (
  id, name_ms, name_en, review_text_ms, review_text_en, rating,
  source_label, status, display_order, website_revision, published_at,
  created_at, updated_at
) ON TABLE public.website_review_presentations TO anon, authenticated;

GRANT SELECT (provider, enabled, pixel_id, consent_version)
  ON TABLE public.website_tracking_settings TO anon, authenticated;
GRANT UPDATE (enabled, pixel_id, consent_version)
  ON TABLE public.website_tracking_settings TO authenticated;

ALTER TABLE public.website_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_page_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_content_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_navigation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_navigation_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_review_presentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_tracking_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published website pages are readable"
ON public.website_pages
FOR SELECT
TO anon, authenticated
USING (status = 'published');

CREATE POLICY "Website managers can preview website pages"
ON public.website_pages
FOR SELECT
TO authenticated
USING ((SELECT private.can_manage_website()));

CREATE POLICY "Website managers can create content page skeletons"
ON public.website_pages
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT private.can_manage_website())
  AND kind = 'content'
  AND status = 'draft'
  AND published_content = '{}'::jsonb
  AND revision = 0
);

CREATE POLICY "Website managers can read page drafts"
ON public.website_page_drafts
FOR SELECT
TO authenticated
USING ((SELECT private.can_manage_website()));

CREATE POLICY "Website managers can insert page drafts"
ON public.website_page_drafts
FOR INSERT
TO authenticated
WITH CHECK ((SELECT private.can_manage_website()));

CREATE POLICY "Website managers can update page drafts"
ON public.website_page_drafts
FOR UPDATE
TO authenticated
USING ((SELECT private.can_manage_website()))
WITH CHECK ((SELECT private.can_manage_website()));

CREATE POLICY "Website managers can delete page drafts"
ON public.website_page_drafts
FOR DELETE
TO authenticated
USING ((SELECT private.can_manage_website()));

CREATE POLICY "Website managers can read content drafts"
ON public.website_content_drafts
FOR SELECT
TO authenticated
USING ((SELECT private.can_manage_website()));

CREATE POLICY "Website managers can insert content drafts"
ON public.website_content_drafts
FOR INSERT
TO authenticated
WITH CHECK ((SELECT private.can_manage_website()));

CREATE POLICY "Website managers can update content drafts"
ON public.website_content_drafts
FOR UPDATE
TO authenticated
USING ((SELECT private.can_manage_website()))
WITH CHECK ((SELECT private.can_manage_website()));

CREATE POLICY "Website managers can delete content drafts"
ON public.website_content_drafts
FOR DELETE
TO authenticated
USING ((SELECT private.can_manage_website()));

CREATE POLICY "Website managers can read content versions"
ON public.website_content_versions
FOR SELECT
TO authenticated
USING ((SELECT private.can_manage_website()));

CREATE POLICY "Visible navigation items are readable"
ON public.website_navigation_items
FOR SELECT
TO anon, authenticated
USING (is_visible = true);

CREATE POLICY "Website managers can preview navigation items"
ON public.website_navigation_items
FOR SELECT
TO authenticated
USING ((SELECT private.can_manage_website()));

CREATE POLICY "Website managers can read navigation drafts"
ON public.website_navigation_drafts
FOR SELECT
TO authenticated
USING ((SELECT private.can_manage_website()));

CREATE POLICY "Website managers can insert navigation drafts"
ON public.website_navigation_drafts
FOR INSERT
TO authenticated
WITH CHECK ((SELECT private.can_manage_website()));

CREATE POLICY "Website managers can update navigation drafts"
ON public.website_navigation_drafts
FOR UPDATE
TO authenticated
USING ((SELECT private.can_manage_website()))
WITH CHECK ((SELECT private.can_manage_website()));

CREATE POLICY "Website managers can delete navigation drafts"
ON public.website_navigation_drafts
FOR DELETE
TO authenticated
USING ((SELECT private.can_manage_website()));

CREATE POLICY "Published review presentations are readable"
ON public.website_review_presentations
FOR SELECT
TO anon, authenticated
USING (status = 'published');

CREATE POLICY "Website managers can preview review presentations"
ON public.website_review_presentations
FOR SELECT
TO authenticated
USING ((SELECT private.can_manage_website()));

CREATE POLICY "Enabled tracking settings are readable"
ON public.website_tracking_settings
FOR SELECT
TO anon, authenticated
USING (enabled = true);

CREATE POLICY "Tracking managers can read tracking settings"
ON public.website_tracking_settings
FOR SELECT
TO authenticated
USING ((SELECT private.can_manage_tracking_settings()));

CREATE POLICY "Tracking managers can update tracking settings"
ON public.website_tracking_settings
FOR UPDATE
TO authenticated
USING ((SELECT private.can_manage_tracking_settings()))
WITH CHECK ((SELECT private.can_manage_tracking_settings()));

CREATE TRIGGER stamp_website_page_draft_actor
BEFORE INSERT OR UPDATE ON public.website_page_drafts
FOR EACH ROW
EXECUTE FUNCTION private.stamp_website_draft_actor();

CREATE TRIGGER stamp_website_content_draft_actor
BEFORE INSERT OR UPDATE ON public.website_content_drafts
FOR EACH ROW
EXECUTE FUNCTION private.stamp_website_draft_actor();

CREATE TRIGGER stamp_website_navigation_draft_actor
BEFORE INSERT OR UPDATE ON public.website_navigation_drafts
FOR EACH ROW
EXECUTE FUNCTION private.stamp_website_draft_actor();

CREATE POLICY "Website managers can upload website media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'website-media'
  AND (SELECT private.can_manage_website())
  AND (storage.foldername(name))[1] IN (
    'home', 'pages', 'services', 'team', 'blog', 'gallery', 'reviews'
  )
);

CREATE POLICY "Website managers can list website media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'website-media'
  AND (SELECT private.can_manage_website())
  AND (storage.foldername(name))[1] IN (
    'home', 'pages', 'services', 'team', 'blog', 'gallery', 'reviews'
  )
);

CREATE POLICY "Website managers can update website media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'website-media'
  AND (SELECT private.can_manage_website())
  AND (storage.foldername(name))[1] IN (
    'home', 'pages', 'services', 'team', 'blog', 'gallery', 'reviews'
  )
)
WITH CHECK (
  bucket_id = 'website-media'
  AND (SELECT private.can_manage_website())
  AND (storage.foldername(name))[1] IN (
    'home', 'pages', 'services', 'team', 'blog', 'gallery', 'reviews'
  )
);

CREATE POLICY "Website managers can delete website media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'website-media'
  AND (SELECT private.can_manage_website())
  AND (storage.foldername(name))[1] IN (
    'home', 'pages', 'services', 'team', 'blog', 'gallery', 'reviews'
  )
);