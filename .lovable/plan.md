## Why this revision

Previous draft used `jsonb_array_elements(...)` inside a `CASE` expression. Postgres rejects set-returning functions inside `CASE` (`ERROR: set-returning functions are not allowed in CASE`). Fixed by normalizing single-object shifts into a 1-element array via `jsonb_build_array`, then unnesting in the `FROM` clause.

## Task 1 — Hardened sync function (new migration `…_rebuild_roster_sync.sql`)

`CREATE OR REPLACE FUNCTION public.sync_roster_zone_assignments(p_roster_id uuid) RETURNS void`:

1. `SELECT month, year, roster_data INTO v_month, v_year, v_data FROM public.saved_rosters WHERE id = p_roster_id;` → if not found, `RETURN;`.
2. Collect every referenced `staffId` using the SRF-safe pattern:
   ```sql
   SELECT array_agg(DISTINCT (cell->>'staffId')::uuid)
     INTO v_user_ids
   FROM jsonb_each(v_data) day,
        jsonb_each(day.value) shift,
        jsonb_array_elements(
          CASE jsonb_typeof(shift.value)
            WHEN 'array'  THEN shift.value
            WHEN 'object' THEN jsonb_build_array(shift.value)
            ELSE '[]'::jsonb
          END
        ) AS cell
   WHERE cell ? 'staffId';
   ```
3. **Targeted purge** — only this roster's users for this month/year:
   ```sql
   DELETE FROM public.roster_zone_assignments
   WHERE source = 'roster'
     AND EXTRACT(MONTH FROM work_date) = v_month
     AND EXTRACT(YEAR  FROM work_date) = v_year
     AND user_id = ANY(v_user_ids);
   ```
4. Re-insert by walking `jsonb_each(v_data) → jsonb_each(day_data) → shift_data`, with a `CASE` covering every existing legacy key (`S1/S2/S3`, `shift1/shift2/shift3`, `Daytime`, `Night`, `Hybrid`, `daytime`, `night`, `hybrid`) **plus** the new keys exactly:
   ```
   WHEN 'DOC_S1' THEN start_t := '08:00'; end_t := '13:00';
   WHEN 'DOC_S2' THEN start_t := '14:00'; end_t := '19:00';
   WHEN 'DOC_S3' THEN start_t := '20:00'; end_t := '23:59';
   ```
5. **Exact key write**: `shift_key` column receives the literal JSON key (`DOC_S1`, `shift1`, …). `ON CONFLICT (user_id, work_date, shift_key) DO UPDATE` for idempotency.
6. **Backward-compat wrapper** keeps the `(integer, integer)` signature:
   ```sql
   CREATE OR REPLACE FUNCTION public.sync_roster_zone_assignments(_month int, _year int)
   RETURNS void … AS $$
   BEGIN
     PERFORM public.sync_roster_zone_assignments(id)
       FROM public.saved_rosters WHERE month = _month AND year = _year;
   END $$;
   ```

## Task 2 — DELETE-aware trigger (SRF-safe)

Drop the stale `trg_sync_roster_zone_assignments`. Create:

```sql
CREATE OR REPLACE FUNCTION public.trg_saved_rosters_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_ids uuid[];
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.sync_roster_zone_assignments(NEW.id);

    -- If month/year changed on UPDATE, also purge the OLD scope for OLD's users
    IF TG_OP = 'UPDATE' AND (OLD.month <> NEW.month OR OLD.year <> NEW.year) THEN
      SELECT array_agg(DISTINCT (cell->>'staffId')::uuid)
        INTO v_user_ids
      FROM jsonb_each(OLD.roster_data) day,
           jsonb_each(day.value) shift,
           jsonb_array_elements(
             CASE jsonb_typeof(shift.value)
               WHEN 'array'  THEN shift.value
               WHEN 'object' THEN jsonb_build_array(shift.value)
               ELSE '[]'::jsonb
             END
           ) AS cell
      WHERE cell ? 'staffId';

      DELETE FROM public.roster_zone_assignments
        WHERE source = 'roster'
          AND EXTRACT(MONTH FROM work_date) = OLD.month
          AND EXTRACT(YEAR  FROM work_date) = OLD.year
          AND user_id = ANY(v_user_ids);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Row is gone after the delete commits; do the cleanup inline using OLD.
    SELECT array_agg(DISTINCT (cell->>'staffId')::uuid)
      INTO v_user_ids
    FROM jsonb_each(OLD.roster_data) day,
         jsonb_each(day.value) shift,
         jsonb_array_elements(
           CASE jsonb_typeof(shift.value)
             WHEN 'array'  THEN shift.value
             WHEN 'object' THEN jsonb_build_array(shift.value)
             ELSE '[]'::jsonb
           END
         ) AS cell
    WHERE cell ? 'staffId';

    DELETE FROM public.roster_zone_assignments
      WHERE source = 'roster'
        AND EXTRACT(MONTH FROM work_date) = OLD.month
        AND EXTRACT(YEAR  FROM work_date) = OLD.year
        AND user_id = ANY(v_user_ids);
    RETURN OLD;
  END IF;

  RETURN NULL;
END $$;

CREATE TRIGGER trg_saved_rosters_sync
AFTER INSERT OR UPDATE OR DELETE ON public.saved_rosters
FOR EACH ROW EXECUTE FUNCTION public.trg_saved_rosters_sync();
```

**One-time backfill** at the end of the migration:
```sql
SELECT public.sync_roster_zone_assignments(id) FROM public.saved_rosters;
```

## Task 3 — `src/pages/staff/DrRosterView.tsx`

- Translate stored JSON into 3 logical slots, accepting both legacy and new keys per day:
  - Slot 1 ← `shift1` OR `DOC_S1`
  - Slot 2 ← `shift2` OR `DOC_S2`
  - Slot 3 ← `shift3` OR `DOC_S3`
- Update row headers + sublabels:
  - **Doctor S1 (8am – 1pm)**
  - **Doctor S2 (2pm – 7pm)**
  - **Doctor S3 (8pm – 12am)**
- Render each filled cell as a coloured pill using semantic tokens:
  - S1 → `bg-primary/15 text-primary`
  - S2 → `bg-accent text-accent-foreground`
  - S3 → `bg-destructive/15 text-destructive`
- Update hours constants: `SHIFT1_HOURS = 5`, `SHIFT2_HOURS = 5`, `SHIFT3_HOURS = 4`. Existing weekly/OT logic continues to work.

No other UI files need editing — `rosterUtils.ts` and `Punch.tsx` already understand `DOC_S*`.

## Stop-and-confirm

After the migration runs and the UI is updated, I'll pause and ask you to verify:
1. Saving the Doctor roster only touches doctor users' rows; Nurse/CA rows for the same month are intact.
2. Doctors can clock in inside the new windows (08–13, 14–19, 20–24) and `attendance_records.shift_key` reads `DOC_S1/2/3`.
3. Deleting a `saved_rosters` row removes only that roster's users' assignments.
4. `/staff/dr-roster` shows the new shift labels and coloured pills.