-- A. Add standard_panel_price to catalog tables
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS standard_panel_price numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS standard_panel_price numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS standard_panel_price numeric(10,2) NOT NULL DEFAULT 0;

-- B. Override table
CREATE TABLE IF NOT EXISTS public.panel_price_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id uuid NOT NULL REFERENCES public.insurance_providers(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.packages(id) ON DELETE CASCADE,
  override_price numeric(10,2) NOT NULL CHECK (override_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_target_only CHECK (
    (item_id IS NOT NULL)::int +
    (service_id IS NOT NULL)::int +
    (package_id IS NOT NULL)::int = 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_panel_item
  ON public.panel_price_overrides(panel_id, item_id)
  WHERE item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_panel_service
  ON public.panel_price_overrides(panel_id, service_id)
  WHERE service_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_panel_package
  ON public.panel_price_overrides(panel_id, package_id)
  WHERE package_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ppo_item_id    ON public.panel_price_overrides(item_id)    WHERE item_id    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ppo_service_id ON public.panel_price_overrides(service_id) WHERE service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ppo_package_id ON public.panel_price_overrides(package_id) WHERE package_id IS NOT NULL;

-- C. RLS
ALTER TABLE public.panel_price_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "panel_price_overrides_read"        ON public.panel_price_overrides;
DROP POLICY IF EXISTS "panel_price_overrides_ops_insert"  ON public.panel_price_overrides;
DROP POLICY IF EXISTS "panel_price_overrides_ops_update"  ON public.panel_price_overrides;
DROP POLICY IF EXISTS "panel_price_overrides_ops_delete"  ON public.panel_price_overrides;

CREATE POLICY "panel_price_overrides_read"
  ON public.panel_price_overrides FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "panel_price_overrides_ops_insert"
  ON public.panel_price_overrides FOR INSERT TO authenticated
  WITH CHECK (is_ops_or_admin(auth.uid()));

CREATE POLICY "panel_price_overrides_ops_update"
  ON public.panel_price_overrides FOR UPDATE TO authenticated
  USING (is_ops_or_admin(auth.uid()))
  WITH CHECK (is_ops_or_admin(auth.uid()));

CREATE POLICY "panel_price_overrides_ops_delete"
  ON public.panel_price_overrides FOR DELETE TO authenticated
  USING (is_ops_or_admin(auth.uid()));

-- D. Auto-update timestamp trigger
DROP TRIGGER IF EXISTS update_panel_price_overrides_updated_at ON public.panel_price_overrides;
CREATE TRIGGER update_panel_price_overrides_updated_at
  BEFORE UPDATE ON public.panel_price_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();