-- Clinic Health is a staff-wide aggregate. Its authorization is checked once
-- inside the function; running every underlying scan through table RLS makes
-- the report exceed the Data API statement timeout as historical data grows.
alter function public.get_clinic_health_metrics(date, date)
  security definer;

alter function public.get_clinic_health_metrics(date, date)
  set search_path = pg_catalog, public;

revoke all on function public.get_clinic_health_metrics(date, date)
  from public, anon;
grant execute on function public.get_clinic_health_metrics(date, date)
  to authenticated;

comment on function public.get_clinic_health_metrics(date, date) is
  'Staff-authorized clinic health aggregate; SECURITY DEFINER avoids repeated per-row RLS evaluation.';
