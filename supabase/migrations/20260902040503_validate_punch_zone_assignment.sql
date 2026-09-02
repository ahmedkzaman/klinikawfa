-- attendance_records: validate that a punch lands in a zone the user is
-- assigned to for the punch's logical work date. Zone/shift checks were
-- previously client-side only, so any staff member could forge a punch with a
-- direct API insert. roster_zone_assignments is admin-writable and trusted.
--
-- Behavior:
--   - User has NO assignments for the work date -> allow (legacy fallback;
--     roster-less staff keep working).
--   - Punch zone matches an assignment for the work date -> allow.
--   - Punch zone matches NO assignment -> reject with PUNCH_ZONE_MISMATCH.

create or replace function public.validate_punch_zone_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_date date;
  v_has_assignments boolean;
  v_zone_matches boolean;
begin
  -- Work date the punch belongs to; default to the punch day when unset.
  v_work_date := coalesce(NEW.logical_work_date, (NEW.punch_time at time zone 'Asia/Kuala_Lumpur')::date);

  -- Does the user have any assignment for this work date at all?
  select exists (
    select 1 from public.roster_zone_assignments r
    where r.user_id = NEW.user_id and r.work_date = v_work_date
  ) or exists (
    select 1 from public.staff_zone_assignments s
    where s.user_id = NEW.user_id and s.is_active
  ) into v_has_assignments;

  -- Legacy fallback: no assignments -> allow (matches frontend behavior).
  if not v_has_assignments then
    return NEW;
  end if;

  -- The punch's zone must match one of the user's assignments for the date.
  select exists (
    select 1 from public.roster_zone_assignments r
    where r.user_id = NEW.user_id and r.work_date = v_work_date and r.zone_id = NEW.zone_id
  ) or exists (
    select 1 from public.staff_zone_assignments s
    where s.user_id = NEW.user_id and s.is_active and s.zone_id = NEW.zone_id
  ) into v_zone_matches;

  if not v_zone_matches then
    raise exception 'PUNCH_ZONE_MISMATCH'
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

revoke all on function public.validate_punch_zone_assignment() from public;

drop trigger if exists trg_attendance_validate_zone on public.attendance_records;
create trigger trg_attendance_validate_zone before insert on public.attendance_records
for each row execute function public.validate_punch_zone_assignment();
