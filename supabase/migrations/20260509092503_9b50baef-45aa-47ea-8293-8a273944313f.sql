
CREATE TABLE public.punch_block_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  client_now timestamptz,
  client_tz text,
  shift_key text,
  shift_start_iso text,
  close_at_iso text,
  clock_in_late_min int,
  buffer_source text,
  roster_row_count int,
  guard_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_punch_block_log_user_attempted ON public.punch_block_log (user_id, attempted_at DESC);

ALTER TABLE public.punch_block_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own block log entries"
ON public.punch_block_log FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own block log entries"
ON public.punch_block_log FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all block log entries"
ON public.punch_block_log FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Allow admins to insert manual attendance records on behalf of any user.
-- (Existing RLS likely restricts inserts to self; this adds an admin escape hatch.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'attendance_records'
      AND policyname = 'Admins can insert attendance for any user'
  ) THEN
    CREATE POLICY "Admins can insert attendance for any user"
    ON public.attendance_records FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin(auth.uid()));
  END IF;
END $$;

-- Optional admin_note column for manual entries (nullable, additive).
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS recorded_by uuid;
