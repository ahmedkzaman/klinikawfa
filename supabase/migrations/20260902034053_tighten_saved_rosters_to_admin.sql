-- saved_rosters: roster editing should be admin-only, matching the frontend
-- route intent (/staff/admin/roster). Broad "Staff/Admin" write policies let
-- any HR staff (ops_staff) rewrite the whole clinic roster via a direct URL
-- or API call. Keep the read policy untouched.

drop policy if exists "Staff/Admin can insert saved rosters" on public.saved_rosters;
drop policy if exists "Staff/Admin can update saved rosters" on public.saved_rosters;
drop policy if exists "Staff/Admin can delete saved rosters" on public.saved_rosters;

create policy "Admin can insert saved rosters"
  on public.saved_rosters for insert to authenticated
  with check (is_admin((select auth.uid())));

create policy "Admin can update saved rosters"
  on public.saved_rosters for update to authenticated
  using (is_admin((select auth.uid())))
  with check (is_admin((select auth.uid())));

create policy "Admin can delete saved rosters"
  on public.saved_rosters for delete to authenticated
  using (is_admin((select auth.uid())));
