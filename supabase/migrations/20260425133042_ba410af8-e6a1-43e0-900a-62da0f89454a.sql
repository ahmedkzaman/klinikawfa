-- Step 19: Package bundling — package_items linking table
CREATE TABLE IF NOT EXISTS public.package_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id        uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  service_id        uuid REFERENCES public.services(id) ON DELETE RESTRICT,
  item_type         varchar(20) NOT NULL CHECK (item_type IN ('service','medication')),
  quantity          numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT package_items_target_chk CHECK (
    (item_type = 'medication' AND inventory_item_id IS NOT NULL AND service_id IS NULL)
 OR (item_type = 'service'    AND service_id        IS NOT NULL AND inventory_item_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS package_items_package_id_idx ON public.package_items(package_id);

ALTER TABLE public.package_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read package_items"
  ON public.package_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "package_items_ops_insert"
  ON public.package_items FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY "package_items_ops_update"
  ON public.package_items FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY "package_items_ops_delete"
  ON public.package_items FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));