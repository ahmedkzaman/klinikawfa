DROP POLICY IF EXISTS "Authenticated can read stock_take_counts" ON public.stock_take_counts;

CREATE POLICY "Cost-aware roles can read stock_take_counts"
ON public.stock_take_counts
FOR SELECT
TO authenticated
USING (public.can_view_inventory_costs(auth.uid()));