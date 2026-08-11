create or replace function private.fill_missing_mykad_demographics()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_digits text;
  v_short_year integer;
  v_year integer;
  v_month integer;
  v_day integer;
  v_date date;
begin
  if coalesce(new.id_type, 'mykad') <> 'mykad' then
    return new;
  end if;

  v_digits := regexp_replace(coalesce(new.national_id, ''), '\D', '', 'g');
  if v_digits !~ '^[0-9]{12}$' then
    return new;
  end if;

  v_short_year := substring(v_digits from 1 for 2)::integer;
  v_month := substring(v_digits from 3 for 2)::integer;
  v_day := substring(v_digits from 5 for 2)::integer;
  v_year := case
    when v_short_year <= extract(year from current_date)::integer % 100
      then 2000 + v_short_year
    else 1900 + v_short_year
  end;

  begin
    v_date := make_date(v_year, v_month, v_day);
  exception when datetime_field_overflow then
    return new;
  end;

  if v_date > current_date then
    return new;
  end if;

  if new.date_of_birth is null then
    new.date_of_birth := v_date;
  end if;
  if new.gender is null or btrim(new.gender) = '' then
    new.gender := case
      when right(v_digits, 1)::integer % 2 = 0 then 'female'
      else 'male'
    end;
  end if;
  return new;
end;
$$;

revoke all on function private.fill_missing_mykad_demographics() from public;

drop trigger if exists fill_missing_mykad_demographics on public.patients;
create trigger fill_missing_mykad_demographics
before insert or update of national_id, id_type, date_of_birth, gender
on public.patients
for each row
execute function private.fill_missing_mykad_demographics();

with parsed as (
  select
    id,
    regexp_replace(national_id, '\D', '', 'g') as digits,
    case
      when substring(regexp_replace(national_id, '\D', '', 'g') from 1 for 2)::integer
        <= extract(year from current_date)::integer % 100
        then 2000
      else 1900
    end + substring(regexp_replace(national_id, '\D', '', 'g') from 1 for 2)::integer as full_year
  from public.patients
  where coalesce(id_type, 'mykad') = 'mykad'
    and regexp_replace(coalesce(national_id, ''), '\D', '', 'g') ~ '^[0-9]{12}$'
    and substring(regexp_replace(national_id, '\D', '', 'g') from 3 for 2)::integer between 1 and 12
    and substring(regexp_replace(national_id, '\D', '', 'g') from 5 for 2)::integer between 1 and 31
    and (date_of_birth is null or gender is null or btrim(gender) = '')
), derived as (
  select
    id,
    digits,
    to_date(
      full_year::text || substring(digits from 3 for 2) || substring(digits from 5 for 2),
      'YYYYMMDD'
    ) as derived_date
  from parsed
), valid as (
  select id, digits, derived_date
  from derived
  where to_char(derived_date, 'YYYYMMDD') =
    substring(derived_date::text from 1 for 4) || substring(digits from 3 for 4)
    and derived_date <= current_date
)
update public.patients as patient
set
  date_of_birth = coalesce(patient.date_of_birth, valid.derived_date),
  gender = case
    when patient.gender is null or btrim(patient.gender) = '' then
      case when right(valid.digits, 1)::integer % 2 = 0 then 'female' else 'male' end
    else patient.gender
  end
from valid
where patient.id = valid.id;
