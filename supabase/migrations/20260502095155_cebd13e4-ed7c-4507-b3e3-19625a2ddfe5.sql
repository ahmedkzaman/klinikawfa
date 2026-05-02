-- 1. Vendor Invoices
DROP POLICY IF EXISTS "vendor_invoices_ops_insert" ON public.vendor_invoices;
DROP POLICY IF EXISTS "vendor_invoices_ops_update" ON public.vendor_invoices;
DROP POLICY IF EXISTS "vendor_invoices_ops_delete" ON public.vendor_invoices;

CREATE POLICY "vendor_invoices_auth_insert" ON public.vendor_invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "vendor_invoices_auth_update" ON public.vendor_invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vendor_invoices_auth_delete" ON public.vendor_invoices FOR DELETE TO authenticated USING (true);

-- 2. Clinic Packages
DROP POLICY IF EXISTS "clinic_packages_ops_insert" ON public.clinic_packages;
DROP POLICY IF EXISTS "clinic_packages_ops_update" ON public.clinic_packages;
DROP POLICY IF EXISTS "clinic_packages_ops_delete" ON public.clinic_packages;

CREATE POLICY "clinic_packages_auth_insert" ON public.clinic_packages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clinic_packages_auth_update" ON public.clinic_packages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "clinic_packages_auth_delete" ON public.clinic_packages FOR DELETE TO authenticated USING (true);

-- 3. Clinic Package Items
DROP POLICY IF EXISTS "clinic_package_items_ops_insert" ON public.clinic_package_items;
DROP POLICY IF EXISTS "clinic_package_items_ops_update" ON public.clinic_package_items;
DROP POLICY IF EXISTS "clinic_package_items_ops_delete" ON public.clinic_package_items;

CREATE POLICY "clinic_package_items_auth_insert" ON public.clinic_package_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clinic_package_items_auth_update" ON public.clinic_package_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "clinic_package_items_auth_delete" ON public.clinic_package_items FOR DELETE TO authenticated USING (true);

-- 4. Inventory Adjustments (Stock Take)
DROP POLICY IF EXISTS "inventory_adjustments_ops_insert" ON public.inventory_adjustments;

CREATE POLICY "inventory_adjustments_auth_insert" ON public.inventory_adjustments FOR INSERT TO authenticated WITH CHECK (adjusted_by = auth.uid());
