
CREATE TABLE public.clinic_charge_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  default_amount numeric(10,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clinic_charge_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view charge types"
  ON public.clinic_charge_types FOR SELECT
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Ops/admin can insert charge types"
  ON public.clinic_charge_types FOR INSERT
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY "Ops/admin can update charge types"
  ON public.clinic_charge_types FOR UPDATE
  USING (public.is_ops_or_admin(auth.uid()));

CREATE POLICY "Ops/admin can delete charge types"
  ON public.clinic_charge_types FOR DELETE
  USING (public.is_ops_or_admin(auth.uid()));

CREATE TRIGGER update_clinic_charge_types_updated_at
  BEFORE UPDATE ON public.clinic_charge_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.clinic_charge_types (name, default_amount, is_active) VALUES
  ('Documentation Fees', 0, true),
  ('Prescription Fees', 0, true),
  ('Regulatory Compliance Charges', 0, true),
  ('Special Care Charges', 0, true),
  ('Special Procedure Charges', 0, true)
ON CONFLICT (name) DO NOTHING;
