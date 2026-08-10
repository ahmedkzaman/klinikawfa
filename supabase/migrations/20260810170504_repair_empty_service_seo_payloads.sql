begin;

-- The registry was originally seeded with empty JSON objects, while the
-- editor contract requires every SEO field to be present. Fill only missing
-- keys so any metadata already entered remains unchanged.
alter table public.website_service_seo
  alter column seo_ms set default jsonb_build_object(
    'title', '',
    'description', '',
    'canonicalUrl', '',
    'socialTitle', '',
    'socialDescription', '',
    'socialImageMediaId', null,
    'index', true,
    'follow', true
  ),
  alter column seo_en set default jsonb_build_object(
    'title', '',
    'description', '',
    'canonicalUrl', '',
    'socialTitle', '',
    'socialDescription', '',
    'socialImageMediaId', null,
    'index', true,
    'follow', true
  );

update public.website_service_seo
set seo_ms = jsonb_build_object(
      'title', '',
      'description', '',
      'canonicalUrl', '',
      'socialTitle', '',
      'socialDescription', '',
      'socialImageMediaId', null,
      'index', true,
      'follow', true
    ) || seo_ms,
    seo_en = jsonb_build_object(
      'title', '',
      'description', '',
      'canonicalUrl', '',
      'socialTitle', '',
      'socialDescription', '',
      'socialImageMediaId', null,
      'index', true,
      'follow', true
    ) || seo_en,
    updated_at = now()
where not (
  seo_ms ?& array['title', 'description', 'canonicalUrl', 'socialTitle', 'socialDescription', 'socialImageMediaId', 'index', 'follow']
  and seo_en ?& array['title', 'description', 'canonicalUrl', 'socialTitle', 'socialDescription', 'socialImageMediaId', 'index', 'follow']
);

commit;
