begin;

create index if not exists website_service_seo_published_by_idx
on public.website_service_seo (published_by)
where published_by is not null;

drop policy if exists "Published service SEO is publicly readable"
on public.website_service_seo;
drop policy if exists "Website managers can read service SEO registry"
on public.website_service_seo;
drop policy if exists "Published service SEO is anonymously readable"
on public.website_service_seo;
drop policy if exists "Authenticated users read published or managed service SEO"
on public.website_service_seo;

create policy "Published service SEO is anonymously readable"
on public.website_service_seo for select to anon
using (published_at is not null);

create policy "Authenticated users read published or managed service SEO"
on public.website_service_seo for select to authenticated
using (published_at is not null or (select private.can_manage_website()));

commit;
