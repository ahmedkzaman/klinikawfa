
CREATE OR REPLACE FUNCTION public.sync_roster_zone_assignments(p_roster_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  default_zone_id uuid;
  v_month integer;
  v_year integer;
  v_data jsonb;
  v_user_ids uuid[];
  day_key text;
  day_data jsonb;
  v_shift_key text;
  shift_data jsonb;
  cell jsonb;
  staff_id uuid;
  start_t time;
  end_t time;
  work_d date;
BEGIN
  SELECT month, year, roster_data
    INTO v_month, v_year, v_data
  FROM public.saved_rosters
  WHERE id = p_roster_id;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT id INTO default_zone_id
  FROM public.geofence_zones
  WHERE is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF default_zone_id IS NULL THEN RETURN; END IF;

  SELECT array_agg(DISTINCT (cell2->>'staffId')::uuid)
    INTO v_user_ids
  FROM jsonb_each(v_data) AS day(key, value),
       jsonb_each(day.value) AS shift(key, value),
       jsonb_array_elements(
         CASE jsonb_typeof(shift.value)
           WHEN 'array'  THEN shift.value
           WHEN 'object' THEN jsonb_build_array(shift.value)
           ELSE '[]'::jsonb
         END
       ) AS cell2
  WHERE cell2 ? 'staffId'
    AND COALESCE(cell2->>'staffId','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

  IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
    DELETE FROM public.roster_zone_assignments
    WHERE source = 'roster'
      AND EXTRACT(MONTH FROM work_date) = v_month
      AND EXTRACT(YEAR  FROM work_date) = v_year
      AND user_id = ANY(v_user_ids);
  END IF;

  FOR day_key, day_data IN SELECT * FROM jsonb_each(v_data)
  LOOP
    BEGIN
      IF day_key ~ '^\d+$' THEN
        work_d := make_date(v_year, v_month, day_key::int);
      ELSIF day_key ~ '^\d{4}-\d{2}-\d{2}$' THEN
        work_d := day_key::date;
        IF EXTRACT(MONTH FROM work_d) <> v_month OR EXTRACT(YEAR FROM work_d) <> v_year THEN
          CONTINUE;
        END IF;
      ELSE
        CONTINUE;
      END IF;
    EXCEPTION WHEN OTHERS THEN CONTINUE;
    END;

    FOR v_shift_key, shift_data IN SELECT * FROM jsonb_each(day_data)
    LOOP
      CASE v_shift_key
        WHEN 'S1' THEN start_t := '08:00'; end_t := '16:00';
        WHEN 'S2' THEN start_t := '16:00'; end_t := '23:59';
        WHEN 'S3' THEN start_t := '20:00'; end_t := '23:59';
        WHEN 'DOC_S1' THEN start_t := '08:00'; end_t := '13:00';
        WHEN 'DOC_S2' THEN start_t := '14:00'; end_t := '19:00';
        WHEN 'DOC_S3' THEN start_t := '20:00'; end_t := '23:59';
        WHEN 'Daytime' THEN start_t := '08:00'; end_t := '20:00';
        WHEN 'Night' THEN start_t := '20:00'; end_t := '23:59';
        WHEN 'Hybrid' THEN start_t := '08:00'; end_t := '13:00';
        WHEN 'shift1' THEN start_t := '08:00'; end_t := '16:00';
        WHEN 'shift2' THEN start_t := '16:00'; end_t := '23:59';
        WHEN 'shift3' THEN start_t := '20:00'; end_t := '23:59';
        WHEN 'hybrid' THEN start_t := '08:00'; end_t := '13:00';
        WHEN 'daytime' THEN start_t := '08:00'; end_t := '20:00';
        WHEN 'night' THEN start_t := '20:00'; end_t := '23:59';
        ELSE start_t := '08:00'; end_t := '20:00';
      END CASE;

      IF jsonb_typeof(shift_data) = 'array' THEN
        FOR cell IN SELECT * FROM jsonb_array_elements(shift_data)
        LOOP
          BEGIN
            staff_id := NULLIF(cell->>'staffId','')::uuid;
          EXCEPTION WHEN OTHERS THEN staff_id := NULL;
          END;
          IF staff_id IS NOT NULL THEN
            INSERT INTO public.roster_zone_assignments
              (user_id, zone_id, work_date, shift_key, start_time, end_time, source)
            VALUES (staff_id, default_zone_id, work_d, v_shift_key, start_t, end_t, 'roster')
            ON CONFLICT (user_id, work_date, shift_key) DO UPDATE
              SET zone_id = EXCLUDED.zone_id,
                  start_time = EXCLUDED.start_time,
                  end_time = EXCLUDED.end_time,
                  source = 'roster';
          END IF;
        END LOOP;
      ELSIF jsonb_typeof(shift_data) = 'object' THEN
        BEGIN
          staff_id := NULLIF(shift_data->>'staffId','')::uuid;
        EXCEPTION WHEN OTHERS THEN staff_id := NULL;
        END;
        IF staff_id IS NOT NULL THEN
          INSERT INTO public.roster_zone_assignments
            (user_id, zone_id, work_date, shift_key, start_time, end_time, source)
          VALUES (staff_id, default_zone_id, work_d, v_shift_key, start_t, end_t, 'roster')
          ON CONFLICT (user_id, work_date, shift_key) DO UPDATE
            SET zone_id = EXCLUDED.zone_id,
                start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                source = 'roster';
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_roster_zone_assignments(_month integer, _year integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.saved_rosters WHERE month = _month AND year = _year LOOP
    PERFORM public.sync_roster_zone_assignments(r.id);
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_saved_rosters_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_user_ids uuid[];
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.sync_roster_zone_assignments(NEW.id);

    IF TG_OP = 'UPDATE' AND (OLD.month <> NEW.month OR OLD.year <> NEW.year) THEN
      SELECT array_agg(DISTINCT (cell2->>'staffId')::uuid)
        INTO v_user_ids
      FROM jsonb_each(OLD.roster_data) AS day(key, value),
           jsonb_each(day.value) AS shift(key, value),
           jsonb_array_elements(
             CASE jsonb_typeof(shift.value)
               WHEN 'array'  THEN shift.value
               WHEN 'object' THEN jsonb_build_array(shift.value)
               ELSE '[]'::jsonb
             END
           ) AS cell2
      WHERE cell2 ? 'staffId'
        AND COALESCE(cell2->>'staffId','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

      IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
        DELETE FROM public.roster_zone_assignments
        WHERE source = 'roster'
          AND EXTRACT(MONTH FROM work_date) = OLD.month
          AND EXTRACT(YEAR  FROM work_date) = OLD.year
          AND user_id = ANY(v_user_ids);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT (cell2->>'staffId')::uuid)
      INTO v_user_ids
    FROM jsonb_each(OLD.roster_data) AS day(key, value),
         jsonb_each(day.value) AS shift(key, value),
         jsonb_array_elements(
           CASE jsonb_typeof(shift.value)
             WHEN 'array'  THEN shift.value
             WHEN 'object' THEN jsonb_build_array(shift.value)
             ELSE '[]'::jsonb
           END
         ) AS cell2
    WHERE cell2 ? 'staffId'
      AND COALESCE(cell2->>'staffId','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

    IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
      DELETE FROM public.roster_zone_assignments
      WHERE source = 'roster'
        AND EXTRACT(MONTH FROM work_date) = OLD.month
        AND EXTRACT(YEAR  FROM work_date) = OLD.year
        AND user_id = ANY(v_user_ids);
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_roster_zone_assignments ON public.saved_rosters;
DROP TRIGGER IF EXISTS trg_saved_rosters_sync ON public.saved_rosters;

CREATE TRIGGER trg_saved_rosters_sync
AFTER INSERT OR UPDATE OR DELETE ON public.saved_rosters
FOR EACH ROW EXECUTE FUNCTION public.trg_saved_rosters_sync();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.saved_rosters LOOP
    PERFORM public.sync_roster_zone_assignments(r.id);
  END LOOP;
END $$;
