CREATE OR REPLACE FUNCTION public.sync_roster_zone_assignments(_month integer, _year integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  default_zone_id uuid;
  roster_row record;
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
  SELECT id INTO default_zone_id
  FROM public.geofence_zones
  WHERE is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF default_zone_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.roster_zone_assignments
  WHERE source = 'roster'
    AND EXTRACT(MONTH FROM work_date) = _month
    AND EXTRACT(YEAR FROM work_date) = _year;

  FOR roster_row IN
    SELECT roster_data FROM public.saved_rosters
    WHERE month = _month AND year = _year
  LOOP
    FOR day_key, day_data IN
      SELECT * FROM jsonb_each(roster_row.roster_data)
    LOOP
      BEGIN
        IF day_key ~ '^\d+$' THEN
          work_d := make_date(_year, _month, day_key::int);
        ELSIF day_key ~ '^\d{4}-\d{2}-\d{2}$' THEN
          work_d := day_key::date;
          IF EXTRACT(MONTH FROM work_d) <> _month OR EXTRACT(YEAR FROM work_d) <> _year THEN
            CONTINUE;
          END IF;
        ELSE
          CONTINUE;
        END IF;
      EXCEPTION WHEN OTHERS THEN CONTINUE;
      END;

      FOR v_shift_key, shift_data IN
        SELECT * FROM jsonb_each(day_data)
      LOOP
        CASE v_shift_key
          WHEN 'S1' THEN start_t := '08:00'; end_t := '16:00';
          WHEN 'S2' THEN start_t := '16:00'; end_t := '23:59';
          WHEN 'S3' THEN start_t := '20:00'; end_t := '23:59';
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
              staff_id := (cell->>'staffId')::uuid;
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
            staff_id := (shift_data->>'staffId')::uuid;
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
  END LOOP;
END;
$function$;

SELECT public.sync_roster_zone_assignments(5, 2026);
SELECT public.sync_roster_zone_assignments(4, 2026);
SELECT public.sync_roster_zone_assignments(3, 2026);