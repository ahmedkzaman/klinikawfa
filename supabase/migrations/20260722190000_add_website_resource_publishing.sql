-- Safe, fixed-branch publishing for public website resources.
-- Published tables remain the public source; drafts and history stay private to website managers.

BEGIN;

ALTER TABLE public.clinic_services
  ADD COLUMN IF NOT EXISTS title_ms text,
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS description_ms text,
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS call_to_action_ms text,
  ADD COLUMN IF NOT EXISTS call_to_action_en text,
  ADD COLUMN IF NOT EXISTS services_list_ms text[],
  ADD COLUMN IF NOT EXISTS services_list_en text[],
  ADD COLUMN IF NOT EXISTS website_revision integer NOT NULL DEFAULT 0 CHECK (website_revision >= 0);

UPDATE public.clinic_services
SET title_ms = COALESCE(NULLIF(title_ms, ''), title),
    description_ms = COALESCE(NULLIF(description_ms, ''), description),
    call_to_action_ms = COALESCE(NULLIF(call_to_action_ms, ''), call_to_action),
    services_list_ms = COALESCE(services_list_ms, services_list)
WHERE title_ms IS NULL OR description_ms IS NULL OR call_to_action_ms IS NULL OR services_list_ms IS NULL;

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS website_revision integer NOT NULL DEFAULT 0 CHECK (website_revision >= 0);

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS website_revision integer NOT NULL DEFAULT 0 CHECK (website_revision >= 0);

ALTER TABLE public.gallery_images
  ADD COLUMN IF NOT EXISTS alt_text_ms text,
  ADD COLUMN IF NOT EXISTS alt_text_en text,
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS website_revision integer NOT NULL DEFAULT 0 CHECK (website_revision >= 0);

UPDATE public.gallery_images
SET alt_text_ms = COALESCE(NULLIF(alt_text_ms, ''), alt_text, 'Imej Klinik Awfa')
WHERE alt_text_ms IS NULL;

