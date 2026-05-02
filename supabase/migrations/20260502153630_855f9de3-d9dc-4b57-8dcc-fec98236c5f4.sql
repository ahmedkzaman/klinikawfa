
-- Sprint 4: Rooms status, Clinic Settings TV/Call config, Realtime publication

-- 1. Rooms: add status column for soft-disable
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

CREATE OR REPLACE FUNCTION public.trg_validate_room_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('active','inactive') THEN
    RAISE EXCEPTION 'INVALID_ROOM_STATUS: %', NEW.status USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rooms_validate ON public.rooms;
CREATE TRIGGER trg_rooms_validate
  BEFORE INSERT OR UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_room_status();

-- Allow ops/admin to mutate rooms
DROP POLICY IF EXISTS "Ops/Admin manage rooms" ON public.rooms;
CREATE POLICY "Ops/Admin manage rooms" ON public.rooms
  FOR ALL TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

-- 2. Add 'arrived' to clinic_appointment_status enum (cancelled, no_show already exist)
ALTER TYPE public.clinic_appointment_status ADD VALUE IF NOT EXISTS 'arrived';

-- 3. Clinic settings: TV and call-mode columns
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS queue_call_by text NOT NULL DEFAULT 'number',
  ADD COLUMN IF NOT EXISTS tv_youtube_id text,
  ADD COLUMN IF NOT EXISTS tv_ticker_text text;

-- Extend the existing settings validator to enforce queue_call_by domain
CREATE OR REPLACE FUNCTION public.trg_validate_clinic_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.content_margin_top IS NULL OR NEW.content_margin_top < 50 OR NEW.content_margin_top > 300 THEN
    RAISE EXCEPTION 'INVALID_CONTENT_MARGIN_TOP: must be between 50 and 300' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.logo_height_px IS NULL OR NEW.logo_height_px < 24 OR NEW.logo_height_px > 240 THEN
    RAISE EXCEPTION 'INVALID_LOGO_HEIGHT_PX: must be between 24 and 240' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.letterhead_text_px IS NULL OR NEW.letterhead_text_px < 8 OR NEW.letterhead_text_px > 32 THEN
    RAISE EXCEPTION 'INVALID_LETTERHEAD_TEXT_PX: must be between 8 and 32' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.queue_call_by NOT IN ('name','number') THEN
    RAISE EXCEPTION 'INVALID_QUEUE_CALL_BY: must be name or number' USING ERRCODE='P0001';
  END IF;
  NEW.singleton := true;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- 4. Realtime: ensure queue_entries is published with full row payload
ALTER TABLE public.queue_entries REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_entries;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
