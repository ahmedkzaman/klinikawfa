
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'client_invoice_items','client_invoices','clinic_package_items',
    'clinic_packages','corporate_clients','vendor_invoices'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_auth_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_auth_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_auth_delete', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (public.is_staff_or_admin(auth.uid()))
    $f$, t || '_staff_insert', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR UPDATE TO authenticated
        USING (public.is_staff_or_admin(auth.uid()))
        WITH CHECK (public.is_staff_or_admin(auth.uid()))
    $f$, t || '_staff_update', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR DELETE TO authenticated
        USING (public.is_staff_or_admin(auth.uid()))
    $f$, t || '_staff_delete', t);
  END LOOP;
END $$;
