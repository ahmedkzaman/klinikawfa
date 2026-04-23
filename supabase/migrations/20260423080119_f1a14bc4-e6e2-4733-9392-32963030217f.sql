-- Migration 5: Midnight Queue Reset (B.4)

-- Ensure sequence exists
CREATE SEQUENCE IF NOT EXISTS public.queue_number_seq START 1001;

-- Drop legacy function if present
DROP FUNCTION IF EXISTS public.reset_queue_number_seq();

-- Create the safe reset
CREATE OR REPLACE FUNCTION public.safe_reset_queue_number_seq()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_active integer;
  v_next integer;
BEGIN
  SELECT COALESCE(MAX(queue_number), 0) INTO v_max_active
  FROM public.queue_entries
  WHERE deleted_at IS NULL
    AND clinic_status IN (
      'registered','ready_for_doctor','with_doctor',
      'sent_to_dispensary','dispensing_payment','on_hold'
    );

  IF v_max_active = 0 THEN
    v_next := 1001;
  ELSE
    v_next := v_max_active + 1;
  END IF;

  PERFORM setval('public.queue_number_seq', v_next, false);
END;
$$;

ALTER FUNCTION public.safe_reset_queue_number_seq() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.safe_reset_queue_number_seq() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.safe_reset_queue_number_seq() TO authenticated;