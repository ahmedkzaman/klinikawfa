ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS logical_work_date date,
  ADD COLUMN IF NOT EXISTS shift_key text;

UPDATE public.attendance_records
   SET logical_work_date = (punch_time AT TIME ZONE 'Asia/Kuala_Lumpur')::date
 WHERE logical_work_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_user_logical_date
  ON public.attendance_records (user_id, logical_work_date DESC);