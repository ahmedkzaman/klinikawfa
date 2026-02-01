-- Fix overly permissive RLS policies for video_payments
-- Payments should only be managed through edge functions with service role

DROP POLICY IF EXISTS "System can insert payments" ON public.video_payments;
DROP POLICY IF EXISTS "System can update payments" ON public.video_payments;

-- Only staff/admin can insert payments (edge functions use service role)
CREATE POLICY "Staff/Admin can insert payments"
ON public.video_payments FOR INSERT
WITH CHECK (is_staff_or_admin(auth.uid()));

-- Only staff/admin can update payments
CREATE POLICY "Staff/Admin can update payments"
ON public.video_payments FOR UPDATE
USING (is_staff_or_admin(auth.uid()));