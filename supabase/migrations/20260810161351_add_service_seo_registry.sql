begin;

create table public.website_service_seo (
  id uuid primary key default gen_random_uuid(),
  path text not null unique check (path ~ '^/services/[a-z0-9-]+/$'),
  label_ms text not null check (length(btrim(label_ms)) between 1 and 200),
  label_en text not null check (length(btrim(label_en)) between 1 and 200),
  source_kind text not null check (source_kind in ('category', 'local_landing')),
  focus_phrase_ms text not null default '' check (length(focus_phrase_ms) <= 160),
  focus_phrase_en text not null default '' check (length(focus_phrase_en) <= 160),
  seo_ms jsonb not null default '{}'::jsonb check (jsonb_typeof(seo_ms) = 'object'),
  seo_en jsonb not null default '{}'::jsonb check (jsonb_typeof(seo_en) = 'object'),
  seo_ms_social_image_path text,
  seo_en_social_image_path text,
  website_revision integer not null default 0 check (website_revision >= 0),
  published_at timestamptz,
  published_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.website_service_seo enable row level security;

create policy "Published service SEO is publicly readable"
on public.website_service_seo for select to anon, authenticated
using (published_at is not null);

create policy "Website managers can read service SEO registry"
on public.website_service_seo for select to authenticated
using ((select private.can_manage_website()));

revoke all on table public.website_service_seo from public, anon, authenticated;
grant select on table public.website_service_seo to anon, authenticated;
revoke insert, update, delete on table public.website_service_seo from anon, authenticated;

insert into public.website_service_seo (id, path, label_ms, label_en, source_kind)
values
  ('b9838947-9b48-4f1d-a378-21224c4b5c01', '/services/rawatan-umum/', 'Rawatan Umum & Penyakit Akut', 'General Treatment & Acute Illness', 'category'),
  ('b9838947-9b48-4f1d-a378-21224c4b5c02', '/services/prosedur-kecil/', 'Prosedur Minor & Pembedahan', 'Minor Procedures & Surgery', 'category'),
  ('b9838947-9b48-4f1d-a378-21224c4b5c03', '/services/pemeriksaan-kesihatan/', 'Pemeriksaan Kesihatan & Pekerjaan', 'Health & Employment Checkups', 'category'),
  ('b9838947-9b48-4f1d-a378-21224c4b5c04', '/services/rawatan-telinga-kuantan/', 'Rawatan Telinga Kuantan', 'Ear Treatment in Kuantan', 'local_landing'),
  ('b9838947-9b48-4f1d-a378-21224c4b5c05', '/services/minor-surgery-kutil-kuantan/', 'Pembedahan Minor & Kutil Kuantan', 'Minor Surgery & Wart Treatment in Kuantan', 'local_landing'),
  ('b9838947-9b48-4f1d-a378-21224c4b5c06', '/services/swab-test-demam-kuantan/', 'Swab Test & Demam Kuantan', 'Swab Tests & Fever Assessment in Kuantan', 'local_landing'),
  ('b9838947-9b48-4f1d-a378-21224c4b5c07', '/services/pengurusan-berat-badan-kuantan/', 'Pengurusan Berat Badan Kuantan', 'Weight Management in Kuantan', 'local_landing'),
  ('b9838947-9b48-4f1d-a378-21224c4b5c08', '/services/sunat-kuantan/', 'Sunat Kuantan', 'Circumcision in Kuantan', 'local_landing')
on conflict (path) do update
set label_ms = excluded.label_ms,
    label_en = excluded.label_en,
    source_kind = excluded.source_kind;

-- Extend the existing CMS resource discriminators without weakening their
-- established accepted values.
alter table public.website_content_drafts
  drop constraint if exists website_content_drafts_resource_type_check;
alter table public.website_content_drafts
  add constraint website_content_drafts_resource_type_check
  check (resource_type in ('service', 'service_seo', 'team_member', 'blog_post', 'gallery_image', 'review'));

alter table public.website_content_versions
  drop constraint if exists website_content_versions_resource_type_check;
alter table public.website_content_versions
  add constraint website_content_versions_resource_type_check
  check (resource_type in ('page', 'service', 'service_seo', 'team_member', 'blog_post', 'gallery_image', 'review', 'navigation'));

alter table public.website_content_lifecycle
  drop constraint if exists website_content_lifecycle_resource_type_check;
alter table public.website_content_lifecycle
  add constraint website_content_lifecycle_resource_type_check
  check (resource_type in ('page', 'service', 'service_seo', 'team_member', 'blog_post', 'gallery_image', 'review'));

alter table public.website_media_references
  drop constraint if exists website_media_references_resource_type_check;
alter table public.website_media_references
  add constraint website_media_references_resource_type_check
  check (resource_type in ('page', 'service', 'service_seo', 'team_member', 'blog_post', 'gallery_image', 'review'));

alter table public.website_content_audit
  drop constraint if exists website_content_audit_resource_type_check;
alter table public.website_content_audit
  add constraint website_content_audit_resource_type_check
  check (resource_type in ('page', 'service', 'service_seo', 'team_member', 'blog_post', 'gallery_image', 'review', 'media'));

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

  select path, website_revision
  into v_path, v_current_revision
  from public.website_service_seo
  where id = p_resource_id
  for update;
  if not found then
    raise exception 'service SEO target not found' using errcode = 'P0002';
  end if;

  select draft_payload, base_revision
  into v_payload, v_base_revision
  from public.website_content_drafts
  where resource_type = 'service_seo' and resource_id = p_resource_id
  for update;
  if not found then
    raise exception 'service SEO draft not found' using errcode = 'P0002';
  end if;

  if v_current_revision <> p_expected_revision or v_base_revision <> p_expected_revision then
    raise exception 'stale website resource revision' using errcode = '40001';
  end if;
  if jsonb_typeof(v_payload) <> 'object'
     or jsonb_object_length(v_payload) <> 5
     or not (v_payload ?& array['focusPhraseEn','focusPhraseMs','path','seoEn','seoMs']) then
    raise exception 'invalid service SEO payload keys' using errcode = '22023';
  end if;
  if v_payload->>'path' <> v_path
     or length(coalesce(v_payload->>'focusPhraseMs', '')) > 160
     or length(coalesce(v_payload->>'focusPhraseEn', '')) > 160
     or not private.website_seo_payload_is_valid(v_payload->'seoMs')
     or not private.website_seo_payload_is_valid(v_payload->'seoEn')
     or coalesce(v_payload#>>'{seoMs,canonicalUrl}', '') <> ''
     or coalesce(v_payload#>>'{seoEn,canonicalUrl}', '') <> '' then
    raise exception 'invalid service SEO payload' using errcode = '22023';
  end if;

  v_ms_media_id := nullif(v_payload#>>'{seoMs,socialImageMediaId}', '')::uuid;
  v_en_media_id := nullif(v_payload#>>'{seoEn,socialImageMediaId}', '')::uuid;

  if v_ms_media_id is not null then
    select storage_bucket || '/' || storage_path into v_ms_media_path
    from public.website_media
    where id = v_ms_media_id and trashed_at is null;
    if not found then
      raise exception 'selected Malay social image is missing or in Trash' using errcode = '23503';
    end if;
  end if;
  if v_en_media_id is not null then
    select storage_bucket || '/' || storage_path into v_en_media_path
    from public.website_media
    where id = v_en_media_id and trashed_at is null;
    if not found then
      raise exception 'selected English social image is missing or in Trash' using errcode = '23503';
    end if;
  end if;

  v_next_revision := v_current_revision + 1;
  update public.website_service_seo
  set focus_phrase_ms = v_payload->>'focusPhraseMs',
      focus_phrase_en = v_payload->>'focusPhraseEn',
      seo_ms = v_payload->'seoMs',
      seo_en = v_payload->'seoEn',
      seo_ms_social_image_path = v_ms_media_path,
      seo_en_social_image_path = v_en_media_path,
      website_revision = v_next_revision,
      published_at = now(),
      published_by = v_actor,
      updated_at = now()
  where id = p_resource_id;

  insert into public.website_content_versions
    (resource_type, resource_id, revision, payload, published_by)
  values
    ('service_seo', p_resource_id, v_next_revision, v_payload, v_actor);

  delete from public.website_media_references
  where resource_type = 'service_seo' and resource_id = p_resource_id
    and field_path like 'published.%';
  if v_ms_media_id is not null then
    insert into public.website_media_references
      (media_id, resource_type, resource_id, field_path)
    values
      (v_ms_media_id, 'service_seo', p_resource_id, 'published.seoMs.socialImageMediaId');
  end if;
  if v_en_media_id is not null then
    insert into public.website_media_references
      (media_id, resource_type, resource_id, field_path)
    values
      (v_en_media_id, 'service_seo', p_resource_id, 'published.seoEn.socialImageMediaId')
    on conflict do nothing;
  end if;

  insert into public.website_content_lifecycle
    (resource_type, resource_id, status, revision, scheduled_at, trashed_at, updated_by, updated_at)
  values
    ('service_seo', p_resource_id, 'published', v_next_revision, null, null, v_actor, now())
  on conflict (resource_type, resource_id) do update
  set status = 'published', revision = excluded.revision,
      scheduled_at = null, trashed_at = null,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  insert into public.website_content_audit
    (resource_type, resource_id, action, from_status, to_status, revision, actor_id)
  values
    ('service_seo', p_resource_id, 'published', 'draft', 'published', v_next_revision, v_actor);

  delete from public.website_content_drafts
  where resource_type = 'service_seo' and resource_id = p_resource_id;

  delete from public.website_content_versions
  where id in (
    select id from public.website_content_versions
    where resource_type = 'service_seo' and resource_id = p_resource_id
    order by revision desc
    offset 20
  );

  return jsonb_build_object(
    'resourceType', 'service_seo',
    'resourceId', p_resource_id,
    'revision', v_next_revision
  );
end;
$$;

revoke all on function public.publish_service_seo(uuid, integer) from public, anon;
grant execute on function public.publish_service_seo(uuid, integer) to authenticated;

commit;
