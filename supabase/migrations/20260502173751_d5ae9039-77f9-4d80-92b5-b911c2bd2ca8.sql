
-- =====================================================
-- 1. VIDEO ROOMS: Remove public SELECT, add scoped RPC
-- =====================================================
DROP POLICY IF EXISTS "Patients can view their room by code" ON public.video_rooms;

-- RPC for anonymous patients to fetch only signaling fields by room_code
CREATE OR REPLACE FUNCTION public.get_video_room_signaling(_room_code text)
RETURNS TABLE (
  id uuid,
  room_code text,
  status text,
  deposit_amount integer,
  per_minute_rate integer,
  patient_name text,
  current_offer jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, room_code, status, deposit_amount, per_minute_rate, patient_name, current_offer
  FROM public.video_rooms
  WHERE room_code = upper(_room_code)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_video_room_signaling(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_video_room_signaling(text) TO anon, authenticated;

-- =====================================================
-- 2. VIDEO PAYMENTS: Remove public SELECT
-- =====================================================
DROP POLICY IF EXISTS "Anyone can view payment by room" ON public.video_payments;

-- =====================================================
-- 3. DAILY-REPORTS BUCKET: Private + scoped read
-- =====================================================
UPDATE storage.buckets SET public = false WHERE id = 'daily-reports';

DROP POLICY IF EXISTS "Anyone can view daily report files" ON storage.objects;

CREATE POLICY "Staff view own daily report files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'daily-reports'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins view all daily report files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'daily-reports'
  AND public.is_admin(auth.uid())
);

-- =====================================================
-- 4. CLINIC-ASSETS BUCKET: Drop over-permissive policies
-- =====================================================
DROP POLICY IF EXISTS "Authenticated can upload clinic assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update clinic assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete clinic assets" ON storage.objects;

-- =====================================================
-- 5. REALTIME.MESSAGES: Authenticated-only channel access
-- =====================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime' AND c.relname = 'messages'
  ) THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'realtime' AND tablename = 'messages'
        AND policyname = 'Authenticated users can use realtime'
    ) THEN
      EXECUTE $p$
        CREATE POLICY "Authenticated users can use realtime"
        ON realtime.messages
        FOR SELECT
        TO authenticated
        USING (true);
      $p$;
    END IF;
  END IF;
END $$;
