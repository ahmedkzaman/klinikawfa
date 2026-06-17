CREATE TABLE public.staff_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  onboarding_data JSONB DEFAULT '{}'::jsonb,
  job_description_acknowledged BOOLEAN DEFAULT false,
  job_scope_acknowledged BOOLEAN DEFAULT false,
  company_policy_acknowledged BOOLEAN DEFAULT false,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.staff_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own onboarding"
  ON public.staff_onboarding FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all onboarding"
  ON public.staff_onboarding FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));