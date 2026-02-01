-- Drop the existing check constraint and recreate with 'test' status
ALTER TABLE public.video_rooms DROP CONSTRAINT IF EXISTS video_rooms_status_check;

ALTER TABLE public.video_rooms ADD CONSTRAINT video_rooms_status_check 
CHECK (status IN ('pending', 'paid', 'test', 'active', 'ended', 'cancelled'));