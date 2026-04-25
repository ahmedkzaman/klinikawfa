-- Ensure is_active column exists for the upcoming import
alter table public.diagnoses
  add column if not exists is_active boolean not null default true;

-- Idempotency guard for the bulk import (icd10_code + alias must be unique)
create unique index if not exists diagnoses_icd10_search_aliases_uidx
  on public.diagnoses (icd10_code, search_aliases);

-- Search performance
create index if not exists diagnoses_name_idx on public.diagnoses (name);
create index if not exists diagnoses_search_aliases_idx on public.diagnoses (search_aliases);
create index if not exists diagnoses_status_idx on public.diagnoses (status);

-- Public read access for active diagnoses (used by consultation combobox)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'diagnoses'
      and policyname = 'Allow public read active diagnoses'
  ) then
    execute $policy$
      create policy "Allow public read active diagnoses"
      on public.diagnoses
      for select
      to anon, authenticated
      using (
        coalesce(is_active, true) = true
        and coalesce(status, 'active') = 'active'
      )
    $policy$;
  end if;
end $$;