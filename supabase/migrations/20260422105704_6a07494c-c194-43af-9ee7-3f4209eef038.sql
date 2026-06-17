-- 1. Enable pg_cron only (no pg_net needed - cleanup is local SQL)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Cleanup function for old log rows
CREATE OR REPLACE FUNCTION public.cleanup_appointment_submission_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.appointment_submission_log
  WHERE created_at < now() - interval '24 hours';
END;
$$;

-- 3. Schedule daily cleanup at 03:00 UTC
DO $$
BEGIN
  -- Unschedule first if exists (idempotent)
  PERFORM cron.unschedule('cleanup-appointment-submission-log')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cleanup-appointment-submission-log'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'cleanup-appointment-submission-log',
  '0 3 * * *',
  $$SELECT public.cleanup_appointment_submission_log()$$
);

-- 4. Atomic RPC: rate-limit check + log insert + appointment insert
CREATE OR REPLACE FUNCTION public.record_appointment_submission(
  _ip_hash text,
  _name text,
  _phone text,
  _service text,
  _preferred_date date,
  _preferred_time time,
  _message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_id uuid;
BEGIN
  -- Serialize concurrent calls from the same IP for this transaction
  PERFORM pg_advisory_xact_lock(hashtext(_ip_hash));

  -- Count submissions in the last 10 minutes for this IP
  SELECT count(*) INTO v_count
  FROM public.appointment_submission_log
  WHERE ip_hash = _ip_hash
    AND created_at > now() - interval '10 minutes';

  IF v_count >= 10 THEN
    RAISE EXCEPTION 'RATE_LIMIT' USING ERRCODE = 'P0001';
  END IF;

  -- Log this submission
  INSERT INTO public.appointment_submission_log (ip_hash)
  VALUES (_ip_hash);

  -- Insert appointment (atomic with the log insert)
  INSERT INTO public.appointments (name, phone, service, preferred_date, preferred_time, message)
  VALUES (_name, _phone, _service, _preferred_date, _preferred_time, _message)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 5. Allow anon and authenticated to call the RPC (definer privileges handle the writes)
GRANT EXECUTE ON FUNCTION public.record_appointment_submission(text, text, text, text, date, time, text) TO anon, authenticated;