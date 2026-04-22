-- 1. Create rate-limit log table
CREATE TABLE public.appointment_submission_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_hash text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointment_submission_log_ip_time
  ON public.appointment_submission_log (ip_hash, created_at DESC);

ALTER TABLE public.appointment_submission_log ENABLE ROW LEVEL SECURITY;

-- No policies: service role bypasses RLS; no other role should access this.

-- 2. Drop the open public INSERT policy on appointments
DROP POLICY IF EXISTS "Anyone can submit appointments" ON public.appointments;