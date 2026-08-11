begin;

alter table public.website_service_seo
  add column if not exists service_id uuid
  references public.clinic_services(id) on delete cascade,
  add column if not exists aeo_ms jsonb not null default '{"answerSummary":"","faqs":[]}'::jsonb,
  add column if not exists aeo_en jsonb not null default '{"answerSummary":"","faqs":[]}'::jsonb;

create unique index if not exists website_service_seo_service_id_uidx
on public.website_service_seo(service_id)
where service_id is not null;

with mapped_services as (
  select
    service.id as service_id,
    '/services/' || case service.slug
      when 'rawatan-am' then 'rawatan-umum'
      when 'prosedur-minor' then 'prosedur-kecil'
      else service.slug
    end || '/' as path,
    coalesce(nullif(btrim(service.title_ms), ''), service.title) as label_ms,
    coalesce(nullif(btrim(service.title_en), ''), service.title) as label_en
  from public.clinic_services service
), updated as (
  update public.website_service_seo seo
  set service_id = mapped.service_id,
      label_ms = mapped.label_ms,
      label_en = mapped.label_en,
      updated_at = now()
  from mapped_services mapped
  where seo.path = mapped.path
  returning seo.id
)
insert into public.website_service_seo
  (service_id, path, label_ms, label_en, source_kind, aeo_ms, aeo_en)
select
  mapped.service_id,
  mapped.path,
  mapped.label_ms,
  mapped.label_en,
  'local_landing',
  '{"answerSummary":"","faqs":[]}'::jsonb,
  '{"answerSummary":"","faqs":[]}'::jsonb
from mapped_services mapped
on conflict (path) do update
set service_id = excluded.service_id,
    label_ms = excluded.label_ms,
    label_en = excluded.label_en,
    updated_at = now();

create or replace function private.service_aeo_payload_is_valid(p_payload jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    pg_catalog.jsonb_typeof(p_payload) = 'object'
    and (select count(*) from pg_catalog.jsonb_object_keys(p_payload)) = 2
    and p_payload ?& array['answerSummary', 'faqs']
    and pg_catalog.jsonb_typeof(p_payload->'answerSummary') = 'string'
    and pg_catalog.length(p_payload->>'answerSummary') <= 1200
    and pg_catalog.jsonb_typeof(p_payload->'faqs') = 'array'
    and pg_catalog.jsonb_array_length(p_payload->'faqs') <= 12
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_payload->'faqs') faq
      where pg_catalog.jsonb_typeof(faq) <> 'object'
         or (select count(*) from pg_catalog.jsonb_object_keys(faq)) <> 2
         or not (faq ?& array['question', 'answer'])
         or pg_catalog.jsonb_typeof(faq->'question') <> 'string'
         or pg_catalog.length(pg_catalog.btrim(faq->>'question')) not between 1 and 240
         or pg_catalog.jsonb_typeof(faq->'answer') <> 'string'
         or pg_catalog.length(pg_catalog.btrim(faq->>'answer')) not between 1 and 1200
    );
$$;

revoke all on function private.service_aeo_payload_is_valid(jsonb) from public, anon, authenticated;

