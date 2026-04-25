do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='diagnoses'
      and policyname='temp_seed_insert_diagnoses'
  ) then
    execute $p$
      create policy "temp_seed_insert_diagnoses"
      on public.diagnoses
      for insert
      to anon, authenticated
      with check (true)
    $p$;
  end if;
end $$;