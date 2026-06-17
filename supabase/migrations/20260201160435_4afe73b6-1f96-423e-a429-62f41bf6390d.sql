-- Add policy to allow anyone to view homepage video settings
CREATE POLICY "Anyone can view homepage video settings"
ON public.app_settings
FOR SELECT
USING (key IN ('homepage_video_url', 'homepage_video_poster'));