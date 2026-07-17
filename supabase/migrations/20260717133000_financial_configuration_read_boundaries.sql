-- Restricts financial-configuration data to the clinic roles that need it.
-- Approved after sanitized-staging role-matrix validation on 2026-07-17.
-- No rows or user-facing content are changed.

BEGIN;

DO $preflight$
DECLARE
  actual text[];
  expected_old text[] := ARRAY[
    'clinic_settings|Authenticated can read clinic settings|{authenticated}|PERMISSIVE|SELECT|true|',
    'insurance_providers|Authenticated can read insurance_providers|{authenticated}|PERMISSIVE|SELECT|true|',
    'payment_methods|payment_methods_authenticated_select|{authenticated}|PERMISSIVE|SELECT|true|'
  ];
  expected_final text[] := ARRAY[
    'clinic_settings|clinic_settings_clinic_roles_read|{authenticated}|PERMISSIVE|SELECT|is_staff_or_clinicalauth.uid|',
    'insurance_providers|insurance_providers_clinic_roles_read|{authenticated}|PERMISSIVE|SELECT|is_staff_or_clinicalauth.uid|',
    'payment_methods|payment_methods_ops_read|{authenticated}|PERMISSIVE|SELECT|is_ops_or_adminauth.uid|'
  ];
BEGIN
  SELECT array_agg(
      tablename || '|' || policyname || '|' || roles::text || '|' ||
      permissive || '|' || cmd || '|' ||
      regexp_replace(lower(coalesce(qual, '')), '[[:space:]()]', '', 'g') || '|' ||
      regexp_replace(lower(coalesce(with_check, '')), '[[:space:]()]', '', 'g')
      ORDER BY tablename, policyname
    )
    INTO actual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('clinic_settings', 'insurance_providers', 'payment_methods')
     AND cmd = 'SELECT';

  IF actual IS DISTINCT FROM expected_old AND actual IS DISTINCT FROM expected_final THEN
    RAISE EXCEPTION 'financial-config preflight failed; SELECT-policy inventory drifted: %', actual;
  END IF;
END
$preflight$;

DROP POLICY IF EXISTS "Authenticated can read clinic settings"
  ON public.clinic_settings;
DROP POLICY IF EXISTS "Authenticated can read insurance_providers"
  ON public.insurance_providers;
DROP POLICY IF EXISTS "payment_methods_authenticated_select"
  ON public.payment_methods;

-- Remove the final names as well so the migration converges safely when the
-- SQL was applied manually before migration-history synchronization.
DROP POLICY IF EXISTS "clinic_settings_clinic_roles_read"
  ON public.clinic_settings;
DROP POLICY IF EXISTS "insurance_providers_clinic_roles_read"
  ON public.insurance_providers;
DROP POLICY IF EXISTS "payment_methods_ops_read"
  ON public.payment_methods;

-- Clinic identity is used on labels and documents across clinic roles. This
-- excludes guest/unassigned accounts while preserving legitimate clinical
-- and operations workflows.
CREATE POLICY "clinic_settings_clinic_roles_read"
  ON public.clinic_settings
  FOR SELECT TO authenticated
  USING (public.is_staff_or_clinical(auth.uid()));

-- Clinical and operations workflows need panel identity and status. The role
-- check blocks guest/unassigned accounts from reading the full row, including
-- tax identifiers and negotiated terms.
CREATE POLICY "insurance_providers_clinic_roles_read"
  ON public.insurance_providers
  FOR SELECT TO authenticated
  USING (public.is_staff_or_clinical(auth.uid()));

-- Payment-provider account details are only required by checkout/settings
-- workflows, both of which are operations/admin routes.
CREATE POLICY "payment_methods_ops_read"
  ON public.payment_methods
  FOR SELECT TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

DO $postflight$
DECLARE
  actual text[];
  expected text[] := ARRAY[
    'clinic_settings|clinic_settings_clinic_roles_read|{authenticated}|PERMISSIVE|SELECT|is_staff_or_clinicalauth.uid|',
    'insurance_providers|insurance_providers_clinic_roles_read|{authenticated}|PERMISSIVE|SELECT|is_staff_or_clinicalauth.uid|',
    'payment_methods|payment_methods_ops_read|{authenticated}|PERMISSIVE|SELECT|is_ops_or_adminauth.uid|'
  ];
  blanket_count integer;
BEGIN
  SELECT array_agg(
      tablename || '|' || policyname || '|' || roles::text || '|' ||
      permissive || '|' || cmd || '|' ||
      regexp_replace(lower(coalesce(qual, '')), '[[:space:]()]', '', 'g') || '|' ||
      regexp_replace(lower(coalesce(with_check, '')), '[[:space:]()]', '', 'g')
      ORDER BY tablename, policyname
    )
    INTO actual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('clinic_settings', 'insurance_providers', 'payment_methods')
     AND cmd = 'SELECT';

  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'financial-config postflight failed; expected %, got %', expected, actual;
  END IF;

  SELECT count(*)
    INTO blanket_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('clinic_settings', 'insurance_providers', 'payment_methods')
     AND cmd = 'SELECT'
     AND regexp_replace(lower(coalesce(qual, '')), '[[:space:]()]', '', 'g') = 'true';

  IF blanket_count <> 0 THEN
    RAISE EXCEPTION 'financial-config postflight failed: % blanket SELECT policy(ies) remain', blanket_count;
  END IF;
END
$postflight$;

COMMIT;
