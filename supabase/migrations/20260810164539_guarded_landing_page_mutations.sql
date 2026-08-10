-- Restore the legacy Landing Pages editor without reopening direct writes to
-- the public presentation table. Only authenticated application admins may
-- call these narrow, validated mutation endpoints.

create or replace function public.save_clinic_landing_page(
  p_id uuid,
  p_slug text,
  p_title text,
  p_description text,
  p_call_to_action text,
  p_hero_image_url text,
  p_promo_video_url text,
  p_services_list text[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_services text[];
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
  v_services := array(
    select btrim(item)
    from unnest(coalesce(p_services_list, array[]::text[])) as item
    where btrim(item) <> ''
  );

  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(p_slug) > 80 then
    raise exception 'invalid landing page slug' using errcode = '22023';
  end if;
  if p_title = '' or length(p_title) > 120 then
    raise exception 'invalid landing page title' using errcode = '22023';
  end if;
  if p_description = '' or length(p_description) > 20000 then
    raise exception 'invalid landing page description' using errcode = '22023';
  end if;
  if p_call_to_action = '' or length(p_call_to_action) > 60 then
    raise exception 'invalid landing page call to action' using errcode = '22023';
  end if;
  if cardinality(v_services) < 1 or cardinality(v_services) > 50
     or exists (select 1 from unnest(v_services) as item where length(item) > 300) then
    raise exception 'invalid landing page services list' using errcode = '22023';
  end if;
  if p_hero_image_url is not null
     and (length(p_hero_image_url) > 2048 or p_hero_image_url !~* '^https?://') then
    raise exception 'invalid landing page hero image URL' using errcode = '22023';
  end if;
  if p_promo_video_url is not null
     and (length(p_promo_video_url) > 2048 or p_promo_video_url !~* '^https?://') then
    raise exception 'invalid landing page promo video URL' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.clinic_services (
      slug, title, description, services_list, call_to_action,
      hero_image_url, promo_video_url,
      title_ms, description_ms, services_list_ms, call_to_action_ms,
      services_list_en, website_revision
    ) values (
      p_slug, p_title, p_description, v_services, p_call_to_action,
      p_hero_image_url, p_promo_video_url,
      p_title, p_description, v_services, p_call_to_action,
      array[]::text[], 1
    )
    returning id into v_id;
  else
    update public.clinic_services
    set title = p_title,
        description = p_description,
        services_list = v_services,
        call_to_action = p_call_to_action,
        hero_image_url = p_hero_image_url,
        promo_video_url = p_promo_video_url,
        title_ms = p_title,
        description_ms = p_description,
        services_list_ms = v_services,
        call_to_action_ms = p_call_to_action,
        website_revision = website_revision + 1,
        updated_at = now()
    where id = p_id and slug = p_slug
    returning id into v_id;

    if v_id is null then
      raise exception 'landing page not found or slug mismatch' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.delete_clinic_landing_page(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := (select auth.uid());
  v_slug text;
begin
  if v_actor is null or not public.is_admin(v_actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select slug into v_slug from public.clinic_services where id = p_id for update;
  if v_slug is null then
    raise exception 'landing page not found' using errcode = 'P0002';
  end if;
  if v_slug in ('rawatan-am', 'prosedur-minor', 'pemeriksaan-kesihatan') then
    raise exception 'core service pages cannot be deleted' using errcode = '22023';
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

-- Keep the table itself read-only to browser roles; mutations stay behind the
-- authenticated, role-checked functions above.
revoke insert, update, delete on table public.clinic_services from anon, authenticated;
