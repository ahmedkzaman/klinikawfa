-- EMERGENCY ROLLBACK ONLY.
-- Restores the exact three SELECT policies captured before the review-only
-- financial-configuration hardening proposal.

BEGIN;

DROP POLICY IF EXISTS "clinic_settings_clinic_roles_read"
  ON public.clinic_settings;
DROP POLICY IF EXISTS "insurance_providers_clinic_roles_read"
  ON public.insurance_providers;
DROP POLICY IF EXISTS "payment_methods_ops_read"
  ON public.payment_methods;

DROP POLICY IF EXISTS "Authenticated can read clinic settings"
  ON public.clinic_settings;
DROP POLICY IF EXISTS "Authenticated can read insurance_providers"
  ON public.insurance_providers;
DROP POLICY IF EXISTS "payment_methods_authenticated_select"
  ON public.payment_methods;

CREATE POLICY "Authenticated can read clinic settings"
  ON public.clinic_settings
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can read insurance_providers"
  ON public.insurance_providers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payment_methods_authenticated_select"
  ON public.payment_methods
  FOR SELECT TO authenticated
  USING (true);

COMMIT;
