create or replace function private.assert_website_resource_payload(
  p_resource_type text,
  p_payload jsonb
)
returns void
language plpgsql
immutable
set search_path = pg_catalog, public, private
as $$
declare
  v_allowed text[];
  v_required text[];
  v_key text;
begin
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'resource payload must be an object' using errcode = '22023';
  end if;

  case p_resource_type
    when 'service' then
      v_allowed := array['slug','titleMs','titleEn','descriptionMs','descriptionEn','ctaMs','ctaEn','servicesMs','servicesEn','heroImageUrl','promoVideoUrl'];
      v_required := array['slug','titleMs','descriptionMs','ctaMs','servicesMs'];
      if p_payload->>'slug' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
         or length(p_payload->>'slug') > 80 then
        raise exception 'invalid service slug' using errcode = '22023';
      end if;
    when 'team_member' then
      v_allowed := array['type','nameMs','nameEn','titleMs','titleEn','bioMs','bioEn','expertiseMs','expertiseEn','qualifications','yearsExperience','photoUrl','isActive','displayOrder'];
      v_required := array['type','nameMs','titleMs','bioMs','expertiseMs','qualifications','yearsExperience','isActive','displayOrder'];
    when 'blog_post' then
      v_allowed := array['slug','titleMs','titleEn','excerptMs','excerptEn','contentMs','contentEn','categoryId','tagIds','authorId','featuredImage','featuredImageMediaId','readingTime','status','scheduledAt','seoMs','seoEn'];
      v_required := array['slug','titleMs','excerptMs','contentMs','readingTime','status'];
      if p_payload->>'status' not in ('draft','scheduled','published','trash') then
        raise exception 'invalid website content status' using errcode = '22023';
      end if;
      if (p_payload->>'status' = 'scheduled') <> (nullif(p_payload->>'scheduledAt', '') is not null) then
        raise exception 'scheduledAt must be present exactly for scheduled posts' using errcode = '22023';
      end if;
      if (p_payload ? 'seoMs' and not private.website_seo_payload_is_valid(p_payload->'seoMs'))
         or (p_payload ? 'seoEn' and not private.website_seo_payload_is_valid(p_payload->'seoEn')) then
        raise exception 'invalid website SEO payload' using errcode = '22023';
      end if;
    when 'gallery_image' then
      v_allowed := array['url','altMs','altEn','tags','displayOrder','visible'];
      v_required := array['url','altMs','tags','displayOrder','visible'];
    when 'review' then
      v_allowed := array['nameMs','nameEn','reviewTextMs','reviewTextEn','rating','sourceLabel','status','displayOrder'];
      v_required := array['nameMs','reviewTextMs','rating','sourceLabel','status','displayOrder'];
    else
      raise exception 'unsupported website resource type' using errcode = '22023';
  end case;

  for v_key in select jsonb_object_keys(p_payload) loop
    if not v_key = any(v_allowed) then
      raise exception 'unknown resource payload key: %', v_key using errcode = '22023';
    end if;
  end loop;
  foreach v_key in array v_required loop
    if not p_payload ? v_key or p_payload->v_key is null
       or btrim(coalesce(p_payload->>v_key, '')) = '' then
      raise exception 'missing required resource payload key: %', v_key using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke all on function private.assert_website_resource_payload(text, jsonb) from public;
