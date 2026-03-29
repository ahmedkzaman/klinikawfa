
CREATE TABLE public.staff_profile_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.staff_profile_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own profile submissions"
  ON public.staff_profile_submissions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all profile submissions"
  ON public.staff_profile_submissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_staff_profile_submissions_updated_at
  BEFORE UPDATE ON public.staff_profile_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_settings (key, value, description)
VALUES ('lateness_threshold_minutes', '15', 'Grace period in minutes before marking attendance as late')
ON CONFLICT DO NOTHING;
