-- Create storage bucket for gallery images
INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery', 'gallery', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Anyone can view gallery images (public bucket)
CREATE POLICY "Anyone can view gallery images"
ON storage.objects FOR SELECT
USING (bucket_id = 'gallery');

-- Policy: Staff/Admin can upload gallery images
CREATE POLICY "Staff/Admin can upload gallery images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'gallery' 
  AND public.is_staff_or_admin(auth.uid())
);

-- Policy: Staff/Admin can update gallery images
CREATE POLICY "Staff/Admin can update gallery images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'gallery' 
  AND public.is_staff_or_admin(auth.uid())
);

-- Policy: Staff/Admin can delete gallery images
CREATE POLICY "Staff/Admin can delete gallery images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'gallery' 
  AND public.is_staff_or_admin(auth.uid())
);