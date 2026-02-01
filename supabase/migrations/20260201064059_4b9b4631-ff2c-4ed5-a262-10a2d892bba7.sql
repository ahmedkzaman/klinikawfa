-- Create team-photos storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('team-photos', 'team-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to team photos
CREATE POLICY "Team photos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'team-photos');

-- Allow staff/admin to upload team photos
CREATE POLICY "Staff/Admin can upload team photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'team-photos' AND public.is_staff_or_admin(auth.uid()));

-- Allow staff/admin to update team photos
CREATE POLICY "Staff/Admin can update team photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'team-photos' AND public.is_staff_or_admin(auth.uid()));

-- Allow staff/admin to delete team photos
CREATE POLICY "Staff/Admin can delete team photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'team-photos' AND public.is_staff_or_admin(auth.uid()));