-- WordPress-inspired website editor foundation.
-- This migration is schema-only: it preserves all published content and does
-- not publish, trash, or delete any existing resource.

begin;

create type public.website_content_status as enum
  ('draft', 'scheduled', 'published', 'trash');

create table public.website_content_lifecycle (
  resource_type text not null check (resource_type in (
    'page', 'service', 'team_member', 'blog_post', 'gallery_image', 'review'
  )),
  resource_id uuid not null,
  status public.website_content_status not null default 'draft',
  revision integer not null default 0 check (revision >= 0),
  scheduled_at timestamptz,
  trashed_at timestamptz,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (resource_type, resource_id),
  check ((status = 'scheduled') = (scheduled_at is not null)),
  check ((status = 'trash') = (trashed_at is not null))
);

create table public.website_media (
  id uuid primary key default gen_random_uuid(),
  storage_bucket text not null default 'website-media',
  storage_path text not null unique,
  mime_type text not null check (mime_type in (
    'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'
  )),
  byte_size bigint not null check (byte_size between 1 and 26214400),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  alt_ms text not null default '',
  alt_en text not null default '',
  caption_ms text not null default '',
  caption_en text not null default '',
  description_ms text not null default '',
  description_en text not null default '',
  replaced_by uuid references public.website_media(id),
  trashed_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.website_media_references (
  media_id uuid not null references public.website_media(id) on delete restrict,
  resource_type text not null check (resource_type in (
    'page', 'service', 'team_member', 'blog_post', 'gallery_image', 'review'
  )),
  resource_id uuid not null,
  field_path text not null check (field_path ~ '^[A-Za-z0-9_.-]{1,200}$'),
  primary key (media_id, resource_type, resource_id, field_path)
);

create table public.website_media_deletion_authorizations (
  media_id uuid primary key references public.website_media(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  expires_at timestamptz not null
);

create table public.blog_tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_ms text not null check (length(btrim(name_ms)) between 1 and 100),
  name_en text not null default '' check (length(name_en) <= 100),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.blog_post_tags (
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  tag_id uuid not null references public.blog_tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

alter table public.blog_posts
add column website_editor_metadata jsonb not null default '{}'::jsonb
check (jsonb_typeof(website_editor_metadata) = 'object');

create table public.website_content_audit (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in (
    'page', 'service', 'team_member', 'blog_post', 'gallery_image', 'review', 'media'
  )),
  resource_id uuid not null,
  action text not null check (action in (
    'scheduled', 'published', 'trashed', 'restored', 'permanently_deleted',
    'media_created', 'media_updated', 'media_replaced', 'media_trashed'
  )),
  from_status public.website_content_status,
  to_status public.website_content_status,
  revision integer not null check (revision >= 0),
  actor_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create index website_content_lifecycle_status_schedule_idx
  on public.website_content_lifecycle (status, scheduled_at)
  where status = 'scheduled';
create index website_content_lifecycle_updated_idx
  on public.website_content_lifecycle (updated_at desc);
create index website_media_created_by_idx on public.website_media (created_by);
create index website_media_active_idx on public.website_media (created_at desc)
  where trashed_at is null;
create index website_media_references_resource_idx
  on public.website_media_references (resource_type, resource_id);
create index website_content_audit_resource_idx
  on public.website_content_audit (resource_type, resource_id, created_at desc);
create index website_content_audit_actor_idx
  on public.website_content_audit (actor_id, created_at desc);

-- Seed lifecycle metadata without changing any source table or public content.
insert into public.website_content_lifecycle
  (resource_type, resource_id, status, revision, scheduled_at, updated_at)
select 'page', id,
       case when status = 'published' then 'published'::public.website_content_status
            else 'draft'::public.website_content_status end,
       revision, null, updated_at
from public.website_pages
on conflict (resource_type, resource_id) do nothing;

insert into public.website_content_lifecycle
  (resource_type, resource_id, status, revision, updated_at)
select 'service', id, 'published'::public.website_content_status,
       website_revision, coalesce(updated_at, now())
from public.clinic_services
on conflict (resource_type, resource_id) do nothing;

insert into public.website_content_lifecycle
  (resource_type, resource_id, status, revision, updated_at)
select 'team_member', id,
       case when is_active then 'published'::public.website_content_status
            else 'draft'::public.website_content_status end,
       website_revision, coalesce(updated_at, now())
from public.team_members
on conflict (resource_type, resource_id) do nothing;

insert into public.website_content_lifecycle
  (resource_type, resource_id, status, revision, scheduled_at, updated_at)
select 'blog_post', id,
       case when published then 'published'::public.website_content_status
            when scheduled_at is not null then 'scheduled'::public.website_content_status
            else 'draft'::public.website_content_status end,
       website_revision,
       case when not published then scheduled_at else null end,
       coalesce(updated_at, now())
from public.blog_posts
on conflict (resource_type, resource_id) do nothing;

insert into public.website_content_lifecycle
  (resource_type, resource_id, status, revision, updated_at)
select 'gallery_image', id,
       case when is_visible then 'published'::public.website_content_status
            else 'draft'::public.website_content_status end,
       website_revision, now()
from public.gallery_images
on conflict (resource_type, resource_id) do nothing;

insert into public.website_content_lifecycle
  (resource_type, resource_id, status, revision, updated_at)
select 'review', id,
       case when status = 'published' then 'published'::public.website_content_status
            else 'draft'::public.website_content_status end,
       website_revision, updated_at
from public.website_review_presentations
on conflict (resource_type, resource_id) do nothing;

revoke all on table public.website_content_lifecycle from anon, authenticated;
revoke all on table public.website_media from anon, authenticated;
revoke all on table public.website_media_references from anon, authenticated;
revoke all on table public.website_media_deletion_authorizations from anon, authenticated;
revoke all on table public.website_content_audit from anon, authenticated;
revoke all on table public.blog_tags from anon, authenticated;
revoke all on table public.blog_post_tags from anon, authenticated;

grant select on table public.website_content_lifecycle to authenticated;
grant select, insert, update on table public.website_media to authenticated;
grant select on table public.website_media_references to authenticated;
grant select on table public.website_content_audit to authenticated;
grant select, insert, update, delete on table public.blog_tags to authenticated;
grant select, insert, delete on table public.blog_post_tags to authenticated;

-- Editors may change descriptive/lifecycle fields only. Immutable ownership,
-- bucket, path, MIME, size, and dimensions cannot be rewritten from clients.
revoke update on table public.website_media from authenticated;
grant update (
  alt_ms, alt_en, caption_ms, caption_en, description_ms, description_en,
  replaced_by, trashed_at
) on table public.website_media to authenticated;

alter table public.website_content_lifecycle enable row level security;
alter table public.website_media enable row level security;
alter table public.website_media_references enable row level security;
alter table public.website_media_deletion_authorizations enable row level security;
alter table public.website_content_audit enable row level security;
alter table public.blog_tags enable row level security;
alter table public.blog_post_tags enable row level security;

create policy "Website managers can read content lifecycle"
on public.website_content_lifecycle for select to authenticated
using ((select private.can_manage_website()));

create policy "Website managers can read media"
on public.website_media for select to authenticated
using ((select private.can_manage_website()));

create policy "Website managers can create media"
on public.website_media for insert to authenticated
with check (
  (select private.can_manage_website())
  and created_by = (select auth.uid())
  and storage_bucket = 'website-media'
);

create policy "Website managers can update media metadata"
on public.website_media for update to authenticated
using ((select private.can_manage_website()))
with check (
  (select private.can_manage_website())
  and storage_bucket = 'website-media'
);

create policy "Website managers can read media references"
on public.website_media_references for select to authenticated
using ((select private.can_manage_website()));

create policy "Website managers can read website audit"
on public.website_content_audit for select to authenticated
using ((select private.can_manage_website()));

create policy "Website managers read blog tags"
on public.blog_tags for select to authenticated
using ((select private.can_manage_website()));

create policy "Website managers create blog tags"
on public.blog_tags for insert to authenticated
with check (
  (select private.can_manage_website())
  and created_by = (select auth.uid())
);

create policy "Website managers update blog tags"
on public.blog_tags for update to authenticated
using ((select private.can_manage_website()))
with check ((select private.can_manage_website()));

create policy "Website managers delete blog tags"
on public.blog_tags for delete to authenticated
using ((select private.can_manage_website()));

create policy "Website managers manage post tags"
on public.blog_post_tags for all to authenticated
using ((select private.can_manage_website()))
with check ((select private.can_manage_website()));

create or replace function private.sync_blog_post_tags_from_draft()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  delete from public.blog_post_tags where post_id = new.id;
  insert into public.blog_post_tags (post_id, tag_id)
  select new.id, tag.id
  from public.website_content_drafts draft
  cross join lateral jsonb_array_elements_text(
    coalesce(draft.draft_payload->'tagIds', '[]'::jsonb)
  ) selected(tag_id)
  join public.blog_tags tag on tag.id::text = selected.tag_id
  where draft.resource_type = 'blog_post'
    and draft.resource_id = new.id
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function private.sync_blog_post_tags_from_draft() from public;

create trigger sync_blog_post_tags_after_publish
after insert or update of website_revision on public.blog_posts
for each row execute function private.sync_blog_post_tags_from_draft();

create or replace function private.sync_blog_post_metadata_from_draft()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_payload jsonb;
begin
  select draft_payload into v_payload
  from public.website_content_drafts
  where resource_type = 'blog_post' and resource_id = new.id;

  if v_payload is not null then
    update public.blog_posts
    set website_editor_metadata = jsonb_build_object(
      'tagIds', coalesce(v_payload->'tagIds', '[]'::jsonb),
      'authorId', v_payload->'authorId',
      'featuredImageMediaId', v_payload->'featuredImageMediaId',
      'seoMs', coalesce(v_payload->'seoMs', '{}'::jsonb),
      'seoEn', coalesce(v_payload->'seoEn', '{}'::jsonb),
      'seoMsSocialImagePath', (
        select media.storage_path from public.website_media media
        where media.id::text = v_payload#>>'{seoMs,socialImageMediaId}'
          and media.trashed_at is null
      ),
      'seoEnSocialImagePath', (
        select media.storage_path from public.website_media media
        where media.id::text = v_payload#>>'{seoEn,socialImageMediaId}'
          and media.trashed_at is null
      )
    )
    where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_blog_post_metadata_from_draft() from public;
create trigger sync_blog_post_metadata_after_publish
after insert or update of website_revision on public.blog_posts
for each row execute function private.sync_blog_post_metadata_from_draft();

-- The previous page-publishing migration intentionally used a strict schema.
-- Preserve that validator as the base contract, then extend it with the guided
-- section envelope introduced by this editor release.
alter function private.website_page_payload_is_valid(text, jsonb)
rename to website_page_base_payload_is_valid;

revoke all on function private.website_page_base_payload_is_valid(text, jsonb)
from public, anon, authenticated;

create or replace function private.website_page_sections_are_valid(p_sections jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
declare
  section jsonb;
  item jsonb;
  v_type text;
  v_key text;
  v_allowed text[];
  v_required text[];
  v_text_keys text[] := array[
    'headingMs','headingEn','bodyMs','bodyEn','contentMs','contentEn',
    'buttonLabelMs','buttonLabelEn','titleMs','titleEn'
  ];
begin
  if jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) > 40 then
    return false;
  end if;

  for section in select value from jsonb_array_elements(p_sections) loop
    if jsonb_typeof(section) <> 'object'
       or not (section ?& array['id','type','visible','spacing'])
       or coalesce(section->>'id', '') !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or jsonb_typeof(section->'visible') <> 'boolean'
       or section->>'spacing' not in ('compact','normal','spacious') then
      return false;
    end if;

    v_type := section->>'type';
    case v_type
      when 'hero' then
        v_allowed := array['id','type','visible','spacing','headingMs','headingEn','bodyMs','bodyEn','mediaId','mediaUrl','mediaAltMs','mediaAltEn','alignment'];
        v_required := array['headingMs','headingEn','bodyMs','bodyEn','mediaId','alignment'];
      when 'rich_text' then
        v_allowed := array['id','type','visible','spacing','contentMs','contentEn','alignment'];
        v_required := array['contentMs','contentEn','alignment'];
      when 'image_text' then
        v_allowed := array['id','type','visible','spacing','headingMs','headingEn','bodyMs','bodyEn','mediaId','mediaUrl','mediaAltMs','mediaAltEn','imagePosition'];
        v_required := array['headingMs','headingEn','bodyMs','bodyEn','mediaId','imagePosition'];
      when 'services', 'team', 'gallery', 'reviews' then
        v_allowed := array['id','type','visible','spacing','headingMs','headingEn','selectedIds'];
        v_required := array['headingMs','headingEn','selectedIds'];
      when 'cta' then
        v_allowed := array['id','type','visible','spacing','headingMs','headingEn','bodyMs','bodyEn','buttonLabelMs','buttonLabelEn','href','alignment'];
        v_required := array['headingMs','headingEn','bodyMs','bodyEn','buttonLabelMs','buttonLabelEn','href','alignment'];
      when 'youtube' then
        v_allowed := array['id','type','visible','spacing','titleMs','titleEn','url'];
        v_required := array['titleMs','titleEn','url'];
      when 'faq' then
        v_allowed := array['id','type','visible','spacing','headingMs','headingEn','items'];
        v_required := array['headingMs','headingEn','items'];
      when 'contact' then
        v_allowed := array['id','type','visible','spacing','headingMs','headingEn','bodyMs','bodyEn','showAddress','showHours','showPhone','showMap'];
        v_required := array['headingMs','headingEn','bodyMs','bodyEn','showAddress','showHours','showPhone','showMap'];
      else
        return false;
    end case;

    for v_key in select jsonb_object_keys(section) loop
      if not v_key = any(v_allowed) then return false; end if;
    end loop;
    foreach v_key in array v_required loop
      if not section ? v_key then return false; end if;
    end loop;
    foreach v_key in array v_text_keys loop
      if section ? v_key and (
        jsonb_typeof(section->v_key) <> 'string'
        or length(section->>v_key) > 20000
      ) then return false; end if;
    end loop;

    if section ? 'alignment' and section->>'alignment' not in ('left','center','right') then return false; end if;
    if section ? 'imagePosition' and section->>'imagePosition' not in ('left','right') then return false; end if;
    if section ? 'mediaId' and section->'mediaId' <> 'null'::jsonb
       and (jsonb_typeof(section->'mediaId') <> 'string' or section->>'mediaId' !~ '^[0-9a-f-]{36}$') then return false; end if;
    if section ? 'mediaUrl' and (
      jsonb_typeof(section->'mediaUrl') <> 'string'
      or length(section->>'mediaUrl') > 2048
      or not (
        section->>'mediaUrl' = ''
        or (
          left(section->>'mediaUrl', 1) = '/'
          and substring(section->>'mediaUrl' from 2 for 1) not in ('/', chr(92))
        )
        or section->>'mediaUrl' ~ '^https://[A-Za-z0-9]'
      )
    ) then return false; end if;
    if section ? 'href' and (
      jsonb_typeof(section->'href') <> 'string'
      or length(section->>'href') > 500
      or not (
        (
          left(section->>'href', 1) = '/'
          and substring(section->>'href' from 2 for 1) not in ('/', chr(92))
        )
        or section->>'href' ~ '^https://[A-Za-z0-9]'
      )
    ) then return false; end if;
    if v_type = 'youtube' and (
      jsonb_typeof(section->'url') <> 'string'
      or section->>'url' !~ '^https://(www\.)?(youtube\.com/|youtu\.be/)'
    ) then return false; end if;
    if section ? 'selectedIds' and (
      jsonb_typeof(section->'selectedIds') <> 'array'
      or jsonb_array_length(section->'selectedIds') > 24
      or exists (
        select 1 from jsonb_array_elements_text(section->'selectedIds') selected(id)
        where selected.id !~ '^[0-9a-f-]{36}$'
      )
    ) then return false; end if;
    if v_type = 'faq' then
      if jsonb_typeof(section->'items') <> 'array'
         or jsonb_array_length(section->'items') > 30 then return false; end if;
      for item in select value from jsonb_array_elements(section->'items') loop
        if jsonb_typeof(item) <> 'object'
           or not (item ?& array['id','questionMs','questionEn','answerMs','answerEn'])
           or (select count(*) from jsonb_object_keys(item)) <> 5
           or item->>'id' !~ '^[0-9a-f-]{36}$'
           or jsonb_typeof(item->'questionMs') <> 'string'
           or jsonb_typeof(item->'questionEn') <> 'string'
           or jsonb_typeof(item->'answerMs') <> 'string'
           or jsonb_typeof(item->'answerEn') <> 'string' then return false; end if;
      end loop;
    end if;
    if v_type = 'contact' and (
      jsonb_typeof(section->'showAddress') <> 'boolean'
      or jsonb_typeof(section->'showHours') <> 'boolean'
      or jsonb_typeof(section->'showPhone') <> 'boolean'
      or jsonb_typeof(section->'showMap') <> 'boolean'
    ) then return false; end if;
  end loop;
  return true;
end;
$$;

revoke all on function private.website_page_sections_are_valid(jsonb) from public;

create or replace function private.website_page_payload_is_valid(
  p_kind text,
  p_payload jsonb
)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if p_kind not in ('system_content', 'content') then
    return private.website_page_base_payload_is_valid(p_kind, p_payload);
  end if;

  if not private.website_page_base_payload_is_valid(
    p_kind,
    p_payload - 'sections'
  ) then
    return false;
  end if;

  if not (p_payload ? 'sections') then
    return true;
  end if;
  return private.website_page_sections_are_valid(p_payload->'sections');
end;
$$;

revoke all on function private.website_page_payload_is_valid(text, jsonb)
from public, anon;
grant execute on function private.website_page_payload_is_valid(text, jsonb)
to authenticated;

create or replace function private.sync_website_lifecycle_after_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_resource_type text := tg_argv[0];
begin
  insert into public.website_content_lifecycle
    (resource_type, resource_id, status, revision, scheduled_at, trashed_at,
     updated_by, updated_at)
  values
    (v_resource_type, new.id, 'published', new.website_revision, null, null,
     auth.uid(), now())
  on conflict (resource_type, resource_id) do update
  set status = 'published', revision = excluded.revision,
      scheduled_at = null, trashed_at = null,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  return new;
end;
$$;

revoke all on function private.sync_website_lifecycle_after_publish() from public;

create or replace function private.prevent_trashed_website_content_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if exists (
    select 1 from public.website_content_lifecycle lifecycle
    where lifecycle.resource_type = tg_argv[0]
      and lifecycle.resource_id = new.id
      and lifecycle.status = 'trash'
  ) then
    raise exception 'trashed content must be restored before publishing'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_trashed_website_content_publish() from public;

create trigger prevent_trashed_service_publish
before update of website_revision on public.clinic_services
for each row execute function private.prevent_trashed_website_content_publish('service');
create trigger prevent_trashed_team_member_publish
before insert or update of website_revision on public.team_members
for each row execute function private.prevent_trashed_website_content_publish('team_member');
create trigger prevent_trashed_blog_post_publish
before insert or update of website_revision on public.blog_posts
for each row execute function private.prevent_trashed_website_content_publish('blog_post');
create trigger prevent_trashed_gallery_image_publish
before insert or update of website_revision on public.gallery_images
for each row execute function private.prevent_trashed_website_content_publish('gallery_image');
create trigger prevent_trashed_review_publish
before insert or update of website_revision on public.website_review_presentations
for each row execute function private.prevent_trashed_website_content_publish('review');

create trigger sync_service_lifecycle_after_publish
after insert or update of website_revision on public.clinic_services
for each row execute function private.sync_website_lifecycle_after_publish('service');
create trigger sync_team_member_lifecycle_after_publish
after insert or update of website_revision on public.team_members
for each row execute function private.sync_website_lifecycle_after_publish('team_member');
create trigger sync_blog_post_lifecycle_after_publish
after insert or update of website_revision on public.blog_posts
for each row execute function private.sync_website_lifecycle_after_publish('blog_post');
create trigger sync_gallery_image_lifecycle_after_publish
after insert or update of website_revision on public.gallery_images
for each row execute function private.sync_website_lifecycle_after_publish('gallery_image');
create trigger sync_review_lifecycle_after_publish
after insert or update of website_revision on public.website_review_presentations
for each row execute function private.sync_website_lifecycle_after_publish('review');

create or replace function private.sync_page_lifecycle_after_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.website_content_lifecycle
    (resource_type, resource_id, status, revision, scheduled_at, trashed_at,
     updated_by, updated_at)
  values
    ('page', new.id, 'published', new.revision, null, null, auth.uid(), now())
  on conflict (resource_type, resource_id) do update
  set status = 'published', revision = excluded.revision,
      scheduled_at = null, trashed_at = null,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  return new;
end;
$$;

revoke all on function private.sync_page_lifecycle_after_publish() from public;
create trigger prevent_trashed_page_publish
before update of revision on public.website_pages
for each row execute function private.prevent_trashed_website_content_publish('page');
create trigger sync_page_lifecycle_after_publish
after update of revision on public.website_pages
for each row
when (new.status = 'published' and old.revision is distinct from new.revision)
execute function private.sync_page_lifecycle_after_publish();

create or replace function private.replace_website_media_references(
  p_resource_type text,
  p_resource_id uuid,
  p_payload jsonb,
  p_prefix text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  delete from public.website_media_references
  where resource_type = p_resource_type
    and resource_id = p_resource_id
    and field_path like p_prefix || '.%';

  if p_resource_type = 'blog_post' then
    if exists (
      select 1
      from (values
        (p_payload->>'featuredImageMediaId'),
        (p_payload#>>'{seoMs,socialImageMediaId}'),
        (p_payload#>>'{seoEn,socialImageMediaId}')
      ) selected(media_id)
      where nullif(selected.media_id, '') is not null
        and not exists (
          select 1 from public.website_media media
          where media.id::text = selected.media_id and media.trashed_at is null
        )
    ) then
      raise exception 'selected media is missing or in Trash' using errcode = '23503';
    end if;

    insert into public.website_media_references
      (media_id, resource_type, resource_id, field_path)
    select media.id, p_resource_type, p_resource_id, p_prefix || '.' || selected.field_path
    from (values
      ('featuredImageMediaId', p_payload->>'featuredImageMediaId'),
      ('seoMs.socialImageMediaId', p_payload#>>'{seoMs,socialImageMediaId}'),
      ('seoEn.socialImageMediaId', p_payload#>>'{seoEn,socialImageMediaId}')
    ) selected(field_path, media_id)
    join public.website_media media on media.id::text = selected.media_id
    where media.trashed_at is null
    on conflict do nothing;
  elsif p_resource_type = 'page' then
    if exists (
      select 1
      from jsonb_array_elements(coalesce(p_payload->'sections', '[]'::jsonb)) section
      where nullif(section->>'mediaId', '') is not null
        and not exists (
          select 1 from public.website_media media
          where media.id::text = section->>'mediaId' and media.trashed_at is null
        )
    ) then
      raise exception 'selected media is missing or in Trash' using errcode = '23503';
    end if;

    insert into public.website_media_references
      (media_id, resource_type, resource_id, field_path)
    select media.id, 'page', p_resource_id,
           p_prefix || '.sections.' || (section.ordinality - 1)::text || '.mediaId'
    from jsonb_array_elements(coalesce(p_payload->'sections', '[]'::jsonb))
         with ordinality section(payload, ordinality)
    join public.website_media media on media.id::text = section.payload->>'mediaId'
    where media.trashed_at is null
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function private.replace_website_media_references(text, uuid, jsonb, text)
from public;

create or replace function private.sync_website_content_media_references()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.website_media_references
    where resource_type = old.resource_type and resource_id = old.resource_id
      and field_path like 'draft.%';
    return old;
  end if;
  perform private.replace_website_media_references(
    new.resource_type, new.resource_id, new.draft_payload, 'draft'
  );
  return new;
end;
$$;

revoke all on function private.sync_website_content_media_references() from public;
create trigger sync_website_content_media_references
after insert or update of draft_payload or delete on public.website_content_drafts
for each row execute function private.sync_website_content_media_references();

create or replace function private.sync_website_page_media_references()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.website_media_references
    where resource_type = 'page' and resource_id = old.page_id
      and field_path like 'draft.%';
    return old;
  end if;
  perform private.replace_website_media_references(
    'page', new.page_id, new.draft_content, 'draft'
  );
  return new;
end;
$$;

revoke all on function private.sync_website_page_media_references() from public;
create trigger sync_website_page_media_references
after insert or update of draft_content or delete on public.website_page_drafts
for each row execute function private.sync_website_page_media_references();

create or replace function private.sync_published_resource_media_references()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.resource_type <> 'page' then
    perform private.replace_website_media_references(
      new.resource_type, new.resource_id, new.payload, 'published'
    );
  end if;
  return new;
end;
$$;

revoke all on function private.sync_published_resource_media_references() from public;
create trigger sync_published_resource_media_references
after insert on public.website_content_versions
for each row execute function private.sync_published_resource_media_references();

create or replace function private.sync_published_page_media_references()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.replace_website_media_references(
    'page', new.id, new.published_content, 'published'
  );
  return new;
end;
$$;

revoke all on function private.sync_published_page_media_references() from public;
create trigger sync_published_page_media_references
after update of revision on public.website_pages
for each row
when (old.revision is distinct from new.revision)
execute function private.sync_published_page_media_references();

create or replace function private.prevent_trash_of_referenced_website_media()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.trashed_at is null and new.trashed_at is not null
     and exists (
       select 1 from public.website_media_references reference
       where reference.media_id = new.id
     ) then
    raise exception 'media is still referenced by website content' using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_trash_of_referenced_website_media() from public;
create trigger prevent_trash_of_referenced_website_media
before update of trashed_at on public.website_media
for each row execute function private.prevent_trash_of_referenced_website_media();

create or replace function private.assert_website_content_type(p_resource_type text)
returns void
language plpgsql
immutable
set search_path = pg_catalog, public, private
as $$
begin
  if p_resource_type not in (
    'page', 'service', 'team_member', 'blog_post', 'gallery_image', 'review'
  ) then
    raise exception 'unsupported website resource type' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.assert_website_content_type(text) from public;

-- Extend the existing strict post payload contract for lifecycle, reusable
-- media, and bilingual SEO fields. Other resource contracts stay unchanged.
create or replace function private.website_seo_payload_is_valid(p_seo jsonb)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select jsonb_typeof(p_seo) = 'object'
    and (select array_agg(key order by key) from jsonb_object_keys(p_seo) key)
      = array['canonicalUrl','description','follow','index','socialDescription','socialImageMediaId','socialTitle','title']
    and jsonb_typeof(p_seo->'title') = 'string'
    and length(p_seo->>'title') <= 120
    and jsonb_typeof(p_seo->'description') = 'string'
    and length(p_seo->>'description') <= 320
    and jsonb_typeof(p_seo->'socialTitle') = 'string'
    and length(p_seo->>'socialTitle') <= 120
    and jsonb_typeof(p_seo->'socialDescription') = 'string'
    and length(p_seo->>'socialDescription') <= 320
    and jsonb_typeof(p_seo->'canonicalUrl') = 'string'
    and (
      p_seo->>'canonicalUrl' = ''
      or p_seo->>'canonicalUrl' ~ '^https://klinikawfa\.com(?:/|$)'
    )
    and jsonb_typeof(p_seo->'index') = 'boolean'
    and jsonb_typeof(p_seo->'follow') = 'boolean'
    and (
      p_seo->'socialImageMediaId' = 'null'::jsonb
      or (
        jsonb_typeof(p_seo->'socialImageMediaId') = 'string'
        and p_seo->>'socialImageMediaId' ~ '^[0-9a-f-]{36}$'
      )
    );
$$;

revoke all on function private.website_seo_payload_is_valid(jsonb) from public;

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
      if p_payload->>'slug' not in ('rawatan-am','prosedur-minor','pemeriksaan-kesihatan') then
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

create or replace function private.assert_website_manager()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.can_manage_website() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

revoke all on function private.assert_website_manager() from public;

create or replace function private.ensure_website_content_lifecycle(
  p_resource_type text,
  p_resource_id uuid,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.assert_website_content_type(p_resource_type);

  insert into public.website_content_lifecycle
    (resource_type, resource_id, status, revision, updated_by)
  select p_resource_type, p_resource_id, 'draft', 0, p_actor
  where (
    (p_resource_type = 'page' and exists (
      select 1 from public.website_page_drafts where page_id = p_resource_id
    ))
    or
    (p_resource_type <> 'page' and exists (
      select 1 from public.website_content_drafts
      where resource_type = p_resource_type and resource_id = p_resource_id
    ))
  )
  on conflict (resource_type, resource_id) do nothing;
end;
$$;

revoke all on function private.ensure_website_content_lifecycle(text, uuid, uuid)
from public;

create or replace function public.trash_website_content(
  p_resource_type text,
  p_resource_id uuid,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := private.assert_website_manager();
  v_state public.website_content_lifecycle%rowtype;
  v_next_revision integer;
begin
  perform private.assert_website_content_type(p_resource_type);
  perform private.ensure_website_content_lifecycle(p_resource_type, p_resource_id, v_actor);

  select * into v_state
  from public.website_content_lifecycle
  where resource_type = p_resource_type and resource_id = p_resource_id
  for update;

  if not found then
    raise exception 'website content not found' using errcode = 'P0002';
  end if;
  if v_state.revision <> p_expected_revision then
    raise exception 'stale website content revision' using errcode = '40001';
  end if;

  if p_resource_type = 'service' then
    raise exception 'canonical service categories cannot be moved to Trash'
      using errcode = '22023';
  elsif p_resource_type = 'page' then
    update public.website_pages set status = 'draft', updated_at = now()
    where id = p_resource_id;
  elsif p_resource_type = 'team_member' then
    update public.team_members set is_active = false, updated_at = now()
    where id = p_resource_id;
  elsif p_resource_type = 'blog_post' then
    update public.blog_posts set published = false, scheduled_at = null,
      updated_at = now()
    where id = p_resource_id;
  elsif p_resource_type = 'gallery_image' then
    update public.gallery_images set is_visible = false
    where id = p_resource_id;
  elsif p_resource_type = 'review' then
    update public.website_review_presentations set status = 'draft',
      updated_at = now()
    where id = p_resource_id;
  end if;

  -- Lifecycle actions do not create content revisions. Keeping the content
  -- revision stable lets a restored/scheduled draft publish against the exact
  -- source revision it was based on.
  v_next_revision := v_state.revision;
  update public.website_content_lifecycle
  set status = 'trash', scheduled_at = null, trashed_at = now(),
      revision = v_next_revision, updated_by = v_actor, updated_at = now()
  where resource_type = p_resource_type and resource_id = p_resource_id;

  insert into public.website_content_audit
    (resource_type, resource_id, action, from_status, to_status, revision, actor_id)
  values
    (p_resource_type, p_resource_id, 'trashed', v_state.status, 'trash', v_next_revision, v_actor);

  return jsonb_build_object('status', 'trash', 'revision', v_next_revision);
end;
$$;

create or replace function public.restore_website_content(
  p_resource_type text,
  p_resource_id uuid,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := private.assert_website_manager();
  v_state public.website_content_lifecycle%rowtype;
  v_next_revision integer;
begin
  perform private.assert_website_content_type(p_resource_type);

  select * into v_state
  from public.website_content_lifecycle
  where resource_type = p_resource_type and resource_id = p_resource_id
  for update;

  if not found then
    raise exception 'website content not found' using errcode = 'P0002';
  end if;
  if v_state.status <> 'trash' then
    raise exception 'only trashed content can be restored' using errcode = '22023';
  end if;
  if v_state.revision <> p_expected_revision then
    raise exception 'stale website content revision' using errcode = '40001';
  end if;

  v_next_revision := v_state.revision;
  update public.website_content_lifecycle
  set status = 'draft', scheduled_at = null, trashed_at = null,
      revision = v_next_revision, updated_by = v_actor, updated_at = now()
  where resource_type = p_resource_type and resource_id = p_resource_id;

  insert into public.website_content_audit
    (resource_type, resource_id, action, from_status, to_status, revision, actor_id)
  values
    (p_resource_type, p_resource_id, 'restored', 'trash', 'draft', v_next_revision, v_actor);

  return jsonb_build_object('status', 'draft', 'revision', v_next_revision);
end;
$$;

create or replace function public.schedule_website_content(
  p_resource_type text,
  p_resource_id uuid,
  p_expected_revision integer,
  p_scheduled_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := private.assert_website_manager();
  v_state public.website_content_lifecycle%rowtype;
  v_next_revision integer;
begin
  perform private.assert_website_content_type(p_resource_type);
  if p_scheduled_at is null or p_scheduled_at <= now() then
    raise exception 'scheduled time must be in the future' using errcode = '22023';
  end if;
  perform private.ensure_website_content_lifecycle(p_resource_type, p_resource_id, v_actor);

  select * into v_state
  from public.website_content_lifecycle
  where resource_type = p_resource_type and resource_id = p_resource_id
  for update;

  if not found then
    raise exception 'website content not found' using errcode = 'P0002';
  end if;
  if v_state.status = 'trash' then
    raise exception 'trashed content cannot be scheduled' using errcode = '22023';
  end if;
  if v_state.revision <> p_expected_revision then
    raise exception 'stale website content revision' using errcode = '40001';
  end if;

  if p_resource_type = 'page' then
    if not exists (
      select 1 from public.website_page_drafts
      where page_id = p_resource_id and base_revision = v_state.revision
    ) then
      raise exception 'saved draft is required before scheduling'
        using errcode = '55000';
    end if;
  elsif not exists (
    select 1 from public.website_content_drafts
    where resource_type = p_resource_type
      and resource_id = p_resource_id
      and base_revision = v_state.revision
  ) then
    raise exception 'saved draft is required before scheduling'
      using errcode = '55000';
  end if;

  v_next_revision := v_state.revision;
  update public.website_content_lifecycle
  set status = 'scheduled', scheduled_at = p_scheduled_at, trashed_at = null,
      revision = v_next_revision, updated_by = v_actor, updated_at = now()
  where resource_type = p_resource_type and resource_id = p_resource_id;

  insert into public.website_content_audit
    (resource_type, resource_id, action, from_status, to_status, revision, actor_id,
     metadata)
  values
    (p_resource_type, p_resource_id, 'scheduled', v_state.status, 'scheduled',
     v_next_revision, v_actor,
     jsonb_build_object('scheduledAt', p_scheduled_at));

  return jsonb_build_object(
    'status', 'scheduled', 'revision', v_next_revision, 'scheduledAt', p_scheduled_at
  );
end;
$$;

create or replace function public.permanently_delete_website_content(
  p_resource_type text,
  p_resource_id uuid,
  p_expected_revision integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := private.assert_website_manager();
  v_state public.website_content_lifecycle%rowtype;
begin
  perform private.assert_website_content_type(p_resource_type);

  select * into v_state
  from public.website_content_lifecycle
  where resource_type = p_resource_type and resource_id = p_resource_id
  for update;

  if not found then
    raise exception 'website content not found' using errcode = 'P0002';
  end if;
  if v_state.status <> 'trash' then
    raise exception 'content must be in Trash before permanent deletion' using errcode = '22023';
  end if;
  if v_state.revision <> p_expected_revision then
    raise exception 'stale website content revision' using errcode = '40001';
  end if;
  if exists (
    select 1 from public.website_media_references
    where resource_type = p_resource_type and resource_id = p_resource_id
  ) then
    raise exception 'content still has active media references' using errcode = '23503';
  end if;
  if p_resource_type = 'service' then
    raise exception 'canonical service categories cannot be permanently deleted'
      using errcode = '22023';
  end if;
  if p_resource_type = 'page' and not exists (
    select 1 from public.website_pages
    where id = p_resource_id and kind = 'content'
  ) then
    raise exception 'system pages cannot be permanently deleted'
      using errcode = '22023';
  end if;

  insert into public.website_content_audit
    (resource_type, resource_id, action, from_status, to_status, revision, actor_id)
  values
    (p_resource_type, p_resource_id, 'permanently_deleted', 'trash', null,
     v_state.revision + 1, v_actor);

  if p_resource_type = 'page' then
    delete from public.website_pages where id = p_resource_id and kind = 'content';
  elsif p_resource_type = 'team_member' then
    delete from public.team_members where id = p_resource_id;
  elsif p_resource_type = 'blog_post' then
    delete from public.blog_posts where id = p_resource_id;
  elsif p_resource_type = 'gallery_image' then
    delete from public.gallery_images where id = p_resource_id;
  elsif p_resource_type = 'review' then
    delete from public.website_review_presentations where id = p_resource_id;
  end if;

  delete from public.website_content_drafts
  where resource_type = p_resource_type and resource_id = p_resource_id;
  delete from public.website_content_versions
  where resource_type = p_resource_type and resource_id = p_resource_id;
  delete from public.website_content_lifecycle
  where resource_type = p_resource_type and resource_id = p_resource_id;
end;
$$;

create or replace function public.publish_due_website_content(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
  v_count integer := 0;
  v_item record;
  v_publish_result jsonb;
  v_next_revision integer;
begin
  for v_item in
    select resource_type, resource_id, revision, updated_by
    from public.website_content_lifecycle
    where status = 'scheduled' and scheduled_at <= now()
      and (
        (resource_type = 'page' and exists (
          select 1 from public.website_page_drafts page_draft
          where page_draft.page_id = website_content_lifecycle.resource_id
            and page_draft.base_revision = website_content_lifecycle.revision
        ))
        or
        (resource_type <> 'page' and exists (
          select 1 from public.website_content_drafts resource_draft
          where resource_draft.resource_type = website_content_lifecycle.resource_type
            and resource_draft.resource_id = website_content_lifecycle.resource_id
            and resource_draft.base_revision = website_content_lifecycle.revision
        ))
      )
    order by scheduled_at, resource_id
    for update skip locked
    limit v_limit
  loop
    if v_item.updated_by is null then
      raise exception 'scheduled content is missing its scheduling actor'
        using errcode = '55000';
    end if;

    -- Re-establish the website manager who approved the schedule. This function
    -- is service-role-only, and the actor is taken exclusively from the locked
    -- lifecycle row—not from the HTTP request.
    perform set_config('request.jwt.claim.sub', v_item.updated_by::text, true);

    if v_item.resource_type = 'page' then
      update public.website_page_drafts
      set publish_requested_at = now()
      where page_id = v_item.resource_id
        and base_revision = v_item.revision;
      if not found then
        raise exception 'scheduled page draft is missing or stale'
          using errcode = '40001';
      end if;
      select revision into v_next_revision
      from public.website_pages where id = v_item.resource_id;
    else
      if v_item.resource_type = 'blog_post' then
        update public.website_content_drafts
        set draft_payload = jsonb_set(
              jsonb_set(draft_payload, '{status}', '"published"'::jsonb, true),
              '{scheduledAt}', 'null'::jsonb, true
            ),
            updated_at = now()
        where resource_type = 'blog_post' and resource_id = v_item.resource_id;
        if not found then
          raise exception 'scheduled post draft is missing' using errcode = 'P0002';
        end if;
      elsif v_item.resource_type = 'review' then
        update public.website_content_drafts
        set draft_payload = jsonb_set(
              draft_payload, '{status}', '"published"'::jsonb, true
            ),
            updated_at = now()
        where resource_type = 'review' and resource_id = v_item.resource_id;
        if not found then
          raise exception 'scheduled review draft is missing' using errcode = 'P0002';
        end if;
      end if;

      v_publish_result := public.publish_website_resource(
        v_item.resource_type, v_item.resource_id, v_item.revision
      );
      v_next_revision := (v_publish_result->>'revision')::integer;
    end if;

    update public.website_content_lifecycle
    set status = 'published', scheduled_at = null, trashed_at = null,
        revision = v_next_revision, updated_by = v_item.updated_by, updated_at = now()
    where resource_type = v_item.resource_type
      and resource_id = v_item.resource_id;

    insert into public.website_content_audit
      (resource_type, resource_id, action, from_status, to_status, revision, actor_id,
       metadata)
    values
      (v_item.resource_type, v_item.resource_id, 'published', 'scheduled', 'published',
       v_next_revision, v_item.updated_by, jsonb_build_object('source', 'scheduler'));
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('published', v_count);
end;
$$;

revoke execute on function public.trash_website_content(text, uuid, integer)
from public, anon;
revoke execute on function public.restore_website_content(text, uuid, integer)
from public, anon;
revoke execute on function public.schedule_website_content(text, uuid, integer, timestamptz)
from public, anon;
revoke execute on function public.permanently_delete_website_content(text, uuid, integer)
from public, anon;

grant execute on function public.trash_website_content(text, uuid, integer)
to authenticated;
grant execute on function public.restore_website_content(text, uuid, integer)
to authenticated;
grant execute on function public.schedule_website_content(text, uuid, integer, timestamptz)
to authenticated;
grant execute on function public.permanently_delete_website_content(text, uuid, integer)
to authenticated;

revoke execute on function public.publish_due_website_content(integer)
from public, anon, authenticated;
grant execute on function public.publish_due_website_content(integer)
to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'website-media',
  'website-media',
  true,
  26214400,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Website managers upload website media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'website-media'
  and (select private.can_manage_website())
);

create or replace function private.can_delete_website_media_object(
  p_bucket_id text,
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.website_media media
    join public.website_media_deletion_authorizations deletion_auth
      on deletion_auth.media_id = media.id
    where media.storage_bucket = p_bucket_id
      and media.storage_path = p_storage_path
      and media.trashed_at is not null
      and deletion_auth.actor_id = auth.uid()
      and deletion_auth.expires_at > now()
      and not exists (
        select 1 from public.website_media_references reference
        where reference.media_id = media.id
      )
  );
$$;

revoke all on function private.can_delete_website_media_object(text, text)
from public, anon;
grant execute on function private.can_delete_website_media_object(text, text)
to authenticated;

create policy "Website managers delete website media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'website-media'
  and (select private.can_delete_website_media_object(bucket_id, name))
);

create or replace function private.prevent_website_media_restore_during_deletion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.trashed_at is not null
     and new.trashed_at is null
     and exists (
       select 1
       from public.website_media_deletion_authorizations deletion_auth
       where deletion_auth.media_id = old.id
     ) then
    raise exception 'media deletion is already in progress'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_website_media_restore_during_deletion()
from public, anon, authenticated;

create trigger prevent_website_media_restore_during_deletion
before update of trashed_at on public.website_media
for each row
execute function private.prevent_website_media_restore_during_deletion();

create or replace function public.permanently_delete_website_media(p_media_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := private.assert_website_manager();
  v_media public.website_media%rowtype;
begin
  select * into v_media
  from public.website_media
  where id = p_media_id
  for update;

  if not found then
    raise exception 'media not found' using errcode = 'P0002';
  end if;
  if v_media.trashed_at is null then
    raise exception 'media must be in Trash before permanent deletion' using errcode = '55000';
  end if;
  if exists (select 1 from public.website_media_references where media_id = p_media_id) then
    raise exception 'media is still referenced by website content' using errcode = '23503';
  end if;

  insert into public.website_media_deletion_authorizations
    (media_id, actor_id, expires_at)
  values (p_media_id, v_actor, now() + interval '2 minutes')
  on conflict (media_id) do update
  set actor_id = excluded.actor_id, expires_at = excluded.expires_at;

  return jsonb_build_object('storage_bucket', v_media.storage_bucket,
                            'storage_path', v_media.storage_path);
end;
$$;

create or replace function public.finalize_website_media_deletion(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, storage
as $$
declare
  v_actor uuid := private.assert_website_manager();
  v_media public.website_media%rowtype;
begin
  select media.* into v_media
  from public.website_media media
  join public.website_media_deletion_authorizations deletion_auth
    on deletion_auth.media_id = media.id
  where media.id = p_media_id
    and deletion_auth.actor_id = v_actor
    and deletion_auth.expires_at > now()
  for update of media;

  if not found then
    raise exception 'media deletion authorization is missing or expired'
      using errcode = '42501';
  end if;
  if v_media.trashed_at is null then
    raise exception 'media must remain in Trash during finalization'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from storage.objects object
    where object.bucket_id = v_media.storage_bucket
      and object.name = v_media.storage_path
  ) then
    raise exception 'storage object must be removed before finalization'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from public.website_media_references reference
    where reference.media_id = p_media_id
  ) then
    raise exception 'media is still referenced by website content' using errcode = '23503';
  end if;

  insert into public.website_content_audit
    (resource_type, resource_id, action, revision, actor_id, metadata)
  values
    ('media', p_media_id, 'permanently_deleted', 0, v_actor,
     jsonb_build_object('storage_bucket', v_media.storage_bucket,
                        'storage_path', v_media.storage_path));

  delete from public.website_media where id = p_media_id;
end;
$$;

create or replace function public.discard_unstored_website_media(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, storage
as $$
declare
  v_actor uuid := private.assert_website_manager();
  v_media public.website_media%rowtype;
begin
  select * into v_media
  from public.website_media
  where id = p_media_id and created_by = v_actor
  for update;

  if not found then
    raise exception 'media not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from storage.objects object
    where object.bucket_id = v_media.storage_bucket
      and object.name = v_media.storage_path
  ) then
    raise exception 'stored media cannot be discarded' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.website_media_references reference
    where reference.media_id = p_media_id
  ) then
    raise exception 'referenced media cannot be discarded' using errcode = '23503';
  end if;
  delete from public.website_media where id = p_media_id;
end;
$$;

revoke execute on function public.permanently_delete_website_media(uuid)
from public, anon;
grant execute on function public.permanently_delete_website_media(uuid)
to authenticated;
revoke execute on function public.finalize_website_media_deletion(uuid)
from public, anon;
grant execute on function public.finalize_website_media_deletion(uuid)
to authenticated;
revoke execute on function public.discard_unstored_website_media(uuid)
from public, anon;
grant execute on function public.discard_unstored_website_media(uuid)
to authenticated;

commit;
