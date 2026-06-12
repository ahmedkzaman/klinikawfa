
CREATE OR REPLACE FUNCTION public.is_clinical(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('doctor_admin','resident_doctor','locum','admin','special_admin')
  )
$$;

-- patients
DROP POLICY IF EXISTS "Privileged roles can read patients" ON public.patients;
DROP POLICY IF EXISTS "Authenticated can read patients" ON public.patients;
DROP POLICY IF EXISTS patients_ops_insert  ON public.patients;
DROP POLICY IF EXISTS patients_ops_update  ON public.patients;
DROP POLICY IF EXISTS patients_ops_delete  ON public.patients;

-- consultations
DROP POLICY IF EXISTS "Authenticated can read consultations" ON public.consultations;
DROP POLICY IF EXISTS consultations_read_active            ON public.consultations;
DROP POLICY IF EXISTS consultations_special_admin_read_voided ON public.consultations;
DROP POLICY IF EXISTS consultations_ops_insert             ON public.consultations;
DROP POLICY IF EXISTS consultations_update_active          ON public.consultations;

-- vital_signs
DROP POLICY IF EXISTS "Authenticated can read vital_signs" ON public.vital_signs;
DROP POLICY IF EXISTS vital_signs_ops_insert ON public.vital_signs;
DROP POLICY IF EXISTS vital_signs_ops_update ON public.vital_signs;
DROP POLICY IF EXISTS vital_signs_ops_delete ON public.vital_signs;

-- corporate_clients
DROP POLICY IF EXISTS "Privileged roles can read corporate_clients" ON public.corporate_clients;
DROP POLICY IF EXISTS corporate_clients_staff_insert ON public.corporate_clients;
DROP POLICY IF EXISTS corporate_clients_staff_update ON public.corporate_clients;
DROP POLICY IF EXISTS corporate_clients_staff_delete ON public.corporate_clients;

-- client_invoices
DROP POLICY IF EXISTS "Strict doctors and admins can view client invoices" ON public.client_invoices;
DROP POLICY IF EXISTS client_invoices_auth_select   ON public.client_invoices;
DROP POLICY IF EXISTS client_invoices_staff_insert  ON public.client_invoices;
DROP POLICY IF EXISTS client_invoices_staff_update  ON public.client_invoices;
DROP POLICY IF EXISTS client_invoices_staff_delete  ON public.client_invoices;

-- clinic_packages
DROP POLICY IF EXISTS clinic_packages_read           ON public.clinic_packages;
DROP POLICY IF EXISTS clinic_packages_staff_insert   ON public.clinic_packages;
DROP POLICY IF EXISTS clinic_packages_staff_update   ON public.clinic_packages;
DROP POLICY IF EXISTS clinic_packages_staff_delete   ON public.clinic_packages;

-- Defensive sweep: drop any leftover `true`-qual policy on the six tables.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('patients','consultations','vital_signs',
                         'corporate_clients','client_invoices','clinic_packages')
       AND (COALESCE(qual, '') = 'true' OR COALESCE(with_check, '') = 'true')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.patients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vital_signs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_invoices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_packages   ENABLE ROW LEVEL SECURITY;

-- patients
CREATE POLICY patients_select ON public.patients
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));
CREATE POLICY patients_insert ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY patients_update ON public.patients
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY patients_delete ON public.patients
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- consultations
CREATE POLICY consultations_select ON public.consultations
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));
CREATE POLICY consultations_insert ON public.consultations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_clinical(auth.uid()));
CREATE POLICY consultations_update ON public.consultations
  FOR UPDATE TO authenticated
  USING (public.is_clinical(auth.uid()))
  WITH CHECK (public.is_clinical(auth.uid()));
CREATE POLICY consultations_delete ON public.consultations
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- vital_signs
CREATE POLICY vital_signs_select ON public.vital_signs
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));
CREATE POLICY vital_signs_insert ON public.vital_signs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY vital_signs_update ON public.vital_signs
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY vital_signs_delete ON public.vital_signs
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- corporate_clients
CREATE POLICY corporate_clients_select ON public.corporate_clients
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));
CREATE POLICY corporate_clients_insert ON public.corporate_clients
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY corporate_clients_update ON public.corporate_clients
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY corporate_clients_delete ON public.corporate_clients
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- client_invoices
CREATE POLICY client_invoices_select ON public.client_invoices
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));
CREATE POLICY client_invoices_insert ON public.client_invoices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY client_invoices_update ON public.client_invoices
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY client_invoices_delete ON public.client_invoices
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- clinic_packages
CREATE POLICY clinic_packages_select ON public.clinic_packages
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));
CREATE POLICY clinic_packages_insert ON public.clinic_packages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY clinic_packages_update ON public.clinic_packages
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY clinic_packages_delete ON public.clinic_packages
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