-- Seed only the already-public review presentation table. Never read clinic_reviews.
INSERT INTO public.website_review_presentations (
  source_review_id,name_ms,name_en,review_text_ms,review_text_en,rating,
  source_label,status,display_order,website_revision,published_at
)
SELECT id,name_ms,name_en,text_ms,text_en,rating,'Klinik Awfa','published',display_order,1,COALESCE(updated_at,created_at)
FROM public.reviews
WHERE published=true
ON CONFLICT (source_review_id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.assert_website_resource_payload(
  p_resource_type text,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_allowed text[];
  v_required text[];
  v_key text;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'resource payload must be an object' USING ERRCODE = '22023';
  END IF;

  CASE p_resource_type
    WHEN 'service' THEN
      v_allowed := ARRAY['slug','titleMs','titleEn','descriptionMs','descriptionEn','ctaMs','ctaEn','servicesMs','servicesEn','heroImageUrl','promoVideoUrl'];
      v_required := ARRAY['slug','titleMs','descriptionMs','ctaMs','servicesMs'];
      IF p_payload->>'slug' NOT IN ('rawatan-am','prosedur-minor','pemeriksaan-kesihatan') THEN
        RAISE EXCEPTION 'invalid service slug' USING ERRCODE = '22023';
      END IF;
    WHEN 'team_member' THEN
      v_allowed := ARRAY['type','nameMs','nameEn','titleMs','titleEn','bioMs','bioEn','expertiseMs','expertiseEn','qualifications','yearsExperience','photoUrl','isActive','displayOrder'];
      v_required := ARRAY['type','nameMs','titleMs','bioMs','expertiseMs','qualifications','yearsExperience','isActive','displayOrder'];
    WHEN 'blog_post' THEN
      v_allowed := ARRAY['slug','titleMs','titleEn','excerptMs','excerptEn','contentMs','contentEn','categoryId','featuredImage','readingTime','status','scheduledAt'];
      v_required := ARRAY['slug','titleMs','excerptMs','contentMs','readingTime','status'];
    WHEN 'gallery_image' THEN
      v_allowed := ARRAY['url','altMs','altEn','tags','displayOrder','visible'];
      v_required := ARRAY['url','altMs','tags','displayOrder','visible'];
    WHEN 'review' THEN
      v_allowed := ARRAY['nameMs','nameEn','reviewTextMs','reviewTextEn','rating','sourceLabel','status','displayOrder'];
      v_required := ARRAY['nameMs','reviewTextMs','rating','sourceLabel','status','displayOrder'];
    ELSE
      RAISE EXCEPTION 'unsupported website resource type' USING ERRCODE = '22023';
  END CASE;

  FOR v_key IN SELECT jsonb_object_keys(p_payload) LOOP
    IF NOT v_key = ANY(v_allowed) THEN
      RAISE EXCEPTION 'unknown resource payload key: %', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH v_key IN ARRAY v_required LOOP
    IF NOT p_payload ? v_key OR p_payload->v_key IS NULL OR btrim(COALESCE(p_payload->>v_key, '')) = '' THEN
      RAISE EXCEPTION 'missing required resource payload key: %', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_website_resource_payload(text, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.publish_website_resource(
  p_resource_type text,
  p_resource_id uuid,
  p_expected_revision integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_payload jsonb;
  v_base_revision integer;
  v_current_revision integer;
  v_next_revision integer;
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR NOT private.can_manage_website() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT draft_payload, base_revision INTO v_payload, v_base_revision
  FROM public.website_content_drafts
  WHERE resource_type = p_resource_type AND resource_id = p_resource_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'resource draft not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.assert_website_resource_payload(p_resource_type, v_payload);

  CASE p_resource_type
    WHEN 'service' THEN
      SELECT website_revision INTO v_current_revision FROM public.clinic_services WHERE id = p_resource_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'service category not found' USING ERRCODE = 'P0002'; END IF;
    WHEN 'team_member' THEN SELECT website_revision INTO v_current_revision FROM public.team_members WHERE id = p_resource_id FOR UPDATE;
    WHEN 'blog_post' THEN SELECT website_revision INTO v_current_revision FROM public.blog_posts WHERE id = p_resource_id FOR UPDATE;
    WHEN 'gallery_image' THEN SELECT website_revision INTO v_current_revision FROM public.gallery_images WHERE id = p_resource_id FOR UPDATE;
    WHEN 'review' THEN SELECT website_revision INTO v_current_revision FROM public.website_review_presentations WHERE id = p_resource_id FOR UPDATE;
    ELSE RAISE EXCEPTION 'unsupported website resource type' USING ERRCODE = '22023';
  END CASE;

  v_current_revision := COALESCE(v_current_revision, 0);
  IF v_current_revision <> p_expected_revision OR v_base_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale website resource revision' USING ERRCODE = '40001';
  END IF;
  v_next_revision := v_current_revision + 1;

  CASE p_resource_type
    WHEN 'service' THEN
      UPDATE public.clinic_services SET
        title = v_payload->>'titleMs', description = v_payload->>'descriptionMs',
        call_to_action = v_payload->>'ctaMs', services_list = ARRAY(SELECT jsonb_array_elements_text(v_payload->'servicesMs')),
        title_ms = v_payload->>'titleMs', title_en = NULLIF(v_payload->>'titleEn',''),
        description_ms = v_payload->>'descriptionMs', description_en = NULLIF(v_payload->>'descriptionEn',''),
        call_to_action_ms = v_payload->>'ctaMs', call_to_action_en = NULLIF(v_payload->>'ctaEn',''),
        services_list_ms = ARRAY(SELECT jsonb_array_elements_text(v_payload->'servicesMs')),
        services_list_en = ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_payload->'servicesEn','[]'::jsonb))),
        hero_image_url = NULLIF(v_payload->>'heroImageUrl',''), promo_video_url = NULLIF(v_payload->>'promoVideoUrl',''),
        website_revision = v_next_revision, updated_at = now()
      WHERE id = p_resource_id AND slug = v_payload->>'slug';
      IF NOT FOUND THEN RAISE EXCEPTION 'service identity mismatch' USING ERRCODE = '22023'; END IF;
    WHEN 'team_member' THEN
      INSERT INTO public.team_members (id,type,name_ms,name_en,title_ms,title_en,bio_ms,bio_en,expertise_ms,expertise_en,qualifications,years_experience,photo_url,is_active,display_order,website_revision)
      VALUES (p_resource_id,CASE WHEN v_payload->>'type'='team' THEN 'staff' ELSE 'doctor' END,v_payload->>'nameMs',COALESCE(NULLIF(v_payload->>'nameEn',''),v_payload->>'nameMs'),v_payload->>'titleMs',NULLIF(v_payload->>'titleEn',''),v_payload->>'bioMs',NULLIF(v_payload->>'bioEn',''),ARRAY(SELECT jsonb_array_elements_text(v_payload->'expertiseMs')),ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_payload->'expertiseEn','[]'::jsonb))),ARRAY(SELECT jsonb_array_elements_text(v_payload->'qualifications')),(v_payload->>'yearsExperience')::integer,NULLIF(v_payload->>'photoUrl',''),(v_payload->>'isActive')::boolean,(v_payload->>'displayOrder')::integer,v_next_revision)
      ON CONFLICT (id) DO UPDATE SET type=EXCLUDED.type,name_ms=EXCLUDED.name_ms,name_en=EXCLUDED.name_en,title_ms=EXCLUDED.title_ms,title_en=EXCLUDED.title_en,bio_ms=EXCLUDED.bio_ms,bio_en=EXCLUDED.bio_en,expertise_ms=EXCLUDED.expertise_ms,expertise_en=EXCLUDED.expertise_en,qualifications=EXCLUDED.qualifications,years_experience=EXCLUDED.years_experience,photo_url=EXCLUDED.photo_url,is_active=EXCLUDED.is_active,display_order=EXCLUDED.display_order,website_revision=EXCLUDED.website_revision,updated_at=now();
    WHEN 'blog_post' THEN
      INSERT INTO public.blog_posts (id,slug,title,title_ms,title_en,content,content_ms,content_en,excerpt_ms,excerpt_en,featured_image,reading_time,category_id,published,scheduled_at,published_at,website_revision)
      VALUES (p_resource_id,v_payload->>'slug',v_payload->>'titleMs',v_payload->>'titleMs',NULLIF(v_payload->>'titleEn',''),v_payload->>'contentMs',v_payload->>'contentMs',NULLIF(v_payload->>'contentEn',''),v_payload->>'excerptMs',NULLIF(v_payload->>'excerptEn',''),NULLIF(v_payload->>'featuredImage',''),(v_payload->>'readingTime')::integer,NULLIF(v_payload->>'categoryId','')::uuid,v_payload->>'status'='published',NULLIF(v_payload->>'scheduledAt','')::timestamptz,CASE WHEN v_payload->>'status'='published' THEN now() ELSE NULL END,v_next_revision)
      ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,title_ms=EXCLUDED.title_ms,title_en=EXCLUDED.title_en,content=EXCLUDED.content,content_ms=EXCLUDED.content_ms,content_en=EXCLUDED.content_en,excerpt_ms=EXCLUDED.excerpt_ms,excerpt_en=EXCLUDED.excerpt_en,featured_image=EXCLUDED.featured_image,reading_time=EXCLUDED.reading_time,category_id=EXCLUDED.category_id,published=EXCLUDED.published,scheduled_at=EXCLUDED.scheduled_at,published_at=EXCLUDED.published_at,website_revision=EXCLUDED.website_revision,updated_at=now();
    WHEN 'gallery_image' THEN
      INSERT INTO public.gallery_images (id,url,alt_text,alt_text_ms,alt_text_en,tags,display_order,is_visible,website_revision)
      VALUES (p_resource_id,v_payload->>'url',v_payload->>'altMs',v_payload->>'altMs',NULLIF(v_payload->>'altEn',''),ARRAY(SELECT jsonb_array_elements_text(v_payload->'tags')),(v_payload->>'displayOrder')::integer,(v_payload->>'visible')::boolean,v_next_revision)
      ON CONFLICT (id) DO UPDATE SET url=EXCLUDED.url,alt_text=EXCLUDED.alt_text,alt_text_ms=EXCLUDED.alt_text_ms,alt_text_en=EXCLUDED.alt_text_en,tags=EXCLUDED.tags,display_order=EXCLUDED.display_order,is_visible=EXCLUDED.is_visible,website_revision=EXCLUDED.website_revision;
    WHEN 'review' THEN
      INSERT INTO public.website_review_presentations (id,name_ms,name_en,review_text_ms,review_text_en,rating,source_label,status,display_order,website_revision,published_at)
      VALUES (p_resource_id,v_payload->>'nameMs',NULLIF(v_payload->>'nameEn',''),v_payload->>'reviewTextMs',NULLIF(v_payload->>'reviewTextEn',''),(v_payload->>'rating')::smallint,v_payload->>'sourceLabel',v_payload->>'status',(v_payload->>'displayOrder')::integer,v_next_revision,CASE WHEN v_payload->>'status'='published' THEN now() ELSE NULL END)
      ON CONFLICT (id) DO UPDATE SET name_ms=EXCLUDED.name_ms,name_en=EXCLUDED.name_en,review_text_ms=EXCLUDED.review_text_ms,review_text_en=EXCLUDED.review_text_en,rating=EXCLUDED.rating,source_label=EXCLUDED.source_label,status=EXCLUDED.status,display_order=EXCLUDED.display_order,website_revision=EXCLUDED.website_revision,published_at=EXCLUDED.published_at,updated_at=now();
  END CASE;

  INSERT INTO public.website_content_versions (resource_type,resource_id,revision,payload,published_by)
  VALUES (p_resource_type,p_resource_id,v_next_revision,v_payload,v_actor);
  DELETE FROM public.website_content_drafts WHERE resource_type=p_resource_type AND resource_id=p_resource_id;
  DELETE FROM public.website_content_versions WHERE id IN (
    SELECT id FROM public.website_content_versions WHERE resource_type=p_resource_type AND resource_id=p_resource_id ORDER BY revision DESC OFFSET 20
  );
  RETURN jsonb_build_object('resourceType',p_resource_type,'resourceId',p_resource_id,'revision',v_next_revision);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_website_resource_version(p_resource_type text,p_resource_id uuid,p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_payload jsonb; v_revision integer; v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR NOT private.can_manage_website() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  SELECT payload INTO v_payload FROM public.website_content_versions WHERE id=p_version_id AND resource_type=p_resource_type AND resource_id=p_resource_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'version not found' USING ERRCODE='P0002'; END IF;
  PERFORM private.assert_website_resource_payload(p_resource_type,v_payload);
  CASE p_resource_type
    WHEN 'service' THEN SELECT website_revision INTO v_revision FROM public.clinic_services WHERE id=p_resource_id;
    WHEN 'team_member' THEN SELECT website_revision INTO v_revision FROM public.team_members WHERE id=p_resource_id;
    WHEN 'blog_post' THEN SELECT website_revision INTO v_revision FROM public.blog_posts WHERE id=p_resource_id;
    WHEN 'gallery_image' THEN SELECT website_revision INTO v_revision FROM public.gallery_images WHERE id=p_resource_id;
    WHEN 'review' THEN SELECT website_revision INTO v_revision FROM public.website_review_presentations WHERE id=p_resource_id;
    ELSE RAISE EXCEPTION 'unsupported website resource type' USING ERRCODE='22023';
  END CASE;
  IF v_revision IS NULL THEN RAISE EXCEPTION 'resource not found' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.website_content_drafts(resource_type,resource_id,draft_payload,base_revision,updated_by)
  VALUES(p_resource_type,p_resource_id,v_payload,v_revision,v_actor)
  ON CONFLICT(resource_type,resource_id) DO UPDATE SET draft_payload=EXCLUDED.draft_payload,base_revision=EXCLUDED.base_revision,updated_by=v_actor,updated_at=now();
END;
$$;

REVOKE ALL ON FUNCTION public.publish_website_resource(text,uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_website_resource_version(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_website_resource(text,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_website_resource_version(text,uuid,uuid) TO authenticated;

-- Published presentation tables are read-only from browsers. All mutations go
-- through the fixed, role-checked publisher above.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.clinic_services FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.team_members FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.blog_posts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.gallery_images FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.website_review_presentations FROM anon, authenticated;

COMMIT;
