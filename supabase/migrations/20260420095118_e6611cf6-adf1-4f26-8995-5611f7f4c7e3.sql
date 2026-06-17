
-- ============================================================
-- Auto-sync zone assignments from saved_rosters (realtime)
-- ============================================================

-- 1. Table for date-specific roster-derived assignments
CREATE TABLE IF NOT EXISTS public.roster_zone_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  zone_id uuid NOT NULL REFERENCES public.geofence_zones(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  shift_key text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  source text NOT NULL DEFAULT 'roster',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roster_zone_assignments_unique UNIQUE (user_id, work_date, shift_key)
);

CREATE INDEX IF NOT EXISTS idx_roster_zone_assignments_user_date
  ON public.roster_zone_assignments (user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_roster_zone_assignments_date
  ON public.roster_zone_assignments (work_date);

-- 2. RLS
ALTER TABLE public.roster_zone_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access roster zone assignments"
  ON public.roster_zone_assignments FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Staff can view own roster zone assignments"
  ON public.roster_zone_assignments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 3. Sync function: rebuild a month's roster-derived assignments from saved_rosters
CREATE OR REPLACE FUNCTION public.sync_roster_zone_assignments(_month int, _year int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_zone_id uuid;
  roster_row record;
  day_key text;
  day_data jsonb;
  shift_key text;
  shift_data jsonb;
  cell jsonb;
  staff_id uuid;
  start_t time;
  end_t time;
  work_d date;
BEGIN
  -- Pick the first active zone as default (single-zone clinic for now)
  SELECT id INTO default_zone_id
  FROM public.geofence_zones
  WHERE is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF default_zone_id IS NULL THEN
    RETURN; -- no zone configured
  END IF;

  -- Wipe roster-sourced rows for this month
  DELETE FROM public.roster_zone_assignments
  WHERE source = 'roster'
    AND EXTRACT(MONTH FROM work_date) = _month
    AND EXTRACT(YEAR FROM work_date) = _year;

  -- Iterate each saved roster (doctor + support) for that month
  FOR roster_row IN
    SELECT roster_data FROM public.saved_rosters
    WHERE month = _month AND year = _year
  LOOP
    -- Iterate days within this roster
    FOR day_key, day_data IN
      SELECT * FROM jsonb_each(roster_row.roster_data)
    LOOP
      -- Skip if day_key isn't a numeric day
      IF day_key !~ '^\d+$' THEN CONTINUE; END IF;
      BEGIN
        work_d := make_date(_year, _month, day_key::int);
      EXCEPTION WHEN OTHERS THEN CONTINUE;
      END;

      -- Iterate shift keys (S1, S2, S3, Daytime, Hybrid, Night, etc.)
      FOR shift_key, shift_data IN
        SELECT * FROM jsonb_each(day_data)
      LOOP
        -- Map shift key → time window
        CASE shift_key
          WHEN 'S1' THEN start_t := '08:00'; end_t := '16:00';
          WHEN 'S2' THEN start_t := '16:00'; end_t := '23:59';
          WHEN 'S3' THEN start_t := '20:00'; end_t := '23:59';
          WHEN 'Daytime' THEN start_t := '08:00'; end_t := '20:00';
          WHEN 'Night' THEN start_t := '20:00'; end_t := '23:59';
          WHEN 'Hybrid' THEN start_t := '08:00'; end_t := '13:00';
          WHEN 'shift1' THEN start_t := '08:00'; end_t := '16:00';
          WHEN 'shift2' THEN start_t := '16:00'; end_t := '23:59';
          WHEN 'hybrid' THEN start_t := '08:00'; end_t := '13:00';
          ELSE start_t := '08:00'; end_t := '20:00';
        END CASE;

        -- shift_data may be an object (single staff) or array (multiple staff)
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
              VALUES (staff_id, default_zone_id, work_d, shift_key, start_t, end_t, 'roster')
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
            VALUES (staff_id, default_zone_id, work_d, shift_key, start_t, end_t, 'roster')
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
$$;

-- 4. Trigger: re-sync the affected month whenever saved_rosters changes
CREATE OR REPLACE FUNCTION public.trg_sync_roster_zone_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_roster_zone_assignments(OLD.month, OLD.year);
    RETURN OLD;
  ELSE
    PERFORM public.sync_roster_zone_assignments(NEW.month, NEW.year);
    -- If month/year changed on update, also resync the old period
    IF TG_OP = 'UPDATE' AND (OLD.month <> NEW.month OR OLD.year <> NEW.year) THEN
      PERFORM public.sync_roster_zone_assignments(OLD.month, OLD.year);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS saved_rosters_sync_zone_assignments ON public.saved_rosters;
CREATE TRIGGER saved_rosters_sync_zone_assignments
AFTER INSERT OR UPDATE OR DELETE ON public.saved_rosters
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_roster_zone_assignments();

-- 5. Realtime publication
ALTER TABLE public.roster_zone_assignments REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'roster_zone_assignments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.roster_zone_assignments';
  END IF;
END $$;

-- 6. Backfill from existing saved_rosters
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT month, year FROM public.saved_rosters LOOP
    PERFORM public.sync_roster_zone_assignments(r.month, r.year);
  END LOOP;
END $$;
