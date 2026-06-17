-- Create videos storage bucket for homepage video
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true);

-- Allow authenticated admin/staff to upload videos
CREATE POLICY "Staff/Admin can upload videos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'videos' 
  AND is_staff_or_admin(auth.uid())
);

-- Allow authenticated admin/staff to update videos
CREATE POLICY "Staff/Admin can update videos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'videos' 
  AND is_staff_or_admin(auth.uid())
);

-- Allow authenticated admin/staff to delete videos
CREATE POLICY "Staff/Admin can delete videos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'videos' 
  AND is_staff_or_admin(auth.uid())
);

-- Allow public read access to videos
CREATE POLICY "Public can view videos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'videos');