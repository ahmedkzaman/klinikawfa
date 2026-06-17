-- Add current_offer column for reliable signaling fallback
ALTER TABLE public.video_rooms ADD COLUMN IF NOT EXISTS current_offer JSONB;