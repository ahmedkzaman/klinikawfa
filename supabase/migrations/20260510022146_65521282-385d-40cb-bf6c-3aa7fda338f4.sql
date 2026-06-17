DROP POLICY IF EXISTS "Authenticated can read inventory_item_prices" ON public.inventory_item_prices;

CREATE POLICY "Cost-aware roles can read inventory_item_prices"
ON public.inventory_item_prices
FOR SELECT
TO authenticated
USING (public.can_view_inventory_costs(auth.uid()));