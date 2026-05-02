-- SERVICES: tighten SELECT, expose safe view
DROP POLICY IF EXISTS "Authenticated can read services" ON public.services;

CREATE POLICY "Cost-aware roles can read services"
ON public.services
FOR SELECT
TO authenticated
USING (public.can_view_inventory_costs(auth.uid()));

CREATE OR REPLACE VIEW public.services_safe AS
SELECT id, name, type, description, price_to_patient,
       status, category, item_code, created_at
FROM public.services;

GRANT SELECT ON public.services_safe TO authenticated;

-- PACKAGES: tighten SELECT, expose safe view
DROP POLICY IF EXISTS "Authenticated can read packages" ON public.packages;

CREATE POLICY "Cost-aware roles can read packages"
ON public.packages
FOR SELECT
TO authenticated
USING (public.can_view_inventory_costs(auth.uid()));

CREATE OR REPLACE VIEW public.packages_safe AS
SELECT id, name, stock, price, items, status, created_at
FROM public.packages;

GRANT SELECT ON public.packages_safe TO authenticated;