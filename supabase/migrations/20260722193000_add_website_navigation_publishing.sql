BEGIN;
CREATE OR REPLACE FUNCTION public.publish_website_navigation(p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_items jsonb;v_base integer;v_current integer;v_next integer;v_actor uuid:=(SELECT auth.uid());v_item jsonb;
BEGIN
 IF v_actor IS NULL OR NOT private.can_manage_website() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501';END IF;
 SELECT draft_items,base_revision INTO v_items,v_base FROM public.website_navigation_drafts WHERE singleton=true FOR UPDATE;
 IF NOT FOUND OR jsonb_typeof(v_items)<>'array' THEN RAISE EXCEPTION 'navigation draft not found' USING ERRCODE='P0002';END IF;
 SELECT COALESCE(max(revision),0) INTO v_current FROM public.website_navigation_items;
 IF v_base<>p_expected_revision OR v_current<>p_expected_revision THEN RAISE EXCEPTION 'stale navigation revision' USING ERRCODE='40001';END IF;
 v_next:=v_current+1;
 FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
  IF (v_item->>'labelMs') IS NULL OR btrim(v_item->>'labelMs')='' OR (v_item->>'href') IS NULL THEN RAISE EXCEPTION 'invalid navigation item' USING ERRCODE='22023';END IF;
  IF NOT ((v_item->>'href') IN ('/','/services','/doctors','/doctor-on-duty','/appointment','/gallery','/health-tips') OR (v_item->>'href')~'^/pages/[a-z0-9]+(?:-[a-z0-9]+)*$' OR (v_item->>'href')~'^https://') THEN RAISE EXCEPTION 'unsafe navigation URL' USING ERRCODE='22023';END IF;
 END LOOP;
 INSERT INTO public.website_content_versions(resource_type,resource_id,revision,payload,published_by) VALUES('navigation','00000000-0000-0000-0000-000000000001',v_next,v_items,v_actor);
 DELETE FROM public.website_navigation_items;
 INSERT INTO public.website_navigation_items(id,page_id,href,label_ms,label_en,is_visible,display_order,parent_id,revision)
 SELECT (x->>'id')::uuid,NULL,x->>'href',x->>'labelMs',NULLIF(x->>'labelEn',''),COALESCE((x->>'visible')::boolean,true),(x->>'displayOrder')::integer,NULL,v_next FROM jsonb_array_elements(v_items)x WHERE NULLIF(x->>'parentId','') IS NULL;
 INSERT INTO public.website_navigation_items(id,page_id,href,label_ms,label_en,is_visible,display_order,parent_id,revision)
 SELECT (x->>'id')::uuid,NULL,x->>'href',x->>'labelMs',NULLIF(x->>'labelEn',''),COALESCE((x->>'visible')::boolean,true),(x->>'displayOrder')::integer,(x->>'parentId')::uuid,v_next FROM jsonb_array_elements(v_items)x WHERE NULLIF(x->>'parentId','') IS NOT NULL;
 DELETE FROM public.website_navigation_drafts WHERE singleton=true;
 DELETE FROM public.website_content_versions WHERE id IN(SELECT id FROM public.website_content_versions WHERE resource_type='navigation' AND resource_id='00000000-0000-0000-0000-000000000001' ORDER BY revision DESC OFFSET 20);
 RETURN jsonb_build_object('revision',v_next);
END$$;
REVOKE ALL ON FUNCTION public.publish_website_navigation(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_website_navigation(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_website_navigation_version(p_version_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  v_items jsonb;
  v_revision integer;
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR NOT private.can_manage_website() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE='42501';
  END IF;
  SELECT payload INTO v_items
  FROM public.website_content_versions
  WHERE id=p_version_id
    AND resource_type='navigation'
    AND resource_id='00000000-0000-0000-0000-000000000001';
  IF NOT FOUND OR jsonb_typeof(v_items)<>'array' THEN
    RAISE EXCEPTION 'navigation version not found' USING ERRCODE='P0002';
  END IF;
  SELECT COALESCE(max(revision),0) INTO v_revision FROM public.website_navigation_items;
  INSERT INTO public.website_navigation_drafts(singleton,draft_items,base_revision,updated_by)
  VALUES(true,v_items,v_revision,v_actor)
  ON CONFLICT(singleton) DO UPDATE SET
    draft_items=EXCLUDED.draft_items,
    base_revision=EXCLUDED.base_revision,
    updated_by=EXCLUDED.updated_by,
    updated_at=now();
END$$;
REVOKE ALL ON FUNCTION public.restore_website_navigation_version(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_website_navigation_version(uuid) TO authenticated;
COMMIT;
