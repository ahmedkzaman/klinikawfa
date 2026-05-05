CREATE OR REPLACE FUNCTION public.trg_set_attendance_logical_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  punch_local timestamp;
  candidate record;
BEGIN
  punch_local := NEW.punch_time AT TIME ZONE 'Asia/Kuala_Lumpur';

  IF NEW.logical_work_date IS NULL THEN
    SELECT r.work_date, r.shift_key
      INTO candidate
    FROM public.roster_zone_assignments r
    WHERE r.user_id = NEW.user_id
      AND r.work_date BETWEEN (punch_local::date - 1) AND (punch_local::date + 1)
      AND punch_local BETWEEN
        (r.work_date::timestamp + r.start_time - interval '60 minutes')
        AND
        (
          CASE
            WHEN r.end_time <= r.start_time THEN r.work_date::timestamp + r.end_time + interval '1 day'
            ELSE r.work_date::timestamp + r.end_time
          END
          + interval '180 minutes'
        )
    ORDER BY
      CASE WHEN r.work_date <= punch_local::date THEN 0 ELSE 1 END,
      r.work_date DESC,
      r.start_time DESC
    LIMIT 1;

    NEW.logical_work_date := COALESCE(candidate.work_date, punch_local::date);
    NEW.shift_key := COALESCE(NEW.shift_key, candidate.shift_key);
  ELSIF NEW.shift_key IS NULL THEN
    SELECT r.shift_key
      INTO candidate
    FROM public.roster_zone_assignments r
    WHERE r.user_id = NEW.user_id
      AND r.work_date = NEW.logical_work_date
      AND punch_local BETWEEN
        (r.work_date::timestamp + r.start_time - interval '60 minutes')
        AND
        (
          CASE
            WHEN r.end_time <= r.start_time THEN r.work_date::timestamp + r.end_time + interval '1 day'
            ELSE r.work_date::timestamp + r.end_time
          END
          + interval '180 minutes'
        )
    ORDER BY r.start_time DESC
    LIMIT 1;

    NEW.shift_key := candidate.shift_key;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_attendance_logical_fields ON public.attendance_records;
CREATE TRIGGER set_attendance_logical_fields
  BEFORE INSERT ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_attendance_logical_fields();

UPDATE public.attendance_records
   SET logical_work_date = (punch_time AT TIME ZONE 'Asia/Kuala_Lumpur')::date
 WHERE logical_work_date IS NULL;