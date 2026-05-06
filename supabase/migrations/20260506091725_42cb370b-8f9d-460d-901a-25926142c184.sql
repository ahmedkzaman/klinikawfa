INSERT INTO public.staff_onboarding (user_id, onboarding_data, is_completed)
SELECT ur.user_id, '{}'::jsonb, false
FROM public.user_roles ur
WHERE ur.role IN ('resident_doctor','staff','operations')
  AND NOT EXISTS (SELECT 1 FROM public.staff_onboarding so WHERE so.user_id = ur.user_id)
ON CONFLICT (user_id) DO NOTHING;