create or replace function public.publish_service_seo(
  p_resource_id uuid,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := (select auth.uid());
  v_payload jsonb;
  v_base_revision integer;
  v_current_revision integer;
  v_next_revision integer;
  v_path text;
  v_ms_media_id uuid;
  v_en_media_id uuid;
  v_ms_media_path text;
  v_en_media_path text;
begin
  if v_actor is null or not private.can_manage_website() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select path, website_revision into v_path, v_current_revision
  from public.website_service_seo where id = p_resource_id for update;
  if not found then
    raise exception 'service SEO target not found' using errcode = 'P0002';
  end if;

  select draft_payload, base_revision into v_payload, v_base_revision
  from public.website_content_drafts
  where resource_type = 'service_seo' and resource_id = p_resource_id
  for update;
  if not found then
    raise exception 'service SEO draft not found' using errcode = 'P0002';
  end if;

  if v_current_revision <> p_expected_revision or v_base_revision <> p_expected_revision then
    raise exception 'stale website resource revision' using errcode = '40001';
  end if;
  if pg_catalog.jsonb_typeof(v_payload) <> 'object'
     or (select count(*) from pg_catalog.jsonb_object_keys(v_payload)) <> 8
     or not (v_payload ?& array['aeoEn','aeoMs','focusPhraseEn','focusPhraseMs','path','schemaVersion','seoEn','seoMs']) then
    raise exception 'invalid service SEO payload keys' using errcode = '22023';
  end if;
  if (v_payload->>'schemaVersion')::integer <> 2
     or v_payload->>'path' <> v_path
     or length(coalesce(v_payload->>'focusPhraseMs', '')) > 160
     or length(coalesce(v_payload->>'focusPhraseEn', '')) > 160
     or not private.website_seo_payload_is_valid(v_payload->'seoMs')
     or not private.website_seo_payload_is_valid(v_payload->'seoEn')
     or not private.service_aeo_payload_is_valid(v_payload->'aeoMs')
     or not private.service_aeo_payload_is_valid(v_payload->'aeoEn')
     or coalesce(v_payload#>>'{seoMs,canonicalUrl}', '') <> ''
     or coalesce(v_payload#>>'{seoEn,canonicalUrl}', '') <> '' then
    raise exception 'invalid service SEO payload' using errcode = '22023';
  end if;

  v_ms_media_id := nullif(v_payload#>>'{seoMs,socialImageMediaId}', '')::uuid;
  v_en_media_id := nullif(v_payload#>>'{seoEn,socialImageMediaId}', '')::uuid;
  if v_ms_media_id is not null then
    select storage_bucket || '/' || storage_path into v_ms_media_path
    from public.website_media where id = v_ms_media_id and trashed_at is null;
    if not found then raise exception 'selected Malay social image is missing or in Trash' using errcode = '23503'; end if;
  end if;
  if v_en_media_id is not null then
    select storage_bucket || '/' || storage_path into v_en_media_path
    from public.website_media where id = v_en_media_id and trashed_at is null;
    if not found then raise exception 'selected English social image is missing or in Trash' using errcode = '23503'; end if;
  end if;

  v_next_revision := v_current_revision + 1;
  update public.website_service_seo
  set focus_phrase_ms = v_payload->>'focusPhraseMs',
      focus_phrase_en = v_payload->>'focusPhraseEn',
      seo_ms = v_payload->'seoMs',
      seo_en = v_payload->'seoEn',
      aeo_ms = v_payload->'aeoMs',
      aeo_en = v_payload->'aeoEn',
      seo_ms_social_image_path = v_ms_media_path,
      seo_en_social_image_path = v_en_media_path,
      website_revision = v_next_revision,
      published_at = now(), published_by = v_actor, updated_at = now()
  where id = p_resource_id;

  insert into public.website_content_versions
    (resource_type, resource_id, revision, payload, published_by)
  values ('service_seo', p_resource_id, v_next_revision, v_payload, v_actor);

  delete from public.website_media_references
  where resource_type = 'service_seo' and resource_id = p_resource_id and field_path like 'published.%';
  if v_ms_media_id is not null then
    insert into public.website_media_references (media_id, resource_type, resource_id, field_path)
    values (v_ms_media_id, 'service_seo', p_resource_id, 'published.seoMs.socialImageMediaId');
  end if;
  if v_en_media_id is not null then
    insert into public.website_media_references (media_id, resource_type, resource_id, field_path)
    values (v_en_media_id, 'service_seo', p_resource_id, 'published.seoEn.socialImageMediaId') on conflict do nothing;
  end if;

  insert into public.website_content_lifecycle
    (resource_type, resource_id, status, revision, scheduled_at, trashed_at, updated_by, updated_at)
  values ('service_seo', p_resource_id, 'published', v_next_revision, null, null, v_actor, now())
  on conflict (resource_type, resource_id) do update
  set status = 'published', revision = excluded.revision, scheduled_at = null, trashed_at = null,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  insert into public.website_content_audit
    (resource_type, resource_id, action, from_status, to_status, revision, actor_id)
  values ('service_seo', p_resource_id, 'published', 'draft', 'published', v_next_revision, v_actor);

  delete from public.website_content_drafts
  where resource_type = 'service_seo' and resource_id = p_resource_id;
  delete from public.website_content_versions where id in (
    select id from public.website_content_versions
    where resource_type = 'service_seo' and resource_id = p_resource_id
    order by revision desc offset 20
  );

  return pg_catalog.jsonb_build_object('resourceType', 'service_seo', 'resourceId', p_resource_id, 'revision', v_next_revision);
end;
$$;

revoke all on function public.publish_service_seo(uuid, integer) from public, anon, authenticated;
grant execute on function public.publish_service_seo(uuid, integer) to authenticated;

drop function public.save_clinic_landing_page(uuid, text, text, text, text, text, text, text[]);
create function public.save_clinic_landing_page(
  p_id uuid, p_slug text, p_title text, p_description text, p_call_to_action text,
  p_hero_image_url text, p_promo_video_url text, p_services_list text[]
)
returns table (service_id uuid, seo_id uuid, created boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := (select auth.uid());
  v_service_id uuid;
  v_seo_id uuid;
  v_services text[];
  v_created boolean := p_id is null;
  v_path text;
begin
  if v_actor is null or not public.is_admin(v_actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  p_slug := btrim(coalesce(p_slug, ''));
  p_title := btrim(coalesce(p_title, ''));
  p_description := btrim(coalesce(p_description, ''));
  p_call_to_action := btrim(coalesce(p_call_to_action, ''));
  p_hero_image_url := nullif(btrim(coalesce(p_hero_image_url, '')), '');
  p_promo_video_url := nullif(btrim(coalesce(p_promo_video_url, '')), '');
  v_services := array(select btrim(item) from unnest(coalesce(p_services_list, array[]::text[])) item where btrim(item) <> '');
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(p_slug) > 80 then raise exception 'invalid landing page slug' using errcode = '22023'; end if;
  if p_title = '' or length(p_title) > 120 then raise exception 'invalid landing page title' using errcode = '22023'; end if;
  if p_description = '' or length(p_description) > 20000 then raise exception 'invalid landing page description' using errcode = '22023'; end if;
  if p_call_to_action = '' or length(p_call_to_action) > 60 then raise exception 'invalid landing page call to action' using errcode = '22023'; end if;
  if cardinality(v_services) < 1 or cardinality(v_services) > 50 or exists (select 1 from unnest(v_services) item where length(item) > 300) then raise exception 'invalid landing page services list' using errcode = '22023'; end if;
  if p_hero_image_url is not null and (length(p_hero_image_url) > 2048 or p_hero_image_url !~* '^https?://') then raise exception 'invalid landing page hero image URL' using errcode = '22023'; end if;
  if p_promo_video_url is not null and (length(p_promo_video_url) > 2048 or p_promo_video_url !~* '^https?://') then raise exception 'invalid landing page promo video URL' using errcode = '22023'; end if;

  if p_id is null then
    insert into public.clinic_services
      (slug, title, description, services_list, call_to_action, hero_image_url, promo_video_url,
       title_ms, description_ms, services_list_ms, call_to_action_ms, services_list_en, website_revision)
    values (p_slug, p_title, p_description, v_services, p_call_to_action, p_hero_image_url, p_promo_video_url,
            p_title, p_description, v_services, p_call_to_action, array[]::text[], 1)
    returning id into v_service_id;
  else
    update public.clinic_services set title = p_title, description = p_description, services_list = v_services,
      call_to_action = p_call_to_action, hero_image_url = p_hero_image_url, promo_video_url = p_promo_video_url,
      title_ms = p_title, description_ms = p_description, services_list_ms = v_services,
      call_to_action_ms = p_call_to_action, website_revision = website_revision + 1, updated_at = now()
    where id = p_id and slug = p_slug returning id into v_service_id;
    if v_service_id is null then raise exception 'landing page not found or slug mismatch' using errcode = 'P0002'; end if;
  end if;

  v_path := '/services/' || case p_slug when 'rawatan-am' then 'rawatan-umum' when 'prosedur-minor' then 'prosedur-kecil' else p_slug end || '/';
  insert into public.website_service_seo (service_id, path, label_ms, label_en, source_kind, aeo_ms, aeo_en)
  values (v_service_id, v_path, p_title, p_title, case when p_slug in ('rawatan-am','prosedur-minor','pemeriksaan-kesihatan') then 'category' else 'local_landing' end,
          '{"answerSummary":"","faqs":[]}'::jsonb, '{"answerSummary":"","faqs":[]}'::jsonb)
  on conflict (path) do update set service_id = excluded.service_id, label_ms = excluded.label_ms, updated_at = now()
  returning id into v_seo_id;

  return query select v_service_id, v_seo_id, v_created;
end;
$$;

create or replace function public.delete_clinic_landing_page(p_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog
as $$
declare v_actor uuid := (select auth.uid()); v_slug text; v_seo_id uuid;
begin
  if v_actor is null or not public.is_admin(v_actor) then raise exception 'not authorized' using errcode = '42501'; end if;
  select slug into v_slug from public.clinic_services where id = p_id for update;
  if v_slug is null then raise exception 'landing page not found' using errcode = 'P0002'; end if;
  if v_slug in ('rawatan-am', 'prosedur-minor', 'pemeriksaan-kesihatan') then raise exception 'core service pages cannot be deleted' using errcode = '22023'; end if;
  select id into v_seo_id from public.website_service_seo where service_id = p_id;
  if v_seo_id is not null then
    delete from public.website_content_drafts where resource_type = 'service_seo' and resource_id = v_seo_id;
    delete from public.website_content_lifecycle where resource_type = 'service_seo' and resource_id = v_seo_id;
    delete from public.website_media_references where resource_type = 'service_seo' and resource_id = v_seo_id;
  end if;
  delete from public.clinic_services where id = p_id;
end;
$$;

revoke all on function public.save_clinic_landing_page(uuid, text, text, text, text, text, text, text[]) from public, anon, authenticated;
revoke all on function public.delete_clinic_landing_page(uuid) from public, anon, authenticated;
grant execute on function public.save_clinic_landing_page(uuid, text, text, text, text, text, text, text[]) to authenticated;
grant execute on function public.delete_clinic_landing_page(uuid) to authenticated;
alter function public.save_clinic_landing_page(uuid, text, text, text, text, text, text, text[]) owner to postgres;
alter function public.delete_clinic_landing_page(uuid) owner to postgres;

commit;
