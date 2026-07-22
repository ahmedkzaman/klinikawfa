-- Require a current clinical role as well as a doctor-record relationship.
-- This prevents a user reassigned to website_editor from retaining access to
-- payments, consultation items, or visit attachments through an old doctor row.

begin;

do $$
begin
  if to_regprocedure('public.is_current_user_consultation_doctor(uuid)') is null then
    raise exception 'clinical-boundary preflight failed: consultation doctor helper is missing';
  end if;
  if to_regprocedure('public.is_clinical(uuid)') is null then
    raise exception 'clinical-boundary preflight failed: clinical role helper is missing';
  end if;
end;
$$;

create or replace function public.is_current_user_consultation_doctor(
  _consultation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_clinical(auth.uid())
    and exists (
      select 1
      from public.consultations consultation
      join public.doctors doctor on doctor.id = consultation.doctor_id
      where consultation.id = _consultation_id
        and doctor.user_id = auth.uid()
    );
$$;

revoke all on function public.is_current_user_consultation_doctor(uuid) from public;
revoke all on function public.is_current_user_consultation_doctor(uuid) from anon;
grant execute on function public.is_current_user_consultation_doctor(uuid)
to authenticated, service_role;

commit;
