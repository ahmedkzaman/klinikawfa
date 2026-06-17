-- 1. Helper function: who can see cost data
CREATE OR REPLACE FUNCTION public.can_view_inventory_costs(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','special_admin','doctor_admin','operations','staff')
  )
$$;

-- 2. Drop existing permissive SELECT policies on inventory_items
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'public.inventory_items'::regclass
      AND polcmd = 'r'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_items', p.polname);
  END LOOP;
END $$;

-- 3. New restricted SELECT policy
CREATE POLICY "Cost-aware roles can read inventory"
ON public.inventory_items
FOR SELECT
TO authenticated
USING (public.can_view_inventory_costs(auth.uid()));

-- 4. Safe view (definer default — no security_invoker) so locums can read non-cost columns
CREATE OR REPLACE VIEW public.inventory_items_safe AS
SELECT
  id, name, item_code, brand, uom, category, groups, is_otc, status,
  stock, allocated_quantity, stock_amount_warning, nearest_expiry_date,
  price_to_patient_max, price_to_patient_min,
  default_indication, default_dosage_qty, default_dosage_unit,
  default_frequency, default_instruction, default_duration,
  default_duration_unit, default_precaution,
  archived_at, created_at, updated_at
FROM public.inventory_items;

GRANT SELECT ON public.inventory_items_safe TO authenticated;